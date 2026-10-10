"""The whole-document overview exists with the AI off, from the items."""
from __future__ import annotations

from app.domain.enums import ItemStatus
from app.domain.models import Item, Match
from app.pipeline.pricing_db import get_pricing_db
from app.pipeline.steps.overview import deterministic_overview


def test_seed_has_a_deterministic_overview(client, seed_id):
    overview = client.get("/api/bandi/%s" % seed_id).json()["overview"]
    assert overview is not None
    assert overview["engine"] == "deterministic"
    assert overview["summary"]
    assert overview["systems"]
    assert overview["materials_needed"]
    assert overview["labour_needed"]


def test_deterministic_overview_reads_materials_and_labour_from_matches():
    db = get_pricing_db()
    item = Item(
        lv_id="LV0001",
        system="244.01 LA01",
        description_raw="Supply air valve DN100",
        quantity=5.0,
        unit="pc",
        match=Match(
            product_id="P-AIR-001",
            install_code="DIFFUSER",
            confidence=0.9,
            price_source="catalog",
        ),
        status=ItemStatus.CALCULATED,
    )
    overview = deterministic_overview([item], db)
    assert "244.01 LA01" in overview.systems
    assert any("valve" in value.lower() or "terminal" in value.lower()
               for value in overview.materials_needed)
    assert overview.labour_needed
