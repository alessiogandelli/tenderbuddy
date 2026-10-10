"""Step 1 - Classify pages: what kind of document page each page is.

Deterministic fallback used when the AI path is off (tests, CI) and to fill any
page the model leaves unanswered. Categories mirror the ``docs/tenders``
analyses. The structural LV forms are detected from their headers; the rest use
light keyword heuristics and default to ``other``. The AI path
(``ai/classify_pages.py``) is the reliable classifier for the fine-grained kinds.
"""
from __future__ import annotations

from typing import List

from ...domain.enums import PageType
from ...domain.models import PageClassification
from ..extractors import Document
from .parse import _has_italian_lv_header


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


__all__ = [
    "classify_page_deterministic",
    "classify_pages_deterministic",
    "table_pages",
]
