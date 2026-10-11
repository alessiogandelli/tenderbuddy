"""Page classification: the deterministic fallback and the Decisions adapter."""
from __future__ import annotations

from app.domain.enums import PageType
from app.domain.models import PageClassification
from app.pipeline.ai.classify_pages import classify_pages
from app.pipeline.ai.usage import UsageLedger
from app.pipeline.extractors import Document, Page
from app.pipeline.steps.classify_pages import (
    classify_pages_deterministic,
    repair_page_types,
    select_extraction_pages,
    table_pages,
)

GERMAN_TABLE = "\n".join(
    [
        "SH Erlenstrasse Oberglatt",
        "244.04 Schulzimmer OG",
        "Pos.",
        "Gegenstand",
        "Mass-",
        "Gattg.",
        "Mass-betrag",
        "Einheits-Preis",
        "Betrag",
        "Fr.",
    ]
)

ITALIAN_TABLE = "\n".join(
    ["Pos.", "Testo", "GQ", "Qtà", "UM", "Prz/Un", "Totale", "R 291.011 condotta"]
)

PROSE = "\n".join(["Besondere Bedingungen", "Der Unternehmer haftet ..."] * 4)


def _doc(*texts: str) -> Document:
    return Document(
        page_count=len(texts),
        pages=[Page(number=i + 1, text=text) for i, text in enumerate(texts)],
    )


# ---------------------------------------------------------------------------
# Deterministic fallback
# ---------------------------------------------------------------------------
def test_deterministic_maps_the_structural_and_keyword_categories():
    result = classify_pages_deterministic(_doc(GERMAN_TABLE, ITALIAN_TABLE, PROSE))

    assert [pc.type for pc in result] == [
        PageType.LV_TABLE,
        PageType.LV_OTHER,
        PageType.LEGAL,
    ]
    assert table_pages(result) == [1]


# ---------------------------------------------------------------------------
# Decisions adapter (fake client, no network)
# ---------------------------------------------------------------------------
class _FakeUsage:
    input_tokens = 300
    output_tokens = 0


class _FakeResponse:
    def __init__(self, answers):
        self.answers = answers
        self.usage = _FakeUsage()


class _FakeAnswer:
    def __init__(self, name, choice, confidence, type_="choice"):
        self.name = name
        self.choice = choice
        self.confidence = confidence
        self.type = type_


class _FakeDecisions:
    def __init__(self, answers):
        self.answers = answers
        self.calls = []

    async def create(self, **kwargs):
        self.calls.append(kwargs)
        return _FakeResponse(self.answers)


class _FakeClient:
    def __init__(self, answers):
        self.decisions = _FakeDecisions(answers)

    async def close(self):
        pass


def test_decisions_choice_labels_pages_and_batches_them():
    answers = [
        _FakeAnswer("page-1", "lv_table", 0.97),
        _FakeAnswer("page-2", "legal", 0.99),
    ]
    client = _FakeClient(answers)
    usage = UsageLedger()
    result = classify_pages(
        _doc(GERMAN_TABLE, PROSE), client=client, usage=usage, batch_size=10
    )

    assert [pc.type for pc in result] == [PageType.LV_TABLE, PageType.LEGAL]
    assert result[0].confidence == 0.97
    assert len(client.decisions.calls) == 1
    assert usage.calls == 1
    assert usage.input_tokens == 300


def test_answers_named_differently_fall_back_deterministically():
    # The model answered a page we never asked about: the real page is unlabeled.
    client = _FakeClient([_FakeAnswer("page-99", "non_lv", 0.11)])
    result = classify_pages(_doc(GERMAN_TABLE), client=client)

    assert result[0].type is PageType.LV_TABLE  # deterministic, not the stray answer
    assert result[0].confidence == 0.9  # deterministic confidence, not 0.11


def test_non_choice_answer_falls_back():
    client = _FakeClient([_FakeAnswer("page-1", "lv_table", 0.9, type_="text")])
    result = classify_pages(_doc(PROSE), client=client)

    assert result[0].type is PageType.LEGAL


# ---------------------------------------------------------------------------
# Repairing stray lv_table labels on non-German tenders (the Italian bug)
# ---------------------------------------------------------------------------
def _label(page: int, page_type: PageType, confidence: float = 0.9):
    return PageClassification(page=page, type=page_type, confidence=confidence)


def test_repair_is_a_no_op_when_the_document_has_the_german_form():
    doc = _doc(GERMAN_TABLE, PROSE)
    labels = [_label(1, PageType.LV_TABLE), _label(2, PageType.LEGAL)]

    repaired = repair_page_types(doc, labels)

    assert [pc.type for pc in repaired] == [PageType.LV_TABLE, PageType.LEGAL]
    assert repaired[0] is labels[0]  # untouched, so the Zurich path is identical
    assert select_extraction_pages(doc, labels) == ([doc.pages[0]], True)


def test_repair_downgrades_stray_lv_table_labels_without_the_german_form():
    # An Italian tender: BOQ pages carry the modulo offerta header, but the
    # classifier wrongly emitted lv_table for one prose page.
    doc = _doc(ITALIAN_TABLE, ITALIAN_TABLE, PROSE)
    labels = [
        _label(1, PageType.LV_OTHER),
        _label(2, PageType.LV_OTHER),
        _label(3, PageType.LV_TABLE, confidence=0.28),
    ]

    repaired = repair_page_types(doc, labels)

    assert [pc.type for pc in repaired] == [
        PageType.LV_OTHER,
        PageType.LV_OTHER,
        PageType.LV_OTHER,
    ]
    assert table_pages(repaired) == []


def test_stray_lv_table_does_not_starve_the_italian_boq():
    # Regression for the uploaded tenders: one stray lv_table page used to be
    # the only page extracted, dropping every real BOQ page.
    doc = _doc(ITALIAN_TABLE, ITALIAN_TABLE, PROSE)
    labels = [
        _label(1, PageType.LV_OTHER),
        _label(2, PageType.LV_OTHER),
        _label(3, PageType.LV_TABLE, confidence=0.33),
    ]

    repaired = repair_page_types(doc, labels)
    pages, german = select_extraction_pages(doc, repaired)

    assert german is False
    assert {page.number for page in pages} >= {1, 2}  # the real BOQ is read
    assert len(pages) > 1  # not just the stray page


def test_german_document_without_labels_selects_nothing_for_the_caller_fallback():
    doc = _doc(GERMAN_TABLE, PROSE)
    labels = [_label(1, PageType.OTHER), _label(2, PageType.LEGAL)]

    pages, german = select_extraction_pages(doc, labels)

    assert pages == []
    assert german is True
