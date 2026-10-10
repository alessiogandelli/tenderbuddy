"""JSON-file storage for Bandi: an index plus one file per Bando. No database."""
from __future__ import annotations

import json
import threading
from pathlib import Path
from typing import List, Optional

from ..config import BANDI_DIR, INDEX_PATH, ensure_runtime
from ..domain.models import Bando, BandoSummary, BandoTotals

# The pipeline runs in a background thread and saves on every step while the UI
# polls, so writes must not interleave.
_LOCK = threading.RLock()


def _write_json(path: Path, payload: dict) -> None:
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


def _bando_path(bando_id: str) -> Path:
    return BANDI_DIR / ("%s.json" % bando_id)


def pdf_path(bando_id: str) -> Path:
    return BANDI_DIR / ("%s.pdf" % bando_id)


def save_pdf(bando_id: str, content: bytes) -> Path:
    ensure_runtime()
    path = pdf_path(bando_id)
    path.write_bytes(content)
    return path


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
    )


def _load_index() -> List[BandoSummary]:
    raw = _read_json(INDEX_PATH) or {"bandi": []}
    return [BandoSummary(**entry) for entry in raw.get("bandi", [])]


def _save_index(summaries: List[BandoSummary]) -> None:
    ensure_runtime()
    _write_json(INDEX_PATH, {"bandi": [s.model_dump(mode="json") for s in summaries]})


def list_bandi() -> List[BandoSummary]:
    return sorted(_load_index(), key=lambda s: s.created_at, reverse=True)


def get_bando(bando_id: str) -> Optional[Bando]:
    raw = _read_json(_bando_path(bando_id))
    if raw is None:
        return None
    return Bando(**raw)


def save_bando(bando: Bando) -> None:
    ensure_runtime()
    with _LOCK:
        _write_json(_bando_path(bando.id), bando.model_dump(mode="json"))
        summaries = [s for s in _load_index() if s.id != bando.id]
        summaries.append(_summarize(bando))
        _save_index(summaries)


def delete_bando(bando_id: str) -> bool:
    removed = False
    with _LOCK:
        path = _bando_path(bando_id)
        if path.exists():
            path.unlink()
            removed = True
        pdf = pdf_path(bando_id)
        if pdf.exists():
            pdf.unlink()
        summaries = [s for s in _load_index() if s.id != bando_id]
        _save_index(summaries)
    return removed
