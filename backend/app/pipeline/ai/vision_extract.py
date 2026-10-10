"""Vision extraction of the six-column LV tables.

For each page the classifier marked ``lv_table`` we render the page to an image
and ask a vision model for its rows. Each row comes back with the quantity/unit
cells, the name cell (Gegenstand), the measure cell (Mass-Gattg./Mass-betrag) and
the price cell in the RIGHTMOST column (Betrag) where we will write the catalog
price.

The price box is small and sits on the quantity/amount line: we take its x-range
from the ``Betrag`` column header and its y-band from the row's measure cell, so
it is never the full column or the height of a long description. A row is kept as
an item only when a measure/price cell is non-empty; discarded rows are still
recorded as ``Detection``s so the UI can show every box the engine drew.
"""
from __future__ import annotations

import asyncio
import base64
import json
import time
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional, Sequence, Tuple

from ... import config
from ...domain.enums import ItemFlag, ItemStatus, normalize_unit
from ...domain.models import Detection, Item
from ..extractors import Document, Page, PdfReader
from ..steps.parse import _detect_system, plausible_quantity
from .client import async_client, with_retry
from .usage import UsageLedger

# The price cell is one text line high; cap it so a tall model box can never
# become the whole column. Fractions of page height.
_MAX_PRICE_H = 0.035
# Fallback left edge of the Betrag column when the header cannot be located.
_BETRAG_FALLBACK_X0 = 0.85
_BETRAG_FALLBACK_X1 = 0.98

SYSTEM_PROMPT = (
    "You read ONE page image of a German construction tender: a Leistungsverzeichnis "
    "(LV) table. Its columns, left to right, are Pos. | Gegenstand | Mass-Gattg. | "
    "Mass-betrag | Einheits-Preis | Betrag Fr.\n"
    "\n"
    "Return every row that is a priceable position — i.e. a row that has SOMETHING "
    "written in one of the measure/price columns (Mass-Gattg. unit, Mass-betrag "
    "quantity, Einheits-Preis or Betrag). Rows whose measure and price cells are all "
    "empty are not positions: return them only with measure_present=false and "
    "price_present=false. Do not return the column header, section banners, page "
    "numbers, totals or cost recaps.\n"
    "\n"
    "For each row return:\n"
    "- description: the text in the Gegenstand cell (the item name plus its "
    "attributes), copied as written, not translated.\n"
    "- quantity: the numeric Mass-betrag when present, else null.\n"
    "- unit: the Mass-Gattg. token (Stk/Meter/m2/Std …), else null.\n"
    "- measure_present: true when the Mass-Gattg./Mass-betrag cells carry text.\n"
    "- price_present: true when the Einheits-Preis/Betrag cells carry text.\n"
    "- name_bbox: [x0, y0, x1, y1] around the row's Gegenstand/name text.\n"
    "- measure_bbox: [x0, y0, x1, y1] around the row's Mass-Gattg./Mass-betrag "
    "cell — the line that carries the unit and the quantity.\n"
    "- price_bbox: a SMALL box, one text line high, on that same quantity line, "
    "inside the RIGHTMOST column (Betrag) where the price will be written. It must "
    "be in the Betrag column only and must NOT span the description height or the "
    "whole column.\n"
    "\n"
    "All bboxes are fractions of the page: x from 0 (left) to 1 (right), y from 0 "
    "(top) to 1 (bottom). Keep the name, measure and price boxes on the same row. "
    "Copy values as written; never invent text or numbers."
)

_SCHEMA: Dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "required": ["rows"],
    "properties": {
        "rows": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": [
                    "description",
                    "quantity",
                    "unit",
                    "measure_present",
                    "price_present",
                    "name_bbox",
                    "measure_bbox",
                    "price_bbox",
                ],
                "properties": {
                    "description": {"type": "string"},
                    "quantity": {"type": ["number", "null"]},
                    "unit": {"type": ["string", "null"]},
                    "measure_present": {"type": "boolean"},
                    "price_present": {"type": "boolean"},
                    "name_bbox": {
                        "type": ["array", "null"],
                        "items": {"type": "number"},
                    },
                    "measure_bbox": {
                        "type": ["array", "null"],
                        "items": {"type": "number"},
                    },
                    "price_bbox": {
                        "type": ["array", "null"],
                        "items": {"type": "number"},
                    },
                },
            },
        }
    },
}


@dataclass
class VisionExtraction:
    """Kept items plus every row the engine saw (kept and discarded)."""

    items: List[Item] = field(default_factory=list)
    detections: List[Detection] = field(default_factory=list)


def _normalize_box(raw: Any) -> Optional[List[float]]:
    if not isinstance(raw, (list, tuple)) or len(raw) != 4:
        return None
    try:
        x0, y0, x1, y1 = (float(value) for value in raw)
    except (TypeError, ValueError):
        return None
    x0, x1 = sorted((max(0.0, min(1.0, x0)), max(0.0, min(1.0, x1))))
    y0, y1 = sorted((max(0.0, min(1.0, y0)), max(0.0, min(1.0, y1))))
    if x1 - x0 <= 0 or y1 - y0 <= 0:
        return None
    return [x0, y0, x1, y1]


def _parse_payload(raw: Optional[str]) -> List[dict]:
    if not raw:
        return []
    try:
        data = json.loads(raw)
    except (ValueError, TypeError):
        return []
    rows = data.get("rows") if isinstance(data, dict) else None
    return rows if isinstance(rows, list) else []


def _betrag_column(
    page: Page, reader: PdfReader, pdf_path
) -> Optional[Tuple[float, float]]:
    """(x0, x1) of the rightmost column, from the 'Betrag' header word.

    Prefer the column's own cell borders so the box spans the true Betrag
    column; fall back to a fixed width off the header word when the reader
    has no geometry (e.g. the text-only engine).
    """
    needles = ("Betrag", "Einheits-Preis", "Fr.")

    column_bounds = getattr(reader, "column_bounds", None)
    if column_bounds is not None:
        for needle in needles:
            bounds = column_bounds(pdf_path, page.number, needle)
            if bounds is not None:
                return (bounds[0], bounds[1])

    locate_word = getattr(reader, "locate_word", None)
    if locate_word is None:
        return None
    for needle in needles:
        x0 = locate_word(pdf_path, page.number, needle)
        if x0 is not None:
            return (x0, min(0.99, x0 + 0.12))
    return None


def _price_band(
    measure_box: Optional[List[float]],
    model_price: Optional[List[float]],
    name_box: Optional[List[float]],
) -> Optional[Tuple[float, float]]:
    """The one-line y-band the price box should occupy."""
    if measure_box is not None:
        y0, y1 = measure_box[1], measure_box[3]
        if y1 - y0 > _MAX_PRICE_H:
            y1 = y0 + _MAX_PRICE_H
        return y0, y1
    if model_price is not None:
        y0, y1 = model_price[1], model_price[3]
        if y1 - y0 <= _MAX_PRICE_H:
            return y0, y1
        # A tall cell: the amount line sits on its last line.
        return max(0.0, y1 - _MAX_PRICE_H), y1
    if name_box is not None:
        if name_box[3] - name_box[1] <= _MAX_PRICE_H:
            return name_box[1], name_box[3]
        return name_box[1], name_box[1] + _MAX_PRICE_H
    return None


def _derive_price_box(
    model_price: Optional[List[float]],
    measure_box: Optional[List[float]],
    name_box: Optional[List[float]],
    column: Optional[Tuple[float, float]],
) -> Optional[List[float]]:
    band = _price_band(measure_box, model_price, name_box)
    if band is None:
        return None
    y0, y1 = band
    if y1 - y0 <= 0:
        y1 = min(1.0, y0 + _MAX_PRICE_H)
    if column is not None:
        x0, x1 = column
    elif model_price is not None:
        x0, x1 = model_price[0], model_price[2]
    else:
        x0, x1 = _BETRAG_FALLBACK_X0, _BETRAG_FALLBACK_X1
    return [round(x0, 4), round(y0, 4), round(x1, 4), round(y1, 4)]


def _build(
    counter: int,
    system: Optional[str],
    page: Page,
    row: dict,
    reader: PdfReader,
    pdf_path,
    with_geometry: bool,
    column: Optional[Tuple[float, float]],
) -> Tuple[Detection, Optional[Item]]:
    measure_present = bool(row.get("measure_present"))
    price_present = bool(row.get("price_present"))
    kept = measure_present or price_present

    description = (row.get("description") or "").strip() or None
    unit = normalize_unit(row["unit"]) if row.get("unit") else None
    qty = row.get("quantity")
    try:
        qty = float(qty) if qty is not None else None
    except (TypeError, ValueError):
        qty = None

    name_bbox = _normalize_box(row.get("name_bbox"))
    if with_geometry and name_bbox is None and description:
        found = reader.locate(pdf_path, page.number, description)
        if found:
            name_bbox = list(found)
    measure_bbox = _normalize_box(row.get("measure_bbox"))
    model_price = _normalize_box(row.get("price_bbox"))
    price_bbox = _derive_price_box(model_price, measure_bbox, name_bbox, column)

    if not kept:
        return (
            Detection(
                page=page.number,
                description=description,
                quantity=qty,
                unit=unit,
                name_bbox=name_bbox,
                price_bbox=price_bbox,
                kept=False,
                reason="no_measure_or_price",
            ),
            None,
        )

    item = Item(
        lv_id="LV%04d" % counter,
        system=system,
        source_page=page.number,
        description_raw=description,
        quantity=qty,
        unit=unit,
        status=ItemStatus.REVIEW_REQUIRED,
    )
    item.name_bbox = name_bbox
    item.price_bbox = price_bbox
    item.source_bbox = name_bbox

    if qty is None:
        item.flags.append(ItemFlag.MISSING_QUANTITY)
    elif not plausible_quantity(qty, unit):
        item.quantity = None
        item.flags.append(ItemFlag.UNPARSED_ROW)
        item.flags.append(ItemFlag.MISSING_QUANTITY)
    if not description:
        item.flags.append(ItemFlag.MISSING_DESCRIPTION)
    if unit is None:
        item.flags.append(ItemFlag.MISSING_UNIT)

    detection = Detection(
        page=page.number,
        description=description,
        quantity=item.quantity,
        unit=unit,
        name_bbox=name_bbox,
        price_bbox=price_bbox,
        kept=True,
        lv_id=item.lv_id,
    )
    return detection, item


async def _call_page(
    client: Any,
    model: str,
    effort: str,
    image_png: bytes,
    usage: UsageLedger,
) -> List[dict]:
    b64 = base64.b64encode(image_png).decode("ascii")
    payload = [
        {
            "role": "user",
            "content": [
                {
                    "type": "input_text",
                    "text": "Extract the priceable rows from this LV page image.",
                },
                {
                    "type": "input_image",
                    "image_url": "data:image/png;base64,%s" % b64,
                },
            ],
        }
    ]

    async def do() -> Any:
        return await client.responses.create(
            model=model,
            instructions=SYSTEM_PROMPT,
            input=payload,
            reasoning={"effort": effort},
            text={
                "format": {
                    "type": "json_schema",
                    "name": "lv_rows_vision",
                    "strict": True,
                    "schema": _SCHEMA,
                }
            },
        )

    start = time.perf_counter()
    response = await with_retry(do, usage)
    elapsed_ms = (time.perf_counter() - start) * 1000.0
    record = getattr(response, "usage", None)
    usage.record(
        model,
        getattr(record, "input_tokens", 0) or 0,
        getattr(record, "output_tokens", 0) or 0,
        elapsed_ms,
    )
    return _parse_payload(getattr(response, "output_text", None))


async def _run_pages(
    client: Any,
    model: str,
    effort: str,
    pages: Sequence[Page],
    reader: PdfReader,
    pdf_path,
    usage: UsageLedger,
    concurrency: int,
    dpi: int,
    on_page: Optional[Callable[[], None]] = None,
) -> List[tuple]:
    semaphore = asyncio.Semaphore(concurrency)

    async def one(page: Page) -> tuple:
        async with semaphore:
            render = getattr(reader, "render_png", None)
            image = render(pdf_path, page.number, dpi) if render else None
            rows = await _call_page(client, model, effort, image, usage) if image else []
            if on_page:
                on_page()
            return page, rows

    return list(await asyncio.gather(*(one(page) for page in pages)))


def extract_document_vision(
    document: Document,
    reader: PdfReader,
    pdf_path,
    *,
    pages: Optional[Sequence[Page]] = None,
    client: Optional[Any] = None,
    model: Optional[str] = None,
    effort: Optional[str] = None,
    usage: Optional[UsageLedger] = None,
    with_geometry: bool = True,
    concurrency: Optional[int] = None,
    dpi: Optional[int] = None,
    on_page: Optional[Callable[[], None]] = None,
) -> VisionExtraction:
    """Extract Items and Detections from the given LV-table pages via images.

    ``pages`` defaults to every page of ``document``; the caller passes only the
    pages classified as ``lv_table``. Returns an empty result when the reader
    cannot render images, so the caller can fall back to a text engine.
    ``on_page`` is called once per page as soon as that page is read.
    """
    usage = usage or UsageLedger()
    if not hasattr(reader, "render_png"):
        return VisionExtraction()
    model = model or config.VISION_MODEL
    effort = effort or config.VISION_EFFORT
    dpi = dpi or config.VISION_DPI
    concurrency = concurrency or config.AI_CONCURRENCY
    selected = [p for p in (pages if pages is not None else document.pages)]
    if not selected:
        return VisionExtraction()

    async def main() -> List[tuple]:
        owns_client = client is None
        active = client or async_client()
        if active is None:
            raise RuntimeError(
                "AI vision extraction requested but OpenAI is not configured "
                "(set OPENAI_API_KEY in backend/.env)."
            )
        try:
            return await _run_pages(
                active, model, effort, selected, reader, pdf_path, usage,
                concurrency, dpi, on_page,
            )
        finally:
            if owns_client:
                await active.close()

    results = asyncio.run(main())

    items: List[Item] = []
    detections: List[Detection] = []
    counter = 0
    for page, rows in sorted(results, key=lambda r: r[0].number):
        system = _detect_system(page.text)
        column = _betrag_column(page, reader, pdf_path) if with_geometry else None
        for row in rows:
            detection, item = _build(
                counter + 1, system, page, row, reader, pdf_path, with_geometry,
                column,
            )
            detections.append(detection)
            if item is not None:
                counter += 1
                items.append(item)
    return VisionExtraction(items=items, detections=detections)
