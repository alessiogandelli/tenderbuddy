"""Vision extraction of the six-column LV tables, with a fake client/reader."""
from __future__ import annotations

import json

from app.domain.enums import ItemFlag, Unit
from app.pipeline.ai.usage import UsageLedger
from app.pipeline.ai.vision_extract import _MAX_PRICE_H, extract_document_vision
from app.pipeline.extractors import Document, Page

PAGE_TEXT = "\n".join(
    [
        "SH Erlenstrasse Oberglatt",
        "244.04 Schulzimmer OG",
        "Pos.",
        "Gegenstand",
        "Mass-",
        "Mass-betrag",
        "Betrag",
    ]
)


class _FakeUsage:
    def __init__(self, input_tokens=100, output_tokens=50):
        self.input_tokens = input_tokens
        self.output_tokens = output_tokens


class _FakeResponse:
    def __init__(self, output_text):
        self.output_text = output_text
        self.usage = _FakeUsage()


class _FakeResponses:
    def __init__(self, payload):
        self.payload = payload
        self.calls = []

    async def create(self, **kwargs):
        self.calls.append(kwargs)
        return _FakeResponse(json.dumps(self.payload))


class _FakeClient:
    def __init__(self, payload):
        self.responses = _FakeResponses(payload)

    async def close(self):
        pass


class _FakeReader:
    name = "fake-vision"

    def render_png(self, path, page_number, dpi=150):
        return b"\x89PNG fake"

    def locate(self, path, page_number, needle):
        return (0.10, 0.20, 0.60, 0.24)

    def locate_word(self, path, page_number, word):
        return 0.80  # left edge of the Betrag column


class _ColumnReader(_FakeReader):
    """Reader that knows the real Betrag column borders (0.79 .. 0.94)."""

    def column_bounds(self, path, page_number, header):
        return (0.79, 0.94)


class _NoRenderReader:
    name = "no-render"


def _doc() -> Document:
    return Document(page_count=1, pages=[Page(number=1, text=PAGE_TEXT)])


def _row(**overrides):
    row = {
        "description": "Zuluft - Tellerventil aus Kunststoff",
        "quantity": 5.0,
        "unit": "Stk",
        "measure_present": True,
        "price_present": True,
        "name_bbox": [0.12, 0.40, 0.60, 0.44],
        "measure_bbox": [0.62, 0.40, 0.80, 0.42],
        "price_bbox": [0.82, 0.40, 0.97, 0.44],
    }
    row.update(overrides)
    return row


def test_vision_items_carry_the_two_boxes():
    client = _FakeClient({"rows": [_row()]})
    usage = UsageLedger()
    result = extract_document_vision(
        _doc(), _FakeReader(), "tender.pdf", client=client, usage=usage
    )

    assert len(result.items) == 1
    item = result.items[0]
    assert item.unit is Unit.PC
    assert item.quantity == 5.0
    assert item.name_bbox == [0.12, 0.40, 0.60, 0.44]
    # Price box: Betrag column (x0 0.80 -> 0.92), on the measure line.
    assert item.price_bbox == [0.80, 0.40, 0.92, 0.42]
    assert item.source_bbox == item.name_bbox  # deprecated alias
    assert usage.calls == 1
    assert len(result.detections) == 1
    assert result.detections[0].kept is True
    assert result.detections[0].lv_id == item.lv_id


def test_tall_price_box_is_replaced_by_the_measure_line():
    # The model returned the whole Betrag column; the measure line wins.
    client = _FakeClient(
        {"rows": [_row(price_bbox=[0.82, 0.07, 0.94, 0.94])]}
    )
    result = extract_document_vision(_doc(), _FakeReader(), "tender.pdf", client=client)

    price = result.items[0].price_bbox
    assert price == [0.80, 0.40, 0.92, 0.42]
    assert price[3] - price[1] <= _MAX_PRICE_H


def test_price_box_uses_the_betrag_column_even_if_model_is_too_far_left():
    client = _FakeClient({"rows": [_row(price_bbox=[0.60, 0.40, 0.75, 0.44])]})
    result = extract_document_vision(_doc(), _FakeReader(), "tender.pdf", client=client)

    assert result.items[0].price_bbox == [0.80, 0.40, 0.92, 0.42]


def test_price_box_uses_the_real_column_borders_when_available():
    # A reader with geometry returns the column's true edges, so the box does
    # not overshoot the table's right border the way word_x0 + fixed width does.
    client = _FakeClient({"rows": [_row()]})
    result = extract_document_vision(
        _doc(), _ColumnReader(), "tender.pdf", client=client
    )

    assert result.items[0].price_bbox == [0.79, 0.40, 0.94, 0.42]


def test_rows_with_no_measure_or_price_cell_are_detected_but_not_items():
    payload = {
        "rows": [
            _row(measure_present=False, price_present=False),
            _row(description="Dienstleistungen", measure_present=True, price_present=False),
        ]
    }
    client = _FakeClient(payload)
    result = extract_document_vision(_doc(), _FakeReader(), "tender.pdf", client=client)

    assert len(result.items) == 1
    assert result.items[0].description_raw == "Dienstleistungen"
    assert len(result.detections) == 2
    discarded = [d for d in result.detections if not d.kept]
    assert len(discarded) == 1
    assert discarded[0].reason == "no_measure_or_price"
    assert discarded[0].lv_id is None


def test_empty_page_yields_no_items():
    client = _FakeClient({"rows": []})
    result = extract_document_vision(_doc(), _FakeReader(), "tender.pdf", client=client)
    assert result.items == []
    assert result.detections == []


def test_missing_boxes_fall_back_to_reader_locate():
    client = _FakeClient(
        {"rows": [_row(name_bbox=None, measure_bbox=None, price_bbox=None)]}
    )
    result = extract_document_vision(_doc(), _FakeReader(), "tender.pdf", client=client)

    assert len(result.items) == 1
    assert result.items[0].name_bbox == [0.10, 0.20, 0.60, 0.24]
    # No measure/price box: a one-line band off the name box, Betrag column.
    price = result.items[0].price_bbox
    assert price[0] == 0.80 and price[2] == 0.92
    assert price[3] - price[1] <= _MAX_PRICE_H


def test_reader_without_render_support_returns_nothing():
    client = _FakeClient({"rows": [_row()]})
    result = extract_document_vision(
        _doc(), _NoRenderReader(), "tender.pdf", client=client
    )
    assert result.items == []
    assert result.detections == []


def test_implausible_quantity_is_flagged_not_dropped():
    client = _FakeClient({"rows": [_row(quantity=2026.0)]})
    result = extract_document_vision(_doc(), _FakeReader(), "tender.pdf", client=client)

    assert len(result.items) == 1
    assert result.items[0].quantity is None
    assert ItemFlag.UNPARSED_ROW in result.items[0].flags
