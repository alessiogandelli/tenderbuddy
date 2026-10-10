"""AI adapter behaviour, exercised with fake clients (no network, no key).

These lock the contract between our code and the OpenAI SDK surfaces we depend
on: the Responses structured-output payload and the Decisions choice answers.
"""
from __future__ import annotations

import json

from app.domain.enums import ItemFlag, ItemStatus, Unit
from app.domain.models import Item
from app.pipeline.ai.escalate import escalate_matches
from app.pipeline.ai.extract import extract_document
from app.pipeline.ai.match import match_items_ai
from app.pipeline.ai.usage import UsageLedger
from app.pipeline.extractors import Document, Page
from app.pipeline.pricing_db import get_pricing_db

LV_PAGE = "\n".join(
    [
        "SH Erlenstrasse Oberglatt",
        "244.01 LA01 Nebenraeume",
        "Pos.",
        "Gegenstand",
        "Mass-",
        "Gattg.",
        "Einheits-",
        "Betrag",
        "ARMATUREN UND INSTRUMENTE",
        "Zuluft - Tellerventil aus Kunststoff",
        "Groesse \u00d8 10 cm",
        "Stk",
        "5",
    ]
)


class _FakeUsage:
    def __init__(self, input_tokens: int, output_tokens: int):
        self.input_tokens = input_tokens
        self.output_tokens = output_tokens


class _FakeResponse:
    def __init__(self, output_text=None, answers=None, input_tokens=100, output_tokens=50):
        self.output_text = output_text
        self.answers = answers
        self.usage = _FakeUsage(input_tokens, output_tokens)


class _FakeResponses:
    def __init__(self, payload):
        self.payload = payload
        self.calls = []

    async def create(self, **kwargs):
        self.calls.append(kwargs)
        return _FakeResponse(output_text=json.dumps(self.payload))


class _FakeAsyncClient:
    def __init__(self, payload=None, answers=None):
        self.responses = _FakeResponses(payload) if payload is not None else None
        self.decisions = _FakeDecisions(answers) if answers is not None else None

    async def close(self):
        pass


class _FakeAnswer:
    def __init__(self, name, choice, confidence, probabilities=None, type_="choice"):
        self.name = name
        self.choice = choice
        self.confidence = confidence
        self.type = type_
        self.probabilities = probabilities or []


class _FakeProbability:
    def __init__(self, value, probability):
        self.value = value
        self.probability = probability


class _FakeDecisions:
    def __init__(self, answers):
        self.answers = answers
        self.calls = []

    async def create(self, **kwargs):
        self.calls.append(kwargs)
        return _FakeResponse(answers=self.answers, input_tokens=200, output_tokens=0)


class _FakeReader:
    name = "fake"

    def read(self, path):  # pragma: no cover - unused in these tests
        raise NotImplementedError

    def locate(self, path, page_number, needle):
        return (0.10, 0.20, 0.30, 0.40)


def _lv_document() -> Document:
    return Document(page_count=1, pages=[Page(number=1, text=LV_PAGE)])


# ---------------------------------------------------------------------------
# Extraction
# ---------------------------------------------------------------------------
def test_extraction_maps_structured_positions_to_items():
    payload = {
        "positions": [
            {
                "description": "Zuluft - Tellerventil aus Kunststoff",
                "quantity": 5.0,
                "unit": "Stk",
                "manufacturer": "Trox Hesco",
                "model": "Z-LVS",
                "size": "\u00d8 10 cm",
                "fire_class": None,
            }
        ]
    }
    client = _FakeAsyncClient(payload=payload)
    usage = UsageLedger()
    items = extract_document(_lv_document(), _FakeReader(), "tender.pdf", client=client, usage=usage)

    assert len(items) == 1
    item = items[0]
    assert item.unit is Unit.PC
    assert item.quantity == 5.0
    assert item.source_page == 1
    assert item.attributes["size"] == "\u00d8 10 cm"
    assert item.attributes["manufacturer"] == "Trox Hesco"
    assert item.source_bbox == [0.10, 0.20, 0.30, 0.40]
    assert usage.calls == 1
    assert usage.input_tokens == 100
    assert usage.cost_usd > 0


def test_extraction_flags_implausible_quantity_instead_of_dropping():
    payload = {
        "positions": [
            {
                "description": "Tellerventil",
                "quantity": 2026.0,
                "unit": "pc",
                "manufacturer": None,
                "model": None,
                "size": None,
                "fire_class": None,
            }
        ]
    }
    client = _FakeAsyncClient(payload=payload)
    items = extract_document(_lv_document(), _FakeReader(), "tender.pdf", client=client)

    assert len(items) == 1
    assert items[0].quantity is None
    assert ItemFlag.UNPARSED_ROW in items[0].flags


# ---------------------------------------------------------------------------
# Matching
# ---------------------------------------------------------------------------
def _item(lv_id: str = "LV0001") -> Item:
    return Item(
        lv_id=lv_id,
        source_page=1,
        description_raw="Zuluft - Tellerventil aus Kunststoff DN100",
        quantity=5.0,
        unit=Unit.PC,
    )


def test_matching_uses_the_decisions_choice_and_confidence():
    answers = [
        _FakeAnswer(
            "LV0001",
            "P-AIR-001",
            0.93,
            [_FakeProbability("P-AIR-001", 0.9), _FakeProbability("P-AIR-002", 0.05)],
        )
    ]
    client = _FakeAsyncClient(answers=answers)
    usage = UsageLedger()
    items = [_item()]
    match_items_ai(items, get_pricing_db(), client=client, usage=usage)

    assert items[0].match is not None
    assert items[0].match.product_id == "P-AIR-001"
    assert items[0].match.install_code == "DIFFUSER"
    assert items[0].match.confidence == 0.93
    assert usage.calls == 1
    assert usage.input_tokens == 200
    # Decisions bills input only.
    assert usage.output_tokens == 0


def test_matching_none_choice_marks_no_match():
    answers = [_FakeAnswer("LV0001", "__none__", 0.1)]
    client = _FakeAsyncClient(answers=answers)
    items = [_item()]
    match_items_ai(items, get_pricing_db(), client=client)

    assert items[0].match is None
    assert ItemFlag.NO_MATCH in items[0].flags
    assert items[0].status is not ItemStatus.CALCULATED


def test_matching_flat_probabilities_are_flagged_ambiguous():
    answers = [
        _FakeAnswer(
            "LV0001",
            "P-AIR-001",
            0.55,
            [_FakeProbability("P-AIR-001", 0.52), _FakeProbability("P-AIR-002", 0.48)],
        )
    ]
    client = _FakeAsyncClient(answers=answers)
    items = [_item()]
    match_items_ai(items, get_pricing_db(), client=client)

    assert ItemFlag.LOW_CONFIDENCE_MATCH in items[0].flags
    assert ItemFlag.MULTI_VARIANT_AMBIGUOUS in items[0].flags


def test_escalation_overrides_a_weak_match_with_the_reasoning_model():
    item = _item()
    item.match = None
    item.flags.append(ItemFlag.NO_MATCH)
    payload = {"product_id": "P-AIR-001", "confidence": 0.88, "reason": "DN100 valve"}
    client = _FakeAsyncClient(payload=payload)
    usage = UsageLedger()
    changed = escalate_matches([item], get_pricing_db(), client=client, usage=usage)

    assert item in changed
    assert item.match is not None
    assert item.match.product_id == "P-AIR-001"
    assert usage.escalation_calls == 1


# ---------------------------------------------------------------------------
# Language-agnostic triage
# ---------------------------------------------------------------------------
def test_lv_pages_sends_all_pages_when_no_german_header():
    from app.pipeline.ai.extract import lv_pages

    # Italian capitolato style: no German column header anywhere.
    pages = [
        Page(number=i, text="Oggetto: RESTAURO\nPagina: %d\n224.50%d\nQuantita 5 pz\nImporto" % (i, i))
        for i in range(1, 6)
    ]
    doc = Document(page_count=5, pages=pages)
    assert len(lv_pages(doc)) == 5


def test_lv_pages_prefers_the_german_subset_when_present():
    from app.pipeline.ai.extract import lv_pages

    german = [Page(number=i, text=LV_PAGE) for i in range(1, 12)]
    prose = [Page(number=i, text="Besondere Bedingungen\n" * 8) for i in range(12, 30)]
    doc = Document(page_count=29, pages=german + prose)
    pages = lv_pages(doc)
    assert len(pages) == 11
    assert all(page.number <= 11 for page in pages)
