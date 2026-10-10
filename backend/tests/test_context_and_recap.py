"""A) section context reaches matching; C) recap pages/rows are not positions."""
from __future__ import annotations

from app.domain.enums import PageType, Unit
from app.domain.models import Item
from app.pipeline.ai.match import _question
from app.pipeline.ai.retrieval import item_text
from app.pipeline.ai.vision_extract import _build, _summary_heading
from app.pipeline.extractors import Page
from app.pipeline.steps.classify_pages import classify_page_deterministic
from app.pipeline.steps.match import _match_text

SECTION = "Rohreinlagen unter Bodenplatte"


def _buried_bend() -> Item:
    item = Item(
        lv_id="LV0050",
        source_page=103,
        description_raw="Ø 250 mm, Bogen 90°",
        quantity=8.0,
        unit=Unit.PC,
    )
    item.attributes["section"] = SECTION
    return item


# --- A: section context ---------------------------------------------------
def test_section_is_part_of_the_match_text():
    assert SECTION in _match_text(_buried_bend())


def test_section_is_embedded_with_the_item():
    assert SECTION in item_text(_buried_bend())


def test_section_is_sent_to_the_decisions_matcher():
    question = _question(_buried_bend(), [])
    assert SECTION in question["instructions"]


# --- C: recap pages and rows ---------------------------------------------
_RECAP_PAGE = "\n".join(
    [
        "SH Erlenstrasse Oberglatt",
        "244.03 LA03 Küche/Abwaschen",
        "Pos. Gegenstand Mass-Gattg. Mass-betrag Einheits-Preis Betrag",
        "KOSTENZUSAMMENSTELLUNG",
        "A Apparate",
        "B Kanäle",
        "C Armaturen und Instrumente",
    ]
)


def test_recap_page_is_not_an_lv_table():
    result = classify_page_deterministic(195, _RECAP_PAGE)
    assert result.type is PageType.MODULO_OFFERTA


def test_summary_heading_detection():
    assert _summary_heading("B Kanäle")
    assert _summary_heading("A Apparate")
    assert not _summary_heading("Fortluft 4-2")  # has a digit -> a real row
    assert not _summary_heading("Ø 250 mm, Bogen 90°")
    assert not _summary_heading(None)


def test_build_drops_a_recap_row():
    row = {
        "description": "B Kanäle",
        "quantity": None,
        "unit": None,
        "measure_present": True,
        "price_present": True,
        "section": None,
    }
    detection, item = _build(
        counter=1,
        system=None,
        page=Page(number=195, text=""),
        row=row,
        reader=None,
        pdf_path=None,
        with_geometry=False,
        column=None,
    )
    assert item is None
    assert detection.kept is False
    assert detection.reason == "summary_row"
