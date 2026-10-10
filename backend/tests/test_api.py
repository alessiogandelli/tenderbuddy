"""API-level tests: the Bando JSON is the only observable behaviour."""
from __future__ import annotations


def test_health_pins_contract_version(client):
    body = client.get("/api/health").json()
    assert body["status"] == "ok"
    assert body["contract_version"] == "2.0"


def test_archive_lists_seeded_bando(client, seed_id):
    bandi = client.get("/api/bandi").json()
    ids = [b["id"] for b in bandi]
    assert seed_id in ids
    seeded = next(b for b in bandi if b["id"] == seed_id)
    assert seeded["title"]
    assert seeded["coverage"]["calculated"] >= 1
    assert seeded["totals"]["direct_cost_chf"] > 0


def test_coverage_totals_sum_to_items(client, seed_id):
    bando = client.get("/api/bandi/%s" % seed_id).json()
    coverage = bando["coverage"]
    assert sum(coverage.values()) == len(bando["items"])


def test_catalog_endpoints(client):
    catalog = client.get("/api/catalog").json()
    assert any(p["product_id"] == "P-AIR-001" for p in catalog)
    productivity = client.get("/api/productivity").json()
    assert any(r["install_code"] == "DIFFUSER" for r in productivity)
    parameters = client.get("/api/parameters").json()
    assert "commercial" in parameters


def test_upload_runs_pipeline_and_extracts_items(client, fresh_bando):
    bando = client.get("/api/bandi/%s" % fresh_bando).json()
    assert bando["pipeline"]["status"] == "done"
    assert bando["page_count"] == 1
    assert len(bando["items"]) == 2
    assert {item["quantity"] for item in bando["items"]} == {5.0, 6.0}
    assert all(item["unit"] == "pc" for item in bando["items"])
    assert all(item["source_page"] == 1 for item in bando["items"])


def test_manual_item_is_priced_like_pipeline(client, fresh_bando):
    item = {
        "lv_id": "MAN0001",
        "description_raw": "Supply air valve DN100",
        "quantity": 5.0,
        "unit": "pc",
        "match": {
            "product_id": "P-AIR-001",
            "install_code": "DIFFUSER",
            "confidence": 0.92,
            "price_source": "catalog",
        },
        "status": "calculated",
        "flags": [],
    }
    response = client.post("/api/bandi/%s/items" % fresh_bando, json=item)
    assert response.status_code == 200
    bando = response.json()
    result = next(r for r in bando["position_results"] if r["lv_id"] == "MAN0001")
    assert result["material_cost_chf"] == 388.96
    assert result["direct_position_cost_chf"] == 806.26
    assert result["status"] == "calculated"


def test_uncertain_items_are_flagged_not_dropped(client, fresh_bando):
    item = {
        "lv_id": "MAN0002",
        "description_raw": "Voce ambigua senza quantità",
        "status": "review_required",
        "flags": ["missing_quantity", "missing_unit"],
    }
    response = client.post("/api/bandi/%s/items" % fresh_bando, json=item)
    bando = response.json()
    stored = next(i for i in bando["items"] if i["lv_id"] == "MAN0002")
    assert "missing_quantity" in stored["flags"]
    result = next(r for r in bando["position_results"] if r["lv_id"] == "MAN0002")
    assert result["material_cost_chf"] is None
    assert result["status"] == "review_required"
