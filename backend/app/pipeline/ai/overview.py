"""Whole-document overview: Luna reads the tender and says what it is.

One structured call over the full text (chunked and reduced for long tenders)
returns a plain-language panorama plus the materials and the labour the project
needs. That panorama is shown to the user and handed to the matcher as context,
so product and install-code choices are grounded in the whole document rather
than one page at a time.
"""
from __future__ import annotations

import asyncio
import json
import time
from typing import Any, Dict, List, Optional, Sequence

from ... import config
from ..extractors import Document, Page
from .client import async_client, with_retry
from .usage import UsageLedger

SYSTEM_PROMPT = (
    "You read ONE complete construction tender (bill of quantities / LV) and "
    "write a short overview for an estimator who will price it. The document may "
    "be in any language, but write your overview in ITALIAN (the app is Italian); "
    "keep technical/product names as they appear in the source.\n"
    "\n"
    "Return:\n"
    "- summary: 2-4 frasi su cos'e' il progetto e cosa comprende.\n"
    "- systems: gli impianti/lotti/installazioni nominati nel bando (etichette brevi).\n"
    "- materials_needed: le famiglie di materiali e attrezzature richieste "
    "(es. 'valvole di mandata', 'serrande tagliafuoco', 'canalizzazioni', "
    "'isolamento'). Non ogni riga: le famiglie che un compratore cerca.\n"
    "- labour_needed: i tipi di lavoro/manodopera richiesti (es. 'posa canali', "
    "'installazione serrande tagliafuoco', 'bilanciamento', 'collaudo').\n"
    "\n"
    "Sii conciso e concreto. Non inventare voci che non sono nel documento."
)

_SCHEMA: Dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "required": ["summary", "systems", "materials_needed", "labour_needed"],
    "properties": {
        "summary": {"type": "string"},
        "systems": {"type": "array", "items": {"type": "string"}},
        "materials_needed": {"type": "array", "items": {"type": "string"}},
        "labour_needed": {"type": "array", "items": {"type": "string"}},
    },
}

_MERGE_INSTRUCTIONS = (
    "You are given several partial overviews of the SAME construction tender. "
    "Merge them into one overview: one summary, and deduplicated, grouped lists "
    "of systems, materials needed and labour needed. Keep the language of the "
    "source document; do not invent anything."
)


def _chunks(pages: Sequence[Page], max_chars: int) -> List[str]:
    chunks: List[str] = []
    current: List[str] = []
    size = 0
    for page in pages:
        text = page.text or ""
        if current and size + len(text) > max_chars:
            chunks.append("\n".join(current))
            current, size = [], 0
        current.append(text)
        size += len(text)
    if current:
        chunks.append("\n".join(current))
    return chunks


async def _call(
    client: Any, model: str, effort: str, instructions: str, text: str,
    usage: UsageLedger,
) -> Dict[str, Any]:
    async def do() -> Any:
        return await client.responses.create(
            model=model,
            instructions=instructions,
            input=text,
            reasoning={"effort": effort},
            text={
                "format": {
                    "type": "json_schema",
                    "name": "document_overview",
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


def _clean(data: Dict[str, Any]) -> Dict[str, Any]:
    def strings(key: str) -> List[str]:
        value = data.get(key)
        if not isinstance(value, list):
            return []
        return [str(item).strip() for item in value if str(item).strip()]

    return {
        "summary": str(data.get("summary") or "").strip(),
        "systems": strings("systems"),
        "materials_needed": strings("materials_needed"),
        "labour_needed": strings("labour_needed"),
    }


def document_overview(
    document: Document,
    *,
    client: Optional[Any] = None,
    model: Optional[str] = None,
    effort: Optional[str] = None,
    usage: Optional[UsageLedger] = None,
    concurrency: Optional[int] = None,
) -> Dict[str, Any]:
    """Read the whole document and return summary/systems/materials/labour."""
    usage = usage or UsageLedger()
    model = model or config.OVERVIEW_MODEL
    effort = effort or config.OVERVIEW_EFFORT
    concurrency = concurrency or config.AI_CONCURRENCY
    pages = list(document.pages)
    if not pages:
        return {}
    chunks = _chunks(pages, config.OVERVIEW_MAX_CHARS)

    async def main() -> Dict[str, Any]:
        owns_client = client is None
        active = client or async_client()
        if active is None:
            raise RuntimeError(
                "Document overview requested but OpenAI is not configured "
                "(set OPENAI_API_KEY in backend/.env)."
            )
        try:
            if len(chunks) == 1:
                return _clean(
                    await _call(active, model, effort, SYSTEM_PROMPT, chunks[0], usage)
                )

            semaphore = asyncio.Semaphore(concurrency)

            async def one(chunk: str) -> Dict[str, Any]:
                async with semaphore:
                    return await _call(active, model, effort, SYSTEM_PROMPT, chunk, usage)

            partials = [_clean(part) for part in await asyncio.gather(*(one(c) for c in chunks))]
            merged_input = json.dumps(
                {"partial_overviews": partials}, ensure_ascii=False
            )
            merged = await _call(
                active, model, effort, _MERGE_INSTRUCTIONS, merged_input, usage
            )
            return _clean(merged) or _merge(partials)
        finally:
            if owns_client:
                await active.close()

    return asyncio.run(main())


def _merge(partials: Sequence[Dict[str, Any]]) -> Dict[str, Any]:
    summary = " ".join(p.get("summary", "") for p in partials if p.get("summary"))
    systems: List[str] = []
    materials: List[str] = []
    labour: List[str] = []
    for part in partials:
        for value in part.get("systems", []):
            if value not in systems:
                systems.append(value)
        for value in part.get("materials_needed", []):
            if value not in materials:
                materials.append(value)
        for value in part.get("labour_needed", []):
            if value not in labour:
                labour.append(value)
    return {
        "summary": summary.strip(),
        "systems": systems,
        "materials_needed": materials,
        "labour_needed": labour,
    }
