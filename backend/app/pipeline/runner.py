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
import time
from pathlib import Path
from typing import Callable, List, Optional

from .. import config
from ..domain.enums import PipelineStatus, PipelineStep
from ..domain.models import Bando, OfferForm, Overview
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
from .offer_form import detect_offer_form
from .pricing import coverage_of, reconcile_item
from .pricing_db import PricingDB, get_pricing_db
from ..util import now_iso

OnStep = Callable[[PipelineStep, PipelineStatus, Optional[str]], None]

# Page progress is saved mid-step for the UI, throttled to spare the disk.
PROGRESS_SAVE_INTERVAL_S = 0.25


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


def _classify_pages(
    document, use_ai: bool, usage: UsageLedger,
    on_progress: Optional[Callable[[int], None]] = None,
) -> List:
    """Label every page, AI-first with a deterministic fallback (never empty)."""
    if use_ai:
        try:
            return classify_pages(document, usage=usage, on_progress=on_progress)
        except Exception:  # noqa: BLE001 - classification must never lose pages
            pass
    return steps_pkg.classify_pages_deterministic(document)


def _detect_offer_form(pdf_path: Path, page_types: List) -> OfferForm:
    """The fillable fields of the first offer-form page; never fails the run."""
    try:
        return detect_offer_form(pdf_path, page_types)
    except Exception:  # noqa: BLE001 - a form we cannot read is just not filled
        return OfferForm()


def _parse_items(
    document, reader: PdfReader, pdf_path: Path, use_ai: bool, usage: UsageLedger,
    deep: bool, page_types: List,
    on_lv_pages: Optional[Callable[[int], None]] = None,
    on_page: Optional[Callable[[], None]] = None,
) -> tuple:
    """Return ``(items, detections)``; detections are empty on the text paths.

    ``on_lv_pages`` receives how many LV pages will be read, ``on_page`` fires
    once per LV page read by the vision engine.
    """
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
    if on_lv_pages:
        on_lv_pages(len(pages))

    vision = extract_document_vision(
        document, reader, pdf_path, pages=pages, usage=usage, on_page=on_page
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
    semantic = match_items_ai(items, db, usage=usage, context=context)
    if deep:
        escalate_matches(items, db, usage=usage, semantic=semantic)


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
        # Canonical English only: the UI translates `step`/`status` into the
        # user's language, so this free text is never localized here.
        bando.pipeline.message = message
        bando.pipeline.updated_at = now_iso()
        if on_step:
            on_step(step, status, error)

    last_saved = [0.0]

    def progress(force: bool = False) -> None:
        """Persist page progress mid-step, at most a few times per second."""
        now = time.monotonic()
        if on_step and (force or now - last_saved[0] >= PROGRESS_SAVE_INTERVAL_S):
            last_saved[0] = now
            bando.pipeline.updated_at = now_iso()
            on_step(bando.pipeline.step, bando.pipeline.status, None)

    def pages_read(count: int) -> None:
        bando.pipeline.pages_read = min(count, bando.pipeline.pages_total)
        progress()

    def lv_pages(total: int) -> None:
        bando.pipeline.lv_pages_total = total
        bando.pipeline.lv_pages_done = 0
        progress(force=True)

    def lv_page_done() -> None:
        bando.pipeline.lv_pages_done += 1
        progress()

    try:
        bando.pipeline.pages_read = 0
        bando.pipeline.lv_pages_total = 0
        bando.pipeline.lv_pages_done = 0
        emit(PipelineStep.READ, PipelineStatus.RUNNING, message="Reading PDF")
        document = steps_pkg.read_pdf(reader, pdf_path)
        bando.page_count = document.page_count
        bando.pipeline.pages_total = document.page_count

        emit(
            PipelineStep.CLASSIFY_PAGES,
            PipelineStatus.RUNNING,
            message="Classifying pages",
        )
        bando.page_types = _classify_pages(document, use_ai, usage, on_progress=pages_read)
        bando.pipeline.pages_read = document.page_count
        bando.offer_form = _detect_offer_form(pdf_path, bando.page_types)

        emit(PipelineStep.PARSE, PipelineStatus.RUNNING, message="Extracting positions")
        items, detections = _parse_items(
            document, reader, pdf_path, use_ai, usage, deep, bando.page_types,
            on_lv_pages=lv_pages, on_page=lv_page_done,
        )
        bando.pipeline.lv_pages_done = bando.pipeline.lv_pages_total
        bando.detections = detections
        bando.pipeline.item_count = len(items)

        emit(
            PipelineStep.OVERVIEW,
            PipelineStatus.RUNNING,
            message="Document overview",
        )
        bando.overview = steps_pkg.build_overview(
            document, items, db, use_ai=use_ai and deep, usage=usage
        )

        emit(
            PipelineStep.CLASSIFY,
            PipelineStatus.RUNNING,
            message="%d positions extracted" % len(items),
        )
        title, description, classification = steps_pkg.classify_document(
            document, bando.source_file or ""
        )
        # Only fill in when the user has not set them.
        bando.title = bando.title or title
        bando.description = bando.description or description
        bando.classification = classification

        emit(PipelineStep.CANONICALIZE, PipelineStatus.RUNNING, message="Normalising")
        items = steps_pkg.canonicalize_items(items)

        emit(PipelineStep.MATCH, PipelineStatus.RUNNING, message="Catalogue match")
        _match_items(items, db, use_ai, usage, context=_match_context(bando.overview), deep=deep)

        bando.items = items

        emit(PipelineStep.PRICE, PipelineStatus.RUNNING, message="Computing price")
        bando.position_results = steps_pkg.price_items(items, db)

        emit(PipelineStep.AGGREGATE, PipelineStatus.RUNNING, message="Summary and bid")
        bando.summary, bando.recommended_bid_range = steps_pkg.aggregate(
            bando.position_results, db
        )
        bando.coverage = coverage_of(items)
        bando.usage = usage.as_dict() if use_ai else None
        bando.updated_at = now_iso()

        emit(PipelineStep.AGGREGATE, PipelineStatus.DONE, message="Completed")
    except Exception as exc:  # noqa: BLE001 - surfaced to the UI as a failure
        emit(bando.pipeline.step, PipelineStatus.FAILED, str(exc))
        raise

    return bando
