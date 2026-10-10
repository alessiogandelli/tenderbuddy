"""Selective escalation: spend reasoning effort only where the cheap path is unsure.

Level 2 (match): positions the Decisions call marked low-confidence, ambiguous or
    unmatched are re-decided by a reasoning model (Astra) with a structured answer.
Level 3 (extraction): LV pages that yielded no usable position are re-extracted at
    a higher effort.

Every escalation is budget-limited; when the budget is spent the deterministic
result is kept and the position is flagged, never dropped.
"""
from __future__ import annotations

import asyncio
import json
import time
from typing import Any, Dict, List, Optional, Sequence

from ... import config
from ...domain.enums import ItemFlag, PriceSource
from ...domain.models import Item, Match, Product
from ..extractors import Document, PdfReader
from ..pricing import reconcile_item
from ..pricing_db import PricingDB
from ..steps.match import candidate_products, _product_tokens
from .client import async_client, with_retry
from .extract import _build_item
from .retrieval import SemanticContext, build_semantic_contexts
from .usage import UsageLedger

_MATCH_PROMPT = (
    "You are a senior HVAC estimator. For the position below, choose the single "
    "best-fitting catalog product from the candidates, or report none. Reason "
    "about category, size/DN, fire class and manufacturer/model. Return your "
    "final answer as JSON."
)

_ESCALATE_FLAGS = {
    ItemFlag.NO_MATCH,
    ItemFlag.LOW_CONFIDENCE_MATCH,
    ItemFlag.MULTI_VARIANT_AMBIGUOUS,
}


def _match_schema(product_ids: Sequence[str]) -> Dict[str, Any]:
    return {
        "type": "object",
        "additionalProperties": False,
        "required": ["product_id", "confidence", "reason"],
        "properties": {
            "product_id": {"type": ["string", "null"], "enum": list(product_ids) + [None]},
            "confidence": {"type": "number"},
            "reason": {"type": "string"},
        },
    }


def _needs_escalation(item: Item) -> bool:
    return (
        item.match is None
        or bool(_ESCALATE_FLAGS & set(item.flags))
    )


async def _escalate_one(
    client: Any,
    model: str,
    effort: str,
    item: Item,
    candidates: List[Product],
    db: PricingDB,
    usage: UsageLedger,
) -> None:
    product_ids = [p.product_id for p in candidates]
    catalog_text = "\n".join(
        "%s | %s %s | %s" % (p.product_id, p.manufacturer or "", p.model or "", p.description or "")
        for p in candidates
    )
    schema = _match_schema(product_ids)
    prompt = (
        "Position: %s\nQuantity: %s %s\n\nCandidates:\n%s\n\n"
        "Return product_id from the candidate list, or null if none fits."
        % (
            item.description_raw or "",
            item.quantity,
            item.unit.value if item.unit else "",
            catalog_text,
        )
    )

    async def do() -> Any:
        return await client.responses.create(
            model=model,
            instructions=_MATCH_PROMPT,
            input=prompt,
            reasoning={"effort": effort},
            text={
                "format": {
                    "type": "json_schema",
                    "name": "match_decision",
                    "strict": True,
                    "schema": schema,
                }
            },
        )

    start = time.perf_counter()
    response = await with_retry(do, usage)
    usage.escalation_calls += 1
    record = getattr(response, "usage", None)
    usage.record(
        model,
        getattr(record, "input_tokens", 0) or 0,
        getattr(record, "output_tokens", 0) or 0,
        (time.perf_counter() - start) * 1000.0,
    )

    payload = getattr(response, "output_text", None)
    try:
        decision = json.loads(payload) if payload else None
    except (ValueError, TypeError):
        decision = None
    chosen = decision.get("product_id") if isinstance(decision, dict) else None
    product = db.product(chosen) if chosen else None
    if product is None:
        return
    confidence = float((decision or {}).get("confidence") or 0.0)
    supplier = bool(product.supplier_quote_required)
    item.match = Match(
        product_id=product.product_id,
        install_code=product.install_code,
        confidence=round(confidence, 2),
        price_source=PriceSource.SUPPLIER_PACKAGE if supplier else PriceSource.CATALOG,
    )
    if ItemFlag.LOW_CONFIDENCE_MATCH in item.flags and confidence >= 0.6:
        item.flags = [f for f in item.flags if f != ItemFlag.LOW_CONFIDENCE_MATCH]
    reconcile_item(item, db)


def escalate_matches(
    items: List[Item],
    db: PricingDB,
    *,
    client: Optional[Any] = None,
    model: Optional[str] = None,
    effort: Optional[str] = None,
    usage: Optional[UsageLedger] = None,
    budget: Optional[int] = None,
    concurrency: Optional[int] = None,
    semantic: Optional[Dict[str, SemanticContext]] = None,
) -> List[Item]:
    """Level 2: re-decide uncertain matches with a reasoning model.

    ``semantic`` reuses the per-item retrieval contexts built by the matcher;
    when omitted, retrieval is rebuilt for the (few) escalated targets.
    """
    usage = usage or UsageLedger()
    model = model or config.ESCALATE_MODEL
    effort = effort or config.ESCALATE_EFFORT
    budget = config.ESCALATION_BUDGET if budget is None else budget
    concurrency = concurrency or config.AI_CONCURRENCY
    tokens = _product_tokens(db)

    targets = [it for it in items if _needs_escalation(it)][:budget]
    if not targets:
        return []

    async def main() -> None:
        owns_client = client is None
        active = client or async_client()
        if active is None:
            raise RuntimeError("AI escalation requested but OpenAI is not configured.")
        contexts = semantic
        if contexts is None:
            contexts = await build_semantic_contexts(active, targets, db, usage)
        candidates = {
            it.lv_id: candidate_products(
                it, db, k=12, product_tokens=tokens, semantic=contexts.get(it.lv_id)
            )
            for it in targets
        }
        semaphore = asyncio.Semaphore(concurrency)

        async def one(it: Item) -> None:
            async with semaphore:
                await _escalate_one(
                    active, model, effort, it, candidates[it.lv_id], db, usage
                )

        try:
            await asyncio.gather(*(one(it) for it in targets))
        finally:
            if owns_client:
                await active.close()

    asyncio.run(main())
    return targets


def escalate_empty_pages(
    document: Document,
    items: List[Item],
    reader: PdfReader,
    pdf_path,
    *,
    client: Optional[Any] = None,
    model: Optional[str] = None,
    effort: Optional[str] = None,
    usage: Optional[UsageLedger] = None,
    budget: Optional[int] = None,
    with_geometry: bool = True,
) -> List[Item]:
    """Level 3: re-extract LV pages that produced no usable position."""
    usage = usage or UsageLedger()
    model = model or config.ESCALATE_MODEL
    effort = effort or config.ESCALATE_EFFORT
    budget = config.ESCALATION_BUDGET if budget is None else budget

    from .extract import lv_pages

    pages = lv_pages(document)
    have = {it.source_page for it in items if it.source_page is not None}
    empty = [p for p in pages if p.number not in have][:budget]
    if not empty:
        return []

    async def main() -> List[tuple]:
        owns_client = client is None
        active = client or async_client()
        if active is None:
            raise RuntimeError("AI escalation requested but OpenAI is not configured.")
        semaphore = asyncio.Semaphore(config.AI_CONCURRENCY)

        async def one(page):
            async with semaphore:
                from .extract import _call_page

                usage.escalation_calls += 1
                positions = await _call_page(active, model, effort, page.text, usage)
                return page, positions

        try:
            return list(await asyncio.gather(*(one(p) for p in empty)))
        finally:
            if owns_client:
                await active.close()

    results = asyncio.run(main())
    from ..steps.parse import _detect_system

    new_items: List[Item] = []
    counter = max((_lv_number(it.lv_id) for it in items), default=0)
    for page, positions in sorted(results, key=lambda r: r[0].number):
        system = _detect_system(page.text)
        for position in positions:
            counter += 1
            new_items.append(
                _build_item(counter, system, page, position, reader, pdf_path, with_geometry)
            )
    return new_items


def _lv_number(lv_id: str) -> int:
    digits = "".join(ch for ch in lv_id if ch.isdigit())
    return int(digits) if digits else 0
