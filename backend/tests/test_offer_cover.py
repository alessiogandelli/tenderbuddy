"""The cover page: fields found from the PDF's dotted blanks, the bidder's
identity and the computed Netto written into them on export."""
from __future__ import annotations

import datetime

import fitz

from app import storage
from app.domain.enums import PageType
from app.domain.models import PageClassification
from app.pipeline.offer_cover import compute_cover, detect_offer_cover, german_date

DOTS = "." * 45

BIDDER = {
    "name": "Equans Switzerland AG",
    "street": "Förrlibuckstrasse 150",
    "plz": "8005",
    "city": "Zürich",
    "phone": "+41 44 247 40 00",
    "fax": "+41 44 247 40 81",
    "email": "info.ch@equans.com",
    "website": "equans.ch",
    "contact": None,
}


def _cover_page(page: fitz.Page) -> None:
    """A miniature of the Oberglatt tender's cover (page 1)."""
    put = lambda x, y, text: page.insert_text((x, y), text, fontsize=9)  # noqa: E731
    put(56, 457, "Eingabesumme Netto Fr.")
    put(245, 457, DOTS)
    put(350, 457, "inkl. MWST")
    put(56, 701, "Name:")
    put(127, 701, DOTS)
    put(56, 723, "Strasse:")
    put(127, 723, DOTS)
    put(56, 745, "PLZ, Ort:")
    put(127, 745, DOTS)
    put(56, 767, "Telefon:")
    put(127, 767, DOTS)
    put(311, 767, "Ort, Datum:")
    put(365, 767, DOTS)
    put(56, 789, "Fax:")
    put(127, 789, DOTS)
    # The label and its leader are printed as one word on the real form.
    put(56, 811, "Sachbearbeiter:" + DOTS)
    put(311, 811, "Unterschrift:")
    put(367, 811, DOTS)


def _write_tender(path) -> None:
    doc = fitz.open()
    _cover_page(doc.new_page(width=595, height=842))
    lv = doc.new_page(width=595, height=842)
    lv.insert_text((380, 300), "Stk", fontsize=9)
    lv.insert_text((430, 300), "1", fontsize=9)
    doc.save(path)


PAGE_TYPES = [
    PageClassification(page=1, type=PageType.COVER, confidence=1.0),
    PageClassification(page=2, type=PageType.LV_TABLE, confidence=1.0),
]


def test_every_blank_of_the_cover_is_a_field(tmp_path):
    path = tmp_path / "tender.pdf"
    _write_tender(path)
    cover = detect_offer_cover(path, PAGE_TYPES)
    ids = [field.id for field in cover.fields]
    assert cover.page == 1
    assert len(ids) == len(set(ids)) == 9
    assert {
        "cover.name", "cover.strasse", "cover.plz_ort", "cover.telefon", "cover.fax",
        "cover.sachbearbeiter", "cover.ort_datum", "cover.eingabesumme", "cover.unterschrift",
    } == set(ids)
    # The merged "Sachbearbeiter:......" leader is still found exactly.
    sachbearbeiter = next(f for f in cover.fields if f.id == "cover.sachbearbeiter")
    assert sachbearbeiter.label == "Sachbearbeiter:"
    # The leader is the dots after the label, not the merged word.
    assert 100 < sachbearbeiter.bbox[0] * 595 < 160


def test_no_cover_page_means_no_fields(tmp_path):
    path = tmp_path / "tender.pdf"
    _write_tender(path)
    cover = detect_offer_cover(path, [PAGE_TYPES[1]])
    assert cover.page is None and cover.fields == []


def test_the_cover_carries_the_bidder_and_the_netto(tmp_path):
    path = tmp_path / "tender.pdf"
    _write_tender(path)
    cover = detect_offer_cover(path, PAGE_TYPES)
    today = datetime.date(2026, 10, 11)
    values = compute_cover(cover, 1066.95, {"bidder": BIDDER}, today=today)
    assert values["cover.name"] == "Equans Switzerland AG"
    assert values["cover.strasse"] == "Förrlibuckstrasse 150"
    assert values["cover.plz_ort"] == "8005 Zürich"
    assert values["cover.telefon"] == "+41 44 247 40 00"
    assert values["cover.fax"] == "+41 44 247 40 81"
    assert values["cover.ort_datum"] == "Zürich, 11. Oktober 2026"
    assert values["cover.eingabesumme"] == "1'066.95"
    # No named contact and no signature: left for the hand.
    assert values["cover.sachbearbeiter"] is None
    assert values["cover.unterschrift"] is None


def test_a_missing_bidder_block_leaves_the_fields_empty(tmp_path):
    path = tmp_path / "tender.pdf"
    _write_tender(path)
    cover = detect_offer_cover(path, PAGE_TYPES)
    values = compute_cover(cover, 1000.0, {})
    assert values["cover.name"] is None
    assert values["cover.plz_ort"] is None
    assert values["cover.eingabesumme"] == "1'000.00"


def test_german_date():
    assert german_date(datetime.date(2026, 1, 3)) == "3. Januar 2026"


def _prepare(client, bando_id):
    """Swap the tender's PDF for one with the cover, price one LV position."""
    _write_tender(storage.pdf_path(bando_id))
    bando = storage.get_bando(bando_id)
    bando.page_types = PAGE_TYPES
    bando.offer_cover = None  # as if read before the cover existed
    storage.save_bando(bando)
    item = {
        "lv_id": "MAN0001", "description_raw": "Position", "quantity": 1.0, "unit": "pc",
        "source_page": 2, "price_bbox": [0.80, 0.34, 0.95, 0.37],
        "offer_price_chf": 1000.0, "status": "calculated", "flags": [],
    }
    return client.put("/api/bandi/%s/items" % bando_id, json=[item]).json()


def test_the_cover_is_found_on_open_and_filled_from_the_lv(client, fresh_bando):
    _prepare(client, fresh_bando)
    bando = client.get("/api/bandi/%s" % fresh_bando).json()
    assert bando["offer_cover"]["page"] == 1
    assert len(bando["offer_cover"]["fields"]) == 9
    values = client.post(
        "/api/bandi/%s/offer-form/values" % fresh_bando,
        json={"lv_ids": ["MAN0001"], "scenario": "Target"},
    ).json()
    assert values["cover"]["page"] == 1
    assert values["cover"]["values"]["cover.name"] == "Equans Switzerland AG"
    assert values["cover"]["values"]["cover.eingabesumme"] == "1'000.00"
    response = client.post(
        "/api/bandi/%s/export/pdf" % fresh_bando, json={"lv_ids": ["MAN0001"], "scenario": "Target"}
    )
    assert int(response.headers["x-offer-cover-written"]) == 7  # 9 minus the two empty
    page = fitz.open(stream=response.content, filetype="pdf")[0]
    text = page.get_text()
    assert "Equans Switzerland AG" in text
    assert "8005 Zürich" in text
    # No Konditionen form here, so no printed MWST: Netto == the LV Brutto.
    assert "1'000.00" in text
