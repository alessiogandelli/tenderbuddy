"""Productivity coverage and supplier-package pricing (the D fixes).

Every catalogue install_code must have a labour rule, or the matched position
silently falls to review_required. Supplier packages are quoted by the supplier,
so they must not depend on a rule of ours at all.
"""
from __future__ import annotations

from app.domain.enums import ItemFlag, ItemStatus, PriceSource, Unit
from app.domain.models import Item, Match
from app.pipeline.pricing import price_item, reconcile_item
from app.pipeline.pricing_db import get_pricing_db


def test_every_catalog_install_code_has_a_productivity_rule():
    db = get_pricing_db()
    codes = {p.install_code for p in db.product_list if p.install_code}
    missing = sorted(code for code in codes if code not in db.rules)
    assert missing == [], "catalogue install_codes without a rule: %s" % missing


def test_no_install_rule_is_material_only():
    rule = get_pricing_db().rule("NO_INSTALL")
    assert rule is not None
    assert rule.base_hours_per_unit == 0.0


def _matched(product_id: str, install_code: str, price_source: PriceSource) -> Item:
    return Item(
        lv_id="LV0001",
        source_page=1,
        description_raw="position",
        quantity=1.0,
        unit=Unit.PC,
        match=Match(
            product_id=product_id,
            install_code=install_code,
            confidence=0.9,
            price_source=price_source,
        ),
    )


def test_supplier_package_is_quotable_without_a_rule():
    db = get_pricing_db()
    # P-AHU-S-0700 is a supplier package; give it an install_code with no rule
    # to prove the supplier path does not need one.
    item = _matched("P-AHU-S-0700", "NO_SUCH_RULE", PriceSource.SUPPLIER_PACKAGE)
    reconcile_item(item, db)

    assert item.status is ItemStatus.SUPPLIER_QUOTE_REQUIRED
    assert ItemFlag.NO_MATCH not in item.flags

    result = price_item(item, db)
    assert result.material_cost_chf and result.material_cost_chf > 0
    assert result.labour_cost_chf == 0.0
    assert result.price_source is PriceSource.SUPPLIER_PACKAGE


def test_catalog_product_without_a_rule_stays_review_required():
    db = get_pricing_db()
    item = _matched("P-AIR-001", "NO_SUCH_RULE", PriceSource.CATALOG)
    reconcile_item(item, db)

    assert item.status is ItemStatus.REVIEW_REQUIRED
    assert ItemFlag.NO_MATCH in item.flags
