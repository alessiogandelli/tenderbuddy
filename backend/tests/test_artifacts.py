"""A run stores every step and its result under one folder per tender."""
from __future__ import annotations

import json

from app import storage

EXPECTED_STEPS = [
    "01_read.json",
    "02_classify_pages.json",
    "03_parse.json",
    "04_overview.json",
    "05_classify.json",
    "06_canonicalize.json",
    "07_match.json",
    "08_price.json",
    "09_aggregate.json",
]


def test_run_writes_one_folder_with_all_steps_and_result(fresh_bando):
    bando_id = fresh_bando

    folder = storage.bando_dir(bando_id)
    assert folder.is_dir()
    assert (folder / "bando.json").exists()
    assert storage.pdf_path(bando_id).exists()

    steps = sorted(p.name for p in storage.steps_dir(bando_id).glob("*.json"))
    assert steps == EXPECTED_STEPS

    read = json.loads((storage.steps_dir(bando_id) / "01_read.json").read_text())
    assert read["step"] == "read"
    assert read["payload"]["page_count"] >= 1
    assert read["payload"]["pages"]

    assert storage.result_path(bando_id).exists()
    result = json.loads(storage.result_path(bando_id).read_text())
    assert result["id"] == bando_id
    assert result["pipeline"]["status"] == "done"


def test_get_bando_reads_the_folder(seed_id):
    bando = storage.get_bando(seed_id)
    assert bando is not None
    assert bando.id == seed_id
