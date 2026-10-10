"""One-off tender pattern analysis with a strong model (gpt-6.1-sol).

Reads a tender PDF, builds a deterministic page map (what is on each page and
where positions look like they start) and asks the model to describe the
document's *structure* and the patterns of its priceable positions, with a
special focus on lump-sum / "una tantum" / percentage positions. The result is a
Markdown report under ``docs/tenders/`` that we then turn into extraction
prompts.

This is a developer tool, not part of the runtime pipeline. Run it once per
tender, re-run when a new tender arrives::

    backend/.venv/bin/python backend/scripts/analyze_tender.py
    backend/.venv/bin/python backend/scripts/analyze_tender.py data/BKP_244_LV_Lueftung_260804.pdf

Only ``docs/tenders/`` is written; the PDFs are read-only.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional

BACKEND_DIR = Path(__file__).resolve().parent.parent
REPO_ROOT = BACKEND_DIR.parent
sys.path.insert(0, str(BACKEND_DIR))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(BACKEND_DIR / ".env", override=False)

import fitz  # noqa: E402  (PyMuPDF)

DATA_DIR = REPO_ROOT / "data"
OUT_DIR = REPO_ROOT / "docs" / "tenders"

MODEL = os.environ.get("BANDO_ANALYZE_MODEL", "gpt-6.1-sol").strip()
EFFORT = os.environ.get("BANDO_ANALYZE_EFFORT", "medium").strip().lower()
CHUNK_CHARS = int(os.environ.get("BANDO_ANALYZE_CHUNK_CHARS", "55000"))

# Position-number shapes across the languages we have seen:
#   Italian modulo-offerta: "R .028", "244 : DIV : 249.1", "531.110"
#   German LV:             "28.07.2026" is a date; positions are "311.100"
_POS_CODE_RE = re.compile(
    r"(?:^|\s)(?:[A-Z]\s?)?\.?\d{2,4}(?:[.:]\d{1,3}){1,3}(?:\s|$)"
)
_AMOUNT_HINT = re.compile(
    r"(una\s+tantum|a\s+corpo|forfait|pauschale|global|importo|percent|%|regie|aufwand)",
    re.IGNORECASE,
)
_UNIT_HINTS = (
    "stk", "stück", "stueck", "pz", "pce", "pc", "pcs",
    "m2", "mq", "qm", "m²", "m3", "mc", "m", "ml", "lfm", "lfdm",
    "h", "std", "ore", "ls", "pauschale", "system", "anlage", "ac",
)


@dataclass
class PageInfo:
    number: int
    text: str
    chars: int
    first_line: str
    pos_codes: int
    unit_hits: int
    amount_hits: int
    table_header: bool = False

    @property
    def looks_like_lv(self) -> bool:
        return self.table_header and (
            self.pos_codes >= 1 or self.unit_hits >= 1 or self.amount_hits >= 1
        )


@dataclass
class Report:
    source_file: str
    page_count: int
    total_chars: int
    document_parts: List[Dict[str, Any]] = field(default_factory=list)
    lv_sections: List[Dict[str, Any]] = field(default_factory=list)
    position_patterns: List[Dict[str, Any]] = field(default_factory=list)
    lump_sum_positions: List[Dict[str, Any]] = field(default_factory=list)
    percentage_positions: List[Dict[str, Any]] = field(default_factory=list)
    unit_vocabulary: List[Dict[str, Any]] = field(default_factory=list)
    extraction_rules: List[str] = field(default_factory=list)
    gotchas: List[str] = field(default_factory=list)
    notes: str = ""
    usage: Dict[str, Any] = field(default_factory=dict)


_SCHEMA: Dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "required": [
        "document_parts",
        "lv_sections",
        "position_patterns",
        "lump_sum_positions",
        "percentage_positions",
        "unit_vocabulary",
        "extraction_rules",
        "gotchas",
    ],
    "properties": {
        "document_parts": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["name", "page_start", "page_end", "kind", "notes"],
                "properties": {
                    "name": {"type": "string"},
                    "page_start": {"type": ["integer", "null"]},
                    "page_end": {"type": ["integer", "null"]},
                    "kind": {
                        "type": "string",
                        "description": "cover|index|legal|captions|specifications|lv|preziario|modulo_offerta|drawings|other",
                    },
                    "notes": {"type": "string"},
                },
            },
        },
        "lv_sections": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": [
                    "name", "page_start", "page_end", "layout",
                    "position_number_format", "columns", "units",
                ],
                "properties": {
                    "name": {"type": "string"},
                    "page_start": {"type": ["integer", "null"]},
                    "page_end": {"type": ["integer", "null"]},
                    "layout": {"type": "string"},
                    "position_number_format": {"type": "string"},
                    "columns": {"type": "array", "items": {"type": "string"}},
                    "units": {"type": "array", "items": {"type": "string"}},
                },
            },
        },
        "position_patterns": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["name", "example", "how_to_extract"],
                "properties": {
                    "name": {"type": "string"},
                    "example": {"type": "string"},
                    "how_to_extract": {"type": "string"},
                },
            },
        },
        "lump_sum_positions": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["description", "page", "signal", "how_to_handle"],
                "properties": {
                    "description": {"type": "string"},
                    "page": {"type": ["integer", "null"]},
                    "signal": {"type": "string", "description": "the words/columns that reveal it is a lump sum"},
                    "how_to_handle": {"type": "string"},
                },
            },
        },
        "percentage_positions": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["description", "page", "basis", "how_to_handle"],
                "properties": {
                    "description": {"type": "string"},
                    "page": {"type": ["integer", "null"]},
                    "basis": {"type": "string", "description": "what the percentage applies to"},
                    "how_to_handle": {"type": "string"},
                },
            },
        },
        "unit_vocabulary": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "required": ["source_token", "normalized", "notes"],
                "properties": {
                    "source_token": {"type": "string"},
                    "normalized": {"type": "string"},
                    "notes": {"type": "string"},
                },
            },
        },
        "extraction_rules": {"type": "array", "items": {"type": "string"}},
        "gotchas": {"type": "array", "items": {"type": "string"}},
    },
}

_SYSTEM = (
    "You analyse ONE construction tender (bill of quantities / LV / capitolato / "
    "preziario) so that an extraction prompt can be written from its real "
    "structure. The document may be in any language; answer in ENGLISH (the "
    "report feeds prompts), but quote source text verbatim.\n"
    "\n"
    "You receive the document as page-tagged text: lines '=== PAGE n ===' then "
    "that page's raw extracted text. Read it as a whole.\n"
    "\n"
    "Focus:\n"
    "- Where does the *priceable* part really start? Many pages are legal text, "
    "criteria, specifications or drawings and must NOT be extracted.\n"
    "- The exact table layout and columns of the priceable pages, and the "
    "position-number format (e.g. '531.110', 'R .028', '244 : DIV : 249.1').\n"
    "- Patterns of positions: material-with-quantity rows, multi-variant rows "
    "(one description, several sizes), and especially LUMP-SUM / 'una tantum' / "
    "a corpo / forfait positions, and PERCENTAGE positions ('... % of position "
    "311.xxx'). Say how to detect each from the raw text.\n"
    "- The unit vocabulary, mapped to pc|m|m2|m3|h|LS|system.\n"
    "- Concrete, copy-pasteable extraction rules and the traps that would fool a "
    "parser.\n"
    "\n"
    "Be concrete and grounded in the text. Use null page numbers only when the "
    "text genuinely does not reveal them."
)

_MERGE_SYSTEM = (
    "You are given several partial structure analyses of the SAME tender, plus a "
    "deterministic page map. Merge them into one coherent analysis: deduplicate, "
    "reconcile page ranges, keep verbatim examples. Do not invent anything."
)


def _read_pages(path: Path) -> List[PageInfo]:
    doc = fitz.open(str(path))
    infos: List[PageInfo] = []
    for i in range(doc.page_count):
        text = doc.load_page(i).get_text("text") or ""
        low = text.lower()
        lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
        # A priceable page carries a known column header block: the Italian
        # modulo offerta ("GQ / UM / Prz / Totale") or the German LV
        # ("Gegenstand / Einheits- / Gattg."). Legal/spec pages do not.
        italian = ("gq" in low and "um" in low and ("prz" in low or "totale" in low)) or (
            "qtà" in low and "testo" in low
        )
        german = "gegenstand" in low and ("einheits" in low or "gattg" in low)
        infos.append(
            PageInfo(
                number=i + 1,
                text=text,
                chars=len(text),
                first_line=(lines[0] if lines else "")[:90],
                pos_codes=len(_POS_CODE_RE.findall(text)),
                unit_hits=sum(low.count(u) for u in _UNIT_HINTS),
                amount_hits=len(_AMOUNT_HINT.findall(text)),
                table_header=italian or german,
            )
        )
    doc.close()
    return infos


def _page_map(pages: List[PageInfo]) -> List[Dict[str, Any]]:
    return [
        {
            "page": p.number,
            "chars": p.chars,
            "looks_like_lv": p.looks_like_lv,
            "table_header": p.table_header,
            "pos_codes": p.pos_codes,
            "amount_hits": p.amount_hits,
            "first_line": p.first_line,
        }
        for p in pages
    ]


def _chunks(pages: List[PageInfo], max_chars: int) -> List[str]:
    chunks: List[str] = []
    current: List[str] = []
    size = 0
    for page in pages:
        block = "=== PAGE %d ===\n%s" % (page.number, page.text)
        if current and size + len(block) > max_chars:
            chunks.append("\n".join(current))
            current, size = [], 0
        current.append(block)
        size += len(block)
    if current:
        chunks.append("\n".join(current))
    return chunks


class Usage:
    def __init__(self) -> None:
        self.calls = 0
        self.input_tokens = 0
        self.output_tokens = 0

    def add(self, response: Any) -> None:
        self.calls += 1
        usage = getattr(response, "usage", None)
        self.input_tokens += getattr(usage, "input_tokens", 0) or 0
        self.output_tokens += getattr(usage, "output_tokens", 0) or 0


def _call(client: Any, instructions: str, text: str, usage: Usage) -> Dict[str, Any]:
    response = client.responses.create(
        model=MODEL,
        instructions=instructions,
        input=text,
        reasoning={"effort": EFFORT},
        text={
            "format": {
                "type": "json_schema",
                "name": "tender_analysis",
                "strict": True,
                "schema": _SCHEMA,
            }
        },
    )
    usage.add(response)
    try:
        data = json.loads(getattr(response, "output_text", None) or "{}")
    except (ValueError, TypeError):
        return {}
    return data if isinstance(data, dict) else {}


def _list(data: Dict[str, Any], key: str) -> List[Any]:
    value = data.get(key)
    return value if isinstance(value, list) else []


def _dedupe(items: List[Any], key) -> List[Any]:
    seen = set()
    out = []
    for item in items:
        marker = key(item)
        if marker in seen:
            continue
        seen.add(marker)
        out.append(item)
    return out


def analyze(path: Path, client: Any) -> Report:
    pages = _read_pages(path)
    usage = Usage()
    report = Report(
        source_file=path.name,
        page_count=len(pages),
        total_chars=sum(p.chars for p in pages),
    )

    page_map = _page_map(pages)
    chunks = _chunks(pages, CHUNK_CHARS)
    partials: List[Dict[str, Any]] = []
    for index, chunk in enumerate(chunks, start=1):
        print("  chunk %d/%d (%d chars)…" % (index, len(chunks), len(chunk)))
        text = "DETERMINISTIC PAGE MAP (JSON):\n%s\n\nDOCUMENT TEXT:\n%s" % (
            json.dumps(page_map, ensure_ascii=False),
            chunk,
        )
        partials.append(_call(client, _SYSTEM, text, usage))

    if len(partials) == 1:
        merged = partials[0]
    else:
        print("  merge (%d partials)…" % len(partials))
        merged_input = json.dumps(
            {
                "deterministic_page_map": page_map,
                "partial_analyses": partials,
            },
            ensure_ascii=False,
        )
        merged = _call(client, _MERGE_SYSTEM, merged_input, usage)

    report.document_parts = _dedupe(
        _list(merged, "document_parts"),
        lambda x: (str(x.get("name", "")).lower(), x.get("page_start")),
    )
    report.lv_sections = _dedupe(
        _list(merged, "lv_sections"),
        lambda x: (str(x.get("name", "")).lower(), x.get("page_start")),
    )
    report.position_patterns = _dedupe(
        _list(merged, "position_patterns"),
        lambda x: str(x.get("name", "")).lower(),
    )
    report.lump_sum_positions = _dedupe(
        _list(merged, "lump_sum_positions"),
        lambda x: str(x.get("description", "")).lower()[:80],
    )
    report.percentage_positions = _dedupe(
        _list(merged, "percentage_positions"),
        lambda x: str(x.get("description", "")).lower()[:80],
    )
    report.unit_vocabulary = _dedupe(
        _list(merged, "unit_vocabulary"),
        lambda x: str(x.get("source_token", "")).lower(),
    )
    report.extraction_rules = [
        str(r).strip() for r in _list(merged, "extraction_rules") if str(r).strip()
    ]
    report.gotchas = [str(r).strip() for r in _list(merged, "gotchas") if str(r).strip()]
    report.notes = str(merged.get("notes") or "")
    report.usage = {
        "model": MODEL,
        "effort": EFFORT,
        "calls": usage.calls,
        "input_tokens": usage.input_tokens,
        "output_tokens": usage.output_tokens,
    }
    return report


# --------------------------------------------------------------------------
# Rendering
# --------------------------------------------------------------------------
def _pages(a: Any, b: Any) -> str:
    if a is None and b is None:
        return "?"
    if a == b or b is None:
        return str(a)
    return "%s–%s" % (a, b)


def _bullets(items: List[Dict[str, Any]], keys: List[str]) -> str:
    if not items:
        return "_(none found)_\n"
    lines = []
    for item in items:
        bits = [str(item.get(k, "")) for k in keys if item.get(k)]
        lines.append("- " + " — ".join(bits))
    return "\n".join(lines) + "\n"


def render_markdown(report: Report, determined_pages: int) -> str:
    date = time.strftime("%Y-%m-%d")
    out: List[str] = []
    out.append("# Tender analysis — %s\n" % report.source_file)
    out.append(
        "_Pattern analysis for extraction prompts. Generated %s with `%s` "
        "(effort `%s`). %d pages, %d chars. Deterministic LV-ish pages: %d._\n"
        % (
            date,
            report.usage.get("model", "?"),
            report.usage.get("effort", "?"),
            report.page_count,
            report.total_chars,
            determined_pages,
        )
    )

    out.append("\n## Document parts\n")
    if report.document_parts:
        out.append("| Part | Pages | Kind | Notes |")
        out.append("|---|---|---|---|")
        for part in report.document_parts:
            out.append(
                "| %s | %s | `%s` | %s |"
                % (
                    part.get("name", ""),
                    _pages(part.get("page_start"), part.get("page_end")),
                    part.get("kind", ""),
                    part.get("notes", ""),
                )
            )
    else:
        out.append("_(none found)_")

    out.append("\n## Priceable sections (LV / preziario / modulo offerta)\n")
    if report.lv_sections:
        for section in report.lv_sections:
            out.append(
                "### %s — pages %s\n"
                % (section.get("name", ""), _pages(section.get("page_start"), section.get("page_end")))
            )
            out.append("**Layout.** %s\n" % section.get("layout", ""))
            out.append("**Position numbers.** `%s`\n" % section.get("position_number_format", ""))
            cols = section.get("columns") or []
            out.append("**Columns.** %s\n" % (", ".join(cols) if cols else "?"))
            units = section.get("units") or []
            out.append("**Units seen.** %s\n" % (", ".join(units) if units else "?"))
    else:
        out.append("_(none found)_")

    out.append("\n## Position patterns\n")
    out.append(_bullets(report.position_patterns, ["name", "example", "how_to_extract"]))

    out.append("\n## Lump-sum / \"una tantum\" positions\n")
    out.append(
        _bullets(report.lump_sum_positions, ["description", "page", "signal", "how_to_handle"])
    )

    out.append("\n## Percentage positions\n")
    out.append(
        _bullets(report.percentage_positions, ["description", "page", "basis", "how_to_handle"])
    )

    out.append("\n## Unit vocabulary\n")
    out.append(_bullets(report.unit_vocabulary, ["source_token", "normalized", "notes"]))

    out.append("\n## Extraction rules\n")
    out.append(
        "\n".join("- " + rule for rule in report.extraction_rules) + "\n"
        if report.extraction_rules
        else "_(none)_\n"
    )

    out.append("\n## Gotchas\n")
    out.append(
        "\n".join("- " + g for g in report.gotchas) + "\n" if report.gotchas else "_(none)_\n"
    )

    if report.notes:
        out.append("\n## Notes\n\n%s\n" % report.notes)

    out.append("\n---\n")
    out.append("Analysis usage: %s\n" % json.dumps(report.usage, ensure_ascii=False))
    return "\n".join(out)


def _slug(path: Path) -> str:
    return re.sub(r"[^A-Za-z0-9]+", "_", path.stem).strip("_")


def update_index() -> None:
    """Rebuild the index from whatever reports are on disk (idempotent)."""
    rows = []
    for md in sorted(OUT_DIR.glob("*.md")):
        if md.name == "README.md":
            continue
        title = md.stem
        pages = "?"
        for line in md.read_text(encoding="utf-8").splitlines()[:12]:
            if line.startswith("# Tender analysis — "):
                title = line[len("# Tender analysis — "):].strip()
            m = re.search(r"(\d+) pages,", line)
            if m:
                pages = m.group(1)
        rows.append((title, pages, md.name))
    lines = ["# Tenders — pattern analysis\n"]
    lines.append(
        "One report per tender, generated by `backend/scripts/analyze_tender.py`. "
        "These reports are the evidence behind the extraction prompts in "
        "`backend/app/pipeline/ai/extract.py`.\n"
    )
    lines.append("| Tender | Pages | Report |")
    lines.append("|---|---|---|")
    for title, pages, name in rows:
        lines.append("| %s | %s | [%s](%s) |" % (title, pages, name, name))
    (OUT_DIR / "README.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> None:
    global OUT_DIR
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "pdfs",
        nargs="*",
        help="PDF paths (default: the tender PDFs in data/)",
    )
    parser.add_argument("--out", default=str(OUT_DIR), help="output directory")
    args = parser.parse_args()

    OUT_DIR = Path(args.out)
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    if args.pdfs:
        pdfs = [Path(p) for p in args.pdfs]
    else:
        pdfs = sorted(
            p
            for p in DATA_DIR.glob("*.pdf")
            if "slides" not in p.name.lower()
        )
    if not pdfs:
        raise SystemExit("no PDFs to analyse")

    key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not key:
        raise SystemExit("OPENAI_API_KEY is empty (backend/.env)")

    import openai

    client = openai.OpenAI(api_key=key, timeout=600, max_retries=3)

    for path in pdfs:
        if not path.exists():
            print("skip (missing): %s" % path)
            continue
        print("analysing %s…" % path.name)
        pages = _read_pages(path)
        lv_pages = sum(1 for p in pages if p.looks_like_lv)
        report = analyze(path, client)
        slug = _slug(path)
        markdown = render_markdown(report, lv_pages)
        (OUT_DIR / ("%s.md" % slug)).write_text(markdown, encoding="utf-8")
        print(
            "  -> %s.md  (%d calls, %d in / %d out tokens)"
            % (
                slug,
                report.usage.get("calls", 0),
                report.usage.get("input_tokens", 0),
                report.usage.get("output_tokens", 0),
            )
        )

    update_index()
    print("index -> %s" % (OUT_DIR / "README.md"))


if __name__ == "__main__":
    main()
