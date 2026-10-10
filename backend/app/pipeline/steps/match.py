"""Step 4 - Match: assign each Item to a Catalogo Prodotto by attributes.

Matching is by category + size/DN + fire class + description tokens, never by
naive string equality (ticket 11), and never across incompatible units (a metre
of duct must not be priced as a piece of equipment). A missing match is a
visible status, never a guessed price.
"""
from __future__ import annotations

import re
from typing import Any, List, Optional

from ... import config
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

# The AI matcher's pre-filter size. The catalog is small and only the
# unit-compatible subset goes in, so a wide net is cheap and keeps the correct
# product available (measured by the eval's candidate_recall). Overridable via
# BANDO_CANDIDATE_K so lexical and semantic retrieval can be compared.
CANDIDATE_K = config.CANDIDATE_K


def _tokens(text: str) -> set:
    return set(_TOKEN_RE.findall(text.lower()))


def _match_text(item: Item) -> str:
    """Description plus the section heading the row sits under.

    The section tells otherwise identical variant rows apart (buried vs.
    above-ground ducts, ...), so it must reach both the lexical filter and the
    AI matcher.
    """
    base = "%s %s" % (item.description_raw or "", item.description_normalized or "")
    section = (item.attributes or {}).get("section")
    return ("%s %s" % (section, base)).strip() if section else base


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


def _score(item: Item, product: Product, hinted: Optional[str],
           item_tokens: set, product_tokens: set) -> float:
    score = 0.0
    if hinted and product.category:
        category = product.category.lower()
        if hinted == category:
            score += 0.6
        elif hinted in category or category in hinted:
            score += 0.3
    overlap = item_tokens & product_tokens
    if overlap:
        score += min(0.3, 0.1 * len(overlap))
    if _size_matches(item, product):
        score += 0.3
    elif item.attributes.get("dn") is not None:
        score -= 0.4
    if item.attributes.get("fire_class") and product.category == "Fire protection":
        score += 0.05
    return score


def _product_tokens(db: PricingDB) -> dict:
    return {
        p.product_id: _tokens(
            "%s %s %s %s" % (p.description or "", p.model or "", p.category or "", p.subcategory or "")
        )
        for p in db.product_list
    }


def candidate_products(
    item: Item,
    db: PricingDB,
    k: int = CANDIDATE_K,
    product_tokens: Optional[dict] = None,
    semantic: Optional[Any] = None,
) -> List[Product]:
    """Unit-compatible catalog products for one Item.

    Ranking is the deterministic lexical score. When a ``semantic`` context is
    passed (from :mod:`app.pipeline.ai.retrieval`) the lexical top-k is unioned
    with the cosine top-k and re-ranked by a blend, so a product the lexical
    filter already found is never lost and language-independent matches are
    added. Measured by the eval's ``candidate_recall`` so a filter miss is never
    blamed on the model.
    """
    product_tokens = product_tokens if product_tokens is not None else _product_tokens(db)
    text = _match_text(item)
    hinted = _hint_category(text)
    item_tokens = _tokens(text)
    compatible = [p for p in db.product_list if _unit_compatible(item, p)]
    lexical = sorted(
        compatible,
        key=lambda p: (-_score(item, p, hinted, item_tokens, product_tokens[p.product_id])),
    )
    if semantic is None:
        return lexical[:k]

    pool = {p.product_id: p for p in lexical[:k]}
    for product in sorted(compatible, key=lambda p: -semantic.similarity(p.product_id))[:k]:
        pool.setdefault(product.product_id, product)
    weight = float(getattr(semantic, "weight", 0.7))

    def blended(product: Product) -> float:
        lex = _score(item, product, hinted, item_tokens, product_tokens[product.product_id])
        return weight * semantic.similarity(product.product_id) + (1.0 - weight) * min(
            1.0, max(0.0, lex)
        )

    return sorted(pool.values(), key=lambda p: -blended(p))[:k]


def match_items(items: List[Item], db: PricingDB) -> List[Item]:
    tokens = _product_tokens(db)

    for item in items:
        text = _match_text(item)
        hinted = _hint_category(text)
        item_tokens = _tokens(text)

        best: Optional[Product] = None
        best_score = 0.0
        for product in db.product_list:
            if not _unit_compatible(item, product):
                continue
            score = _score(item, product, hinted, item_tokens, tokens[product.product_id])
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
