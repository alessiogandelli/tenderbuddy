"""Bando endpoints: archive, upload, detail, manual items, PDF, export."""
from __future__ import annotations

import csv
import io
import re
import threading
import uuid
from typing import List, Optional

from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse, JSONResponse, Response
from pydantic import BaseModel

from .. import storage
from ..domain.enums import Classification, PipelineStatus, PipelineStep
from ..domain.models import Bando, Item
from ..pipeline.extractors import default_reader
from ..pipeline.runner import recompute, run_pipeline
from ..util import now_iso

router = APIRouter(prefix="/api/bandi", tags=["bandi"])


class BandoPatch(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    classification: Optional[Classification] = None


def _error(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(status_code=status, content={"error": {"code": code, "message": message}})


def _get_or_404(bando_id: str) -> Bando:
    bando = storage.get_bando(bando_id)
    if bando is None:
        raise HTTPException(status_code=404, detail="Bando %s non trovato" % bando_id)
    return bando


@router.get("")
def list_bandi() -> List[dict]:
    return [s.model_dump(mode="json") for s in storage.list_bandi()]


@router.post("")
async def upload_bando(
    file: UploadFile = File(...),
    title: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
) -> dict:
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Serve un file PDF")

    content = await file.read()
    bando_id = "bnd_" + uuid.uuid4().hex[:12]
    created = now_iso()
    bando = Bando(
        id=bando_id,
        title=title or None,
        description=description or None,
        classification=Classification.OTHER,
        source_file=file.filename,
        created_at=created,
        updated_at=created,
    )
    storage.save_pdf(bando_id, content)
    storage.save_bando(bando)

    _run_in_background(bando_id)
    return storage.get_bando(bando_id).model_dump(mode="json")


def _run_in_background(bando_id: str) -> None:
    def work() -> None:
        bando = storage.get_bando(bando_id)
        if bando is None:
            return

        def on_step(step, status, error=None) -> None:
            storage.save_bando(bando)

        try:
            run_pipeline(
                bando,
                storage.pdf_path(bando_id),
                reader=default_reader(),
                on_step=on_step,
            )
        except Exception:  # noqa: BLE001 - failure is persisted in pipeline state
            pass
        storage.save_bando(bando)

    threading.Thread(target=work, daemon=True).start()


@router.get("/{bando_id}")
def get_bando(bando_id: str) -> dict:
    return _get_or_404(bando_id).model_dump(mode="json")


@router.patch("/{bando_id}")
def patch_bando(bando_id: str, patch: BandoPatch) -> dict:
    bando = _get_or_404(bando_id)
    if patch.title is not None:
        bando.title = patch.title
    if patch.description is not None:
        bando.description = patch.description
    if patch.classification is not None:
        bando.classification = patch.classification
    bando.updated_at = now_iso()
    storage.save_bando(bando)
    return bando.model_dump(mode="json")


@router.delete("/{bando_id}")
def delete_bando(bando_id: str) -> dict:
    _get_or_404(bando_id)
    storage.delete_bando(bando_id)
    return {"ok": True}


@router.get("/{bando_id}/pipeline")
def get_pipeline(bando_id: str) -> dict:
    return _get_or_404(bando_id).pipeline.model_dump(mode="json")


@router.post("/{bando_id}/run")
def run_bando(bando_id: str) -> dict:
    bando = _get_or_404(bando_id)
    pdf = storage.pdf_path(bando_id)
    if not pdf.exists():
        return _error(400, "invalid_input", "PDF non disponibile per questo Bando")
    # Mark it running now so the UI starts polling and the button never looks dead.
    bando.pipeline.step = PipelineStep.READ
    bando.pipeline.status = PipelineStatus.RUNNING
    bando.pipeline.error = None
    bando.updated_at = now_iso()
    storage.save_bando(bando)
    _run_in_background(bando_id)
    return bando.model_dump(mode="json")


@router.put("/{bando_id}/items")
def replace_items(bando_id: str, items: List[Item]) -> dict:
    bando = _get_or_404(bando_id)
    bando.items = items
    recompute(bando)
    storage.save_bando(bando)
    return bando.model_dump(mode="json")


@router.post("/{bando_id}/items")
def add_item(bando_id: str, item: Item) -> dict:
    bando = _get_or_404(bando_id)
    if not item.lv_id:
        item.lv_id = _next_manual_id(bando.items)
    bando.items = bando.items + [item]
    recompute(bando)
    storage.save_bando(bando)
    return bando.model_dump(mode="json")


def _next_manual_id(items: List[Item]) -> str:
    used = set()
    for existing in items:
        match = re.match(r"MAN(\d+)$", existing.lv_id)
        if match:
            used.add(int(match.group(1)))
    return "MAN%04d" % ((max(used) + 1) if used else 1)


@router.get("/{bando_id}/pdf")
def get_pdf(bando_id: str) -> FileResponse:
    _get_or_404(bando_id)
    pdf = storage.pdf_path(bando_id)
    if not pdf.exists():
        raise HTTPException(status_code=404, detail="PDF non disponibile")
    return FileResponse(pdf, media_type="application/pdf", filename="%s.pdf" % bando_id)


@router.get("/{bando_id}/export")
def export_bando(bando_id: str, format: str = Query("json")) -> Response:
    bando = _get_or_404(bando_id)
    if format == "csv":
        buffer = io.StringIO()
        writer = csv.writer(buffer)
        writer.writerow(
            [
                "lv_id",
                "source_page",
                "product_id",
                "install_code",
                "quantity",
                "unit",
                "material_cost_chf",
                "labour_cost_chf",
                "direct_position_cost_chf",
                "status",
            ]
        )
        for result in bando.position_results:
            writer.writerow(
                [
                    result.lv_id,
                    result.source_page,
                    result.matched_product_id,
                    result.install_code,
                    result.quantity,
                    result.unit.value if result.unit else "",
                    result.material_cost_chf,
                    result.labour_cost_chf,
                    result.direct_position_cost_chf,
                    result.status.value,
                ]
            )
        return Response(
            content=buffer.getvalue(),
            media_type="text/csv",
            headers={"Content-Disposition": 'attachment; filename="%s.csv"' % bando_id},
        )

    payload = {
        "title": bando.title,
        "description": bando.description,
        "classification": bando.classification.value,
        "position_results": [r.model_dump(mode="json") for r in bando.position_results],
        "summary": bando.summary.model_dump(mode="json"),
        "recommended_bid_range": (
            bando.recommended_bid_range.model_dump(mode="json")
            if bando.recommended_bid_range
            else None
        ),
    }
    return JSONResponse(
        content=payload,
        headers={"Content-Disposition": 'attachment; filename="%s.json"' % bando_id},
    )
