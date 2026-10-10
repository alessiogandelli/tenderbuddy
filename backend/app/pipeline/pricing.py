"""The pricing engine: the deterministic math that must match the golden output.

Formulas are pinned in ``docs/contract/README.md`` section 4. Nothing here may
drift from ``data/expected_output_example.json``: the golden test guards it.
"""
from __future__ import annotations

import math
from typing import List, Optional

from ..domain.enums import ItemFlag, ItemStatus, PriceSource
from ..domain.models import (
    BidRange,
    BidScenario,
    Coverage,
    Item,
    PositionResult,
    Summary,
)
from .pricing_db import PricingDB

SELECTION_LOGIC = (
    "Compare bid price, margin, estimated win probability and expected contribution."
)


def _factor_product(db: PricingDB, factor_keys: List[str]) -> float:
    """Product of project factors, with site_efficiency applied as its reciprocal."""
    product = 1.0
    factors = db.factors
    for key in factor_keys:
        if key == "site_efficiency":
            product *= 1.0 / float(factors[key])
        else:
            product *= float(factors[key])
    return product


def price_item(item: Item, db: PricingDB) -> PositionResult:
    """Compute a PositionResult for one Item.

    Items without quantity/unit/match stay unpriced but keep their status and
    flags: losing them silently is the worst outcome.
    """
    base = PositionResult(
        lv_id=item.lv_id,
        source_page=item.source_page,
        quantity=item.quantity,
        unit=item.unit,
        status=item.status,
        review_required=item.status not in (ItemStatus.CALCULATED, ItemStatus.OUT_OF_SCOPE),
    )

    if item.manual_unit_price_chf is not None and item.quantity is not None:
        return _price_manual(item, base)

    if item.match is None or item.quantity is None:
        return base

    product = db.product(item.match.product_id)
    rule = db.rule(item.match.install_code) if item.match.install_code else None
    if product is None or product.net_cost_chf is None:
        return base

    # A supplier package is quoted by the supplier, so our labour rule is
    # optional: without one we still price the material and let the supplier
    # confirm the rest. A catalogue product needs a rule to be priceable.
    supplier = bool(product.supplier_quote_required)
    if rule is None and not supplier:
        return base

    waste = 1.0 + db.waste_pct / 100.0
    material = item.quantity * float(product.net_cost_chf) * waste

    if rule is not None:
        hours = item.quantity * float(rule.base_hours_per_unit) * _factor_product(
            db, rule.factor_keys
        )
        rate = float(rule.default_hourly_rate_chf or 0.0)
        factor_product = round(_factor_product(db, rule.factor_keys), 4)
        install_code = rule.install_code
    else:
        hours = 0.0
        rate = 0.0
        factor_product = None
        install_code = item.match.install_code
    labour = hours * rate
    direct = material + labour

    base.matched_product_id = product.product_id
    base.install_code = install_code
    base.net_unit_cost_chf = round(float(product.net_cost_chf), 4)
    base.material_cost_chf = round(material, 2)
    base.adjusted_install_hours = round(hours, 2)
    base.labour_cost_chf = round(labour, 2)
    base.direct_position_cost_chf = round(direct, 2)
    base.base_hours_per_unit = (
        round(float(rule.base_hours_per_unit), 4) if rule is not None else None
    )
    base.hourly_rate_chf = round(rate, 2)
    base.factor_product = factor_product
    base.price_source = (
        PriceSource.SUPPLIER_PACKAGE
        if supplier or item.match.price_source == PriceSource.SUPPLIER_PACKAGE
        else PriceSource.CATALOG
    )
    base.match_confidence = round(float(item.match.confidence), 4)
    return base


def _price_manual(item: Item, base: PositionResult) -> PositionResult:
    """An estimator's all-in unit price: counted as material, no waste, no labour."""
    unit_price = float(item.manual_unit_price_chf)
    direct = item.quantity * unit_price
    base.matched_product_id = item.match.product_id if item.match else None
    base.net_unit_cost_chf = round(unit_price, 4)
    base.material_cost_chf = round(direct, 2)
    base.adjusted_install_hours = 0.0
    base.labour_cost_chf = 0.0
    base.direct_position_cost_chf = round(direct, 2)
    base.price_source = PriceSource.MANUAL
    return base


def compute_summary(results: List[PositionResult], db: PricingDB) -> Summary:
    material = sum(r.material_cost_chf or 0.0 for r in results)
    labour = sum(r.labour_cost_chf or 0.0 for r in results)
    project = db.project_costs_chf() if db.include_project_costs else 0.0
    direct = material + labour + project
    with_overhead = direct * (1.0 + db.overhead_pct / 100.0)
    baseline = with_overhead * (1.0 + db.transport_pct / 100.0)
    indicative = baseline / (1.0 - db.target_margin_pct / 100.0)
    return Summary(
        material_cost_chf=round(material, 2),
        labour_cost_chf=round(labour, 2),
        direct_cost_chf=round(direct, 2),
        cost_baseline_chf=round(baseline, 2),
        indicative_selling_price_chf=round(indicative, 2),
        project_costs_chf=round(project, 2),
        include_project_costs=db.include_project_costs,
        overhead_chf=round(with_overhead - direct, 2),
        transport_equipment_chf=round(baseline - with_overhead, 2),
        margin_chf=round(indicative - baseline, 2),
    )


def _ceil_to(value: float, step: int) -> float:
    if step <= 0:
        return round(value, 2)
    return float(math.ceil(value / step) * step)


def compute_bid_range(summary: Summary, db: PricingDB) -> BidRange:
    params = db.parameters["stretch_bid_optimization"]
    baseline = summary.cost_baseline_chf

    reference_price = baseline / (1.0 - db.target_margin_pct / 100.0)

    sensitivity = float(params["price_sensitivity_probability_points_per_1pct_price"])
    base_prob = float(params["reference_win_probability"])
    net_adjust = float(params["strategic_appetite_adjustment"]) + float(
        params["competition_adjustment"]
    )
    pmin = float(params["minimum_probability"])
    pmax = float(params["maximum_probability"])

    margins = params["scenario_margins_pct"]
    scenarios: List[BidScenario] = []
    for name in params["scenario_names"]:
        margin = float(margins[name])
        bid = _ceil_to(baseline / (1.0 - margin / 100.0), db.round_to_chf)

        prob_pct = (reference_price - bid) / reference_price * 100.0 if reference_price else 0.0
        prob_raw = base_prob + net_adjust + sensitivity * prob_pct
        prob_raw = min(max(prob_raw, pmin), pmax)

        # Expected contribution uses the UNROUNDED probability.
        contribution = (bid - baseline) * prob_raw
        scenarios.append(
            BidScenario(
                scenario=name,
                bid_price_chf=round(bid, 2),
                margin_pct=margin,
                estimated_win_probability=round(prob_raw, 2),
                expected_contribution_chf=round(contribution, 2),
            )
        )

    return BidRange(scenarios=scenarios, selection_logic=SELECTION_LOGIC)


def coverage_of(items: List[Item]) -> Coverage:
    coverage = Coverage()
    for item in items:
        setattr(coverage, item.status.value, getattr(coverage, item.status.value) + 1)
    return coverage


_RESOLVED_BY_QUANTITY = {ItemFlag.MISSING_QUANTITY, ItemFlag.UNPARSED_ROW}
_RESOLVED_BY_UNIT = {ItemFlag.MISSING_UNIT, ItemFlag.UNCLEAR_UNIT}


def reconcile_item(item: Item, db: PricingDB) -> Item:
    """Recompute an Item's flags and status from its current data.

    Runs after matching (pipeline) and after every manual edit, so an Item can
    never be reported as ``calculated`` without a real price, and flags that no
    longer apply disappear. Nothing uncertain is ever silently hidden.
    """
    resolved = set()
    if item.quantity is not None:
        resolved |= _RESOLVED_BY_QUANTITY
    if item.unit is not None:
        resolved |= _RESOLVED_BY_UNIT
    if item.description_raw:
        resolved.add(ItemFlag.MISSING_DESCRIPTION)

    flags = [flag for flag in item.flags if flag not in resolved]

    if item.manual_unit_price_chf is not None and item.quantity is not None:
        # A human priced it: nothing is left to match.
        item.flags = [
            flag for flag in flags
            if flag not in (ItemFlag.NO_MATCH, ItemFlag.LOW_CONFIDENCE_MATCH)
        ]
        item.status = ItemStatus.CALCULATED
        return item

    def ensure(flag: ItemFlag, present: bool) -> None:
        if present and flag not in flags:
            flags.append(flag)
        elif not present and flag in flags:
            flags.remove(flag)

    product = db.product(item.match.product_id) if item.match else None
    rule = (
        db.rule(item.match.install_code)
        if item.match and item.match.install_code
        else None
    )
    # A supplier package is quoted by the supplier, so our labour rule is
    # optional; a catalogue product needs one to be priced.
    supplier = product is not None and bool(product.supplier_quote_required)
    priceable = (
        product is not None
        and product.net_cost_chf is not None
        and item.quantity is not None
        and (rule is not None or supplier)
    )

    ensure(ItemFlag.NO_MATCH, not priceable)

    if priceable:
        assert item.match is not None
        ensure(ItemFlag.LOW_CONFIDENCE_MATCH, item.match.confidence < 0.7)
        if supplier or item.match.price_source == PriceSource.SUPPLIER_PACKAGE:
            item.status = ItemStatus.SUPPLIER_QUOTE_REQUIRED
        else:
            item.status = ItemStatus.CALCULATED
    elif item.status in (ItemStatus.CALCULATED, ItemStatus.SUPPLIER_QUOTE_REQUIRED):
        item.status = ItemStatus.REVIEW_REQUIRED

    item.flags = flags
    return item


def build_position_results(items: List[Item], db: PricingDB) -> List[PositionResult]:
    return [price_item(item, db) for item in items]
