"""Step 4 - Match: assign each Item to a Catalogo Prodotto by attributes.

Matching is by category + size/DN + fire class + description tokens, never by
naive string equality (ticket 11), and never across incompatible units (a metre
of duct must not be priced as a piece of equipment). A missing match is a
visible status, never a guessed price.
"""
from __future__ import annotations

import re
from typing import List, Optional

from ...domain.enums import PriceSource
from ...domain.models import Item, Match, Product
from ..pricing import reconcile_item
from ..pricing_db import PricingDB

# category keywords -> catalog category names (lowercased substring)
_CATEGORY_HINTS = [
    ("brandschutz", "fire protection"),
    ("fire damper", "fire protection"),
    ("brandschutzklappe", "fire protection"),
    ("revisionsdeckel", "fire protection"),
    ("inspection", "fire protection"),
    ("schalldämpfer", "silencer"),
    ("schalldaempfer", "silencer"),
    ("silencer", "silencer"),
    ("tellerventil", "air terminal"),
    ("ventil", "air terminal"),
    ("valve", "air terminal"),
    ("drosselklappe", "damper"),
    ("damper", "damper"),
    ("volumenstrom", "flow controller"),
    ("volumen", "flow controller"),
    ("vav", "flow controller"),
    ("cav", "flow controller"),
    ("controller", "flow controller"),
    ("dämmung", "insulation"),
    ("daemmung", "insulation"),
    ("insulation", "insulation"),
    ("kanal", "ductwork"),
    ("duct", "ductwork"),
    ("bogen", "ductwork"),
    ("anschlusswinkel", "support"),
    ("support", "support"),
    ("ventilator", "equipment"),
    ("fan", "equipment"),
    ("ahu", "equipment"),
    ("steuerung", "controls"),
    ("control", "controls"),
]

_TOKEN_RE = re.compile(r"[a-zäöü0-9]{4,}")


def _tokens(text: str) -> set:
    return set(_TOKEN_RE.findall(text.lower()))


def _hint_category(text: str) -> Optional[str]:
    low = text.lower()
    for needle, category in _CATEGORY_HINTS:
        if needle in low:
            return category
    return None


def _size_matches(item: Item, product: Product) -> bool:
    item_dn = item.attributes.get("dn")
    item_size = str(item.attributes.get("size") or "")
    prod_text = (product.description or "") + " " + (product.model or "")
    if item_dn is not None and ("DN%s" % item_dn) in prod_text:
        return True
    if item_size and item_size.lower() in prod_text.lower():
        return True
    return item_dn is None and not item_size


def _unit_compatible(item: Item, product: Product) -> bool:
    """A metre of duct must never be priced as a piece of equipment."""
    if item.unit is None or not product.unit:
        return True
    return product.unit.lower() == item.unit.value.lower()


def match_items(items: List[Item], db: PricingDB) -> List[Item]:
    product_tokens = {
        p.product_id: _tokens(
            "%s %s %s %s" % (p.description or "", p.model or "", p.category or "", p.subcategory or "")
        )
        for p in db.product_list
    }

    for item in items:
        text = "%s %s" % (item.description_raw or "", item.description_normalized or "")
        hinted = _hint_category(text)
        item_tokens = _tokens(text)

        best: Optional[Product] = None
        best_score = 0.0
        for product in db.product_list:
            if not _unit_compatible(item, product):
                continue
            score = 0.0
            if hinted and product.category:
                category = product.category.lower()
                if hinted == category:
                    score += 0.6
                elif hinted in category or category in hinted:
                    score += 0.3
            overlap = item_tokens & product_tokens[product.product_id]
            if overlap:
                score += min(0.3, 0.1 * len(overlap))
            if _size_matches(item, product):
                score += 0.3
            elif item.attributes.get("dn") is not None:
                score -= 0.4
            if item.attributes.get("fire_class") and product.category == "Fire protection":
                score += 0.05
            if score > best_score:
                best_score = score
                best = product

        if best is None or best_score <= 0:
            item.match = None
            reconcile_item(item, db)
            continue

        confidence = min(0.95, 0.5 + best_score * 0.4)
        supplier = bool(best.supplier_quote_required)
        item.match = Match(
            product_id=best.product_id,
            install_code=best.install_code,
            confidence=round(confidence, 2),
            price_source=PriceSource.SUPPLIER_PACKAGE if supplier else PriceSource.CATALOG,
        )
        reconcile_item(item, db)

    return items
