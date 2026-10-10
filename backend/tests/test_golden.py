"""GOLDEN TEST: the seeded Bando must reproduce the expected output to the cent.

This is the single most valuable test in the repo: it guards the whole pricing
pipeline against silent drift. It asserts the contract surface, not internals.
"""
from __future__ import annotations

import json

from app.config import DATA_DIR

EXPECTED = json.loads((DATA_DIR / "expected_output_example.json").read_text(encoding="utf-8"))

POSITION_KEYS = [
    "lv_id",
    "source_page",
    "matched_product_id",
    "install_code",
    "quantity",
    "unit",
    "net_unit_cost_chf",
    "material_cost_chf",
    "adjusted_install_hours",
    "labour_cost_chf",
    "direct_position_cost_chf",
    "price_source",
    "match_confidence",
    "review_required",
    "status",
]


def _close(a, b, tol=0.011):
    if isinstance(a, (int, float)) and isinstance(b, (int, float)):
        return abs(float(a) - float(b)) <= tol
    return a == b


def test_seeded_bando_position_results_match_golden(client, seed_id):
    bando = client.get("/api/bandi/%s" % seed_id).json()
    results = {r["lv_id"]: r for r in bando["position_results"]}
    expected = {r["lv_id"]: r for r in EXPECTED["position_results"]}

    assert set(results) == set(expected), "position set differs from golden"

    for lv_id, exp in expected.items():
        got = results[lv_id]
        for key in POSITION_KEYS:
            assert _close(got[key], exp[key]), (
                "%s.%s: got %r expected %r" % (lv_id, key, got[key], exp[key])
            )


def test_seeded_bando_summary_matches_golden(client, seed_id):
    bando = client.get("/api/bandi/%s" % seed_id).json()
    summary = bando["summary"]
    exp = EXPECTED["example_subset_summary"]
    assert _close(summary["material_cost_chf"], exp["material_cost_chf"])
    assert _close(summary["labour_cost_chf"], exp["labour_cost_chf"])
    assert _close(summary["direct_cost_chf"], exp["direct_cost_chf"])
    assert _close(summary["cost_baseline_chf"], exp["cost_baseline_chf"])
    # baseline / (1 - target_margin 5.5%) = 414489.12 / 0.945
    assert _close(summary["indicative_selling_price_chf"], 438612.83)


def test_seeded_bando_bid_range_matches_golden(client, seed_id):
    bando = client.get("/api/bandi/%s" % seed_id).json()
    got = {s["scenario"]: s for s in bando["recommended_bid_range"]["scenarios"]}
    exp = {s["scenario"]: s for s in EXPECTED["recommended_bid_range"]["scenarios"]}
    assert set(got) == set(exp)
    for name, e in exp.items():
        g = got[name]
        assert _close(g["bid_price_chf"], e["bid_price_chf"], 0.5)
        assert _close(g["margin_pct"], e["margin_pct"])
        assert _close(g["estimated_win_probability"], e["estimated_win_probability"])
        assert _close(g["expected_contribution_chf"], e["expected_contribution_chf"])
