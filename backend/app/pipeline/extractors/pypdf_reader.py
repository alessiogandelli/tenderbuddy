"""Text-only PdfReader built on pypdf. Always available, no geometry."""
from __future__ import annotations

from pathlib import Path
from typing import Optional

from .base import BBox, Document, Page


class PypdfTextReader:
    name = "pypdf-text"

    def read(self, path: Path) -> Document:
        from pypdf import PdfReader as _Pypdf

        reader = _Pypdf(str(path))
        pages = []
        for index, page in enumerate(reader.pages):
            try:
                text = page.extract_text() or ""
            except Exception:  # pragma: no cover - defensive
                text = ""
            pages.append(Page(number=index + 1, text=text))
        return Document(page_count=len(pages), pages=pages)

    def locate(self, path: Path, page_number: int, needle: str) -> Optional[BBox]:
        return None
