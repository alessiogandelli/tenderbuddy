"""The swappable PDF reading interface.

The rest of the pipeline only knows this interface. A broken engine can be
replaced (or a future LLM/MinerU engine added) without touching pricing or the
API. See ticket 08.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Optional, Protocol, Tuple

BBox = Tuple[float, float, float, float]  # normalized [x0, y0, x1, y1] in 0..1
Column = Tuple[float, float]  # normalized (x0, x1) of a table column in 0..1


@dataclass
class Page:
    number: int  # 1-based
    text: str


@dataclass
class Document:
    page_count: int
    pages: List[Page] = field(default_factory=list)


class PdfReader(Protocol):
    """Reads a tender PDF into per-page text and can locate a snippet."""

    name: str

    def read(self, path: Path) -> Document:
        ...

    def locate(self, path: Path, page_number: int, needle: str) -> Optional[BBox]:
        """Return the normalized bbox of ``needle`` on a page, or None."""
        ...

    def render_png(self, path: Path, page_number: int, dpi: int = 150) -> Optional[bytes]:
        """Render one page to PNG bytes, or None when the engine cannot."""
        ...

    def locate_word(self, path: Path, page_number: int, word: str) -> Optional[float]:
        """Normalized x0 (0..1) of an exact header word, or None.

        Used to find the right edge column (``Betrag``) even when a longer word
        (``Mass-betrag``) contains it as a substring.
        """
        ...

    def column_bounds(
        self, path: Path, page_number: int, header: str
    ) -> Optional[Column]:
        """Normalized (x0, x1) of the table column headed by ``header``, or None.

        Uses the table's own cell borders so the column spans its true left and
        right edges instead of a fixed width off the header word. Returns None
        when the engine has no geometry or the column cannot be found.
        """
        ...
