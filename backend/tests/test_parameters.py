"""Estimator-editable Parameters: exposed, persisted, and repriced live."""
from __future__ import annotations

import copy


def test_parameters_are_exposed_with_defaults(client, seed_id):
    bando = client.get("/api/bandi/%s" % seed_id).json()
    params = bando["parameters"]
    assert params["commercial"]["target_margin_pct"] == 5.5
    assert params["allowances"]["material_waste_pct"] == 4.0
    assert bando["summary"]["include_project_costs"] is False
    assert bando["summary"]["project_costs_chf"] == 0.0


def test_patch_margin_reprices_and_persists(client, seed_id):
    original = client.get("/api/bandi/%s" % seed_id).json()
    baseline_price = original["summary"]["indicative_selling_price_chf"]
    original_params = copy.deepcopy(original["parameters"])
    try:
        response = client.patch(
            "/api/bandi/%s/parameters" % seed_id,
            json={"parameters": {"commercial": {"target_margin_pct": 8.0}}},
        )
        assert response.status_code == 200
        updated = response.json()
        assert updated["parameters"]["commercial"]["target_margin_pct"] == 8.0
        assert updated["summary"]["indicative_selling_price_chf"] > baseline_price

        reloaded = client.get("/api/bandi/%s" % seed_id).json()
        assert reloaded["summary"]["indicative_selling_price_chf"] == (
            updated["summary"]["indicative_selling_price_chf"]
        )
    finally:
        client.patch(
            "/api/bandi/%s/parameters" % seed_id,
            json={"parameters": {"commercial": original_params["commercial"]}},
        )


def test_project_costs_toggle_changes_the_price(client, seed_id):
    original = client.get("/api/bandi/%s" % seed_id).json()
    original_params = copy.deepcopy(original["parameters"])
    direct = original["summary"]["direct_cost_chf"]
    try:
        updated = client.patch(
            "/api/bandi/%s/parameters" % seed_id,
            json={"parameters": {"include_project_costs": True}},
        ).json()
        summary = updated["summary"]
        assert summary["include_project_costs"] is True
        assert summary["project_costs_chf"] > 0
        assert summary["direct_cost_chf"] > direct
    finally:
        client.patch(
            "/api/bandi/%s/parameters" % seed_id,
            json={
                "parameters": {
                    "include_project_costs": False,
                    "commercial": original_params["commercial"],
                }
            },
        )
