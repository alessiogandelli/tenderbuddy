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
    "Return:\n"
    "- title: a short name for the tender (max ~8 words), e.g. "
    "'Ventilazione scuola elementare Zurich'. Keep proper names as written.\n"
    "- description: ONE sentence saying what the tender is about, e.g. "
    "'Fornitura e posa dell'impianto di ventilazione di una scuola'.\n"
    "\n"
    "Write in ITALIAN (the app language); keep technical/product names as they "
    "appear in the source. Be concrete and do not invent anything."
)

_SCHEMA: Dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "required": ["title", "description"],
    "properties": {
        "title": {"type": "string"},
        "description": {"type": "string"},
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


def document_identity(
    document: Document,
    *,
    client: Optional[Any] = None,
    model: Optional[str] = None,
    effort: Optional[str] = None,
    usage: Optional[UsageLedger] = None,
) -> Dict[str, str]:
    """Read the opening pages and return ``{"title", "description"}``.

    Empty strings when there is nothing to read or the model returns nothing.
    """
    usage = usage or UsageLedger()
    model = model or config.TITLE_MODEL
    effort = effort or config.TITLE_EFFORT
    text = _opening_text(document)
    if not text:
        return {"title": "", "description": ""}

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
        "title": str(data.get("title") or "").strip(),
        "description": str(data.get("description") or "").strip(),
    }
