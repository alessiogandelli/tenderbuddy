"""The offer form: the first page classified ``modulo_offerta``, filled in.

Swiss tenders carry a standard conditions form (CRB "Konditionen"): a summary
per BKP chapter (Brutto / Netto) and the conditions chain

    Brutto − Rabatt % = Zwischentotal 1 − Skonto % = Zwischentotal 2
    − allg. Bauabzüge % = Zwischentotal 3 + MWST % = Netto

with an "Eingabesumme" column (ours) and a "Revidiert" column (the client's).
Every blank is printed as a dotted leader ("......"), which is text in the PDF,
so each fillable field is found exactly: its box is the leader, its row is the
label at the start of the line, its column the header above it. No AI is used.

The Brutto is the sum of the amounts the offer prints in the LV (the same
positions and the same bid scenario as the export). Rabatt and Skonto are the
tender's parameters (``offer_conditions``, 0% by default); the Bauabzüge and
MWST rates are read from the form itself, where the client prints them. Any
field can be typed by hand; the fields below it follow.
"""
from __future__ import annotations

import re
import unicodedata
from pathlib import Path
from typing import Dict, List, Optional, Sequence

import fitz  # PyMuPDF

from ..domain.enums import PageType
from ..domain.models import FormField, OfferForm, PageClassification

_DOTS = re.compile(r"^\.{5,}$")
_NUMBER = re.compile(r"^\d+(?:[.,]\d+)?$")

# Row labels (normalised, without accents) -> row key, most specific first.
_ROWS = (
    ("zwischentotal 1", "zt1"),
    ("zwischentotal 2", "zt2"),
    ("zwischentotal 3", "zt3"),
    ("allg. bauabzuge", "bauabzuege"),
    ("bauabzuge", "bauabzuege"),
    ("rabatt", "rabatt"),
    ("skonto", "skonto"),
    ("mwst", "mwst"),
    ("brutto", "brutto"),
    ("netto", "netto"),
    ("ohne npk", "ohne_npk"),
    ("total", "total"),
)
_COLUMN_HEADERS = {"eingabesumme": "eingabe", "revidiert": "revidiert", "brutto": "brutto", "netto": "netto"}

# Conditions rows in chain order.
CHAIN = ["brutto", "rabatt", "zt1", "skonto", "zt2", "bauabzuege", "zt3", "mwst", "netto"]


def _norm(text: str) -> str:
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode()
    return " ".join(text.lower().split())


def _row_key(label: str, section: str) -> Optional[str]:
    low = _norm(label)
    for needle, key in _ROWS:
        if needle in low:
            # In the summary, any BKP chapter line is the chapter row.
            return key
    if section == "summary" and re.match(r"^\d{3}\b", low):
        return "chapter"
    return None


def first_form_page(page_types: Sequence[PageClassification]) -> Optional[int]:
    pages = sorted(p.page for p in page_types if p.type == PageType.MODULO_OFFERTA)
    return pages[0] if pages else None


def detect_offer_form(pdf_path: Path, page_types: Sequence[PageClassification]) -> OfferForm:
    """Find every fillable field of the first offer-form page."""
    number = first_form_page(page_types)
    if number is None:
        return OfferForm(page=None, fields=[])
    doc = fitz.open(pdf_path)
    try:
        if not (1 <= number <= doc.page_count):
            return OfferForm(page=None, fields=[])
        page = doc[number - 1]
        return _detect_on_page(page, number)
    finally:
        doc.close()


def _detect_on_page(page: fitz.Page, number: int) -> OfferForm:
    W, H = page.rect.width, page.rect.height
    words = page.get_text("words")  # x0, y0, x1, y1, text, block, line, word
    # Baselines of every span, to write each value exactly on its line.
    baselines = []
    for block in page.get_text("dict")["blocks"]:
        for line in block.get("lines", []):
            for span in line["spans"]:
                baselines.append((span["bbox"], span["origin"][1]))

    def baseline_of(box) -> float:
        middle = (box[1] + box[3]) / 2
        for bbox, origin in baselines:
            if bbox[0] <= box[0] + 1 and bbox[2] >= box[2] - 1 and bbox[1] <= middle <= bbox[3]:
                return origin
        return box[3] - (box[3] - box[1]) * 0.22

    # The "Konditionen" heading splits the summary (above) from the conditions.
    split = next((w[1] for w in words if _norm(w[4]) == "konditionen"), H)
    headers = [w for w in words if _norm(w[4]) in _COLUMN_HEADERS]

    def column_of(box, section: str) -> Optional[str]:
        candidates = [
            h for h in headers
            if h[3] <= box[1] + 2
            and (h[1] >= split) == (section == "conditions")
            and min(h[2], box[2]) - max(h[0], box[0]) > -10
        ]
        if not candidates:
            return None
        nearest = max(candidates, key=lambda h: h[1])
        return _COLUMN_HEADERS[_norm(nearest[4])]

    fields: List[FormField] = []
    rates: Dict[str, float] = {}
    lines: Dict[int, list] = {}
    for word in words:
        lines.setdefault(round((word[1] + word[3]) / 2), []).append(word)
    for y in sorted(lines):
        line = sorted(lines[y], key=lambda w: w[0])
        # The label runs up to the first blank or printed rate ("1.30 %"); a
        # number inside the label ("Zwischentotal 1", "244 Lufttechnische…") stays.
        def starts_field(i: int) -> bool:
            text = line[i][4]
            rate = _NUMBER.match(text) and i + 1 < len(line) and line[i + 1][4] == "%"
            return bool(_DOTS.match(text) or rate)

        first_field = next((i for i in range(len(line)) if starts_field(i)), len(line))
        label = " ".join(w[4] for w in line[:first_field] if not _DOTS.match(w[4]))
        section = "conditions" if y > split else "summary"
        row = _row_key(label, section) if label else None
        for index, word in enumerate(line):
            text = word[4]
            follows_percent = index + 1 < len(line) and line[index + 1][4] == "%"
            if _NUMBER.match(text) and follows_percent and row:
                # A rate the client printed (allg. Bauabzüge 1.30 %, MWST 8.10 %).
                rates[row] = float(text.replace(",", "."))
                continue
            if not _DOTS.match(text) or row is None:
                continue
            column = "pct" if follows_percent else column_of(word, section)
            if column is None:
                continue
            box = [word[0] / W, word[1] / H, word[2] / W, word[3] / H]
            fields.append(
                FormField(
                    id="%s.%s.%s" % (section, row, column),
                    page=number,
                    bbox=[round(v, 4) for v in box],
                    baseline=round(baseline_of(word) / H, 4),
                    section=section,
                    row=row,
                    column=column,
                    kind="percent" if column == "pct" else "amount",
                    label=label,
                )
            )
    return OfferForm(page=number, fields=fields, printed_rates=rates)


def compute_offer_form(
    form: OfferForm, brutto: float, parameters: dict
) -> Dict[str, Optional[float]]:
    """Every field's value: typed by hand, or computed down the chain."""
    conditions = (parameters or {}).get("offer_conditions") or {}
    rates = {
        "rabatt": float(conditions.get("rabatt_pct", 0.0) or 0.0),
        "skonto": float(conditions.get("skonto_pct", 0.0) or 0.0),
        "bauabzuege": float(form.printed_rates.get("bauabzuege", 0.0)),
        "mwst": float(form.printed_rates.get("mwst", 0.0)),
    }
    by_id = {field.id: field for field in form.fields}
    values: Dict[str, Optional[float]] = {}

    def pick(field_id: str, computed: Optional[float]) -> Optional[float]:
        field = by_id.get(field_id)
        if field is not None and field.override is not None:
            return field.override
        return None if computed is None else round(computed, 2)

    # Percent fields show the rate in use (a typed rate overrides the parameter).
    for row in ("rabatt", "skonto"):
        rate = pick("conditions.%s.pct" % row, rates[row])
        rates[row] = rate if rate is not None else 0.0
        values["conditions.%s.pct" % row] = rate

    chain: Dict[str, float] = {}
    chain["brutto"] = pick("conditions.brutto.eingabe", brutto)
    chain["rabatt"] = pick("conditions.rabatt.eingabe", chain["brutto"] * rates["rabatt"] / 100)
    chain["zt1"] = pick("conditions.zt1.eingabe", chain["brutto"] - chain["rabatt"])
    chain["skonto"] = pick("conditions.skonto.eingabe", chain["zt1"] * rates["skonto"] / 100)
    chain["zt2"] = pick("conditions.zt2.eingabe", chain["zt1"] - chain["skonto"])
    chain["bauabzuege"] = pick("conditions.bauabzuege.eingabe", chain["zt2"] * rates["bauabzuege"] / 100)
    chain["zt3"] = pick("conditions.zt3.eingabe", chain["zt2"] - chain["bauabzuege"])
    chain["mwst"] = pick("conditions.mwst.eingabe", chain["zt3"] * rates["mwst"] / 100)
    chain["netto"] = pick("conditions.netto.eingabe", chain["zt3"] + chain["mwst"])
    for row, value in chain.items():
        values["conditions.%s.eingabe" % row] = value

    # Summary: the tender is one BKP chapter, so chapter and total carry the
    # Brutto and the Netto of the conditions; "ohne NPK" stays for the hand.
    computed_summary = {
        "summary.chapter.brutto": chain["brutto"],
        "summary.chapter.netto": chain["netto"],
        "summary.total.brutto": chain["brutto"],
        "summary.total.netto": chain["netto"],
    }
    for field in form.fields:
        if field.id in values:
            continue
        values[field.id] = pick(field.id, computed_summary.get(field.id))
    return values


def format_value(value: float, kind: str) -> str:
    if kind == "percent":
        return "%.2f" % value
    whole, cents = f"{value:,.2f}".split(".")
    return f"{whole.replace(',', chr(39))}.{cents}"


def fill_offer_form(doc: fitz.Document, form: OfferForm, values: Dict[str, Optional[float]]) -> int:
    """Write the values into the form page of an open document; returns how many."""
    if form.page is None or not (1 <= form.page <= doc.page_count):
        return 0
    page = doc[form.page - 1]
    W, H = page.rect.width, page.rect.height
    written = 0
    for field in form.fields:
        value = values.get(field.id)
        if value is None:
            continue
        rect = fitz.Rect(field.bbox[0] * W, field.bbox[1] * H, field.bbox[2] * W, field.bbox[3] * H)
        # The value replaces the dotted leader: cover it, then write on its line.
        page.draw_rect(rect, color=None, fill=(1, 1, 1), overlay=True)
        text = format_value(value, field.kind)
        size = 9.0
        width = fitz.get_text_length(text, fontname="helv", fontsize=size)
        if width > rect.width:
            size = max(5.0, size * rect.width / width)
            width = fitz.get_text_length(text, fontname="helv", fontsize=size)
        page.insert_text(
            fitz.Point(rect.x1 - width, field.baseline * H), text, fontname="helv", fontsize=size
        )
        written += 1
    return written
