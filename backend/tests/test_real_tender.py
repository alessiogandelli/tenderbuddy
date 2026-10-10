"""Pipeline on the real tender: it must run, extract a meaningful share, and
never crash. This is the external behaviour the spec promises for the full LV.
"""
from __future__ import annotations

from app.config import DATA_DIR
from app.domain.enums import Classification
from app.domain.models import Bando
from app.pipeline.runner import run_pipeline
from app.util import now_iso

TENDER = DATA_DIR / "BKP_244_LV_Lueftung_260804.pdf"


def test_pipeline_runs_on_the_full_tender():
    if not TENDER.exists():  # pragma: no cover - dataset always present in repo
        return

    bando = Bando(id="real", source_file=TENDER.name, created_at=now_iso(), updated_at=now_iso())
    run_pipeline(bando, TENDER)

    assert bando.pipeline.status == "done"
    assert bando.page_count == 202
    assert bando.classification == Classification.VENTILATION
    assert len(bando.items) > 0

    # Every Item is accounted for in the coverage, nothing silently dropped.
    assert sum(bando.coverage.model_dump().values()) == len(bando.items)

    # The two flagged-but-unpriced failure modes are visible, not hidden.
    flagged = [item for item in bando.items if item.flags]
    assert len(flagged) > 0

    # A real price is produced for at least a share of the positions.
    priced = [
        result
        for result in bando.position_results
        if result.direct_position_cost_chf is not None
    ]
    assert len(priced) >= 5


def test_matched_but_unpriceable_is_not_calculated():
    """A match whose install code is unknown must not look like a priced row."""
    from app.domain.enums import ItemStatus
    from app.domain.models import Item, Match
    from app.pipeline.pricing_db import get_pricing_db
    from app.pipeline.runner import recompute

    db = get_pricing_db()
    item = Item(
        lv_id="X1",
        quantity=5.0,
        unit="pc",
        match=Match(
            product_id="P-AIR-001",
            install_code="NOT_A_RULE",
            confidence=0.9,
            price_source="catalog",
        ),
        status=ItemStatus.CALCULATED,
    )
    bando = Bando(id="x", created_at=now_iso(), updated_at=now_iso(), items=[item])
    recompute(bando, db)

    result = bando.position_results[0]
    assert result.material_cost_chf is None
    assert result.status != ItemStatus.CALCULATED
    assert "no_match" in [flag.value for flag in item.flags]
