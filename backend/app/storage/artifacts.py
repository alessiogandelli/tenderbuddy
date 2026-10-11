"""Per-step run artifacts: every pipeline step's output, written to disk.

Each tender folder keeps a ``steps/`` subfolder with one JSON per step
(``01_read.json``, ``02_classify_pages.json``, ...) plus the frozen
``result.json`` once the run is DONE, so a run can be reconstructed and audited
from what the pipeline actually produced.
"""
from __future__ import annotations

from pathlib import Path
from typing import Any, Optional

from ..domain.enums import PipelineStep
from ..domain.models import Bando
from ..util import now_iso
from .store import steps_dir, write_json

# Stable, ordered filenames so a run reads chronologically on disk.
_ORDER = {
    PipelineStep.READ: 1,
    PipelineStep.CLASSIFY_PAGES: 2,
    PipelineStep.PARSE: 3,
    PipelineStep.OVERVIEW: 4,
    PipelineStep.CLASSIFY: 5,
    PipelineStep.CANONICALIZE: 6,
    PipelineStep.MATCH: 7,
    PipelineStep.PRICE: 8,
    PipelineStep.AGGREGATE: 9,
}


class ArtifactWriter:
    """Writes step outputs for one tender. Never raises into the pipeline."""

    def __init__(self, bando_id: str, root: Optional[Path] = None):
        self.bando_id = bando_id
        self.root = root or steps_dir(bando_id)

    def write(self, step: PipelineStep, payload: Any) -> None:
        if not isinstance(step, PipelineStep):
            step = PipelineStep(str(step))
        index = _ORDER.get(step, 99)
        path = self.root / ("%02d_%s.json" % (index, step.value))
        write_json(
            path,
            {"step": step.value, "at": now_iso(), "payload": payload},
        )

    def write_result(self, bando: Bando) -> None:
        from .store import result_path  # local import avoids a cycle at load

        write_json(result_path(self.bando_id), bando.model_dump(mode="json"))
