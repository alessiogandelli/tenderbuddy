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
