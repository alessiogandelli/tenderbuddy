"""Step 1 - Classify pages: what kind of document page each page is.

Deterministic fallback used when the AI path is off (tests, CI) and to fill any
page the model leaves unanswered. Categories mirror the ``docs/tenders``
analyses. The structural LV forms are detected from their headers; the rest use
light keyword heuristics and default to ``other``. The AI path
(``ai/classify_pages.py``) is the reliable classifier for the fine-grained kinds.
"""
from __future__ import annotations

from typing import List, Tuple

from ...domain.enums import PageType
from ...domain.models import PageClassification
from ..extractors import Document, Page
from .parse import _has_italian_lv_header, _is_lv_page


def _is_german_table(text: str) -> bool:
    """The six-column LV header: Gegenstand plus a measure/price column token."""
    low = text.lower()
    return "gegenstand" in low and any(
        token in low for token in ("mass-", "einheits-", "gattg")
    )


# A cost-summary / recapitulation page keeps the six-column header but lists
# lettered categories, not positions. It must win over the header check.
_RECAP = (
    "kostenzusammenstellung",
    "zusammenstellung",
    "ricapitolazione",
    "recapitulation",
    "cost summary",
)


# Ordered keyword buckets for the non-structural kinds. First hit wins.
_KEYWORDS = (
    (PageType.INDEX, ("inhaltsverzeichnis", "indice", "contents", "table of contents")),
    (PageType.COVER, ("ausschreibung und angebot", "capitolato d'appalto", "deckblatt", "titelseite")),
    (PageType.CAPTIONS, ("leistungsverzeichnis.docx", "modulo d'offerta", "divider")),
    (PageType.PREZIARIO, ("mehr-/", "minderpreise", "einheitspreise", "preziario")),
    (PageType.MODULO_OFFERTA, ("zusammenstellung", "ricapitolazione", "konditionen", "variazione dei prezzi")),
    (PageType.SPECIFICATIONS, ("prescrizioni tecniche", "berechnungsgrundlagen", "basi di calcolo", "technische", "prescriptions")),
    (PageType.LEGAL, ("besondere bedingungen", "disposizioni particolari", "bedingungen", "conditions", "declarations")),
)


def classify_page_deterministic(page_number: int, text: str) -> PageClassification:
    low = text.lower()
    if any(keyword in low for keyword in _RECAP):
        return PageClassification(
            page=page_number, type=PageType.MODULO_OFFERTA, confidence=0.7,
            reason="cost summary / recap",
        )
    if _is_german_table(text):
        return PageClassification(
            page=page_number, type=PageType.LV_TABLE, confidence=0.9,
            reason="header Gegenstand + Mass-/Einheits-",
        )
    if _has_italian_lv_header(text):
        return PageClassification(
            page=page_number, type=PageType.LV_OTHER, confidence=0.6,
            reason="modulo offerta header",
        )
    for page_type, keywords in _KEYWORDS:
        if any(keyword in low for keyword in keywords):
            return PageClassification(
                page=page_number, type=page_type, confidence=0.5,
                reason="keyword",
            )
    return PageClassification(
        page=page_number, type=PageType.OTHER, confidence=0.4,
        reason="no clear signal",
    )


def classify_pages_deterministic(document: Document) -> List[PageClassification]:
    return [classify_page_deterministic(page.number, page.text) for page in document.pages]


def table_pages(page_types: List[PageClassification]) -> List[int]:
    """Page numbers classified as the six-column LV table we process."""
    return [pc.page for pc in page_types if pc.type is PageType.LV_TABLE]


def _has_german_table(document: Document) -> bool:
    """Whether the document carries the six-column German LV form at all."""
    return any(_is_german_table(page.text) for page in document.pages)


def repair_page_types(
    document: Document, page_types: List[PageClassification]
) -> List[PageClassification]:
    """Downgrade impossible ``lv_table`` labels on non-German tenders.

    ``lv_table`` means the six-column German form. A classifier can still emit a
    stray ``lv_table`` for a page of another layout (an Italian BOQ, a prose
    page); such a label would narrow extraction to one junk page and hide the
    real bill of quantities. When the document contains no six-column page at
    all, every ``lv_table`` label is rebuilt as ``lv_other``. When it does (the
    Zurich-style tender), the labels are returned untouched, so this is a no-op
    for the tenders that already work.
    """
    if _has_german_table(document):
        return list(page_types)
    repaired: List[PageClassification] = []
    for pc in page_types:
        if pc.type is PageType.LV_TABLE:
            pc = pc.model_copy(
                update={
                    "type": PageType.LV_OTHER,
                    "reason": "no six-column header in document",
                }
            )
        repaired.append(pc)
    return repaired


def select_extraction_pages(
    document: Document, page_types: List[PageClassification]
) -> Tuple[List[Page], bool]:
    """The pages to send to extraction, and whether the tender is German.

    German tenders keep the exact behaviour of the six-column path: only the
    classified ``lv_table`` pages, with the caller falling back to the
    language-agnostic heuristic when nothing is labelled. Any other layout (the
    Italian modulo offerta, for instance) has no ``lv_table`` pages once
    :func:`repair_page_types` has run, so its bill of quantities is the set of
    ``lv_other`` pages plus the pages the header heuristic recognises.
    """
    if _has_german_table(document):
        numbers = set(table_pages(page_types))
        return [page for page in document.pages if page.number in numbers], True
    numbers = {pc.page for pc in page_types if pc.type is PageType.LV_OTHER}
    pages = [
        page
        for page in document.pages
        if page.number in numbers or _is_lv_page(page.text)
    ]
    return pages, False


__all__ = [
    "classify_page_deterministic",
    "classify_pages_deterministic",
    "repair_page_types",
    "select_extraction_pages",
    "table_pages",
]
