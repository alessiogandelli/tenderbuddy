"""OpenAI clients and a retry helper that feeds the usage ledger.

The SDK's own retries are disabled (``max_retries=0``) so ours are the only ones
and can be counted for the latency report.
"""
from __future__ import annotations

import asyncio
import random
from typing import Awaitable, Callable, Optional, TypeVar

import openai

from ... import config
from .usage import UsageLedger

T = TypeVar("T")

RETRYABLE = tuple(
    exc
    for exc in (
        getattr(openai, "RateLimitError", None),
        getattr(openai, "APITimeoutError", None),
        getattr(openai, "APIConnectionError", None),
        getattr(openai, "InternalServerError", None),
    )
    if exc is not None
)


def sync_client() -> Optional["openai.OpenAI"]:
    if not config.ai_enabled():
        return None
    return openai.OpenAI(
        api_key=config.OPENAI_API_KEY, timeout=config.AI_TIMEOUT_S, max_retries=0
    )


def async_client() -> Optional["openai.AsyncOpenAI"]:
    if not config.ai_enabled():
        return None
    return openai.AsyncOpenAI(
        api_key=config.OPENAI_API_KEY, timeout=config.AI_TIMEOUT_S, max_retries=0
    )


async def with_retry(
    fn: Callable[[], Awaitable[T]],
    usage: UsageLedger,
    attempts: int = 4,
) -> T:
    for attempt in range(attempts):
        try:
            return await fn()
        except RETRYABLE:
            usage.retries += 1
            if attempt == attempts - 1:
                usage.errors += 1
                raise
            backoff = min(8.0, 0.5 * (2 ** attempt))
            await asyncio.sleep(backoff * (0.5 + random.random()))
        except Exception:
            usage.errors += 1
            raise
    raise RuntimeError("unreachable")  # pragma: no cover
