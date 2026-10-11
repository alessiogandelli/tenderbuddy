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
from ..domain.models import Bando, Item, Match, OfferCover, OfferForm
from ..pipeline.extractors import default_reader
from ..pipeline.offer_cover import compute_cover, detect_offer_cover, fill_offer_cover
from ..pipeline.offer_form import compute_offer_form, detect_offer_form, fill_offer_form
from ..pipeline.offer_pdf import OfferEntry, fill_offer
from ..pipeline.pricing import offer_amount, scenario_margin_pct
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
    # The printed offer total for the position; explicit null clears it.
    offer_price_chf: Optional[float] = None
    # Confirm (or un-confirm) the current price. Any change to the price resets
    # it, unless the same patch sets it again.
    price_confirmed: Optional[bool] = None


# Patch fields that change a position's price, and so its confirmation.
_PRICE_FIELDS = {"quantity", "unit", "product_id", "install_code", "manual_unit_price_chf", "offer_price_chf"}


class OfferExport(BaseModel):
    """Which positions go into the offer PDF, and at which bid scenario."""

    lv_ids: List[str]
    # A key of stretch_bid_optimization.scenario_margins_pct; None = target margin.
    scenario: Optional[str] = None


class FormFieldPatch(BaseModel):
    """A value typed into an offer-form field; null goes back to the computed one."""

    value: Optional[float] = None


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
                artifacts=storage.ArtifactWriter(bando_id),
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
    # Tenders saved before offer prices existed: price them once, then keep.
    stale = any(
        result.direct_position_cost_chf is not None and not result.offer_prices_chf
        for result in bando.position_results
    )
    if stale and bando.pipeline.status == PipelineStatus.DONE:
        recompute(bando)
        storage.save_bando(bando)
    # Tenders read before the offer form existed: look for its fields once.
    pdf = storage.pdf_path(bando_id)
    if bando.pipeline.status == PipelineStatus.DONE and pdf.exists():
        if bando.offer_form is None:
            try:
                bando.offer_form = detect_offer_form(pdf, bando.page_types)
            except Exception:  # noqa: BLE001 - an unreadable form is just not filled
                bando.offer_form = OfferForm()
            storage.save_bando(bando)
        if bando.offer_cover is None:
            try:
                bando.offer_cover = detect_offer_cover(pdf, bando.page_types)
            except Exception:  # noqa: BLE001 - an unreadable cover is just not filled
                bando.offer_cover = OfferCover()
            storage.save_bando(bando)
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
    if "offer_price_chf" in patch.model_fields_set:
        price = patch.offer_price_chf
        if price is not None and price < 0:
            raise HTTPException(status_code=400, detail="The price cannot be negative")
        item.offer_price_chf = price
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

    if patch.price_confirmed is not None:
        item.price_confirmed = patch.price_confirmed
    elif patch.model_fields_set & _PRICE_FIELDS:
        item.price_confirmed = False

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


def _offer_lines(bando: Bando, body: OfferExport):
    """The positions the offer prints, with their amounts: ``(entries, skipped)``.

    Raises KeyError for an unknown scenario. The offer form's Brutto is the sum
    of exactly these amounts, so the form and the LV always agree."""
    db = get_pricing_db().with_parameters(
        bando.parameters or copy.deepcopy(get_pricing_db().parameters)
    )
    scenario_margin_pct(db, body.scenario)
    items = {item.lv_id: item for item in bando.items}
    results = {result.lv_id: result for result in bando.position_results}
    entries = []
    skipped = []
    for lv_id in dict.fromkeys(body.lv_ids):
        item = items.get(lv_id)
        result = results.get(lv_id)
        amount = offer_amount(item, result, db, body.scenario) if item and result else None
        if amount is None or not item.price_bbox or not item.source_page:
            skipped.append(lv_id)
            continue
        entries.append(
            (
                lv_id,
                OfferEntry(page=item.source_page, price_bbox=item.price_bbox, amount_chf=amount),
            )
        )
    return entries, skipped


def _form_values(bando: Bando, entries) -> dict:
    # The conditions chain (and so the Netto) is computed even when no form page
    # was found: the cover prints the same Netto.
    form = bando.offer_form or OfferForm()
    brutto = sum(entry.amount_chf for _, entry in entries)
    return compute_offer_form(form, brutto, bando.parameters or {})


def _cover_values(bando: Bando, netto: Optional[float]) -> dict:
    """The cover's values: the bidder's identity and the computed Netto.

    The dataset defaults fill any key the Bando's own parameters predate (e.g. a
    ``bidder`` block added after the tender was saved), tightened by the Bando's.
    """
    params = _deep_merge(copy.deepcopy(get_pricing_db().parameters), bando.parameters or {})
    return compute_cover(bando.offer_cover, netto, params)


@router.post("/{bando_id}/offer-form/values")
def offer_form_values(bando_id: str, body: OfferExport) -> dict:
    """The offer form filled for these positions and this bid scenario, the
    same values the export writes. Fields left empty are null. The cover's
    values (the bidder and the Netto) ride along, so the UI can show them too."""
    bando = _get_or_404(bando_id)
    try:
        entries, _ = _offer_lines(bando, body)
    except KeyError:
        return _error(400, "invalid_input", "Unknown scenario %s" % body.scenario)
    values = _form_values(bando, entries)
    cover = None
    if bando.offer_cover is not None:
        cover = {
            "page": bando.offer_cover.page,
            "values": _cover_values(bando, values.get("conditions.netto.eingabe")),
        }
    return {
        "page": bando.offer_form.page if bando.offer_form else None,
        "brutto_chf": round(sum(entry.amount_chf for _, entry in entries), 2),
        "values": values,
        "cover": cover,
    }


# The rates an estimator types on the form are the tender's parameters.
_RATE_PARAMETERS = {
    "conditions.rabatt.pct": "rabatt_pct",
    "conditions.skonto.pct": "skonto_pct",
}


@router.patch("/{bando_id}/offer-form/fields/{field_id}")
def patch_offer_form_field(bando_id: str, field_id: str, patch: FormFieldPatch) -> dict:
    """Type a value into an offer-form field (null: back to the computed one).
    Rabatt % and Skonto % are stored as the tender's offer_conditions."""
    bando = _get_or_404(bando_id)
    form = bando.offer_form
    field = next((f for f in (form.fields if form else []) if f.id == field_id), None)
    if field is None:
        raise HTTPException(status_code=404, detail="Field %s not found" % field_id)
    if patch.value is not None and patch.value < 0:
        raise HTTPException(status_code=400, detail="The value cannot be negative")
    if field_id in _RATE_PARAMETERS:
        if patch.value is not None and patch.value >= 100:
            raise HTTPException(status_code=400, detail="A rate must be below 100%")
        base = copy.deepcopy(bando.parameters or get_pricing_db().parameters)
        conditions = dict(base.get("offer_conditions") or {})
        conditions[_RATE_PARAMETERS[field_id]] = patch.value or 0.0
        base["offer_conditions"] = conditions
        bando.parameters = base
    else:
        field.override = patch.value
    bando.updated_at = now_iso()
    storage.save_bando(bando)
    return bando.model_dump(mode="json")


@router.post("/{bando_id}/export/pdf")
def export_offer_pdf(bando_id: str, body: OfferExport) -> Response:
    """The tender PDF with the selling price of each chosen position written in
    its price cell, and the offer form filled with the same positions.
    Positions without a price or a price cell are skipped."""
    bando = _get_or_404(bando_id)
    pdf = storage.pdf_path(bando_id)
    if not pdf.exists():
        raise HTTPException(status_code=404, detail="PDF not available")
    try:
        entries, skipped = _offer_lines(bando, body)
    except KeyError:
        return _error(400, "invalid_input", "Unknown scenario %s" % body.scenario)

    values = _form_values(bando, entries)
    form_written = [0]
    cover_written = [0]

    def fill_form(doc) -> None:
        if bando.offer_form is not None:
            form_written[0] = fill_offer_form(doc, bando.offer_form, values)
        if bando.offer_cover is not None:
            netto = values.get("conditions.netto.eingabe")
            cover_written[0] = fill_offer_cover(
                doc, bando.offer_cover, _cover_values(bando, netto)
            )

    filled = fill_offer(pdf, entries, also=fill_form)
    stem = re.sub(r"\.pdf$", "", bando.source_file or bando_id, flags=re.I)
    stem = re.sub(r"[^A-Za-z0-9._-]+", "_", stem) or bando_id  # header-safe
    return Response(
        content=filled.pdf,
        media_type="application/pdf",
        headers={
            "Content-Disposition": 'attachment; filename="%s_offer.pdf"' % stem,
            "X-Offer-Written": str(filled.written),
            "X-Offer-Skipped": str(len(skipped) + len(filled.skipped)),
            "X-Offer-Form-Written": str(form_written[0]),
            "X-Offer-Cover-Written": str(cover_written[0]),
        },
    )


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
