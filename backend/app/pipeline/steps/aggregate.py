"""Step 6 - Aggregate: project summary, Cost Baseline and Fascia di offerta."""
from __future__ import annotations

from typing import List, Tuple

from ...domain.models import BidRange, PositionResult, Summary
from ..pricing import compute_bid_range, compute_summary
from ..pricing_db import PricingDB


def aggregate(
    results: List[PositionResult], db: PricingDB
) -> Tuple[Summary, BidRange]:
    summary = compute_summary(results, db)
    return summary, compute_bid_range(summary, db)
