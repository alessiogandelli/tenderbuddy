"""Seed a demo Bando from the provided example data.

Creates a Bando whose Items carry the verified matches, then prices it. The
result reproduces ``data/expected_output_example.json`` exactly (the golden test
asserts this). Also copies the tender PDF so the viewer works on first run.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import List, Optional

import pandas as pd

from .config import DATA_DIR
from .domain.enums import Classification, ItemStatus, PipelineStatus, PipelineStep, PriceSource, Unit
from .domain.models import Bando, Item, Match
from .pipeline.extractors import PdfReader, default_reader
from .pipeline.pricing_db import PricingDB, get_pricing_db
from .pipeline.runner import recompute
from . import storage
from .util import now_iso

SEED_ID = "bnd_seed_oberglatt"
_EXAMPLE_POSITIONS = "example_lv_positions.csv"
_EXPECTED_OUTPUT = "expected_output_example.json"
_TENDER_PDF = "BKP_244_LV_Lueftung_260804.pdf"

_CONFIDENCE = {PriceSource.CATALOG: 0.92, PriceSource.SUPPLIER_PACKAGE: 0.72}

# Unit token as it appears in the German tender, used to locate a row's region.
_LOCATE_UNIT = {
    Unit.PC: "Stk",
    Unit.M: "m",
    Unit.M2: "m2",
    Unit.H: "h",
    Unit.LS: "LS",
    Unit.SYSTEM: "System",
}


def _status(value: str) -> ItemStatus:
    try:
        return ItemStatus(value)
    except ValueError:
        return ItemStatus.REVIEW_REQUIRED


def build_seed_bando(
    db: Optional[PricingDB] = None,
    data_dir: Path = DATA_DIR,
    reader: Optional[PdfReader] = None,
) -> Bando:
    db = db or get_pricing_db()
    positions = pd.read_csv(data_dir / _EXAMPLE_POSITIONS)
    expected = json.loads((data_dir / _EXPECTED_OUTPUT).read_text(encoding="utf-8"))

    items = []
    for row in positions.to_dict(orient="records"):
        product_id = row.get("suggested_product_id")
        product = db.product(product_id) if isinstance(product_id, str) else None
        source = (
            PriceSource.SUPPLIER_PACKAGE
            if product is not None and product.supplier_quote_required
            else PriceSource.CATALOG
        )
        unit = row.get("unit")
        item = Item(
            lv_id=str(row["lv_id"]),
            system=row.get("system"),
            source_page=int(row["source_page"]) if pd.notna(row.get("source_page")) else None,
            description_raw=row.get("description"),
            description_normalized=row.get("description"),
            attributes={
                k: v
                for k, v in {
                    "manufacturer_hint": row.get("manufacturer_hint"),
                    "model_hint": row.get("model_hint"),
                    "category": row.get("category"),
                }.items()
                if isinstance(v, str) and v
            },
            quantity=float(row["quantity"]) if pd.notna(row.get("quantity")) else None,
            unit=Unit(unit) if isinstance(unit, str) and unit in Unit._value2member_map_ else None,
            match=Match(
                product_id=product_id,
                install_code=row.get("expected_install_code"),
                confidence=_CONFIDENCE[source],
                price_source=source,
            ),
            status=_status(str(row.get("ground_truth_status"))),
        )
        items.append(item)

    if reader is not None:
        tender = data_dir / _TENDER_PDF
        if tender.exists():
            _populate_bboxes(items, reader, tender)

    created = now_iso()
    bando = Bando(
        id=SEED_ID,
        title="Sistema di ventilazione",
        description="BKP 244 Lüftungsanlagen — Schulhaus Oberglatt (dati di esempio verificati)",
        classification=Classification.VENTILATION,
        source_file=_TENDER_PDF,
        page_count=expected.get("page_count", 0) or 202,
        created_at=created,
        updated_at=created,
        items=items,
    )
    bando.pipeline.step = PipelineStep.AGGREGATE
    bando.pipeline.status = PipelineStatus.DONE
    bando.pipeline.updated_at = created
    recompute(bando, db)
    return bando


def _populate_bboxes(items: List[Item], reader: PdfReader, tender: Path) -> None:
    """Give the seeded Items a source region so the PDF highlights on first run."""
    for item in items:
        if not item.source_page or item.quantity is None or item.unit is None:
            continue
        token = _LOCATE_UNIT.get(item.unit)
        if not token:
            continue
        quantity = int(item.quantity) if float(item.quantity).is_integer() else item.quantity
        bbox = reader.locate(tender, item.source_page, "%s %s" % (token, quantity))
        if bbox:
            item.source_bbox = list(bbox)


def seed(data_dir: Path = DATA_DIR, force: bool = False) -> Bando:
    """Persist the seeded Bando (and its PDF) if it is not already there."""
    if not force and storage.get_bando(SEED_ID) is not None:
        return storage.get_bando(SEED_ID)

    bando = build_seed_bando(data_dir=data_dir, reader=default_reader())
    tender = data_dir / _TENDER_PDF
    if tender.exists():
        storage.save_pdf(bando.id, tender.read_bytes())
    storage.save_bando(bando)
    return bando


def main() -> None:  # pragma: no cover - CLI convenience
    bando = seed(force=True)
    print("Seeded %s with %d items" % (bando.id, len(bando.items)))


if __name__ == "__main__":  # pragma: no cover
    main()
