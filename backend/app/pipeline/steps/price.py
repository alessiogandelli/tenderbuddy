"""Step 5 - Price: build position_results from matched Items."""
from __future__ import annotations

from typing import List

from ...domain.models import Item, PositionResult
from ..pricing import build_position_results
from ..pricing_db import PricingDB


def price_items(items: List[Item], db: PricingDB) -> List[PositionResult]:
    return build_position_results(items, db)
