"""Bando endpoints: archive, upload, detail, manual items, PDF, export."""
from __future__ import annotations

import copy
import csv
import io
import re
import threading
import uuid
from typing import Dict, List, Optional

from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse, JSONResponse, Response
from pydantic import BaseModel

from .. import storage
from ..domain.enums import Classification, ItemStatus, PipelineStatus, PipelineStep, PriceSource, Unit
from ..domain.models import Bando, Item, Match
from ..pipeline.extractors import default_reader
from ..pipeline.pricing_db import get_pricing_db
from ..pipeline.runner import recompute, run_pipeline
from ..util import now_iso

router = APIRouter(prefix="/api/bandi", tags=["bandi"])


class BandoPatch(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    classification: Optional[Classification] = None


class ItemPatch(BaseModel):
    """Fields a reviewer can change inline; the status is always recomputed."""

    description_raw: Optional[str] = None
    quantity: Optional[float] = None
    unit: Optional[Unit] = None
    product_id: Optional[str] = None
    install_code: Optional[str] = None
    confidence: Optional[float] = None
    # Explicit null clears it; omitted leaves it unchanged (same for product_id).
    manual_unit_price_chf: Optional[float] = None


class ParametersPatch(BaseModel):
    """Partial Parameters update; nested dicts are merged, price is recomputed."""

    parameters: Dict[str, object]


def _deep_merge(base: dict, patch: dict) -> dict:
    out = dict(base)
    for key, value in patch.items():
        if isinstance(value, dict) and isinstance(out.get(key), dict):
            out[key] = _deep_merge(out[key], value)
        else:
            out[key] = value
    return out


def _error(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(status_code=status, content={"error": {"code": code, "message": message}})


def _get_or_404(bando_id: str) -> Bando:
    bando = storage.get_bando(bando_id)
    if bando is None:
        raise HTTPException(status_code=404, detail="Bando %s not found" % bando_id)
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
        raise HTTPException(status_code=400, detail="A PDF file is required")

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


def _run_in_background(bando_id: str, deep: bool = False) -> None:
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
                deep=deep,
            )
        except Exception:  # noqa: BLE001 - failure is persisted in pipeline state
            pass
        storage.save_bando(bando)

    threading.Thread(target=work, daemon=True).start()


@router.get("/{bando_id}")
def get_bando(bando_id: str) -> dict:
    bando = _get_or_404(bando_id)
    if bando.parameters is None:
        bando.parameters = copy.deepcopy(get_pricing_db().parameters)
    return bando.model_dump(mode="json")


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


@router.patch("/{bando_id}/parameters")
def patch_parameters(bando_id: str, patch: ParametersPatch) -> dict:
    """Edit the Bando's pricing Parameters; the whole quote is recomputed."""
    bando = _get_or_404(bando_id)
    base = copy.deepcopy(bando.parameters or get_pricing_db().parameters)
    bando.parameters = _deep_merge(base, patch.parameters)
    recompute(bando)
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
def run_bando(bando_id: str, deep: bool = False) -> dict:
    bando = _get_or_404(bando_id)
    pdf = storage.pdf_path(bando_id)
    if not pdf.exists():
        return _error(400, "invalid_input", "PDF not available for this Bando")
    # Mark it running now so the UI starts polling and the button never looks dead.
    bando.pipeline.step = PipelineStep.READ
    bando.pipeline.status = PipelineStatus.RUNNING
    bando.pipeline.error = None
    bando.updated_at = now_iso()
    storage.save_bando(bando)
    _run_in_background(bando_id, deep=deep)
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


@router.patch("/{bando_id}/items/{lv_id}")
def patch_item(bando_id: str, lv_id: str, patch: ItemPatch) -> dict:
    """Edit one position inline. The status is always recomputed, never forced."""
    bando = _get_or_404(bando_id)
    item = next((existing for existing in bando.items if existing.lv_id == lv_id), None)
    if item is None:
        raise HTTPException(status_code=404, detail="Position %s not found" % lv_id)

    if patch.description_raw is not None:
        item.description_raw = patch.description_raw
        item.description_normalized = patch.description_raw.strip()
    if patch.quantity is not None:
        item.quantity = patch.quantity
    if patch.unit is not None:
        item.unit = patch.unit
    if "product_id" in patch.model_fields_set and patch.product_id is None:
        item.match = None
    if "manual_unit_price_chf" in patch.model_fields_set:
        price = patch.manual_unit_price_chf
        if price is not None and price < 0:
            raise HTTPException(status_code=400, detail="The price cannot be negative")
        item.manual_unit_price_chf = price
    if patch.product_id is not None:
        product = get_pricing_db().product(patch.product_id)
        install_code = patch.install_code or (product.install_code if product else None)
        price_source = (
            PriceSource.SUPPLIER_PACKAGE
            if product is not None and product.supplier_quote_required
            else PriceSource.CATALOG
        )
        item.match = Match(
            product_id=patch.product_id,
            install_code=install_code,
            confidence=patch.confidence if patch.confidence is not None else 0.9,
            price_source=price_source,
        )

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
        raise HTTPException(status_code=404, detail="PDF not available")
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
        "usage": bando.usage,
    }
    return JSONResponse(
        content=payload,
        headers={"Content-Disposition": 'attachment; filename="%s.json"' % bando_id},
    )
