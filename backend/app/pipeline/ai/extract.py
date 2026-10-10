"""AI extraction: one Responses API call per LV page, structured output.

A cheap deterministic triage picks the LV pages first (see ``steps.parse``), so
the model only ever sees the ~55 pages that carry positions, never all 202.
Each page yields a JSON array of positions in one round-trip; geometry is then
recovered with ``reader.locate`` from the page text, which doubles as an
anti-hallucination cross-check.
"""
from __future__ import annotations

import asyncio
import json
import time
from typing import Any, Dict, List, Optional, Sequence, Tuple

from ... import config
from ...domain.enums import ItemFlag, ItemStatus, normalize_unit
from ...domain.models import Item
from ..extractors import Document, Page, PdfReader
from ..steps.parse import _detect_system, _is_lv_page, plausible_quantity
from .client import async_client, with_retry
from .usage import UsageLedger

SYSTEM_PROMPT = (
    "You extract priced positions (Positionen / voci di capitolato / postes du "
    "bordereau / bill-of-quantities items) from ONE page of a construction tender. "
    "The page may be in any language (German, Italian, French, English, ...); read "
    "it as written and do not translate the description.\n"
    "\n"
    "Layout: a description block (title, Fabrikat/manufacturer, Typ/model, Material, "
    "Farbe, Groesse/size) is often followed by one or more variant rows, e.g. "
    "'Groesse / \u00d8 10 cm / Stk / 5'. Emit ONE position per variant row: repeat the "
    "block description and set that row's size and quantity.\n"
    "\n"
    "German LV pages have six columns: Pos. | Gegenstand | Mass-Gattg. | "
    "Mass-betrag | Einheits-Preis | Betrag Fr. Mass-betrag is the quantity; most "
    "rows have no printed position number. 'Montage und Transport' / "
    "'Dienstleistungen' with Stk 1 are service packages (one item each).\n"
    "\n"
    "Italian 'modulo offerta' pages have columns: Pos. | Testo | GQ | Qt\u00e0 | UM | "
    "Prz/Un | Totale | TP. The unit sits right before the price underscores, e.g. "
    "'190.00 m___________' or '8.00 pz___________'. Units: pz/pce->pc, ac (a "
    "corpo)->LS, m2/mq->m2, m->m, h/ore->h, up (prova completa)->system. "
    "Reconstruct a position number split across lines: a parent like 'R 291' or "
    "'311' plus a suffix line '.011' becomes 'R 291.011'. A leading 'R' marks "
    "modified text, keep it. The allocation block ('244 : UTA1 : 244.2') is NOT a "
    "position number. Rows whose unit is 'ac' and whose text mentions "
    "'Percentuali per fissaggi ... posizione 311.xxx' / '(percent. consigliata ..%)' "
    "are percentage surcharges: emit them with quantity and unit ac, do not invent "
    "the percentage. Blank underscores are unknown prices, never zero.\n"
    "\n"
    "Rules:\n"
    "- Emit only real bill items: a described material/equipment position (usually "
    "carrying a position number) that has a quantity and a unit. Do NOT emit "
    "requirements, evaluation criteria, bullet points, headings or narrative prose, "
    "even when they read like line items.\n"
    "- Skip column headers, page numbers, project/system lines, section banners "
    "('ARMATUREN UND INSTRUMENTE', 'Besondere Bedingungen', 'Prescrizioni tecniche'), "
    "totals, evaluation criteria, tables of contents and pure legal/administrative "
    "text. Pages of legal clauses and specifications are not positions even when "
    "they carry dotted codes.\n"
    "- Copy the description from the source; never invent text or numbers.\n"
    "- unit: normalise to one of pc, m, m2, h, LS, system. Map Stk/St\u00fcck/pz/pcs/"
    "pce->pc, m2/qm/mq->m2, lfm/lfdm/ml/m->m, Std/h/ore->h, "
    "Pauschale/forfait/ac/una tantum->LS, up->system.\n"
    "- quantity: the numeric quantity of that row; null only when it is a clearly "
    "numbered position whose quantity is genuinely absent from the page.\n"
    "- pos_number: the printed position number when the page shows one (e.g. "
    "'R 291.011', '311.101', 'R 512.022'); null when rows are unnumbered.\n"
    "- size: the raw size string, e.g. '\u00d8 10 cm' or '400x300x1250 mm'.\n"
    "- fire_class: e.g. 'EI30', 'EI90-S', 'REI120' when present.\n"
    "- If the page has no positions at all, return an empty list."
)

_SCHEMA: Dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "required": ["positions"],
    "properties": {
        "positions": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": [
                    "description",
                    "quantity",
                    "unit",
                    "pos_number",
                    "manufacturer",
                    "model",
                    "size",
                    "fire_class",
                ],
                "properties": {
                    "description": {"type": "string"},
                    "quantity": {"type": ["number", "null"]},
                    "unit": {"type": ["string", "null"]},
                    "pos_number": {"type": ["string", "null"]},
                    "manufacturer": {"type": ["string", "null"]},
                    "model": {"type": ["string", "null"]},
                    "size": {"type": ["string", "null"]},
                    "fire_class": {"type": ["string", "null"]},
                },
            },
        }
    },
}


def lv_pages(document: Document) -> List[Page]:
    """Pick the pages worth sending to the model, in any language.

    Fast path: if a known LV header block appears on a meaningful share of pages
    (German 'Gegenstand'+'Mass-', or Italian modulo offerta 'GQ'/'Qt\u00e0'+'UM'), the
    model only sees that exact subset. Otherwise the tender uses another language
    or layout, so the model gets every page with enough content to judge (it
    returns an empty list where there are none). This keeps the extractor
    language-agnostic without sending legal front matter or specifications.
    """
    pages = list(document.pages)
    lv_like = [page for page in pages if _is_lv_page(page.text)]
    if len(lv_like) >= 10:
        return lv_like
    return [p for p in pages if sum(1 for line in p.text.splitlines() if line.strip()) >= 5]


def _parse_payload(raw: Optional[str]) -> List[dict]:
    if not raw:
        return []
    try:
        data = json.loads(raw)
    except (ValueError, TypeError):
        return []
    positions = data.get("positions") if isinstance(data, dict) else None
    return positions if isinstance(positions, list) else []


async def _call_page(
    client: Any, model: str, effort: str, text: str, usage: UsageLedger
) -> List[dict]:
    async def do() -> Any:
        return await client.responses.create(
            model=model,
            instructions=SYSTEM_PROMPT,
            input=text,
            reasoning={"effort": effort},
            text={
                "format": {
                    "type": "json_schema",
                    "name": "lv_positions",
                    "strict": True,
                    "schema": _SCHEMA,
                }
            },
        )

    start = time.perf_counter()
    response = await with_retry(do, usage)
    elapsed_ms = (time.perf_counter() - start) * 1000.0
    usage_record = getattr(response, "usage", None)
    usage.record(
        model,
        getattr(usage_record, "input_tokens", 0) or 0,
        getattr(usage_record, "output_tokens", 0) or 0,
        elapsed_ms,
    )
    return _parse_payload(getattr(response, "output_text", None))


async def _run_pages(
    client: Any,
    model: str,
    effort: str,
    pages: Sequence[Page],
    usage: UsageLedger,
    concurrency: int,
) -> List[Tuple[Page, List[dict]]]:
    semaphore = asyncio.Semaphore(concurrency)

    async def one(page: Page) -> Tuple[Page, List[dict]]:
        async with semaphore:
            return page, await _call_page(client, model, effort, page.text, usage)

    return list(await asyncio.gather(*(one(page) for page in pages)))


def _build_item(
    counter: int,
    system: Optional[str],
    page: Page,
    position: dict,
    reader: PdfReader,
    pdf_path,
    with_geometry: bool,
) -> Item:
    description = (position.get("description") or "").strip() or None
    unit = normalize_unit(position["unit"]) if position.get("unit") else None
    qty = position.get("quantity")
    try:
        qty = float(qty) if qty is not None else None
    except (TypeError, ValueError):
        qty = None

    item = Item(
        lv_id="LV%04d" % counter,
        system=system,
        source_page=page.number,
        description_raw=description,
        quantity=qty,
        unit=unit,
        status=ItemStatus.REVIEW_REQUIRED,
    )

    attributes = {
        key: position[key].strip()
        for key in ("pos_number", "manufacturer", "model", "size", "fire_class")
        if isinstance(position.get(key), str) and position[key].strip()
    }
    if attributes:
        item.attributes = attributes

    if qty is None:
        item.flags.append(ItemFlag.MISSING_QUANTITY)
    elif not plausible_quantity(qty, unit):
        item.quantity = None
        item.flags.append(ItemFlag.UNPARSED_ROW)
        item.flags.append(ItemFlag.MISSING_QUANTITY)
    if not description:
        item.flags.append(ItemFlag.MISSING_DESCRIPTION)
    if unit is None:
        item.flags.append(ItemFlag.UNCLEAR_UNIT)

    if with_geometry:
        # Prefer the printed position number to anchor the row: it is printed once
        # and identifies the exact line, where a long description may wrap and
        # defeat a phrase search.
        needle = (
            position.get("pos_number")
            or position.get("size")
            or description
        )
        bbox = reader.locate(pdf_path, page.number, needle) if needle else None
        if bbox is None and position.get("pos_number") and description:
            bbox = reader.locate(pdf_path, page.number, description)
        if bbox:
            item.source_bbox = list(bbox)

    return item


def extract_document(
    document: Document,
    reader: PdfReader,
    pdf_path,
    *,
    client: Optional[Any] = None,
    model: Optional[str] = None,
    effort: Optional[str] = None,
    usage: Optional[UsageLedger] = None,
    with_geometry: bool = True,
    concurrency: Optional[int] = None,
) -> List[Item]:
    """Extract Items from the LV pages of a document via the Responses API."""
    usage = usage or UsageLedger()
    model = model or config.EXTRACT_MODEL
    effort = effort or config.EXTRACT_EFFORT
    concurrency = concurrency or config.AI_CONCURRENCY
    pages = lv_pages(document)
    if not pages:
        return []

    async def main() -> List[Tuple[Page, List[dict]]]:
        owns_client = client is None
        active = client or async_client()
        if active is None:
            raise RuntimeError(
                "AI extraction requested but OpenAI is not configured "
                "(set OPENAI_API_KEY in backend/.env)."
            )
        try:
            return await _run_pages(active, model, effort, pages, usage, concurrency)
        finally:
            if owns_client:
                await active.close()

    results = asyncio.run(main())

    items: List[Item] = []
    counter = 0
    for page, positions in sorted(results, key=lambda r: r[0].number):
        system = _detect_system(page.text)
        for position in positions:
            counter += 1
            items.append(
                _build_item(
                    counter, system, page, position, reader, pdf_path, with_geometry
                )
            )
    return items
