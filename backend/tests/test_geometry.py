"""Every Item the pipeline identifies must carry a real highlight region.

The match only supplies a price: an item without a catalogue match keeps its box.
A box must cover the position, never a single word (the old "puntino").
"""
from __future__ import annotations


def test_every_seeded_item_has_a_row_box(client, seed_id):
    bando = client.get("/api/bandi/%s" % seed_id).json()
    assert bando["items"]
    for item in bando["items"]:
        box = item.get("source_bbox")
        assert box, "no box for %s" % item["lv_id"]
        width = box[2] - box[0]
        height = box[3] - box[1]
        assert width > 0.08, "%s is a lone cell (w=%.3f)" % (item["lv_id"], width)
        assert height > 0.008, "%s is a line too thin (h=%.3f)" % (item["lv_id"], height)
        for value in box:
            assert 0.0 <= value <= 1.0


def test_locate_expands_a_split_row_needle():
    from app.config import DATA_DIR
    from app.pipeline.extractors.pymupdf_reader import default_reader

    tender = DATA_DIR / "BKP_244_LV_Lueftung_260804.pdf"
    if not tender.exists():  # pragma: no cover - dataset always present
        return

    reader = default_reader()
    boxes = reader.locate_all(tender, 78, "Stk 5")
    assert boxes and boxes[0][2] - boxes[0][0] > 0.1


def test_betrag_column_matches_the_table_border_not_the_header_word():
    """The price column is the cell bordered by the table, not a fixed width
    off the header word (which overshot the right border)."""
    from app.config import DATA_DIR
    from app.pipeline.extractors.pymupdf_reader import default_reader

    tender = DATA_DIR / "BKP_244_LV_Lueftung_260804.pdf"
    if not tender.exists():  # pragma: no cover - dataset always present
        return

    reader = default_reader()
    column = reader.column_bounds(tender, 67, "Betrag")
    assert column is not None
    x0, x1 = column
    assert 0.81 < x0 < 0.83
    assert 0.93 < x1 < 0.95
    assert x1 < 0.96, "must not overshoot the table's right border"
