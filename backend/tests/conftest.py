"""Test configuration: isolate the runtime directory and seed once."""
from __future__ import annotations

import os
import tempfile
import time

# Must be set before app.config is imported anywhere.
os.environ.setdefault("BANDO_RUNTIME_DIR", tempfile.mkdtemp(prefix="bando-test-"))

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
    import fitz

    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((72, 100), "Zuluft - Tellerventil aus Kunststoff")
    page.insert_text((72, 120), "Groesse Ø 10 cm Stk 5")
    page.insert_text((72, 140), "Ø 12.5 cm Stk 6")
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
