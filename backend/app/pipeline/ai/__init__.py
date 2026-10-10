"""Interchangeable AI engines behind the deterministic pipeline steps.

Extraction uses the Responses API with structured output; matching uses the
Decisions API. Both fall back to the deterministic parser/matcher when OpenAI is
not configured (``BANDO_AI_MODE=off`` or an empty key).
"""
from .classify_pages import classify_pages  # noqa: F401
from .escalate import escalate_empty_pages, escalate_matches  # noqa: F401
from .extract import extract_document, lv_pages  # noqa: F401
from .match import match_items_ai  # noqa: F401
from .usage import UsageLedger  # noqa: F401
from .vision_extract import extract_document_vision  # noqa: F401

__all__ = [
    "classify_pages",
    "escalate_empty_pages",
    "escalate_matches",
    "extract_document",
    "extract_document_vision",
    "lv_pages",
    "match_items_ai",
    "UsageLedger",
]
