"""Pipeline runner: sequences the seven steps and keeps per-step state.

Read -> Parse -> Classify -> Canonicalize -> Match -> Price -> Aggregate.
Each step is independently replaceable; only the resulting Bando JSON is
observable from outside (that is the one test seam).
"""
from __future__ import annotations

from pathlib import Path
from typing import Callable, List, Optional

from ..domain.enums import PipelineStatus, PipelineStep
from ..domain.models import Bando
from . import steps as steps_pkg
from .extractors import PdfReader, default_reader
from .pricing import coverage_of, reconcile_item
from .pricing_db import PricingDB, get_pricing_db
from ..util import now_iso

OnStep = Callable[[PipelineStep, PipelineStatus, Optional[str]], None]


def recompute(bando: Bando, db: Optional[PricingDB] = None) -> Bando:
    """(Re)price a Bando from its Items. Used by the manual path and after edits."""
    db = db or get_pricing_db()
    for item in bando.items:
        reconcile_item(item, db)
    bando.position_results = steps_pkg.price_items(bando.items, db)
    bando.summary, bando.recommended_bid_range = steps_pkg.aggregate(
        bando.position_results, db
    )
    bando.coverage = coverage_of(bando.items)
    bando.updated_at = now_iso()
    return bando


def run_pipeline(
    bando: Bando,
    pdf_path: Path,
    reader: Optional[PdfReader] = None,
    db: Optional[PricingDB] = None,
    on_step: Optional[OnStep] = None,
) -> Bando:
    """Run the full extraction pipeline in place and return the Bando."""
    reader = reader or default_reader()
    db = db or get_pricing_db()

    def emit(step: PipelineStep, status: PipelineStatus, error: Optional[str] = None) -> None:
        bando.pipeline.step = step
        bando.pipeline.status = status
        bando.pipeline.error = error
        bando.pipeline.updated_at = now_iso()
        if on_step:
            on_step(step, status, error)

    try:
        emit(PipelineStep.READ, PipelineStatus.RUNNING)
        document = steps_pkg.read_pdf(reader, pdf_path)
        bando.page_count = document.page_count

        emit(PipelineStep.PARSE, PipelineStatus.RUNNING)
        items: List = steps_pkg.parse_document(
            document, reader, pdf_path, with_geometry=True
        )

        emit(PipelineStep.CLASSIFY, PipelineStatus.RUNNING)
        title, description, classification = steps_pkg.classify_document(
            document, bando.source_file or ""
        )
        # Only fill in when the user has not set them.
        bando.title = bando.title or title
        bando.description = bando.description or description
        bando.classification = classification

        emit(PipelineStep.CANONICALIZE, PipelineStatus.RUNNING)
        items = steps_pkg.canonicalize_items(items)

        emit(PipelineStep.MATCH, PipelineStatus.RUNNING)
        items = steps_pkg.match_items(items, db)

        bando.items = items

        emit(PipelineStep.PRICE, PipelineStatus.RUNNING)
        bando.position_results = steps_pkg.price_items(items, db)

        emit(PipelineStep.AGGREGATE, PipelineStatus.RUNNING)
        bando.summary, bando.recommended_bid_range = steps_pkg.aggregate(
            bando.position_results, db
        )
        bando.coverage = coverage_of(items)
        bando.updated_at = now_iso()

        emit(PipelineStep.AGGREGATE, PipelineStatus.DONE)
    except Exception as exc:  # noqa: BLE001 - surfaced to the UI as a failure
        emit(bando.pipeline.step, PipelineStatus.FAILED, str(exc))
        raise

    return bando
