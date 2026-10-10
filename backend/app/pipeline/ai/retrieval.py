"""Semantic candidate retrieval for the matcher's pre-filter.

The catalog is English while tenders are German/Italian/French, so the
deterministic token pre-filter finds nothing for most positions: an item named
``Kompaktschalldämpfer`` shares zero tokens with ``Compact silencer`` and is
offered the wrong products, so the Decisions matcher can only answer ``none``.

This module embeds the catalog once (cached on disk, keyed by the catalog text)
and each run's item descriptions, then ranks candidates by cosine similarity.
It is optional: when OpenAI is not configured, or a call fails, callers fall
back to the deterministic lexical pre-filter. Retrieval never blocks a run.
"""
from __future__ import annotations

import hashlib
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence

import numpy as np

from ... import config
from ...domain.models import Item, Product
from ..pricing_db import PricingDB
from .usage import UsageLedger

# A description longer than this is truncated before embedding: the head carries
# the meaning and the tail is boilerplate (chapter refs, "wie vorbeschrieben").
_MAX_ITEM_CHARS = 2000
_EMBED_BATCH = 128


def product_text(product: Product) -> str:
    """The text embedded for a catalog product."""
    parts = [
        product.category,
        product.subcategory,
        product.manufacturer,
        product.model,
        product.description,
        ("unit " + product.unit) if product.unit else None,
        product.install_code,
    ]
    return " | ".join(p for p in parts if p)


def item_text(item: Item) -> str:
    """The text embedded for a tender position (section context included)."""
    text = (item.description_raw or item.description_normalized or "").strip()
    section = (item.attributes or {}).get("section")
    if section:
        text = "%s %s" % (section, text)
    text = text[:_MAX_ITEM_CHARS]
    if item.quantity is not None:
        unit = item.unit.value if item.unit else ""
        text = "%s | qty %s %s" % (text, item.quantity, unit)
    return text or "(no description)"


def _normalize(matrix: np.ndarray) -> np.ndarray:
    """Row-normalize so cosine similarity is a plain dot product."""
    norms = np.linalg.norm(matrix, axis=1, keepdims=True)
    norms[norms == 0] = 1.0
    return matrix / norms


@dataclass
class CatalogEmbeddings:
    """Unit-normalized product vectors plus an id -> row index."""

    model: str
    dimensions: int
    product_ids: List[str]
    matrix: np.ndarray

    def __post_init__(self) -> None:
        self._index = {pid: i for i, pid in enumerate(self.product_ids)}

    def cosine(self, product_id: str, item_vector: np.ndarray) -> float:
        row = self._index.get(product_id)
        if row is None:
            return 0.0
        return float(self.matrix[row] @ item_vector)


@dataclass
class SemanticContext:
    """Per-item retrieval context handed to ``candidate_products``."""

    item_vector: np.ndarray
    catalog: CatalogEmbeddings
    weight: float = 0.7

    def similarity(self, product_id: str) -> float:
        return self.catalog.cosine(product_id, self.item_vector)


def _catalog_digest(model: str, dimensions: int, texts: Sequence[str]) -> str:
    digest = hashlib.sha1()
    digest.update(("%s|%d|" % (model, dimensions)).encode("utf-8"))
    for text in texts:
        digest.update(text.encode("utf-8"))
        digest.update(b"\n")
    return digest.hexdigest()[:16]


def _cache_path(cache_dir: Path, digest: str) -> Path:
    return Path(cache_dir) / ("catalog_emb_%s.npz" % digest)


async def _embed(
    client: Any,
    model: str,
    texts: Sequence[str],
    dimensions: int,
    usage: UsageLedger,
) -> List[List[float]]:
    kwargs: Dict[str, Any] = {"input": list(texts), "model": model}
    if dimensions:
        kwargs["dimensions"] = dimensions
    start = time.perf_counter()
    response = await client.embeddings.create(**kwargs)
    elapsed_ms = (time.perf_counter() - start) * 1000.0
    record = getattr(response, "usage", None)
    # Embeddings report ``prompt_tokens``; chat-style responses report
    # ``input_tokens``. Accept either so cost accounting is never silently zero.
    tokens = (
        getattr(record, "input_tokens", None)
        or getattr(record, "prompt_tokens", 0)
        or 0
    )
    usage.record(model, tokens, 0, elapsed_ms, input_only=True)
    return [list(d.embedding) for d in response.data]


async def load_or_build_catalog_embeddings(
    db: PricingDB,
    client: Any,
    *,
    model: Optional[str] = None,
    dimensions: Optional[int] = None,
    cache_dir: Optional[Path] = None,
    usage: Optional[UsageLedger] = None,
) -> CatalogEmbeddings:
    """Return the catalog vectors, embedding and caching them on first use."""
    model = model or config.EMBED_MODEL
    dimensions = config.EMBED_DIMENSIONS if dimensions is None else dimensions
    cache_dir = cache_dir or config.EMBED_CACHE_DIR
    usage = usage or UsageLedger()

    texts = [product_text(p) for p in db.product_list]
    digest = _catalog_digest(model, dimensions, texts)
    path = _cache_path(cache_dir, digest)
    if path.exists():
        data = np.load(path, allow_pickle=False)
        matrix = data["vectors"].astype(np.float32)
        ids = [str(x) for x in data["product_ids"]]
        return CatalogEmbeddings(model, matrix.shape[1], ids, matrix)

    vectors = await _embed(client, model, texts, dimensions, usage)
    matrix = _normalize(np.asarray(vectors, dtype=np.float32))
    product_ids = [p.product_id for p in db.product_list]
    cache_dir = Path(cache_dir)
    cache_dir.mkdir(parents=True, exist_ok=True)
    np.savez(path, vectors=matrix, product_ids=np.asarray(product_ids))
    return CatalogEmbeddings(model, matrix.shape[1], product_ids, matrix)


async def embed_items(
    items: Sequence[Item],
    client: Any,
    *,
    model: Optional[str] = None,
    dimensions: Optional[int] = None,
    usage: Optional[UsageLedger] = None,
    batch: int = _EMBED_BATCH,
) -> Dict[str, np.ndarray]:
    """Embed each item's description; ``{lv_id: unit-normalized vector}``."""
    model = model or config.EMBED_MODEL
    dimensions = config.EMBED_DIMENSIONS if dimensions is None else dimensions
    usage = usage or UsageLedger()
    texts = [item_text(it) for it in items]
    if not texts:
        return {}

    vectors: List[List[float]] = []
    for start in range(0, len(texts), batch):
        vectors.extend(
            await _embed(client, model, texts[start : start + batch], dimensions, usage)
        )
    matrix = _normalize(np.asarray(vectors, dtype=np.float32))
    return {item.lv_id: matrix[i] for i, item in enumerate(items)}


def embeddings_available(client: Any) -> bool:
    """Whether this client can embed (fake/offline clients cannot)."""
    return client is not None and getattr(client, "embeddings", None) is not None


async def build_semantic_contexts(
    client: Any,
    items: Sequence[Item],
    db: PricingDB,
    usage: Optional[UsageLedger] = None,
    *,
    mode: Optional[str] = None,
    model: Optional[str] = None,
    dimensions: Optional[int] = None,
    weight: Optional[float] = None,
    catalog: Optional[CatalogEmbeddings] = None,
) -> Dict[str, SemanticContext]:
    """Per-item :class:`SemanticContext`, or ``{}`` to fall back to lexical.

    Returns an empty mapping (never raises) when retrieval is disabled, when the
    client cannot embed, or when an embedding call fails, so the caller always
    has a deterministic lexical path.
    """
    mode = (mode or config.RETRIEVAL_MODE).lower()
    if mode == "lexical":
        return {}
    if not embeddings_available(client):
        return {}
    usage = usage or UsageLedger()
    weight = config.SEMANTIC_WEIGHT if weight is None else weight
    try:
        catalog = catalog or await load_or_build_catalog_embeddings(
            db, client, model=model, dimensions=dimensions, usage=usage
        )
        vectors = await embed_items(
            items, client, model=model, dimensions=dimensions, usage=usage
        )
    except Exception:  # noqa: BLE001 - retrieval must never break a run
        return {}
    return {
        item.lv_id: SemanticContext(vectors[item.lv_id], catalog, weight)
        for item in items
        if item.lv_id in vectors
    }
