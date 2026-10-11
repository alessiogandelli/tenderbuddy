"""Identity pass: the AI names the tender in four languages, with a fallback.

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

PAYLOAD = {
    "title": {
        "en": "Ventilation school Zurich",
        "de": "Lueftung Schule Zuerich",
        "fr": "Ventilation ecole Zurich",
        "it": "Ventilazione scuola Zurigo",
    },
    "description": {
        "en": "Ventilation system of a primary school.",
        "de": "Lueftungsanlage einer Primarschule.",
        "fr": "Systeme de ventilation d'une ecole primaire.",
        "it": "Impianto di ventilazione di una scuola elementare.",
    },
}


class _FakeUsage:
    def __init__(self, input_tokens: int, output_tokens: int):
        self.input_tokens = input_tokens
        self.output_tokens = output_tokens


class _FakeResponse:
    def __init__(self, output_text):
        self.output_text = output_text
        self.usage = _FakeUsage(120, 60)


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


def test_document_identity_returns_all_four_languages():
    client = _FakeAsyncClient(PAYLOAD)
    usage = UsageLedger()
    data = document_identity(_doc(), client=client, usage=usage)

    assert set(data) == {"title", "description"}
    for key in ("title", "description"):
        assert set(data[key]) == {"en", "de", "fr", "it"}
    assert data["title"]["it"] == "Ventilazione scuola Zurigo"
    assert data["title"]["en"] == "Ventilation school Zurich"
    assert usage.calls == 1
    assert usage.cost_usd > 0
    assert "Comune di Zurigo" in client.responses.calls[0]["input"]


def test_build_classification_without_ai_stays_deterministic():
    result = build_classification(_doc(), "26122_ca_capitolato.pdf", use_ai=False)
    assert result.title is None
    assert result.classification is Classification.VENTILATION
    assert result.identity is None


def test_build_classification_uses_ai_identity(monkeypatch):
    monkeypatch.setattr(
        classify_ai,
        "document_identity",
        lambda document, usage=None: {
            "title": PAYLOAD["title"],
            "description": PAYLOAD["description"],
        },
    )
    result = build_classification(_doc(), "26122_ca_capitolato.pdf", use_ai=True)

    assert result.title == "Ventilation school Zurich"
    assert result.description == "Ventilation system of a primary school."
    assert result.classification is Classification.VENTILATION
    assert result.identity is not None
    assert result.identity.title.it == "Ventilazione scuola Zurigo"
    assert result.identity.description.de == "Lueftungsanlage einer Primarschule."


def test_build_classification_falls_back_when_ai_fails(monkeypatch):
    def boom(document, usage=None):
        raise RuntimeError("no key")

    monkeypatch.setattr(classify_ai, "document_identity", boom)
    result = build_classification(_doc(), "26122_ca_capitolato.pdf", use_ai=True)
    assert result.title is None
    assert result.identity is None
    assert result.classification is Classification.VENTILATION
