"""Semantic candidate retrieval, exercised with a fake embedder (no network).

The catalog is English while the German tender uses other words, so the
deterministic token pre-filter offers the wrong products. These tests lock the
wiring that closes that gap: a German term with zero lexical overlap must reach
the right English product once a semantic context is supplied.
"""
from __future__ import annotations

import asyncio

from app.domain.enums import Unit
from app.domain.models import Item
from app.pipeline.ai.retrieval import (
    build_semantic_contexts,
    load_or_build_catalog_embeddings,
)
from app.pipeline.ai.usage import UsageLedger
from app.pipeline.pricing_db import get_pricing_db
from app.pipeline.steps.match import candidate_products

# A tiny hand-made "embedding": one dimension per concept, on when a keyword is
# present. Two texts that share a concept get cosine 1.0 regardless of language.
_CONCEPTS = {
    "transfer": ["überströmer", "uberstromer", "transfer"],
    "instrument": [
        "druckwächter",
        "druckwachter",
        "transmitter",
        "thermometer",
        "pressure",
        "sensor",
        "fühler",
        "fuehler",
        "frostschutz",
    ],
    "silencer": ["schalldämpfer", "schalldaempfer", "silencer"],
    "vav": ["volumenstromregler", "vav", "variable volume"],
    "nozzle": ["düsenrohr", "dusenrohr", "nozzle"],
}
_KEYS = list(_CONCEPTS)


def _fake_vector(text: str):
    low = text.lower()
    return [1.0 if any(k in low for k in _CONCEPTS[key]) else 0.0 for key in _KEYS]


class _Emb:
    def __init__(self, embedding):
        self.embedding = embedding


class _EmbUsage:
    def __init__(self, tokens):
        self.input_tokens = tokens


class _EmbResponse:
    def __init__(self, texts):
        self.data = [_Emb(_fake_vector(t)) for t in texts]
        self.usage = _EmbUsage(len(texts))


class _FakeEmbeddings:
    def __init__(self, boom: bool = False):
        self.calls = []
        self.boom = boom

    async def create(self, input, model, **kwargs):
        if self.boom:
            raise RuntimeError("embedding backend down")
        texts = input if isinstance(input, list) else [input]
        self.calls.append(list(texts))
        return _EmbResponse(texts)


class _FakeClient:
    def __init__(self, boom: bool = False):
        self.embeddings = _FakeEmbeddings(boom=boom)

    async def close(self):
        pass


class _NoEmbeddingsClient:
    async def close(self):
        pass


def _transfer_item() -> Item:
    return Item(
        lv_id="LV0001",
        source_page=1,
        description_raw="Überströmer Klassenzimmer Fabrikat z.B. SCHAKO AG",
        quantity=2.0,
        unit=Unit.PC,
    )


def test_lexical_filter_misses_the_product_across_languages():
    db = get_pricing_db()
    item = _transfer_item()
    lexical = [p.product_id for p in candidate_products(item, db, k=30)]
    assert "P-AIR-012" not in lexical  # the transfer-air unit is never offered


def test_semantic_retrieval_surfaces_the_product():
    db = get_pricing_db()
    item = _transfer_item()
    contexts = asyncio.run(
        build_semantic_contexts(
            _FakeClient(), [item], db, UsageLedger(), mode="semantic"
        )
    )
    assert "LV0001" in contexts
    ranked = [
        p.product_id
        for p in candidate_products(item, db, k=30, semantic=contexts["LV0001"])
    ]
    assert "P-AIR-012" in ranked
    assert ranked[0] == "P-AIR-012"  # the blend ranks the semantic hit first


def test_retrieval_mode_lexical_skips_embeddings():
    db = get_pricing_db()
    client = _FakeClient()
    contexts = asyncio.run(
        build_semantic_contexts(client, [_transfer_item()], db, mode="lexical")
    )
    assert contexts == {}
    assert client.embeddings.calls == []


def test_missing_embeddings_client_falls_back():
    db = get_pricing_db()
    contexts = asyncio.run(
        build_semantic_contexts(
            _NoEmbeddingsClient(), [_transfer_item()], db, mode="semantic"
        )
    )
    assert contexts == {}


def test_embedding_failure_falls_back_without_raising():
    db = get_pricing_db()
    contexts = asyncio.run(
        build_semantic_contexts(
            _FakeClient(boom=True), [_transfer_item()], db, mode="semantic"
        )
    )
    assert contexts == {}


def test_catalog_embeddings_are_cached_on_disk(tmp_path):
    db = get_pricing_db()
    client = _FakeClient()
    usage = UsageLedger()

    first = asyncio.run(
        load_or_build_catalog_embeddings(db, client, cache_dir=tmp_path, usage=usage)
    )
    embedded_calls = len(client.embeddings.calls)
    assert embedded_calls >= 1

    second = asyncio.run(
        load_or_build_catalog_embeddings(db, client, cache_dir=tmp_path, usage=usage)
    )
    assert len(client.embeddings.calls) == embedded_calls  # served from cache
    assert first.product_ids == second.product_ids
    assert first.matrix.shape == second.matrix.shape
