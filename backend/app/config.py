"""Runtime configuration: dataset location, Bando storage, and AI settings.

Values come from the environment, with a ``backend/.env`` file loaded first
(git-ignored, holds ``OPENAI_API_KEY`` and the pipeline knobs).
"""
from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT = BACKEND_DIR.parent

# Load backend/.env before reading anything, without overriding real env vars
# (so `OPENAI_API_KEY=... uvicorn ...` still wins over the file).
load_dotenv(BACKEND_DIR / ".env", override=False)

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


# --------------------------------------------------------------------------
# AI pipeline (OpenAI: Responses API for extraction, Decisions API for match)
# --------------------------------------------------------------------------
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "").strip()

# auto   -> use AI when a key is present (default)
# off    -> never call the API; deterministic parser/matcher only
# forced -> require a key, fail loudly if missing
AI_MODE = os.environ.get("BANDO_AI_MODE", "auto").strip().lower()

EXTRACT_MODEL = os.environ.get("BANDO_EXTRACT_MODEL", "gpt-6-luna").strip()
# "none" beat "low" on both accuracy and latency for structured extraction in the
# benchmark (docs/benchmark.md): reasoning made the model over-think field copying.
EXTRACT_EFFORT = os.environ.get("BANDO_EXTRACT_EFFORT", "none").strip().lower()

MATCH_MODEL = os.environ.get("BANDO_MATCH_MODEL", "gpt-6-luna").strip()

# Page classification (step 1): the Decisions API answers one choice question
# per page. Batched so a 200-page tender is a handful of calls.
CLASSIFY_MODEL = os.environ.get("BANDO_CLASSIFY_MODEL", "gpt-6-luna").strip()
CLASSIFY_BATCH = int(os.environ.get("BANDO_CLASSIFY_BATCH", "20"))

# Vision extraction of the six-column LV tables: one image call per lv_table
# page, returning the rows with their name/price boxes.
VISION_MODEL = os.environ.get("BANDO_VISION_MODEL", "gpt-6-luna").strip()
VISION_EFFORT = os.environ.get("BANDO_VISION_EFFORT", "none").strip().lower()
VISION_DPI = int(os.environ.get("BANDO_VISION_DPI", "150"))

ESCALATE_MODEL = os.environ.get("BANDO_ESCALATE_MODEL", "gpt-6-astra").strip()
ESCALATE_EFFORT = os.environ.get("BANDO_ESCALATE_EFFORT", "medium").strip().lower()

AI_CONCURRENCY = int(os.environ.get("BANDO_AI_CONCURRENCY", "8"))
AI_TIMEOUT_S = float(os.environ.get("BANDO_AI_TIMEOUT_S", "120"))
ESCALATION_BUDGET = int(os.environ.get("BANDO_ESCALATION_BUDGET", "20"))

# Whole-document overview: Luna reads the full tender text. Long tenders are
# chunked and reduced so a single call never exceeds a sane context.
OVERVIEW_MODEL = os.environ.get("BANDO_OVERVIEW_MODEL", EXTRACT_MODEL).strip()
OVERVIEW_EFFORT = os.environ.get("BANDO_OVERVIEW_EFFORT", "low").strip().lower()
OVERVIEW_MAX_CHARS = int(os.environ.get("BANDO_OVERVIEW_MAX_CHARS", "90000"))


def ai_enabled() -> bool:
    """Whether the AI path should be used for this process."""
    if AI_MODE == "off":
        return False
    if AI_MODE == "forced" and not OPENAI_API_KEY:
        raise RuntimeError(
            "BANDO_AI_MODE=forced but OPENAI_API_KEY is empty (backend/.env)."
        )
    return bool(OPENAI_API_KEY)


def ensure_runtime() -> None:
    BANDI_DIR.mkdir(parents=True, exist_ok=True)
