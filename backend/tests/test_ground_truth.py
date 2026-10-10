"""Extraction quality gate against the 22 verified positions.

The threshold is a knob (``EVAL_MIN_RECALL``) so it can be raised as the
pipeline improves; it starts at 0 to record the baseline without failing.
Raise it locally to test a change, e.g. ``EVAL_MIN_RECALL=0.8 pytest
tests/test_ground_truth.py``.
"""
from __future__ import annotations

import os

import pytest

from app.config import DATA_DIR
from app.eval import TENDER_FILE, evaluate, run_deterministic

MIN_RECALL = float(os.environ.get("EVAL_MIN_RECALL", "0.9"))
_HAS_TENDER = (DATA_DIR / TENDER_FILE).exists()


@pytest.mark.skipif(not _HAS_TENDER, reason="tender PDF not present")
def test_deterministic_extraction_recall():
    items, latency = run_deterministic()
    report = evaluate(items, label="deterministic", latency=latency)
    print("\n" + report.format_table())
    assert report.recall >= MIN_RECALL, (
        "recall %.2f below EVAL_MIN_RECALL %.2f" % (report.recall, MIN_RECALL)
    )
