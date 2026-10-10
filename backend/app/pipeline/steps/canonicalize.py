"""Step 3 - Canonicalize: normalize attributes and descriptions of raw Items."""
from __future__ import annotations

import re
from typing import List

from ...domain.models import Item

_DN_RE = re.compile(r"(?:DN|Ø)\s*(\d{1,4})\b", re.IGNORECASE)
_CM_RE = re.compile(r"Ø\s*(\d{1,3}(?:[.,]\d+)?)\s*cm", re.IGNORECASE)
_RECT_RE = re.compile(r"(\d{2,4})\s*[x×]\s*(\d{2,4})")
_FIRE_RE = re.compile(r"EI\s*(\d{2,3})", re.IGNORECASE)


def _dedupe_key(item: Item):
    """Signature of an identical row. Repeated CPN codes across systems
    (UTA1 vs UTA2) stay distinct because the system is part of the key."""
    pos = item.attributes.get("pos_number") if item.attributes else None
    desc = (item.description_normalized or item.description_raw or "").strip().lower()
    unit = item.unit.value if item.unit else None
    return (item.system, pos, desc, item.quantity, unit)


def dedupe_items(items: List[Item]) -> List[Item]:
    """Drop exact duplicates (same system, code, description, quantity, unit)."""
    seen = set()
    unique: List[Item] = []
    for item in items:
        key = _dedupe_key(item)
        if all(part is None or part == "" for part in key[:4]):
            unique.append(item)
            continue
        if key in seen:
            continue
        seen.add(key)
        unique.append(item)
    return unique


def canonicalize_items(items: List[Item]) -> List[Item]:
    for item in items:
        text = " ".join(
            part for part in (item.description_raw, item.attributes.get("variant")) if part
        )
        attrs = dict(item.attributes)

        rect = _RECT_RE.search(text)
        if rect:
            attrs["width_mm"] = int(rect.group(1))
            attrs["height_mm"] = int(rect.group(2))
            attrs["size"] = "%sx%s" % (rect.group(1), rect.group(2))

        cm = _CM_RE.search(text)
        if cm:
            dn = int(round(float(cm.group(1).replace(",", ".")) * 10))
            attrs["dn"] = dn
            attrs.setdefault("size", "DN%d" % dn)

        dn = _DN_RE.search(text)
        if dn and "dn" not in attrs:
            attrs["dn"] = int(dn.group(1))
            attrs.setdefault("size", "DN%s" % dn.group(1))

        fire = _FIRE_RE.search(text)
        if fire:
            attrs["fire_class"] = "EI" + fire.group(1)

        if attrs:
            item.attributes = attrs
        if item.description_raw and not item.description_normalized:
            item.description_normalized = item.description_raw.strip()

    return dedupe_items(items)
