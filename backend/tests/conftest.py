"""Test configuration: isolate the runtime directory and seed once."""
from __future__ import annotations

import os
import tempfile
import time

# Must be set before app.config is imported anywhere.
os.environ.setdefault("BANDO_RUNTIME_DIR", tempfile.mkdtemp(prefix="bando-test-"))
# Keep the suite deterministic and free even when a key is in the env: tests
# exercise the deterministic parser/matcher, never the API.
os.environ.setdefault("BANDO_AI_MODE", "off")

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from app.seed import SEED_ID, seed  # noqa: E402


@pytest.fixture(scope="session")
def client() -> TestClient:
    seed(force=True)
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture(scope="session")
def seed_id() -> str:
    return SEED_ID


def _tiny_pdf(path):
    """A one-page miniature of a real German LV page: column header, a description
    block, then variant rows whose unit token and quantity sit on separate lines
    (the layout the real tender uses)."""
    import fitz

    doc = fitz.open()
    page = doc.new_page()
    header = [
        "SH Erlenstrasse Oberglatt",
        "244.01 LA01 Nebenraeume",
        "Seite 1 / 1",
        "Pos.",
        "Gegenstand",
        "Mass-",
        "Gattg.",
        "Einheits-",
        "Preis",
        "Betrag",
        "Fr.",
        "C",
        "ARMATUREN UND INSTRUMENTE",
    ]
    y = 40
    for line in header:
        page.insert_text((72, y), line)
        y += 14
    body = [
        "Zuluft - Tellerventil aus Kunststoff",
        "Fabrikat z.B. Trox Hesco",
        "Groesse \u00d8 10 cm",
        "Stk",
        "5",
        "\u00d8 12.5 cm",
        "Stk",
        "6",
    ]
    y += 10
    for line in body:
        page.insert_text((72, y), line)
        y += 14
    doc.save(str(path))
    doc.close()


@pytest.fixture
def fresh_bando(client, tmp_path) -> str:
    """A throwaway Bando, so tests never mutate the golden seed."""
    pdf = tmp_path / "tender.pdf"
    _tiny_pdf(pdf)
    with open(pdf, "rb") as fh:
        response = client.post(
            "/api/bandi", files={"file": ("tender.pdf", fh, "application/pdf")}
        )
    bando_id = response.json()["id"]
    for _ in range(50):
        state = client.get("/api/bandi/%s/pipeline" % bando_id).json()
        if state["status"] in ("done", "failed"):
            break
        time.sleep(0.1)
    return bando_id
