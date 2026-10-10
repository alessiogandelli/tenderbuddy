"""Hand-typed offer totals, per-scenario offer prices and price confirmation."""
from __future__ import annotations

import fitz

from app.pipeline.offer_pdf import format_chf

CELL = [0.70, 0.40, 0.95, 0.43]


def _one_item(client, bando_id, **fields):
    item = {
        "lv_id": "MAN0001",
        "description_raw": "Position",
        "quantity": 2.0,
        "unit": "pc",
        "source_page": 1,
        "price_bbox": CELL,
        "status": "review_required",
        "flags": ["no_match"],
        **fields,
    }
    return client.put("/api/bandi/%s/items" % bando_id, json=[item]).json()


def _patch(client, bando_id, **body):
    response = client.patch("/api/bandi/%s/items/MAN0001" % bando_id, json=body)
    assert response.status_code == 200, response.text
    return response.json()


def _markup(params, margin):
    return (1 + params["commercial"]["overhead_pct"] / 100) * (
        1 + params["allowances"]["transport_equipment_pct"] / 100
    ) / (1 - margin / 100)


def test_priced_positions_carry_their_offer_price_per_scenario(client, fresh_bando):
    bando = _one_item(client, fresh_bando, manual_unit_price_chf=500.0)
    params = bando["parameters"]
    result = bando["position_results"][0]
    margins = params["stretch_bid_optimization"]["scenario_margins_pct"]
    assert set(result["offer_prices_chf"]) == set(margins)
    for name, margin in margins.items():
        assert result["offer_prices_chf"][name] == round(1000.0 * _markup(params, margin), 2)


def test_unpriced_positions_have_no_offer_price(client, fresh_bando):
    bando = _one_item(client, fresh_bando)
    assert bando["position_results"][0]["offer_prices_chf"] == {}


def test_a_typed_offer_total_is_printed_as_is_in_every_scenario(client, fresh_bando):
    _one_item(client, fresh_bando)  # no price at all
    bando = _patch(client, fresh_bando, offer_price_chf=1234.5)
    item = bando["items"][0]
    result = bando["position_results"][0]
    assert item["status"] == "calculated"
    assert "no_match" not in item["flags"]
    assert set(result["offer_prices_chf"].values()) == {1234.5}
    # Its cost share is the total at the target margin, so the summary holds.
    params = bando["parameters"]
    expected_direct = 1234.5 / _markup(params, params["commercial"]["target_margin_pct"])
    assert abs(result["direct_position_cost_chf"] - expected_direct) < 0.01
    for scenario in ("Aggressive", "Conservative", None):
        pdf = client.post(
            "/api/bandi/%s/export/pdf" % fresh_bando,
            json={"lv_ids": ["MAN0001"], "scenario": scenario},
        ).content
        page = fitz.open(stream=pdf, filetype="pdf")[0]
        r = page.rect
        rect = fitz.Rect(r.width * CELL[0], r.height * CELL[1], r.width * CELL[2], r.height * CELL[3])
        assert page.get_textbox(rect).strip() == format_chf(1234.5)


def test_clearing_the_offer_total_goes_back_to_the_computed_price(client, fresh_bando):
    _one_item(client, fresh_bando, manual_unit_price_chf=10.0)
    _patch(client, fresh_bando, offer_price_chf=999.0)
    bando = _patch(client, fresh_bando, offer_price_chf=None)
    assert bando["items"][0]["offer_price_chf"] is None
    assert bando["position_results"][0]["direct_position_cost_chf"] == 20.0


def test_negative_offer_total_is_rejected(client, fresh_bando):
    _one_item(client, fresh_bando)
    response = client.patch(
        "/api/bandi/%s/items/MAN0001" % fresh_bando, json={"offer_price_chf": -5}
    )
    assert response.status_code == 400


def test_confirmation_sticks_until_the_price_changes(client, fresh_bando):
    _one_item(client, fresh_bando, manual_unit_price_chf=10.0)
    bando = _patch(client, fresh_bando, price_confirmed=True)
    assert bando["items"][0]["price_confirmed"] is True
    # an unrelated edit keeps it
    bando = _patch(client, fresh_bando, description_raw="Renamed")
    assert bando["items"][0]["price_confirmed"] is True
    # a price change resets it ...
    bando = _patch(client, fresh_bando, quantity=3.0)
    assert bando["items"][0]["price_confirmed"] is False
    # ... unless the same edit confirms the new price
    bando = _patch(client, fresh_bando, offer_price_chf=50.0, price_confirmed=True)
    assert bando["items"][0]["price_confirmed"] is True


def test_a_tender_saved_before_offer_prices_gets_them_on_open(client, fresh_bando):
    from app import storage

    _one_item(client, fresh_bando, manual_unit_price_chf=10.0)
    bando = storage.get_bando(fresh_bando)
    for result in bando.position_results:
        result.offer_prices_chf = {}
    storage.save_bando(bando)
    reopened = client.get("/api/bandi/%s" % fresh_bando).json()
    assert reopened["position_results"][0]["offer_prices_chf"]
