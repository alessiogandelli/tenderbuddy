"""The cover page: the first page classified ``cover``, filled in.

Swiss tenders open with a bidder-identification sheet: the company's name and
address, a contact line, a place/date line and the offer total
("Eingabesumme Netto Fr. ... inkl. MWST"). Every blank is printed as a dotted
leader ("......"), which is text in the PDF, so each fillable field is found
exactly by locating the run of dots and reading the label to its left. No AI.

The values come from the ``bidder`` block of the pricing parameters (the
company) and from the computed Netto (the same chain the offer form uses).
Nothing is ever typed by hand, so a field with no value is simply left alone.
"""
from __future__ import annotations

import datetime
import unicodedata
from pathlib import Path
from typing import Dict, List, Optional, Sequence, Tuple

import fitz  # PyMuPDF

from ..domain.enums import PageType
from ..domain.models import CoverField, OfferCover, PageClassification
from .offer_form import format_value, write_on_leader

# A dotted leader: five or more dots in a row.
_MIN_DOTS = 5

# Label (normalised, without accents) -> row key, most specific first.
_COVER_ROWS: Tuple[Tuple[str, str], ...] = (
    ("eingabesumme", "eingabesumme"),
    ("sachbearbeiter", "sachbearbeiter"),
    ("unterschrift", "unterschrift"),
    ("strasse", "strasse"),
    ("telefon", "telefon"),
    ("datum", "ort_datum"),
    ("fax", "fax"),
    ("plz", "plz_ort"),
    ("name", "name"),
)

_MONTHS = (
    "Januar", "Februar", "März", "April", "Mai", "Juni",
    "Juli", "August", "September", "Oktober", "November", "Dezember",
)


def _norm(text: str) -> str:
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return " ".join(text.lower().split())


def _cover_row(label: str) -> Optional[str]:
    low = _norm(label)
    for needle, key in _COVER_ROWS:
        if needle in low:
            return key
    return None


def first_cover_page(page_types: Sequence[PageClassification]) -> Optional[int]:
    pages = sorted(p.page for p in page_types if p.type == PageType.COVER)
    return pages[0] if pages else None


def detect_offer_cover(pdf_path: Path, page_types: Sequence[PageClassification]) -> OfferCover:
    """Find every fillable field of the first cover page."""
    number = first_cover_page(page_types)
    if number is None:
        return OfferCover(page=None, fields=[])
    doc = fitz.open(pdf_path)
    try:
        if not (1 <= number <= doc.page_count):
            return OfferCover(page=None, fields=[])
        return _detect_cover_page(doc[number - 1], number)
    finally:
        doc.close()


def _detect_cover_page(page: fitz.Page, number: int) -> OfferCover:
    W, H = page.rect.width, page.rect.height
    fields: List[CoverField] = []
    for x0, y0, x1, y1, label, baseline in _leaders(page):
        row = _cover_row(label)
        if row is None:
            continue
        fields.append(
            CoverField(
                id="cover.%s" % row,
                page=number,
                bbox=[round(x0 / W, 4), round(y0 / H, 4), round(x1 / W, 4), round(y1 / H, 4)],
                baseline=round(baseline / H, 4),
                row=row,
                label=label.strip(),
            )
        )
    return OfferCover(page=number, fields=fields)


def _leaders(page: fitz.Page):
    """Every dotted leader on the page: ``(x0, y0, x1, y1, label, baseline)``.

    Read at character level and grouped into lines by baseline, so a leader
    printed inside the label word (e.g. ``Sachbearbeiter:......``) is found
    exactly, and labels written as separate text objects still join their line.
    """
    chars: List[dict] = []
    for block in page.get_text("rawdict")["blocks"]:
        for line in block.get("lines", []):
            for span in line["spans"]:
                chars.extend(span["chars"])
    # Group into text lines by baseline, with a small tolerance, so a label and
    # its leader (which may be separate text objects a fraction of a point apart)
    # stay on one line.
    chars.sort(key=lambda char: (char["origin"][1], char["bbox"][0]))
    lines: List[list] = []
    for char in chars:
        if lines and abs(char["origin"][1] - lines[-1][0]["origin"][1]) <= 2.0:
            lines[-1].append(char)
        else:
            lines.append([char])
    for line_chars in lines:
        chars = sorted(line_chars, key=lambda char: char["bbox"][0])
        index = 0
        label_start = 0
        while index < len(chars):
            if chars[index]["c"] != ".":
                index += 1
                continue
            end = index
            while end < len(chars) and chars[end]["c"] == ".":
                end += 1
            if end - index >= _MIN_DOTS:
                run = chars[index:end]
                # The label is the text since the previous leader on the line, so
                # two fields sharing a baseline (Telefon / Ort, Datum) don't bleed.
                label = "".join(char["c"] for char in chars[label_start:index])
                label_start = end
                yield (
                    min(char["bbox"][0] for char in run),
                    min(char["bbox"][1] for char in run),
                    max(char["bbox"][2] for char in run),
                    max(char["bbox"][3] for char in run),
                    label,
                    run[0]["origin"][1],
                )
            index = end


def german_date(day: datetime.date) -> str:
    return "%d. %s %d" % (day.day, _MONTHS[day.month - 1], day.year)


def compute_cover(
    cover: OfferCover,
    netto_chf: Optional[float],
    parameters: dict,
    today: Optional[datetime.date] = None,
) -> Dict[str, Optional[str]]:
    """Every field's value: the bidder's identity and the computed Netto."""
    bidder = (parameters or {}).get("bidder") or {}

    def text(key: str) -> Optional[str]:
        value = bidder.get(key)
        return value.strip() if isinstance(value, str) and value.strip() else None

    city = text("city") or ""
    plz = text("plz")
    place = " ".join(part for part in (plz, city) if part) or None
    date = today or datetime.date.today()
    ort_datum = ("%s, %s" % (city, german_date(date))) if city else german_date(date)

    values: Dict[str, Optional[str]] = {
        "cover.name": text("name"),
        "cover.strasse": text("street"),
        "cover.plz_ort": place,
        "cover.telefon": text("phone"),
        "cover.fax": text("fax"),
        "cover.sachbearbeiter": text("contact"),
        "cover.ort_datum": ort_datum,
        "cover.eingabesumme": (
            format_value(netto_chf, "amount") if netto_chf is not None else None
        ),
        "cover.unterschrift": None,
    }
    return {field.id: values.get(field.id) for field in cover.fields}


def fill_offer_cover(
    doc: fitz.Document, cover: OfferCover, values: Dict[str, Optional[str]]
) -> int:
    """Write the values into the cover page of an open document; returns how many."""
    if cover.page is None or not (1 <= cover.page <= doc.page_count):
        return 0
    page = doc[cover.page - 1]
    W, H = page.rect.width, page.rect.height
    written = 0
    for field in cover.fields:
        value = values.get(field.id)
        if not value:
            continue
        rect = fitz.Rect(field.bbox[0] * W, field.bbox[1] * H, field.bbox[2] * W, field.bbox[3] * H)
        # The amount sits right-aligned in its box; names and addresses left.
        align = "right" if field.row == "eingabesumme" else "left"
        write_on_leader(page, rect, field.baseline * H, value, align=align)
        written += 1
    return written
