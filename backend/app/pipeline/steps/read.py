"""Step 0 - Read: turn the tender PDF into per-page text via the reader."""
from __future__ import annotations

from pathlib import Path

from ..extractors import Document, PdfReader


def read_pdf(reader: PdfReader, pdf_path: Path) -> Document:
    return reader.read(pdf_path)
