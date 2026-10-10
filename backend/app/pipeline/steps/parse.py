"""Step 1 - Parse: turn page text into raw Items.

German LV pages are a description block followed by one or more variant rows
like ``Grösse / Ø 10 cm / Stk / 5`` where the unit token and the quantity sit on
*separate* lines. A page is only an LV page if it carries the column header; the
index, cover and "Besondere Bedingungen" pages are skipped. Every row that
cannot be parsed still becomes an Item carrying flags, because silently dropping
data is the worst outcome.
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
    r"(?P<unit>Stk\.?|Stück|Stueck|m2|m²|QM|qm|m|St)\s+(?P<qty>\d+(?:[.,]\d+)?)\b",
    re.IGNORECASE,
)
# a line that is only a unit token ("Stk"), whose quantity is the next line
_UNIT_ONLY_RE = re.compile(
    r"^(?P<unit>Stk\.?|Stück|Stueck|m2|m²|QM|qm|m|St|h|Std|LS|Pauschale|System|Anlage)\.?$",
    re.IGNORECASE,
)
_QTY_ONLY_RE = re.compile(r"^\d+(?:[.,]\d+)?$")

_SYSTEM_RE = re.compile(r"(\d{3}\.\d{2}\s+LA\d+[^\n]*)")

# Italian "modulo offerta": the measured cell is a quantity, a unit and the blank
# price underscores, e.g. "8.00 pz___________" or "190.00 m___________".
_IT_QTY_CELL_RE = re.compile(
    r"^\s*(?P<qty>\d+(?:['\u2019]\d{3})*(?:[.,]\d+)?)\s*"
    r"(?P<unit>m2|m\u00b2|mq|m|pz|pce|pcs|ac|h|ore|up)\s*_*\s*$",
    re.IGNORECASE,
)
# A printed position code, e.g. "R 291.011", "311.101", ".028", "R 512.022".
_IT_POS_RE = re.compile(r"(?:^|\s)(R\s*)?(?P<code>\d{0,3}\.?\d{2,3}(?:[.:]\d{1,3}){0,2})(?:\s|$)")

_IT_FURNITURE = (
    "oggetto:", "pagina:", "opera da:", "data:", "pos.", "testo", "gq", "prz",
    "totale", "cpn-costruzione", "prog.", "modulo offerta", "capitolo", "sdo",
    "udo", "sdc", "tp", "condizioni", "diversi", "smontaggi", "ventilazione",
)

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

# An LV page carries the column header block. Its absence means index/legal/cover.
_LV_HEADER_TOKENS = ("gegenstand",)
_LV_COLUMN_TOKENS = ("mass-", "einheits-", "gattg")

# The Italian "modulo offerta" table header (CPN/SIA preziario): its columns.
_IT_HEADER_TOKENS = ("testo",)
_IT_COLUMN_TOKENS = ("gq", "um", "qtà", "prz", "totale")

# A size line, distinguishing a variant row from a new position title.
_SIZE_RE = re.compile(
    r"(Ø|DN\s*\d|\d+\s*[x×]\s*\d+|\d+(?:[.,]\d+)?\s*(?:cm|mm)\b)",
    re.IGNORECASE,
)
# Attribute labels inside a description block; they never start a new position.
_ATTR_LABELS = {
    "fabrikat",
    "typ",
    "farbe",
    "grösse",
    "groesse",
    "material",
    "ausführung",
    "ausfuehrung",
    "bauweise",
    "anschluss",
    "nennweite",
    "länge",
    "laenge",
    "breite",
    "höhe",
    "hoehe",
    "abmessung",
}

# Plausible quantity ranges per unit. Anything outside is a mis-parse (e.g. a
# year or a price column leaking into the quantity), so it is flagged, not used.
_QTY_RANGE = {
    "pc": (1.0, 2000.0),
    "m": (0.1, 2000.0),
    "m2": (0.1, 5000.0),
    "h": (0.1, 5000.0),
}


def plausible_quantity(qty: float, unit) -> bool:
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
    if low.startswith(("h:\\", "h:/")):
        return True
    if "\\" in low and low.endswith((".docx", ".doc", ".pdf")):
        return True
    return any(token in low for token in _HEADER_TOKENS)


def _has_italian_lv_header(text: str) -> bool:
    """The Italian modulo offerta header: 'Pos. Testo GQ Qtà UM Prz/Un Totale'."""
    low = text.lower()
    if "testo" in low and "um" in low and ("qtà" in low or "prz" in low or "totale" in low):
        return True
    return "gq" in low and "um" in low and ("prz" in low or "totale" in low)


def _is_lv_page(text: str) -> bool:
    low = text.lower()
    if all(tok in low for tok in _LV_HEADER_TOKENS) and any(
        tok in low for tok in _LV_COLUMN_TOKENS
    ):
        return True
    if _has_italian_lv_header(text):
        return True
    return bool(_SYSTEM_RE.search(text))


def _is_size_line(line: str) -> bool:
    return bool(_SIZE_RE.search(line))


def _is_attr_label(line: str) -> bool:
    return line.strip().lower().rstrip(":") in _ATTR_LABELS


# All-caps section banners ("ARMATUREN UND INSTRUMENTE"); not part of a position.
def _is_section_title(line: str) -> bool:
    stripped = line.strip()
    if len(stripped) < 8 or " " not in stripped:
        return False
    return stripped.upper() == stripped and any(ch.isalpha() for ch in stripped)


def _content_start(lines: List[str]) -> int:
    """Index of the first real content line, past the repeated page preamble.

    Each LV page opens with the project/system/date block and the column header
    (``Pos. Gegenstand Mass- ... Fr. C``); everything up to and including it must
    not leak into the first position's description.
    """
    start = 0
    for idx, line in enumerate(lines[:40]):
        if "gegenstand" in line.lower():
            start = idx + 1
            break
    while start < len(lines):
        low = lines[start].strip().lower()
        if not low:
            start += 1
            continue
        if low in ("fr.", "fr", "c") or any(tok in low for tok in _HEADER_TOKENS):
            start += 1
            continue
        break
    return start


def _detect_system(text: str) -> Optional[str]:
    match = _SYSTEM_RE.search(text)
    if match:
        return match.group(1).strip()
    return _detect_italian_system(text)


# The Italian modulo offerta prints the allocation block, e.g.
#   SdO 244  UdO UTA1  SdC 244.0  (or the flattened '244\n: UTA1\n: 244.2').
# It is the only thing that tells repeated CPN codes (UTA1 vs UTA2) apart, so it
# becomes the system label and the UI groups by it.
_IT_UO_RE = re.compile(r":\s*(UTA\s*\d+|DIV|Diversi|P\s*\d)\b", re.IGNORECASE)
_IT_SDC_RE = re.compile(r":\s*(\d{3}\.\d+)")
_IT_UDO_RE = re.compile(r"\bUdO\s+(UTA\s*\d+|DIV|Diversi)\b", re.IGNORECASE)
_IT_SDC2_RE = re.compile(r"\bSdC\s+(\d{3}\.\d+)")


def _detect_italian_system(text: str) -> Optional[str]:
    uo = _IT_UO_RE.search(text) or _IT_UDO_RE.search(text)
    sdc = _IT_SDC_RE.search(text) or _IT_SDC2_RE.search(text)
    parts: List[str] = []
    if uo:
        parts.append(re.sub(r"\s+", "", uo.group(1)).upper())
    if sdc:
        parts.append(sdc.group(1))
    return " · ".join(parts) if parts else None


def _build_item(
    counter: int,
    system: Optional[str],
    page_number: int,
    description: str,
    size: str,
    dimension: str,
    qty: float,
    unit,
) -> Item:
    raw = " ".join(p for p in (description, size, dimension) if p).strip() or None
    item = Item(
        lv_id="LV%04d" % counter,
        system=system,
        source_page=page_number,
        description_raw=raw,
        quantity=qty,
        unit=unit,
        status=ItemStatus.REVIEW_REQUIRED,
    )
    if not plausible_quantity(qty, unit):
        item.quantity = None
        item.flags.append(ItemFlag.UNPARSED_ROW)
        item.flags.append(ItemFlag.MISSING_QUANTITY)
    if not raw:
        item.flags.append(ItemFlag.MISSING_DESCRIPTION)
    if unit is None:
        item.flags.append(ItemFlag.UNCLEAR_UNIT)
    return item


def _flush_block(block_items: List[Item]) -> None:
    """Two or more rows sharing one description block are variant rows."""
    if len(block_items) > 1:
        for item in block_items:
            if ItemFlag.MULTI_VARIANT_EXPANDED not in item.flags:
                item.flags.append(ItemFlag.MULTI_VARIANT_EXPANDED)


def _parse_italian_page(
    lines: List[str],
    system: Optional[str],
    page_number: int,
    reader: PdfReader,
    pdf_path: Path,
    with_geometry: bool,
    start_counter: int,
) -> tuple[List[Item], int]:
    """Deterministic fallback for Italian 'modulo offerta' pages.

    The measured cell (``8.00 pz___________``) is the unambiguous anchor; the
    text accumulated since the previous cell is that row's description, and a
    dotted code inside it (``R 291.011``) is the printed position number. This is
    cruder than the AI engine but stops the parser from inventing items on pages
    of legal prose.
    """
    items: List[Item] = []
    counter = start_counter
    pending: List[str] = []

    for raw in lines:
        line = raw.strip()
        if not line:
            continue
        low = line.lower()
        if any(low.startswith(token) for token in _IT_FURNITURE):
            continue
        if any(token in low for token in ("mo-", "rcfz", " i/20", "i/2022")):
            continue  # recurring CPN project header block
        if line.startswith(":") or _QTY_ONLY_RE.match(line):
            continue  # allocation lines ("244", ": DIV", ": 249.1") and page numbers

        cell = _IT_QTY_CELL_RE.match(line)
        if cell:
            counter += 1
            qty = float(
                cell.group("qty").replace("'", "").replace("\u2019", "").replace(",", ".")
            )
            unit = normalize_unit(cell.group("unit"))
            description = " ".join(pending).strip().strip("_ ")
            item = _build_item(
                counter, system, page_number, description, "", "", qty, unit
            )
            pos = _IT_POS_RE.search(description)
            if pos:
                item.attributes = {"pos_number": pos.group(0).strip()}
            if with_geometry:
                needle = item.attributes.get("pos_number") if item.attributes else None
                bbox = reader.locate(pdf_path, page_number, needle) if needle else None
                if bbox is None and description:
                    bbox = reader.locate(pdf_path, page_number, description)
                if bbox:
                    item.source_bbox = list(bbox)
            items.append(item)
            pending = []
            continue

        if low not in ("r",) and _is_header_line(line):
            continue
        cleaned = line.strip("_ ").strip()
        if cleaned:
            pending.append(cleaned)
        if len(pending) > 40:
            pending = pending[-40:]

    return items, counter


def parse_document(document: Document, reader: PdfReader, pdf_path: Path,
                   with_geometry: bool = True) -> List[Item]:
    items: List[Item] = []
    counter = 0

    for page in document.pages:
        if not _is_lv_page(page.text):
            continue

        system = _detect_system(page.text)
        if _has_italian_lv_header(page.text) and "gegenstand" not in page.text.lower():
            page_items, counter = _parse_italian_page(
                page.text.splitlines(), system, page.number, reader, pdf_path,
                with_geometry, counter,
            )
            items.extend(page_items)
            continue

        lines = page.text.splitlines()
        pending_description: List[str] = []
        pending_size: str = ""
        block_items: List[Item] = []
        last_was_blank = False
        i = _content_start(lines)

        while i < len(lines):
            line = lines[i].strip()
            if not line:
                last_was_blank = True
                i += 1
                continue

            quantity_match = _QUANTITY_RE.search(line)
            if quantity_match:
                counter += 1
                dimension = line[: quantity_match.start()].strip(" ,;:-")
                qty = float(quantity_match.group("qty").replace(",", "."))
                unit = normalize_unit(quantity_match.group("unit"))
                item = _build_item(
                    counter, system, page.number,
                    " ".join(pending_description).strip(), pending_size, dimension, qty, unit,
                )
                if with_geometry:
                    needle = pending_size or dimension or line
                    bbox = reader.locate(pdf_path, page.number, needle)
                    if bbox:
                        item.source_bbox = list(bbox)
                items.append(item)
                block_items.append(item)
                pending_size = ""
                last_was_blank = False
                i += 1
                continue

            if _UNIT_ONLY_RE.match(line):
                j = i + 1
                while j < len(lines) and not lines[j].strip():
                    j += 1
                if j < len(lines) and _QTY_ONLY_RE.match(lines[j].strip()):
                    counter += 1
                    qty = float(lines[j].strip().replace(",", "."))
                    unit = normalize_unit(line)
                    item = _build_item(
                        counter, system, page.number,
                        " ".join(pending_description).strip(), pending_size, "", qty, unit,
                    )
                    if with_geometry:
                        needle = pending_size or line
                        bbox = reader.locate(pdf_path, page.number, needle)
                        if bbox:
                            item.source_bbox = list(bbox)
                    items.append(item)
                    block_items.append(item)
                    pending_size = ""
                    last_was_blank = False
                    i = j + 1
                    continue

            if _is_header_line(line):
                last_was_blank = False
                i += 1
                continue

            if _is_section_title(line):
                last_was_blank = False
                i += 1
                continue

            # A new position block starts after a blank line, once the current
            # block has emitted at least one row, when the line is neither a size
            # nor an attribute label (the two ways a block continues).
            if (
                last_was_blank
                and block_items
                and not _is_size_line(line)
                and not _is_attr_label(line)
            ):
                _flush_block(block_items)
                block_items = []
                pending_description = []
                pending_size = ""

            if _is_size_line(line):
                pending_size = line
            else:
                pending_description.append(line)
            last_was_blank = False
            i += 1

        _flush_block(block_items)

    return items
