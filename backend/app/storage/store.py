"""File storage for Bandi: one folder per tender, plus an index. No database.

Layout (under ``BANDI_DIR``)::

    <id>/
      bando.json     the live/final Bando the API serves
      source.pdf     the uploaded tender
      steps/         one JSON per pipeline step (see storage.artifacts)
      result.json    frozen final Bando snapshot (written when the run is DONE)

Older installs kept flat ``<id>.json`` / ``<id>.pdf`` files next to the folders;
reads and PDF access fall back to those so nothing had to be migrated.
"""
from __future__ import annotations

import json
import shutil
import threading
from pathlib import Path
from typing import List, Optional

from ..config import BANDI_DIR, INDEX_PATH, ensure_runtime
from ..domain.models import Bando, BandoSummary, BandoTotals, PageTypeEntry

# The pipeline runs in a background thread and saves on every step while the UI
# polls, so writes must not interleave.
_LOCK = threading.RLock()


def write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, indent=2)
    tmp.replace(path)


def _read_json(path: Path) -> Optional[dict]:
    if not path.exists():
        return None
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


# ---------------------------------------------------------------------------
# Paths (new folder layout, with legacy flat-file fallbacks)
# ---------------------------------------------------------------------------
def bando_dir(bando_id: str) -> Path:
    return BANDI_DIR / bando_id


def steps_dir(bando_id: str) -> Path:
    return bando_dir(bando_id) / "steps"


def _bando_path(bando_id: str) -> Path:
    return bando_dir(bando_id) / "bando.json"


def _legacy_bando_path(bando_id: str) -> Path:
    return BANDI_DIR / ("%s.json" % bando_id)


def _new_pdf_path(bando_id: str) -> Path:
    return bando_dir(bando_id) / "source.pdf"


def _legacy_pdf_path(bando_id: str) -> Path:
    return BANDI_DIR / ("%s.pdf" % bando_id)


def pdf_path(bando_id: str) -> Path:
    """The tender PDF, preferring the new layout but honouring legacy files."""
    new = _new_pdf_path(bando_id)
    if new.exists():
        return new
    legacy = _legacy_pdf_path(bando_id)
    if legacy.exists():
        return legacy
    return new


def result_path(bando_id: str) -> Path:
    return bando_dir(bando_id) / "result.json"


def save_pdf(bando_id: str, content: bytes) -> Path:
    ensure_runtime()
    path = _new_pdf_path(bando_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(content)
    return path


# ---------------------------------------------------------------------------
# Index
# ---------------------------------------------------------------------------
def _summarize(bando: Bando) -> BandoSummary:
    return BandoSummary(
        id=bando.id,
        title=bando.title,
        description=bando.description,
        classification=bando.classification,
        source_file=bando.source_file,
        page_count=bando.page_count,
        created_at=bando.created_at,
        updated_at=bando.updated_at,
        pipeline=bando.pipeline,
        coverage=bando.coverage,
        totals=BandoTotals(
            direct_cost_chf=bando.summary.direct_cost_chf,
            indicative_price_chf=bando.summary.indicative_selling_price_chf,
        ),
        overview_summary=bando.overview.summary if bando.overview else None,
        page_types=[PageTypeEntry(page=p.page, type=p.type) for p in bando.page_types],
    )


def _load_index() -> List[BandoSummary]:
    raw = _read_json(INDEX_PATH) or {"bandi": []}
    return [BandoSummary(**entry) for entry in raw.get("bandi", [])]


def _save_index(summaries: List[BandoSummary]) -> None:
    ensure_runtime()
    write_json(INDEX_PATH, {"bandi": [s.model_dump(mode="json") for s in summaries]})


def list_bandi() -> List[BandoSummary]:
    return sorted(_load_index(), key=lambda s: s.created_at, reverse=True)


def _index_is_stale() -> bool:
    """True when the stored index predates a field (or field shape) we need.

    Checks both for a missing ``page_types`` and for the older verbose form that
    carried ``confidence``/``reason`` per page (the compact tape only needs page
    and type), so an upgraded index is rewritten once and stays small.
    """
    raw = _read_json(INDEX_PATH) or {"bandi": []}
    for entry in raw.get("bandi", []):
        if "page_types" not in entry:
            return True
        for page_type in entry.get("page_types") or []:
            if isinstance(page_type, dict) and (
                "confidence" in page_type or "reason" in page_type
            ):
                return True
    return False


def rebuild_index() -> None:
    """Rewrite the index from the Bandi on disk, backfilling new summary fields.

    The index is a cache; the per-tender ``bando.json`` files are the truth.
    Run once at startup so entries written before a field existed are upgraded.
    A Bando that fails to load keeps its previous (field-less) summary, so a
    single bad file never empties the archive.
    """
    if not _index_is_stale():
        return
    ensure_runtime()
    previous = {summary.id: summary for summary in _load_index()}
    ids: set[str] = set()
    for entry in BANDI_DIR.iterdir():
        if entry.is_dir():
            ids.add(entry.name)
        elif entry.suffix == ".json":
            ids.add(entry.stem)
    summaries: List[BandoSummary] = []
    for bando_id in ids:
        try:
            bando = get_bando(bando_id)
        except Exception:  # noqa: BLE001 - a single unreadable file must not abort
            bando = None
        if bando is not None:
            summaries.append(_summarize(bando))
        elif bando_id in previous:
            summaries.append(previous[bando_id])
    if summaries:
        with _LOCK:
            _save_index(summaries)


# ---------------------------------------------------------------------------
# Bando
# ---------------------------------------------------------------------------
def get_bando(bando_id: str) -> Optional[Bando]:
    raw = _read_json(_bando_path(bando_id))
    if raw is None:
        raw = _read_json(_legacy_bando_path(bando_id))
    if raw is None:
        return None
    return Bando(**raw)


def save_bando(bando: Bando) -> None:
    ensure_runtime()
    with _LOCK:
        write_json(_bando_path(bando.id), bando.model_dump(mode="json"))
        summaries = [s for s in _load_index() if s.id != bando.id]
        summaries.append(_summarize(bando))
        _save_index(summaries)


def write_result(bando: Bando) -> None:
    """Freeze the final Bando snapshot of a completed run."""
    with _LOCK:
        write_json(result_path(bando.id), bando.model_dump(mode="json"))


def delete_bando(bando_id: str) -> bool:
    removed = False
    with _LOCK:
        folder = bando_dir(bando_id)
        if folder.exists():
            shutil.rmtree(folder)
            removed = True
        for legacy in (_legacy_bando_path(bando_id), _legacy_pdf_path(bando_id)):
            if legacy.exists():
                legacy.unlink()
                removed = True
        summaries = [s for s in _load_index() if s.id != bando_id]
        _save_index(summaries)
    return removed
