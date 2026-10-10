"""Runtime configuration: where the dataset lives, where Bandi are stored."""
from __future__ import annotations

import os
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT = BACKEND_DIR.parent

# The curated pricing dataset (catalog, productivity, parameters) and the
# tender PDF read from disk. Read-only.
DATA_DIR = Path(os.environ.get("BANDO_DATA_DIR", REPO_ROOT / "data"))

# Persisted Bandi (index + one JSON per Bando + the uploaded PDF). Writable.
RUNTIME_DIR = Path(os.environ.get("BANDO_RUNTIME_DIR", BACKEND_DIR / "runtime"))
BANDI_DIR = RUNTIME_DIR / "bandi"
INDEX_PATH = RUNTIME_DIR / "index.json"

# CORS: the Vite dev server. Configurable for other hosts.
ALLOWED_ORIGINS = [
    o.strip()
    for o in os.environ.get(
        "BANDO_ALLOWED_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173",
    ).split(",")
    if o.strip()
]


def ensure_runtime() -> None:
    BANDI_DIR.mkdir(parents=True, exist_ok=True)
