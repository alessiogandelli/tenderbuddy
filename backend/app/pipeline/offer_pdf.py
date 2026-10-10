"""The offer: the tender PDF as received, with our prices written in.

Each priced position gets its amount in its own price cell (``price_bbox``, the
rightmost ``Betrag`` column on the quantity line). Nothing else on the page is
touched, so the file we send back is the client's document, filled in.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Iterable, List, Optional

import fitz  # PyMuPDF

FONT = "helv"
MAX_FONT_SIZE = 9.0
MIN_FONT_SIZE = 5.0
PAD = 2.0  # points between the amount and the cell's right edge
INK = (0.0, 0.0, 0.0)
# How far left of the price cell the row's own text (unit, quantity) is looked
# for, to put the amount on that text's baseline.
ROW_TEXT_REACH = 160.0


@dataclass
class _Span:
    x0: float
    x1: float
    middle: float
    baseline: float
    size: float


def _spans(page: fitz.Page) -> List[_Span]:
    out: List[_Span] = []
    for block in page.get_text("dict")["blocks"]:
        for line in block.get("lines", []):
            for span in line["spans"]:
                if not span["text"].strip():
                    continue
                x0, y0, x1, y1 = span["bbox"]
                out.append(_Span(x0, x1, (y0 + y1) / 2, span["origin"][1], span["size"]))
    return out


def _row_anchor(rect: fitz.Rect, spans: List[_Span]) -> _Span | None:
    """The row text (quantity, unit) just left of the cell. A price cell starts
    at its own row and can reach into the next one (variant rows), so the
    topmost row inside the cell's band is the position's row."""
    row = [
        span
        for span in spans
        if span.x1 <= rect.x0 + 1
        and span.x0 >= rect.x0 - ROW_TEXT_REACH
        and rect.y0 <= span.middle <= rect.y1
    ]
    return min(row, key=lambda span: span.middle) if row else None


@dataclass
class OfferEntry:
    page: int  # 1-based
    price_bbox: List[float]  # [x0, y0, x1, y1], fractions of the page
    amount_chf: float


@dataclass
class OfferResult:
    pdf: bytes
    written: int = 0
    skipped: List[str] = field(default_factory=list)


def format_chf(amount: float) -> str:
    """Swiss style, as printed in LV forms: 12'345.60."""
    whole, cents = f"{amount:,.2f}".split(".")
    return f"{whole.replace(',', chr(39))}.{cents}"


def _cell(page: fitz.Page, bbox: List[float]) -> fitz.Rect:
    area = page.rect  # the visible page; the boxes were measured on it
    return fitz.Rect(
        area.x0 + bbox[0] * area.width,
        area.y0 + bbox[1] * area.height,
        area.x0 + bbox[2] * area.width,
        area.y0 + bbox[3] * area.height,
    )


def _write(page: fitz.Page, rect: fitz.Rect, text: str, anchor: _Span | None) -> None:
    """Right-aligned on the row's baseline (centred when the row text is not
    found), in the row's type size, shrunk to fit the cell."""
    size = min(MAX_FONT_SIZE, anchor.size if anchor else rect.height * 0.75)
    width = fitz.get_text_length(text, fontname=FONT, fontsize=size)
    room = rect.width - 2 * PAD
    if width > room > 0:
        size = max(MIN_FONT_SIZE, size * room / width)
        width = fitz.get_text_length(text, fontname=FONT, fontsize=size)
    baseline = anchor.baseline if anchor else rect.y0 + (rect.height + size * 0.7) / 2
    point = fitz.Point(rect.x1 - PAD - width, baseline)
    # insert_text works in unrotated page space, like the boxes.
    page.insert_text(point, text, fontname=FONT, fontsize=size, color=INK)


def fill_offer(
    pdf_path: Path,
    entries: Iterable[tuple[str, OfferEntry]],
    also: Optional[Callable[[fitz.Document], None]] = None,
) -> OfferResult:
    """Write each ``(lv_id, entry)`` amount into a copy of the tender PDF;
    ``also`` can fill more of the same document (the offer form) before saving."""
    doc = fitz.open(pdf_path)
    result = OfferResult(pdf=b"")
    spans_by_page: dict = {}  # read once per page, before anything is written
    try:
        for lv_id, entry in entries:
            if not (1 <= entry.page <= doc.page_count) or len(entry.price_bbox) != 4:
                result.skipped.append(lv_id)
                continue
            page = doc[entry.page - 1]
            rect = _cell(page, entry.price_bbox)
            if rect.is_empty or rect.width < 4:
                result.skipped.append(lv_id)
                continue
            if entry.page not in spans_by_page:
                spans_by_page[entry.page] = _spans(page)
            anchor = _row_anchor(rect, spans_by_page[entry.page])
            _write(page, rect, format_chf(entry.amount_chf), anchor)
            result.written += 1
        if also is not None:
            also(doc)
        result.pdf = doc.tobytes(garbage=3, deflate=True)
    finally:
        doc.close()
    return result
