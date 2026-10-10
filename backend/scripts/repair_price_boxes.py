"""Re-derive the x-range of every price box from the page's real Betrag column.

The price box must sit inside the rightmost (Betrag) column. Older pipeline runs
derived its x from the header word plus a fixed width, which overshot the table's
right border. This re-reads each Bando's own source PDF, recomputes the column
bounds per page and rewrites only the x-range of each ``price_bbox`` (items and
detections), keeping its y-band. It makes no AI call: the geometry is fully
deterministic.

Developer tool, not part of the runtime pipeline::

    backend/.venv/bin/python backend/scripts/repair_price_boxes.py --dry-run
    backend/.venv/bin/python backend/scripts/repair_price_boxes.py

Only the Bando JSON files under ``backend/runtime/bandi/`` are written; the PDFs
are read-only.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

from app import config  # noqa: E402
from app.pipeline.extractors import default_reader  # noqa: E402


def _round_pair(box: list) -> tuple:
    return (round(float(box[0]), 4), round(float(box[2]), 4))


def _repair_rows(rows, page_key, reader, pdf, cache) -> int:
    fixed = 0
    for row in rows:
        page = row.get(page_key)
        box = row.get("price_bbox")
        if not page or not isinstance(box, list) or len(box) != 4:
            continue
        if page not in cache:
            try:
                cache[page] = reader.column_bounds(pdf, page, "Betrag")
            except Exception:  # noqa: BLE001 - a bad page must not stop the run
                cache[page] = None
        column = cache[page]
        if column is None:
            continue
        if _round_pair(box) != (round(column[0], 4), round(column[1], 4)):
            box[0] = round(column[0], 4)
            box[2] = round(column[1], 4)
            fixed += 1
    return fixed


def repair_file(path: Path, reader, dry_run: bool) -> tuple:
    payload = json.loads(path.read_text(encoding="utf-8"))
    bando_id = payload.get("id") or path.stem
    pdf = config.BANDI_DIR / ("%s.pdf" % bando_id)
    if not pdf.exists():
        return 0, 0, "no pdf"
    cache: dict = {}
    items = _repair_rows(payload.get("items", []), "source_page", reader, pdf, cache)
    detections = _repair_rows(payload.get("detections", []), "page", reader, pdf, cache)
    if not dry_run and (items or detections):
        path.write_text(
            json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
        )
    return items, detections, ("%d pages" % len(cache))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="report without writing")
    args = parser.parse_args()

    reader = default_reader()
    files = sorted(p for p in config.BANDI_DIR.glob("*.json"))
    total_items = total_det = 0
    for path in files:
        items, det, note = repair_file(path, reader, args.dry_run)
        total_items += items
        total_det += det
        print(f"{path.stem:24} items={items:4} detections={det:3}  {note}")
    verb = "would fix" if args.dry_run else "fixed"
    print(f"\n{verb} {total_items} item boxes and {total_det} detection boxes "
          f"across {len(files)} files.")


if __name__ == "__main__":
    main()
