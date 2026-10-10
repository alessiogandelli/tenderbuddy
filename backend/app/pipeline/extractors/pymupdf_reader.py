"""Geometry-aware PdfReader built on PyMuPDF: text plus normalized bboxes.

This is the engine that makes MinerU-style page highlighting possible: every
Item can carry the exact region of the page it came from.

The opened document is cached per path so locating many snippets on the same
tender does not reopen the file hundreds of times.
"""
from __future__ import annotations

from collections import OrderedDict
from pathlib import Path
from typing import Optional

from .base import BBox, Document, Page

_CACHE: "OrderedDict[str, object]" = OrderedDict()
_CACHE_MAX = 4


def _open(path: Path):
    import fitz

    key = str(path)
    doc = _CACHE.get(key)
    if doc is None:
        doc = fitz.open(key)
        _CACHE[key] = doc
    _CACHE.move_to_end(key)
    while len(_CACHE) > _CACHE_MAX:
        _, evicted = _CACHE.popitem(last=False)
        evicted.close()  # type: ignore[attr-defined]
    return doc


class PymupdfGeomReader:
    name = "pymupdf-geom"

    def read(self, path: Path) -> Document:
        doc = _open(path)
        pages = [
            Page(number=index + 1, text=doc.load_page(index).get_text("text") or "")
            for index in range(doc.page_count)
        ]
        return Document(page_count=doc.page_count, pages=pages)

    def locate(self, path: Path, page_number: int, needle: str) -> Optional[BBox]:
        if not needle:
            return None
        doc = _open(path)
        page = doc.load_page(page_number - 1)
        rects = page.search_for(needle)
        if not rects:
            for token in sorted(needle.split(), key=len, reverse=True):
                if len(token) < 2:
                    continue
                rects = page.search_for(token)
                if rects:
                    break
        if not rects:
            return None
        rect = rects[0]
        width = page.rect.width or 1.0
        height = page.rect.height or 1.0
        return (
            max(0.0, rect.x0 / width),
            max(0.0, rect.y0 / height),
            min(1.0, rect.x1 / width),
            min(1.0, rect.y1 / height),
        )


def default_reader():
    """Prefer the geometry-aware engine; fall back to the text-only one."""
    try:
        import fitz  # noqa: F401

        return PymupdfGeomReader()
    except Exception:  # pragma: no cover - defensive
        from .pypdf_reader import PypdfTextReader

        return PypdfTextReader()
