"""AI page classification: one Decisions API call per batch of pages.

The Decisions API answers a *choice* question from a fixed set, which is exactly
page typing. Each page becomes one question with the three page-type choices,
and a batch of pages rides in a single call, so a 200-page tender costs a handful
of requests. Pages the model leaves unanswered fall back to the deterministic
header check, so classification can never lose a page.
"""
from __future__ import annotations

import asyncio
import time
from typing import Any, Callable, Dict, List, Optional, Sequence

from ... import config
from ...domain.enums import PageType
from ...domain.models import PageClassification
from ..extractors import Document, Page
from .client import async_client, with_retry
from .usage import UsageLedger

SHARED_INPUT = (
    "You classify the pages of ONE construction tender (bill of quantities / "
    "Leistungsverzeichnis). For each page choose exactly one category.\n"
    "\n"
    "- lv_table: the six-column quantity table we price: Pos. | Gegenstand | "
    "Mass-Gattg. | Mass-betrag | Einheits-Preis | Betrag. The header words "
    "'Gegenstand' together with 'Mass-'/'Mass-betrag', 'Einheits-preis' or "
    "'Betrag' are the signature. Only when that header is present AND the page "
    "carries actual positions (rows with a quantity in Mass-betrag). A "
    "recapitulation that repeats the header but lists lettered categories "
    "(A Apparate, B Kanäle, …) with no quantities is NOT lv_table.\n"
    "- lv_other: a bill-of-quantities-like page in ANOTHER layout, with "
    "quantities but not the six-column form: an Italian 'modulo offerta' "
    "(Testo | GQ | Qtà | UM | Prezzo), a NOVA material schedule "
    "(l/Stk | KZ | Bezeichnung | dimensions), or a supplementary rate table.\n"
    "- cover: cover sheet / bidder identification / offer totals.\n"
    "- index: table of contents or attachment lists.\n"
    "- captions: divider sheets (e.g. a page that only announces "
    "'Leistungsverzeichnis' or 'Modulo d'offerta').\n"
    "- legal: contractual conditions, procurement rules, declarations, "
    "obligations, guarantees, payment terms.\n"
    "- specifications: technical specifications and design bases "
    "(Prescrizioni tecniche, Berechnungsgrundlagen, requirements, criteria).\n"
    "- modulo_offerta: offer-module administrative forms, cost summaries, "
    "recapitulations, price-adjustment forms (not detail rows). A "
    "KOSTENZUSAMMENSTELLUNG / Zusammenstellung / Ricapitolazione page is "
    "modulo_offerta EVEN IF it shows the six-column header: its lettered "
    "category lines (A Apparate, B Kanäle, C Armaturen, …) are summary rows, "
    "not positions.\n"
    "- preziario: supplementary unit-price schedules "
    "(Mehr-/Minderpreise, Einheitspreise lists).\n"
    "- other: anything else (programme, drawings index, unclear).\n"
    "\n"
    "Narrative prose, evaluation criteria and tables without a quantity or "
    "price column are never lv_table. When unsure, prefer other."
)

_PAGE_TYPES = tuple(PageType)

_CHOICE_LABELS = {
    PageType.LV_TABLE: "Six-column LV quantity table "
    "(Pos./Gegenstand/Mass-/Einheits-Preis/Betrag).",
    PageType.LV_OTHER: "BOQ-like page in another layout "
    "(modulo offerta, NOVA, supplementary rates).",
    PageType.COVER: "Cover sheet / bidder identification.",
    PageType.INDEX: "Table of contents / attachment lists.",
    PageType.CAPTIONS: "Divider sheet (announces a section).",
    PageType.LEGAL: "Contractual conditions, declarations, obligations.",
    PageType.SPECIFICATIONS: "Technical specifications and design bases.",
    PageType.MODULO_OFFERTA: "Offer-module form, cost summary, recap.",
    PageType.PREZIARIO: "Supplementary unit-price schedule.",
    PageType.OTHER: "Anything else (programme, drawings index, unclear).",
}


def _choices() -> List[dict]:
    return [
        {"value": page_type.value, "description": _CHOICE_LABELS[page_type]}
        for page_type in _PAGE_TYPES
    ]


def _question(page: Page) -> dict:
    return {
        "type": "choice",
        "name": "page-%d" % page.number,
        "instructions": (page.text or "").strip()[:6000],
        "choices": _choices(),
    }


def _classification(page: Page, answer: Any) -> PageClassification:
    from ..steps.classify_pages import classify_page_deterministic

    if answer is None or getattr(answer, "type", None) != "choice":
        return classify_page_deterministic(page.number, page.text)
    try:
        ptype = PageType(getattr(answer, "choice", None))
    except ValueError:
        return classify_page_deterministic(page.number, page.text)
    return PageClassification(
        page=page.number,
        type=ptype,
        confidence=round(float(getattr(answer, "confidence", 0.0) or 0.0), 2),
    )


async def _call_batch(
    client: Any, model: str, batch: Sequence[Page], usage: UsageLedger
) -> List[PageClassification]:
    questions = [_question(page) for page in batch]

    async def do() -> Any:
        return await client.decisions.create(
            model=model, input=SHARED_INPUT, questions=questions
        )

    start = time.perf_counter()
    response = await with_retry(do, usage)
    elapsed_ms = (time.perf_counter() - start) * 1000.0
    record = getattr(response, "usage", None)
    usage.record(
        model,
        getattr(record, "input_tokens", 0) or 0,
        0,
        elapsed_ms,
        input_only=True,
    )

    by_name = {
        getattr(answer, "name", None): answer
        for answer in (getattr(response, "answers", None) or [])
    }
    return [
        _classification(page, by_name.get("page-%d" % page.number))
        for page in batch
    ]


def classify_pages(
    document: Document,
    *,
    client: Optional[Any] = None,
    model: Optional[str] = None,
    usage: Optional[UsageLedger] = None,
    batch_size: Optional[int] = None,
    concurrency: Optional[int] = None,
    on_progress: Optional[Callable[[int], None]] = None,
) -> List[PageClassification]:
    """Classify every page of the document, in order, via the Decisions API.

    ``on_progress`` receives the number of pages classified so far after each batch.
    """
    usage = usage or UsageLedger()
    model = model or config.CLASSIFY_MODEL
    batch_size = batch_size or config.CLASSIFY_BATCH
    concurrency = concurrency or config.AI_CONCURRENCY
    pages = list(document.pages)
    if not pages:
        return []

    batches = [pages[i : i + batch_size] for i in range(0, len(pages), batch_size)]
    results: Dict[int, PageClassification] = {}

    async def main() -> None:
        owns_client = client is None
        active = client or async_client()
        if active is None:
            raise RuntimeError(
                "AI page classification requested but OpenAI is not configured "
                "(set OPENAI_API_KEY in backend/.env)."
            )
        semaphore = asyncio.Semaphore(concurrency)

        async def one(batch: Sequence[Page]) -> None:
            async with semaphore:
                for result in await _call_batch(active, model, batch, usage):
                    results[result.page] = result
                if on_progress:
                    on_progress(len(results))

        try:
            await asyncio.gather(*(one(batch) for batch in batches))
        finally:
            if owns_client:
                await active.close()

    asyncio.run(main())

    from ..steps.classify_pages import classify_page_deterministic

    return [
        results.get(page.number)
        or classify_page_deterministic(page.number, page.text)
        for page in pages
    ]
