"""Identity: a quick Luna read of the OPENING pages to name the tender.

Unlike the whole-document overview (deep pass), this is small on purpose: it
reads only the first ``TITLE_MAX_PAGES`` pages and returns a short title plus a
one-line description, so the archive shows "what this tender is" at a glance
instead of the source filename. It runs on every upload, so latency and cost
must stay low.
"""
from __future__ import annotations

import asyncio
import json
import time
from typing import Any, Dict, Optional

from ... import config
from ..extractors import Document
from .client import async_client, with_retry
from .usage import UsageLedger

SYSTEM_PROMPT = (
    "You are given the FIRST pages of ONE construction tender. Read them and "
    "name the tender for an estimator browsing an archive.\n"
    "\n"
    "Return, IN EACH of the four languages (en, de, fr, it):\n"
    "- title: a short name for the tender (max ~8 words), e.g. "
    "'Ventilation system primary school Zurich'.\n"
    "- description: ONE sentence saying what the tender is about, e.g. "
    "'Supply and installation of the ventilation system of a school'.\n"
    "\n"
    "The four versions must say the SAME thing; keep proper names, places and "
    "technical/product names as they appear in the source (do not translate "
    "them). Be concrete and do not invent anything."
)

_LANGS = ("en", "de", "fr", "it")

_LANG_STRING: Dict[str, Any] = {"type": "string"}
_LOCALIZED: Dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "required": list(_LANGS),
    "properties": {code: _LANG_STRING for code in _LANGS},
}

_SCHEMA: Dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "required": ["title", "description"],
    "properties": {
        "title": _LOCALIZED,
        "description": _LOCALIZED,
    },
}


def _opening_text(document: Document) -> str:
    """The first pages' text, capped by pages and characters."""
    parts = []
    size = 0
    for page in list(document.pages)[: config.TITLE_MAX_PAGES]:
        text = page.text or ""
        if size + len(text) > config.TITLE_MAX_CHARS:
            parts.append(text[: max(0, config.TITLE_MAX_CHARS - size)])
            break
        parts.append(text)
        size += len(text)
    return "\n".join(parts).strip()


async def _call(
    client: Any, model: str, effort: str, text: str, usage: UsageLedger
) -> Dict[str, Any]:
    async def do() -> Any:
        return await client.responses.create(
            model=model,
            instructions=SYSTEM_PROMPT,
            input=text,
            reasoning={"effort": effort},
            text={
                "format": {
                    "type": "json_schema",
                    "name": "document_identity",
                    "strict": True,
                    "schema": _SCHEMA,
                }
            },
        )

    start = time.perf_counter()
    response = await with_retry(do, usage)
    elapsed_ms = (time.perf_counter() - start) * 1000.0
    record = getattr(response, "usage", None)
    usage.record(
        model,
        getattr(record, "input_tokens", 0) or 0,
        getattr(record, "output_tokens", 0) or 0,
        elapsed_ms,
    )
    try:
        data = json.loads(getattr(response, "output_text", None) or "{}")
    except (ValueError, TypeError):
        return {}
    return data if isinstance(data, dict) else {}


def _localized(value: Any) -> Dict[str, str]:
    if not isinstance(value, dict):
        return {code: "" for code in _LANGS}
    return {code: str(value.get(code) or "").strip() for code in _LANGS}


def document_identity(
    document: Document,
    *,
    client: Optional[Any] = None,
    model: Optional[str] = None,
    effort: Optional[str] = None,
    usage: Optional[UsageLedger] = None,
) -> Dict[str, Dict[str, str]]:
    """Read the opening pages and return ``{"title": {...}, "description": {...}}``.

    Each is a ``{en, de, fr, it}`` map, all empty when there is nothing to read
    or the model returns nothing.
    """
    usage = usage or UsageLedger()
    model = model or config.TITLE_MODEL
    effort = effort or config.TITLE_EFFORT
    empty = {"title": _localized(None), "description": _localized(None)}
    text = _opening_text(document)
    if not text:
        return empty

    async def main() -> Dict[str, Any]:
        owns_client = client is None
        active = client or async_client()
        if active is None:
            raise RuntimeError(
                "Document identity requested but OpenAI is not configured "
                "(set OPENAI_API_KEY in backend/.env)."
            )
        try:
            return await _call(active, model, effort, text, usage)
        finally:
            if owns_client:
                await active.close()

    data = asyncio.run(main())
    return {
        "title": _localized(data.get("title")),
        "description": _localized(data.get("description")),
    }
