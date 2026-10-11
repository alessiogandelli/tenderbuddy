"""The archive summary carries the fields the tender library needs.

The library under the upload drop zone shows each tender's AI one-liner and a
page tape, so ``BandoSummary`` must expose ``overview_summary`` and
``page_types`` — and an index written before those fields existed must upgrade.
"""
from __future__ import annotations

from app.storage import store

_STALE_ENTRY = {
    "schema_version": "2.0",
    "id": "bnd_seed_oberglatt",
    "title": "stale",
    "created_at": "2020-01-01T00:00:00Z",
    "updated_at": "2020-01-01T00:00:00Z",
    "pipeline": {
        "step": "aggregate",
        "status": "done",
        "updated_at": None,
        "error": None,
        "item_count": 0,
        "message": None,
    },
    "coverage": {
        "calculated": 0,
        "supplier_quote_required": 0,
        "assumption_applied": 0,
        "review_required": 0,
        "insufficient_information": 0,
        "out_of_scope": 0,
        "non_priceable": 0,
    },
    "totals": {"direct_cost_chf": 0.0, "indicative_price_chf": 0.0},
}


def test_list_carries_the_library_fields(client, seed_id):
    entries = client.get("/api/bandi").json()
    seed = next(entry for entry in entries if entry["id"] == seed_id)
    assert seed["overview_summary"]
    assert "page_types" in seed


def test_rebuild_index_backfills_a_stale_index(seed_id):
    store.write_json(store.INDEX_PATH, {"bandi": [_STALE_ENTRY]})
    assert store._index_is_stale()

    store.rebuild_index()

    seed = next(s for s in store.list_bandi() if s.id == seed_id)
    assert seed.model_dump().get("page_types") is not None
    assert seed.overview_summary
