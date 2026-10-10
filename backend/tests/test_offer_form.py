"""The offer form: fields found from the PDF's dotted blanks, the conditions
chain computed from the printed LV amounts, hand-typed values, export."""
from __future__ import annotations

import fitz

from app import storage
from app.domain.enums import PageType
from app.domain.models import PageClassification
from app.pipeline.offer_form import compute_offer_form, detect_offer_form

DOTS = "." * 22
SHORT = "." * 11
# (label, y, rate printed by the client or None, has a typed % blank)
CONDITIONS = [
    ("Brutto", 363, None, False),
    ("Rabatt", 383, None, True),
    ("Zwischentotal 1", 406, None, False),
    ("Skonto", 426, None, True),
    ("Zwischentotal 2", 450, None, False),
    ("allg. Bauabzüge", 470, "1.30", False),
    ("Zwischentotal 3", 494, None, False),
    ("MWST", 513, "8.10", False),
    ("Netto", 537, None, False),
]


def _form_page(page: fitz.Page) -> None:
    """A miniature of the CRB conditions form (page 2 of the Oberglatt tender)."""
    put = lambda x, y, text: page.insert_text((x, y), text, fontsize=9)  # noqa: E731
    put(440, 136, "Brutto")
    put(542, 136, "Netto")
    put(56, 196, "24400 BKP 244 Lüftungsanlagen")
    put(70, 207, "244 Lufttechnische Anlagen")
    put(400, 207, DOTS)
    put(499, 207, DOTS)
    put(56, 252, "Total")
    put(400, 252, DOTS)
    put(499, 252, DOTS)
    put(56, 308, "Konditionen")
    put(56, 343, "Bezeichnung")
    put(322, 343, "Eingabesumme")
    put(482, 343, "Revidiert")
    for label, y, rate, typed in CONDITIONS:
        put(56, y, label)
        if typed:
            put(237, y, SHORT)
            put(277, y, "%")
        if rate:
            put(248, y, rate)
            put(277, y, "%")
        put(292, y, DOTS)
        put(422, y, DOTS)


def _write_tender(path) -> None:
    doc = fitz.open()
    _form_page(doc.new_page(width=595, height=842))
    lv = doc.new_page(width=595, height=842)
    lv.insert_text((380, 300), "Stk", fontsize=9)
    lv.insert_text((430, 300), "1", fontsize=9)
    doc.save(path)


PAGE_TYPES = [
    PageClassification(page=1, type=PageType.MODULO_OFFERTA, confidence=1.0),
    PageClassification(page=2, type=PageType.LV_TABLE, confidence=1.0),
]


def test_every_blank_of_the_form_is_a_field(tmp_path):
    path = tmp_path / "tender.pdf"
    _write_tender(path)
    form = detect_offer_form(path, PAGE_TYPES)
    ids = [field.id for field in form.fields]
    assert form.page == 1
    assert len(ids) == len(set(ids)) == 24
    assert {"summary.chapter.brutto", "summary.total.netto", "conditions.rabatt.pct",
            "conditions.skonto.pct", "conditions.zt3.eingabe", "conditions.netto.revidiert"} <= set(ids)
    assert form.printed_rates == {"bauabzuege": 1.3, "mwst": 8.1}
    rabatt = next(f for f in form.fields if f.id == "conditions.rabatt.pct")
    assert rabatt.kind == "percent"
    # The box is the dotted blank itself, and the baseline its line's.
    assert abs(rabatt.bbox[0] * 595 - 237) < 1.5
    assert abs(rabatt.baseline * 842 - 383) < 0.5


def test_no_offer_form_page_means_no_fields(tmp_path):
    path = tmp_path / "tender.pdf"
    _write_tender(path)
    form = detect_offer_form(path, [PAGE_TYPES[1]])
    assert form.page is None and form.fields == []


def test_the_conditions_chain(tmp_path):
    path = tmp_path / "tender.pdf"
    _write_tender(path)
    form = detect_offer_form(path, PAGE_TYPES)
    values = compute_offer_form(form, 100000.0, {"offer_conditions": {"rabatt_pct": 2, "skonto_pct": 1}})
    assert values["conditions.brutto.eingabe"] == 100000.0
    assert values["conditions.rabatt.eingabe"] == 2000.0
    assert values["conditions.zt1.eingabe"] == 98000.0
    assert values["conditions.skonto.eingabe"] == 980.0
    assert values["conditions.zt2.eingabe"] == 97020.0
    assert values["conditions.bauabzuege.eingabe"] == 1261.26
    assert values["conditions.zt3.eingabe"] == 95758.74
    assert values["conditions.mwst.eingabe"] == 7756.46
    assert values["conditions.netto.eingabe"] == 103515.2
    assert values["summary.chapter.brutto"] == values["summary.total.brutto"] == 100000.0
    assert values["summary.total.netto"] == 103515.2
    # The client's column stays empty.
    assert values["conditions.brutto.revidiert"] is None


def test_rates_default_to_zero_and_a_typed_value_drives_the_rest(tmp_path):
    path = tmp_path / "tender.pdf"
    _write_tender(path)
    form = detect_offer_form(path, PAGE_TYPES)
    values = compute_offer_form(form, 1000.0, {})
    assert values["conditions.rabatt.pct"] == 0.0
    assert values["conditions.zt1.eingabe"] == 1000.0
    zt1 = next(f for f in form.fields if f.id == "conditions.zt1.eingabe")
    zt1.override = 900.0
    values = compute_offer_form(form, 1000.0, {})
    assert values["conditions.zt1.eingabe"] == 900.0
    assert values["conditions.zt2.eingabe"] == 900.0  # follows the typed value


def _prepare(client, bando_id):
    """Swap the tender's PDF for one with the form, price one LV position."""
    _write_tender(storage.pdf_path(bando_id))
    bando = storage.get_bando(bando_id)
    bando.page_types = PAGE_TYPES
    bando.offer_form = None  # as if read before the form existed
    storage.save_bando(bando)
    item = {
        "lv_id": "MAN0001", "description_raw": "Position", "quantity": 1.0, "unit": "pc",
        "source_page": 2, "price_bbox": [0.80, 0.34, 0.95, 0.37],
        "offer_price_chf": 1000.0, "status": "calculated", "flags": [],
    }
    return client.put("/api/bandi/%s/items" % bando_id, json=[item]).json()


def test_the_form_is_found_on_open_and_filled_from_the_lv(client, fresh_bando):
    _prepare(client, fresh_bando)
    bando = client.get("/api/bandi/%s" % fresh_bando).json()
    assert bando["offer_form"]["page"] == 1
    assert len(bando["offer_form"]["fields"]) == 24
    body = {"lv_ids": ["MAN0001"], "scenario": "Target"}
    values = client.post("/api/bandi/%s/offer-form/values" % fresh_bando, json=body).json()
    assert values["brutto_chf"] == 1000.0
    assert values["values"]["conditions.brutto.eingabe"] == 1000.0
    assert values["values"]["conditions.netto.eingabe"] == round(1000 * 0.987 * 1.081, 2)


def test_typing_rabatt_on_the_form_sets_the_parameter(client, fresh_bando):
    _prepare(client, fresh_bando)
    client.get("/api/bandi/%s" % fresh_bando)
    bando = client.patch(
        "/api/bandi/%s/offer-form/fields/conditions.rabatt.pct" % fresh_bando, json={"value": 5}
    ).json()
    assert bando["parameters"]["offer_conditions"]["rabatt_pct"] == 5
    values = client.post(
        "/api/bandi/%s/offer-form/values" % fresh_bando, json={"lv_ids": ["MAN0001"], "scenario": None}
    ).json()["values"]
    assert values["conditions.rabatt.eingabe"] == 50.0
    assert values["conditions.zt1.eingabe"] == 950.0


def test_a_typed_amount_and_back_to_computed(client, fresh_bando):
    _prepare(client, fresh_bando)
    client.get("/api/bandi/%s" % fresh_bando)
    url = "/api/bandi/%s/offer-form/fields/conditions.zt1.eingabe" % fresh_bando
    client.patch(url, json={"value": 777})
    values_url = "/api/bandi/%s/offer-form/values" % fresh_bando
    body = {"lv_ids": ["MAN0001"], "scenario": None}
    assert client.post(values_url, json=body).json()["values"]["conditions.zt1.eingabe"] == 777
    client.patch(url, json={"value": None})
    assert client.post(values_url, json=body).json()["values"]["conditions.zt1.eingabe"] == 1000.0
    assert client.patch(
        "/api/bandi/%s/offer-form/fields/nope" % fresh_bando, json={"value": 1}
    ).status_code == 404


def test_the_export_fills_the_form(client, fresh_bando):
    _prepare(client, fresh_bando)
    client.get("/api/bandi/%s" % fresh_bando)
    response = client.post(
        "/api/bandi/%s/export/pdf" % fresh_bando, json={"lv_ids": ["MAN0001"], "scenario": "Target"}
    )
    assert response.headers["x-offer-written"] == "1"
    # 24 fields minus the 9 Revidiert blanks, which stay empty for the client.
    assert int(response.headers["x-offer-form-written"]) == 15
    page = fitz.open(stream=response.content, filetype="pdf")[0]
    text = page.get_text()
    assert "1'000.00" in text  # Brutto
    assert "1'066.95" in text  # Netto = 1000 × (1 − 1.3%) × (1 + 8.1%)
    assert "0.00" in text  # Rabatt % and Skonto %
