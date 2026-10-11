"""Identity pass: the AI names the tender, with a deterministic fallback.

Uses fake clients (no network, no key), mirroring test_ai_adapters.py.
"""
from __future__ import annotations

import json

from app.domain.enums import Classification
from app.pipeline.ai import classify as classify_ai
from app.pipeline.ai.classify import document_identity
from app.pipeline.ai.usage import UsageLedger
from app.pipeline.extractors import Document, Page
from app.pipeline.steps.classify import build_classification

OPENING = "\n".join(
    [
        "Comune di Zurigo",
        "Scuola elementare",
        "Impianto di ventilazione",
        "Capitolato d'appalto",
    ]
)


class _FakeUsage:
    def __init__(self, input_tokens: int, output_tokens: int):
        self.input_tokens = input_tokens
        self.output_tokens = output_tokens


class _FakeResponse:
    def __init__(self, output_text):
        self.output_text = output_text
        self.usage = _FakeUsage(120, 30)


class _FakeResponses:
    def __init__(self, payload):
        self.payload = payload
        self.calls = []

    async def create(self, **kwargs):
        self.calls.append(kwargs)
        return _FakeResponse(json.dumps(self.payload))


class _FakeAsyncClient:
    def __init__(self, payload):
        self.responses = _FakeResponses(payload)

    async def close(self):
        pass


def _doc() -> Document:
    return Document(page_count=1, pages=[Page(number=1, text=OPENING)])


def test_document_identity_returns_title_and_description():
    client = _FakeAsyncClient(
        {"title": "Ventilazione scuola Zurigo", "description": "Impianto di ventilazione di una scuola."}
    )
    usage = UsageLedger()
    data = document_identity(_doc(), client=client, usage=usage)

    assert data["title"] == "Ventilazione scuola Zurigo"
    assert data["description"] == "Impianto di ventilazione di una scuola."
    assert usage.calls == 1
    assert usage.cost_usd > 0
    # Only the opening pages are sent, never the whole document.
    assert "Comune di Zurigo" in client.responses.calls[0]["input"]


def test_build_classification_without_ai_stays_deterministic():
    title, description, classification = build_classification(
        _doc(), "26122_ca_capitolato.pdf", use_ai=False
    )
    assert title is None
    assert classification is Classification.VENTILATION
    assert description is None


def test_build_classification_uses_ai_identity(monkeypatch):
    monkeypatch.setattr(
        classify_ai,
        "document_identity",
        lambda document, usage=None: {
            "title": "Ventilazione scuola",
            "description": "Fornitura e posa dell'impianto di ventilazione.",
        },
    )
    title, description, classification = build_classification(
        _doc(), "26122_ca_capitolato.pdf", use_ai=True
    )
    assert title == "Ventilazione scuola"
    assert description == "Fornitura e posa dell'impianto di ventilazione."
    assert classification is Classification.VENTILATION


def test_build_classification_falls_back_when_ai_fails(monkeypatch):
    def boom(document, usage=None):
        raise RuntimeError("no key")

    monkeypatch.setattr(classify_ai, "document_identity", boom)
    title, description, classification = build_classification(
        _doc(), "26122_ca_capitolato.pdf", use_ai=True
    )
    assert title is None
    assert classification is Classification.VENTILATION
