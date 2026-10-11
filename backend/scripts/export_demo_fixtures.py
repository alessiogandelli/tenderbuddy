"""Export the preloaded example the frontend serves when the backend is down.

Reads a processed tender from the runtime store plus the pricing dataset and
writes the JSON fixtures (and the tender PDF) under ``frontend/public/demo/``.
Those files are committed, so the GitHub Pages build is self-contained and the
demo works with the laptop off.

Usage::

    python backend/scripts/export_demo_fixtures.py [bando_id]
"""
from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT = BACKEND_DIR.parent
sys.path.insert(0, str(BACKEND_DIR))

from app.pipeline.pricing_db import get_pricing_db  # noqa: E402
from app.storage import get_bando, list_bandi, pdf_path  # noqa: E402

DEMO_DIR = REPO_ROOT / "frontend" / "public" / "demo"
DEFAULT_BANDO = "bnd_eb09ac9d83ea"


def _write(name: str, payload: object) -> None:
    path = DEMO_DIR / name
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False)
    print("wrote", path.relative_to(REPO_ROOT))


def main() -> None:
    wanted = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_BANDO
    bando = get_bando(wanted)
    if bando is None:
        # Fall back to the most recent finished tender that has items.
        for summary in list_bandi():
            candidate = get_bando(summary.id)
            if candidate is not None and candidate.items:
                bando = candidate
                break
    if bando is None:
        raise SystemExit("No processed tender with items found in the runtime store.")

    summary = next((s for s in list_bandi() if s.id == bando.id), None)
    if summary is None:
        raise SystemExit(f"No archive summary for {bando.id}.")

    db = get_pricing_db()

    _write("bando.json", bando.model_dump(mode="json"))
    _write("summary.json", summary.model_dump(mode="json"))
    _write("catalog.json", [p.model_dump(mode="json") for p in db.product_list])
    _write("productivity.json", [r.model_dump(mode="json") for r in db.rules.values()])
    _write("parameters.json", db.parameters)

    source = pdf_path(bando.id)
    if not source.exists():
        raise SystemExit(f"No source PDF for {bando.id}.")
    DEMO_DIR.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(source, DEMO_DIR / "source.pdf")
    print(
        "wrote",
        (DEMO_DIR / "source.pdf").relative_to(REPO_ROOT),
        f"({bando.id}: {bando.page_count} pages, {len(bando.items)} items)",
    )


if __name__ == "__main__":
    main()
