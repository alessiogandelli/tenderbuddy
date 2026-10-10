"""AI matching: one Decisions API call per batch of positions.

The Decisions API answers a *choice* question from a fixed set, which is exactly
product selection. Each question gets its own pre-filtered candidate list (so the
model cannot pick outside it) plus a ``none`` option; the shared ``input`` carries
the task. ``confidence`` becomes ``Match.confidence`` and a flat probability
distribution marks the match ambiguous.
"""
from __future__ import annotations

import asyncio
import time
from typing import Any, Dict, List, Optional, Sequence

from ... import config
from ...domain.enums import ItemFlag, PriceSource
from ...domain.models import Item, Match, Product
from ..pricing import reconcile_item
from ..pricing_db import PricingDB
from ..steps.match import CANDIDATE_K, candidate_products, _product_tokens
from .client import async_client, with_retry
from .usage import UsageLedger

NONE_CHOICE = "__none__"
BATCH_SIZE = 12
LOW_CONFIDENCE = 0.6
FLAT_MARGIN = 0.15

SHARED_INPUT = (
    "You match HVAC tender positions to catalog products. For each question, "
    "pick the single best-fitting product id from THAT question's choices, or "
    "the none option if nothing fits. Judge by category, size/DN, fire class, "
    "manufacturer and model. Never pick a product whose unit differs from the "
    "position's unit."
)


def _describe(product: Product) -> str:
    head = " | ".join(
        p for p in (product.category, product.subcategory, product.manufacturer, product.model)
        if p
    )
    tail = " | ".join(
        p for p in (product.description, "unit " + (product.unit or "?"), product.install_code)
        if p
    )
    return " | ".join(p for p in (head, tail) if p)


def _question(item: Item, candidates: Sequence[Product]) -> dict:
    choices = [{"value": p.product_id, "description": _describe(p)} for p in candidates]
    choices.append({"value": NONE_CHOICE, "description": "No catalog product fits this position."})
    bits = [item.description_raw or ""]
    if item.quantity is not None:
        bits.append("qty %s %s" % (item.quantity, item.unit.value if item.unit else ""))
    return {
        "type": "choice",
        "name": item.lv_id,
        "instructions": " ".join(b for b in bits if b).strip(),
        "choices": choices,
    }


def _apply_choice(item: Item, chosen: str, confidence: float,
                  probabilities: Sequence[tuple], db: PricingDB) -> None:
    product = db.product(chosen) if chosen and chosen != NONE_CHOICE else None
    if product is None:
        item.match = None
        if ItemFlag.NO_MATCH not in item.flags:
            item.flags.append(ItemFlag.NO_MATCH)
        reconcile_item(item, db)
        return
    conf = float(confidence or 0.0)
    supplier = bool(product.supplier_quote_required)
    item.match = Match(
        product_id=product.product_id,
        install_code=product.install_code,
        confidence=round(conf, 2),
        price_source=PriceSource.SUPPLIER_PACKAGE if supplier else PriceSource.CATALOG,
    )
    if conf < LOW_CONFIDENCE and ItemFlag.LOW_CONFIDENCE_MATCH not in item.flags:
        item.flags.append(ItemFlag.LOW_CONFIDENCE_MATCH)
    ordered = sorted((p for p in probabilities if p[1] is not None), key=lambda p: -p[1])
    if len(ordered) >= 2 and (ordered[0][1] - ordered[1][1]) < FLAT_MARGIN:
        if ItemFlag.MULTI_VARIANT_AMBIGUOUS not in item.flags:
            item.flags.append(ItemFlag.MULTI_VARIANT_AMBIGUOUS)
    reconcile_item(item, db)


def _answer_probabilities(answer: Any) -> List[tuple]:
    out = []
    for prob in getattr(answer, "probabilities", None) or []:
        out.append((getattr(prob, "value", None), getattr(prob, "probability", None)))
    return out


async def _call_batch(
    client: Any,
    model: str,
    questions: List[dict],
    usage: UsageLedger,
    batch: Sequence[Item],
    candidates: Dict[str, List[Product]],
    db: PricingDB,
    context: str = "",
) -> None:
    shared = SHARED_INPUT + ("\n\n" + context if context else "")

    async def do() -> Any:
        return await client.decisions.create(
            model=model, input=shared, questions=questions
        )

    start = time.perf_counter()
    response = await with_retry(do, usage)
    elapsed_ms = (time.perf_counter() - start) * 1000.0
    record = getattr(response, "usage", None)
    usage.record(
        model,
        getattr(record, "input_tokens", 0) or 0,
        0,
        elapsed_ms,
        input_only=True,
    )

    by_name = {getattr(a, "name", None): a for a in (getattr(response, "answers", None) or [])}
    for item in batch:
        answer = by_name.get(item.lv_id)
        if answer is None or getattr(answer, "type", None) != "choice":
            item.match = None
            if ItemFlag.NO_MATCH not in item.flags:
                item.flags.append(ItemFlag.NO_MATCH)
            reconcile_item(item, db)
            continue
        allowed = {p.product_id for p in candidates[item.lv_id]}
        chosen = getattr(answer, "choice", None)
        if chosen not in allowed:
            chosen = NONE_CHOICE
        _apply_choice(
            item, chosen, getattr(answer, "confidence", 0.0),
            _answer_probabilities(answer), db,
        )


async def _run_batches(
    client: Any,
    model: str,
    batches: List[Sequence[Item]],
    candidates: Dict[str, List[Product]],
    db: PricingDB,
    usage: UsageLedger,
    concurrency: int,
    context: str = "",
) -> None:
    semaphore = asyncio.Semaphore(concurrency)

    async def one(batch: Sequence[Item]) -> None:
        async with semaphore:
            questions = [_question(it, candidates[it.lv_id]) for it in batch]
            await _call_batch(client, model, questions, usage, batch, candidates, db, context)

    await asyncio.gather(*(one(b) for b in batches))


def match_items_ai(
    items: List[Item],
    db: PricingDB,
    *,
    client: Optional[Any] = None,
    model: Optional[str] = None,
    usage: Optional[UsageLedger] = None,
    batch_size: int = BATCH_SIZE,
    concurrency: Optional[int] = None,
    context: str = "",
) -> None:
    """Assign each Item a Match via the Decisions API, in place."""
    usage = usage or UsageLedger()
    model = model or config.MATCH_MODEL
    concurrency = concurrency or config.AI_CONCURRENCY
    tokens = _product_tokens(db)

    candidates: Dict[str, List[Product]] = {
        item.lv_id: candidate_products(item, db, k=CANDIDATE_K, product_tokens=tokens)
        for item in items
    }

    matchable: List[Item] = []
    for item in items:
        if candidates[item.lv_id]:
            matchable.append(item)
        else:
            item.match = None
            if ItemFlag.NO_MATCH not in item.flags:
                item.flags.append(ItemFlag.NO_MATCH)
            reconcile_item(item, db)

    if not matchable:
        return

    batches = [
        matchable[i : i + batch_size] for i in range(0, len(matchable), batch_size)
    ]

    async def main() -> None:
        owns_client = client is None
        active = client or async_client()
        if active is None:
            raise RuntimeError(
                "AI matching requested but OpenAI is not configured "
                "(set OPENAI_API_KEY in backend/.env)."
            )
        try:
            await _run_batches(
                active, model, batches, candidates, db, usage, concurrency, context
            )
        finally:
            if owns_client:
                await active.close()

    asyncio.run(main())
