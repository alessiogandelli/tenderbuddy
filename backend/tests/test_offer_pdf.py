"""The offer PDF: the tender as received, with selling prices in the price cells."""
from __future__ import annotations

import fitz

from app.pipeline.offer_pdf import format_chf

# A price cell on the right of the one-page test tender.
CELL = [0.70, 0.40, 0.95, 0.43]


def _price_items(client, bando_id, *items):
    """Replace the tender's items with hand-priced ones that have a price cell."""
    body = [
        {
            "lv_id": lv_id,
            "description_raw": "Position %s" % lv_id,
            "quantity": quantity,
            "unit": "pc",
            "source_page": 1,
            "price_bbox": bbox,
            "manual_unit_price_chf": unit_price,
            "status": "calculated",
            "flags": [],
        }
        for lv_id, quantity, unit_price, bbox in items
    ]
    response = client.put("/api/bandi/%s/items" % bando_id, json=body)
    assert response.status_code == 200
    return response.json()


def _text_in(pdf_bytes, bbox):
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    page = doc[0]
    r = page.rect
    rect = fitz.Rect(r.width * bbox[0], r.height * bbox[1], r.width * bbox[2], r.height * bbox[3])
    return page.get_textbox(rect).strip()


def _markup(parameters, margin):
    overhead = parameters["commercial"]["overhead_pct"]
    transport = parameters["allowances"]["transport_equipment_pct"]
    return (1 + overhead / 100) * (1 + transport / 100) / (1 - margin / 100)


def test_format_is_swiss():
    assert format_chf(1234567.5) == "1'234'567.50"
    assert format_chf(0.4) == "0.40"


def test_selling_price_is_written_in_the_price_cell(client, fresh_bando):
    bando = _price_items(client, fresh_bando, ("MAN0001", 2.0, 500.0, CELL))
    response = client.post(
        "/api/bandi/%s/export/pdf" % fresh_bando, json={"lv_ids": ["MAN0001"]}
    )
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert response.headers["x-offer-written"] == "1"
    params = bando["parameters"]
    expected = round(1000.0 * _markup(params, params["commercial"]["target_margin_pct"]), 2)
    assert _text_in(response.content, CELL) == format_chf(expected)


def test_scenario_margin_sets_the_price(client, fresh_bando):
    bando = _price_items(client, fresh_bando, ("MAN0001", 1.0, 1000.0, CELL))
    params = bando["parameters"]
    margins = params["stretch_bid_optimization"]["scenario_margins_pct"]
    response = client.post(
        "/api/bandi/%s/export/pdf" % fresh_bando,
        json={"lv_ids": ["MAN0001"], "scenario": "Aggressive"},
    )
    expected = round(1000.0 * _markup(params, margins["Aggressive"]), 2)
    assert _text_in(response.content, CELL) == format_chf(expected)


def test_unknown_scenario_is_rejected(client, fresh_bando):
    _price_items(client, fresh_bando, ("MAN0001", 1.0, 10.0, CELL))
    response = client.post(
        "/api/bandi/%s/export/pdf" % fresh_bando,
        json={"lv_ids": ["MAN0001"], "scenario": "Reckless"},
    )
    assert response.status_code == 400


def test_positions_without_price_or_cell_are_left_blank(client, fresh_bando):
    other = [0.70, 0.60, 0.95, 0.63]
    _price_items(
        client,
        fresh_bando,
        ("MAN0001", 1.0, 10.0, CELL),
        ("MAN0002", 1.0, None, other),  # no price
        ("MAN0003", 1.0, 10.0, None),  # no price cell
    )
    response = client.post(
        "/api/bandi/%s/export/pdf" % fresh_bando,
        json={"lv_ids": ["MAN0001", "MAN0002", "MAN0003", "NOPE"]},
    )
    assert response.headers["x-offer-written"] == "1"
    assert response.headers["x-offer-skipped"] == "3"
    assert _text_in(response.content, other) == ""


def test_only_the_chosen_positions_are_written(client, fresh_bando):
    other = [0.70, 0.60, 0.95, 0.63]
    _price_items(
        client, fresh_bando, ("MAN0001", 1.0, 10.0, CELL), ("MAN0002", 1.0, 20.0, other)
    )
    response = client.post(
        "/api/bandi/%s/export/pdf" % fresh_bando, json={"lv_ids": ["MAN0001"]}
    )
    assert _text_in(response.content, CELL) != ""
    assert _text_in(response.content, other) == ""


def test_amount_sits_on_the_row_baseline_even_in_a_tall_cell(tmp_path):
    """Variant rows get price cells taller than the row: the amount must still
    line up with the row's quantity, not float at the cell's middle."""
    from app.pipeline.offer_pdf import OfferEntry, fill_offer

    doc = fitz.open()
    page = doc.new_page(width=595, height=842)
    page.insert_text((380, 300), "Stk", fontsize=9)
    page.insert_text((430, 300), "5", fontsize=9)
    page.insert_text((380, 312), "Stk", fontsize=9)
    page.insert_text((430, 312), "6", fontsize=9)
    path = tmp_path / "tender.pdf"
    doc.save(path)
    # A cell from y=290 to y=318: its middle (304) is between the two rows.
    cell = [488 / 595, 290 / 842, 561 / 595, 318 / 842]
    filled = fill_offer(path, [("LV1", OfferEntry(page=1, price_bbox=cell, amount_chf=918.12))])
    out = fitz.open(stream=filled.pdf, filetype="pdf")
    spans = [
        span
        for block in out[0].get_text("dict")["blocks"]
        for line in block.get("lines", [])
        for span in line["spans"]
        if span["text"] == "918.12"
    ]
    assert len(spans) == 1
    assert abs(spans[0]["origin"][1] - 300) < 0.5  # on the "5" row
    assert spans[0]["bbox"][2] <= 561  # inside the cell, right-aligned
