"""Pipeline runner: sequences the seven steps and keeps per-step state.

Read -> Parse -> Classify -> Canonicalize -> Match -> Price -> Aggregate.
Each step is independently replaceable; only the resulting Bando JSON is
observable from outside (that is the one test seam).

When OpenAI is configured the Parse and Match steps run their AI engines
(extraction via the Responses API, matching via the Decisions API) with a
selective escalation pass; otherwise the deterministic engines run and no
network call is made.
"""
from __future__ import annotations

import copy
from pathlib import Path
from typing import Callable, List, Optional

from .. import config
from ..domain.enums import PipelineStatus, PipelineStep
from ..domain.models import Bando, Overview
from . import steps as steps_pkg
from .ai import (
    UsageLedger,
    classify_pages,
    escalate_empty_pages,
    escalate_matches,
    extract_document,
    extract_document_vision,
    lv_pages,
    match_items_ai,
)
from .extractors import PdfReader, default_reader
from .pricing import coverage_of, reconcile_item
from .pricing_db import PricingDB, get_pricing_db
from ..util import now_iso

OnStep = Callable[[PipelineStep, PipelineStatus, Optional[str]], None]


def _with_bando_parameters(bando: Bando, db: PricingDB) -> PricingDB:
    """The dataset priced with the Bando's own Parameters (snapshotted once)."""
    if bando.parameters is None:
        bando.parameters = copy.deepcopy(db.parameters)
    return db.with_parameters(bando.parameters)


def recompute(bando: Bando, db: Optional[PricingDB] = None) -> Bando:
    """(Re)price a Bando from its Items. Used by the manual path and after edits."""
    db = _with_bando_parameters(bando, db or get_pricing_db())
    for item in bando.items:
        reconcile_item(item, db)
    bando.position_results = steps_pkg.price_items(bando.items, db)
    bando.summary, bando.recommended_bid_range = steps_pkg.aggregate(
        bando.position_results, db
    )
    bando.coverage = coverage_of(bando.items)
    bando.updated_at = now_iso()
    return bando


def _match_context(overview: Optional[Overview]) -> str:
    if overview is None:
        return ""
    bits: List[str] = []
    if overview.summary:
        bits.append("Project overview: %s" % overview.summary)
    if overview.materials_needed:
        bits.append(
            "Materials needed across the tender: %s"
            % ", ".join(overview.materials_needed)
        )
    if overview.labour_needed:
        bits.append(
            "Labour needed across the tender: %s" % ", ".join(overview.labour_needed)
        )
    return "\n".join(bits)


def _classify_pages(document, use_ai: bool, usage: UsageLedger) -> List:
    """Label every page, AI-first with a deterministic fallback (never empty)."""
    if not use_ai:
        return steps_pkg.classify_pages_deterministic(document)
    try:
        return classify_pages(document, usage=usage)
    except Exception:  # noqa: BLE001 - classification must never lose pages
        return steps_pkg.classify_pages_deterministic(document)


def _parse_items(
    document, reader: PdfReader, pdf_path: Path, use_ai: bool, usage: UsageLedger,
    deep: bool, page_types: List,
) -> tuple:
    """Return ``(items, detections)``; detections are empty on the text paths."""
    if not use_ai:
        return (
            steps_pkg.parse_document(document, reader, pdf_path, with_geometry=True),
            [],
        )

    # Only the six-column LV tables are read, and read with the vision engine.
    table_numbers = set(steps_pkg.table_pages(page_types))
    pages = [p for p in document.pages if p.number in table_numbers]
    if not pages:
        # No LV table classified: fall back to the header heuristic.
        pages = lv_pages(document)

    vision = extract_document_vision(
        document, reader, pdf_path, pages=pages, usage=usage
    )
    items = vision.items
    detections = vision.detections
    if not items:
        # Fallbacks: text AI, then the deterministic parser (no detections).
        items = extract_document(document, reader, pdf_path, usage=usage)
        detections = []
    if not items:
        items = steps_pkg.parse_document(document, reader, pdf_path, with_geometry=True)
        detections = []
    if deep:
        items.extend(
            escalate_empty_pages(document, items, reader, pdf_path, usage=usage)
        )
    return items, detections


def _match_items(
    items: List, db: PricingDB, use_ai: bool, usage: UsageLedger, context: str = "",
    deep: bool = False,
) -> None:
    if not use_ai:
        steps_pkg.match_items(items, db)
        return
    match_items_ai(items, db, usage=usage, context=context)
    if deep:
        escalate_matches(items, db, usage=usage)


def run_pipeline(
    bando: Bando,
    pdf_path: Path,
    reader: Optional[PdfReader] = None,
    db: Optional[PricingDB] = None,
    on_step: Optional[OnStep] = None,
    use_ai: Optional[bool] = None,
    deep: bool = False,
) -> Bando:
    """Run the full extraction pipeline in place and return the Bando.

    ``deep`` enables the expensive quality passes (whole-document overview and
    selective escalation). The default fast path skips them: for a first price
    they add latency and cost without changing what gets extracted.
    """
    reader = reader or default_reader()
    db = db or get_pricing_db()
    use_ai = config.ai_enabled() if use_ai is None else use_ai
    usage = UsageLedger()
    db = _with_bando_parameters(bando, db)

    def emit(step: PipelineStep, status: PipelineStatus, error: Optional[str] = None,
             message: Optional[str] = None) -> None:
        bando.pipeline.step = step
        bando.pipeline.status = status
        bando.pipeline.error = error
        if message is not None:
            bando.pipeline.message = message
        bando.pipeline.updated_at = now_iso()
        if on_step:
            on_step(step, status, error)

    try:
        emit(PipelineStep.READ, PipelineStatus.RUNNING, message="Lettura del PDF")
        document = steps_pkg.read_pdf(reader, pdf_path)
        bando.page_count = document.page_count

        emit(
            PipelineStep.CLASSIFY_PAGES,
            PipelineStatus.RUNNING,
            message="Classificazione delle pagine",
        )
        bando.page_types = _classify_pages(document, use_ai, usage)

        emit(PipelineStep.PARSE, PipelineStatus.RUNNING, message="Estrazione posizioni")
        items, detections = _parse_items(
            document, reader, pdf_path, use_ai, usage, deep, bando.page_types
        )
        bando.detections = detections
        bando.pipeline.item_count = len(items)

        emit(
            PipelineStep.OVERVIEW,
            PipelineStatus.RUNNING,
            message="Panoramica del documento",
        )
        bando.overview = steps_pkg.build_overview(
            document, items, db, use_ai=use_ai and deep, usage=usage
        )

        emit(
            PipelineStep.CLASSIFY,
            PipelineStatus.RUNNING,
            message="%d posizioni estratte" % len(items),
        )
        title, description, classification = steps_pkg.classify_document(
            document, bando.source_file or ""
        )
        # Only fill in when the user has not set them.
        bando.title = bando.title or title
        bando.description = bando.description or description
        bando.classification = classification

        emit(PipelineStep.CANONICALIZE, PipelineStatus.RUNNING, message="Normalizzazione")
        items = steps_pkg.canonicalize_items(items)

        emit(PipelineStep.MATCH, PipelineStatus.RUNNING, message="Match catalogo")
        _match_items(items, db, use_ai, usage, context=_match_context(bando.overview), deep=deep)

        bando.items = items

        emit(PipelineStep.PRICE, PipelineStatus.RUNNING, message="Calcolo prezzo")
        bando.position_results = steps_pkg.price_items(items, db)

        emit(PipelineStep.AGGREGATE, PipelineStatus.RUNNING, message="Sintesi e offerta")
        bando.summary, bando.recommended_bid_range = steps_pkg.aggregate(
            bando.position_results, db
        )
        bando.coverage = coverage_of(items)
        bando.usage = usage.as_dict() if use_ai else None
        bando.updated_at = now_iso()

        emit(PipelineStep.AGGREGATE, PipelineStatus.DONE, message="Completato")
    except Exception as exc:  # noqa: BLE001 - surfaced to the UI as a failure
        emit(bando.pipeline.step, PipelineStatus.FAILED, str(exc))
        raise

    return bando
