"""Geometry-aware PdfReader built on PyMuPDF: text plus normalized bboxes.

Every Item identified by the pipeline carries the region of the page it came
from, whether or not it later gets a catalogue match: the match only supplies a
price, the evidence must exist for everything the engine found.

A needle (a size like ``Ø 10 cm`` or the row's unit/quantity) is located in
three steps: an exact phrase search, then a word-span match that survives
columns and hyphens, then the longest single token. Whatever we find is grown to
the whole row/block so the highlight covers the position, never a lone word.
"""
from __future__ import annotations

from collections import OrderedDict
from pathlib import Path
from typing import List, Optional, Sequence, Tuple

from .base import BBox, Column, Document, Page

_CACHE: "OrderedDict[str, object]" = OrderedDict()
_CACHE_MAX = 4

# A block longer than this many visual lines is a description column, not a row:
# for those we keep the matched line instead of swallowing the whole column.
_COMPACT_BLOCK_LINES = 4
# ...and a block taller than this fraction of the page is never a single row.
_MAX_BLOCK_HEIGHT = 0.06
# Below this fraction of the page width, a box is a lone cell: widen to the row.
_NARROW_WIDTH = 0.25


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


def _clean(token: str) -> str:
    return "".join(ch for ch in token.lower() if ch.isalnum() or ch in ".,/").strip(".,/")


def _same_word(a: str, b: str) -> bool:
    if not a or not b:
        return False
    if a == b:
        return True
    return len(a) >= 4 and len(b) >= 4 and (a.startswith(b) or b.startswith(a))


def _span_from(words: Sequence[Sequence], tokens: Sequence[str], start: int) -> List[Sequence]:
    """Greedy run of ``tokens`` in order from ``start``, confined to one block."""
    block = words[start][5]
    matched: List[Sequence] = []
    index = 0
    cursor = start
    while cursor < len(words) and index < len(tokens):
        word = words[cursor]
        if word[5] != block and matched:
            break
        if _same_word(_clean(word[4]), tokens[index]):
            matched.append(word)
            index += 1
        cursor += 1
    return matched


def _best_span(words: Sequence[Sequence], tokens: Sequence[str]) -> Optional[List[Sequence]]:
    """Best run of page words matching ``tokens`` in order, inside one block."""
    targets = [t for t in tokens if t]
    if not targets:
        return None
    best: Optional[List[Sequence]] = None
    for start in range(len(words)):
        matched = _span_from(words, targets, start)
        if len(matched) == len(targets):
            return matched
        if best is None or len(matched) > len(best):
            best = matched
    return best or None


def _full_spans(words: Sequence[Sequence], tokens: Sequence[str]) -> List[List[Sequence]]:
    """Every non-overlapping run of all ``tokens``, in reading order."""
    targets = [t for t in tokens if t]
    if not targets:
        return []
    spans: List[List[Sequence]] = []
    index = 0
    while index < len(words):
        matched = _span_from(words, targets, index)
        if len(matched) == len(targets):
            spans.append(matched)
            index += len(matched)
        else:
            index += 1
    return spans


class PymupdfGeomReader:
    name = "pymupdf-geom"

    def read(self, path: Path) -> Document:
        doc = _open(path)
        pages = [
            Page(number=index + 1, text=doc.load_page(index).get_text("text") or "")
            for index in range(doc.page_count)
        ]
        return Document(page_count=doc.page_count, pages=pages)

    def render_png(self, path: Path, page_number: int, dpi: int = 150) -> Optional[bytes]:
        doc = _open(path)
        page = doc.load_page(page_number - 1)
        pixmap = page.get_pixmap(dpi=dpi)
        return pixmap.tobytes("png")

    def locate_word(self, path: Path, page_number: int, word: str) -> Optional[float]:
        """Rightmost x0 (0..1) of an exact word in the page header band.

        The header band avoids body matches, and the rightmost occurrence
        disambiguates a wrapped header cell: 'Mass-betrag' prints as 'Mass-' /
        'betrag', so the standalone 'Betrag' column is the rightmost match.
        """
        target = _clean(word)
        if not target:
            return None
        doc = _open(path)
        page = doc.load_page(page_number - 1)
        width = page.rect.width or 1.0
        height = page.rect.height or 1.0
        xs = [
            w[0]
            for w in page.get_text("words")
            if w[1] < 0.12 * height and _clean(w[4]) == target
        ]
        return (max(xs) / width) if xs else None

    def column_bounds(
        self, path: Path, page_number: int, header: str
    ) -> Optional[Column]:
        """(x0, x1) of the table column whose header cell contains ``header``.

        The header word only marks where the text starts, not where the column
        starts or ends; the column's true edges are its cell borders, which are
        drawn as tall rectangles. We pick the one straddling the header word.
        """
        target = _clean(header)
        if not target:
            return None
        doc = _open(path)
        page = doc.load_page(page_number - 1)
        width = page.rect.width or 1.0
        height = page.rect.height or 1.0

        hits = [
            w
            for w in page.get_text("words")
            if w[1] < 0.12 * height and _clean(w[4]) == target
        ]
        if not hits:
            return None
        center = max(w[0] + w[2] for w in hits) / 2.0 / width

        cells = []
        for drawing in page.get_drawings():
            for item in drawing["items"]:
                if item[0] != "re":
                    continue
                rect = item[1]
                if rect.height > 0.4 * height and 0.02 * width < rect.width < 0.6 * width:
                    cells.append((rect.x0 / width, rect.x1 / width))
        if not cells:
            return None

        straddling = [cell for cell in cells if cell[0] <= center <= cell[1]]
        pool = straddling or cells
        best = min(pool, key=lambda cell: abs((cell[0] + cell[1]) / 2.0 - center))
        return best

    def locate(self, path: Path, page_number: int, needle: str) -> Optional[BBox]:
        if not needle or not needle.strip():
            return None
        import fitz

        doc = _open(path)
        page = doc.load_page(page_number - 1)
        width = page.rect.width or 1.0
        height = page.rect.height or 1.0

        rect = self._find(page, needle)
        if rect is None:
            return None
        rect = self._expand(page, rect)
        return (
            max(0.0, rect.x0 / width),
            max(0.0, rect.y0 / height),
            min(1.0, rect.x1 / width),
            min(1.0, rect.y1 / height),
        )

    def locate_all(self, path: Path, page_number: int, needle: str) -> List[BBox]:
        """Every region on the page matching ``needle``, in reading order.

        Used when a needle (e.g. ``Stk 6``) recurs on a page: the caller pairs
        the n-th occurrence with the n-th row instead of re-highlighting one.
        """
        if not needle or not needle.strip():
            return []
        import fitz

        doc = _open(path)
        page = doc.load_page(page_number - 1)
        width = page.rect.width or 1.0
        height = page.rect.height or 1.0
        tokens = [_clean(t) for t in needle.split()]
        tokens = [t for t in tokens if t]
        if not tokens:
            return []

        boxes: List[BBox] = []
        seen = set()
        for span in _full_spans(page.get_text("words"), tokens):
            rect = self._expand(page, _union([fitz.Rect(word[:4]) for word in span]))
            box = (
                max(0.0, rect.x0 / width),
                max(0.0, rect.y0 / height),
                min(1.0, rect.x1 / width),
                min(1.0, rect.y1 / height),
            )
            key = tuple(round(value, 4) for value in box)
            if key not in seen:
                seen.add(key)
                boxes.append(box)
        boxes.sort(key=lambda b: (round(b[1], 3), b[0]))
        return boxes

    def _find(self, page, needle: str):
        import fitz

        tokens = [_clean(t) for t in needle.split()]
        tokens = [t for t in tokens if t]

        rects = page.search_for(" ".join(needle.split()))
        if rects:
            return _union(rects)

        words = page.get_text("words")
        span = _best_span(words, tokens)
        if span:
            return _union([fitz.Rect(word[:4]) for word in span])

        for token in sorted(tokens, key=len, reverse=True):
            if len(token) < 2:
                continue
            rects = page.search_for(token)
            if rects:
                return _union(rects)
        return None

    def _expand(self, page, rect):
        """Grow a matched rect to its row and, when compact, its whole block."""
        import fitz

        words = page.get_text("words")
        if not words:
            return rect

        lines: "OrderedDict[Tuple[int, int], list]" = OrderedDict()
        blocks: "OrderedDict[int, list]" = OrderedDict()
        for word in words:
            lines.setdefault((word[5], word[6]), []).append(word)
            blocks.setdefault(word[5], []).append(word)

        line_rects = []
        block_ids = set()
        for (block, _line), line_words in lines.items():
            line_rect = _union([fitz.Rect(w[:4]) for w in line_words])
            if line_rect.intersects(rect):
                line_rects.append(line_rect)
                block_ids.add(block)

        if not line_rects:
            return rect

        grown = _union(line_rects)
        page_height = page.rect.height or 1.0
        for block_id in block_ids:
            block_words = blocks[block_id]
            block_lines = {(w[5], w[6]) for w in block_words}
            block_rect = _union([fitz.Rect(w[:4]) for w in block_words])
            if (
                len(block_lines) <= _COMPACT_BLOCK_LINES
                and block_rect.height <= _MAX_BLOCK_HEIGHT * page_height
            ):
                grown = grown | block_rect

        # A bare unit/quantity cell is not a readable region: widen to the row.
        page_width = page.rect.width or 1.0
        if grown.width < _NARROW_WIDTH * page_width:
            band = [
                fitz.Rect(w[:4])
                for w in words
                if w[3] > grown.y0 - 2 and w[1] < grown.y1 + 2
            ]
            if band:
                grown = _union([grown] + band)
        return grown


def _union(rects: Sequence) -> object:
    rect = rects[0]
    for other in rects[1:]:
        rect = rect | other
    return rect


def default_reader():
    """Prefer the geometry-aware engine; fall back to the text-only one."""
    try:
        import fitz  # noqa: F401

        return PymupdfGeomReader()
    except Exception:  # pragma: no cover - defensive
        from .pypdf_reader import PypdfTextReader

        return PypdfTextReader()
