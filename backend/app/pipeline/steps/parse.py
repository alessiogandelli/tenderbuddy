"""Step 1 - Parse: turn page text into raw Items.

This is deliberately crude and iterative (ticket 09). German LV tables come out
of the PDF with scrambled column order: a description block followed by variant
lines like ``Ø 10 cm Stk 5``. Every row that cannot be parsed still becomes an
Item carrying flags, because silently dropping data is the worst outcome.
"""
from __future__ import annotations

import re
from pathlib import Path
from typing import List, Optional

from ...domain.enums import ItemFlag, ItemStatus, normalize_unit
from ...domain.models import Item
from ..extractors import Document, PdfReader

# unit token immediately followed by a quantity, e.g. "Stk 5", "m2 52"
_QUANTITY_RE = re.compile(
    r"(?P<unit>Stk\.?|Stück|m2|m²|QM|qm|m|St)\s+(?P<qty>\d+(?:[.,]\d+)?)\b",
    re.IGNORECASE,
)
_SYSTEM_RE = re.compile(r"(\d{3}\.\d{2}\s+LA\d+[^\n]*)")
_HEADER_TOKENS = (
    "pos.",
    "gegenstand",
    "mass-",
    "gattg",
    "betrag",
    "einheits-",
    "preis",
    "seite",
    "submission",
    "docx",
)

# Plausible quantity ranges per unit. Anything outside is a mis-parse (e.g. a
# year or a price column leaking into the quantity), so it is flagged, not used.
_QTY_RANGE = {
    "pc": (1.0, 2000.0),
    "m": (0.1, 2000.0),
    "m2": (0.1, 5000.0),
    "h": (0.1, 5000.0),
}


def _plausible(qty: float, unit) -> bool:
    if 1900.0 <= qty <= 2100.0:  # a year, almost never a real quantity
        return False
    if unit is None:
        return 0.0 < qty < 10000.0
    low, high = _QTY_RANGE.get(unit.value, (0.0, 10000.0))
    return low <= qty <= high


def _is_header_line(line: str) -> bool:
    low = line.strip().lower()
    if not low:
        return True
    if low.startswith("h:\\") or "\\" in low:
        return True
    return any(token in low for token in _HEADER_TOKENS)


def _detect_system(text: str) -> Optional[str]:
    match = _SYSTEM_RE.search(text)
    if match:
        return match.group(1).strip()
    return None


def parse_document(document: Document, reader: PdfReader, pdf_path: Path,
                   with_geometry: bool = True) -> List[Item]:
    items: List[Item] = []
    counter = 0

    for page in document.pages:
        system = _detect_system(page.text)
        pending_description: List[str] = []
        variant_count = 0

        for raw_line in page.text.splitlines():
            line = raw_line.strip()
            if not line:
                continue
            quantity_match = _QUANTITY_RE.search(line)
            if quantity_match:
                counter += 1
                variant_count += 1
                dimension = line[: quantity_match.start()].strip(" ,;:-")
                qty = float(quantity_match.group("qty").replace(",", "."))
                unit = normalize_unit(quantity_match.group("unit"))

                description = " ".join(pending_description).strip()
                item = Item(
                    lv_id="LV%04d" % counter,
                    system=system,
                    source_page=page.number,
                    description_raw=(description + (" " + dimension if dimension else "")).strip()
                    or dimension
                    or None,
                    quantity=qty,
                    unit=unit,
                    status=ItemStatus.REVIEW_REQUIRED,
                )
                if not _plausible(qty, unit):
                    item.quantity = None
                    item.flags.append(ItemFlag.UNPARSED_ROW)
                    item.flags.append(ItemFlag.MISSING_QUANTITY)
                if not description:
                    item.flags.append(ItemFlag.MISSING_DESCRIPTION)
                if unit is None:
                    item.flags.append(ItemFlag.UNCLEAR_UNIT)
                if with_geometry:
                    needle = line if dimension == "" else dimension
                    bbox = reader.locate(pdf_path, page.number, needle)
                    if bbox:
                        item.source_bbox = list(bbox)
                items.append(item)
                continue

            if _is_header_line(line):
                continue
            pending_description.append(line)

        if variant_count > 1:
            for item in items[-variant_count:]:
                if ItemFlag.MULTI_VARIANT_EXPANDED not in item.flags:
                    item.flags.append(ItemFlag.MULTI_VARIANT_EXPANDED)

    return items
