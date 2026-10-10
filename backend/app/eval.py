"""Extraction accuracy harness against the verified example positions.

Ground truth is ``data/example_lv_positions.csv``: 22 positions verified against
the full tender. Nothing else in the repo measures what the pipeline actually
extracts from a real PDF, so this is the instrument that decides whether the AI
path beats the deterministic one and whether a change is an improvement.

Pairing rule (the one judgment call, kept explicit): an extracted Item is paired
to a ground-truth row by a greedy bipartite match restricted to the SAME page
and SAME unit. Candidate pairs are scored ``qty_match + jaccard(desc_tokens)``
and accepted above ``PAIR_MIN_SCORE``. Quantity is weighted as the strong signal
because many positions differ only by size; the description breaks ties.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from statistics import median
from typing import Callable, Dict, List, Optional, Sequence, Tuple

import pandas as pd

from .config import DATA_DIR
from .domain.enums import ItemStatus, Unit, normalize_unit
from .domain.models import Item
from .pipeline.extractors import Document, PdfReader, default_reader
from .pipeline.pricing_db import PricingDB, get_pricing_db
from .pipeline.steps import (
    candidate_products,
    canonicalize_items,
    match_items,
    parse_document,
    read_pdf,
)

GT_FILE = "example_lv_positions.csv"
TENDER_FILE = "BKP_244_LV_Lueftung_260804.pdf"

_TOKEN_RE = re.compile(r"[a-zäöü0-9]{3,}")
PAIR_MIN_SCORE = 0.35


# ---------------------------------------------------------------------------
# Ground truth
# ---------------------------------------------------------------------------
@dataclass
class GroundTruthRow:
    lv_id: str
    source_page: int
    description: str
    quantity: Optional[float]
    unit: Optional[Unit]
    expected_install_code: Optional[str]
    suggested_product_id: Optional[str]
    ground_truth_status: str
    system: Optional[str] = None
    category: Optional[str] = None
    manufacturer_hint: Optional[str] = None
    model_hint: Optional[str] = None


def _opt_str(value) -> Optional[str]:
    return value if isinstance(value, str) and value.strip() else None


def load_ground_truth(data_dir: Path = DATA_DIR) -> List[GroundTruthRow]:
    df = pd.read_csv(data_dir / GT_FILE)
    rows: List[GroundTruthRow] = []
    for r in df.to_dict(orient="records"):
        unit_raw = r.get("unit")
        rows.append(
            GroundTruthRow(
                lv_id=str(r["lv_id"]),
                source_page=int(r["source_page"]) if pd.notna(r.get("source_page")) else -1,
                description=str(r.get("description") or ""),
                quantity=float(r["quantity"]) if pd.notna(r.get("quantity")) else None,
                unit=normalize_unit(unit_raw) if isinstance(unit_raw, str) else None,
                expected_install_code=_opt_str(r.get("expected_install_code")),
                suggested_product_id=_opt_str(r.get("suggested_product_id")),
                ground_truth_status=str(r.get("ground_truth_status") or ""),
                system=_opt_str(r.get("system")),
                category=_opt_str(r.get("category")),
                manufacturer_hint=_opt_str(r.get("manufacturer_hint")),
                model_hint=_opt_str(r.get("model_hint")),
            )
        )
    return rows


# ---------------------------------------------------------------------------
# Pairing
# ---------------------------------------------------------------------------
def _tokens(text: Optional[str]) -> set:
    return set(_TOKEN_RE.findall((text or "").lower()))


def _jaccard(a: set, b: set) -> float:
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def _qty_match(item_q: Optional[float], gt_q: Optional[float]) -> float:
    if item_q is None or gt_q is None:
        return 0.0
    return 1.0 if abs(item_q - gt_q) < 0.01 else 0.0


def pair_items(
    items: Sequence[Item], gt_rows: Sequence[GroundTruthRow]
) -> List[Tuple[int, int, float]]:
    """Greedy bipartite pairing. Returns ``(gt_index, item_index, score)``."""
    candidates: List[Tuple[float, int, int]] = []
    for gi, gt in enumerate(gt_rows):
        gt_tokens = _tokens(gt.description)
        for ii, item in enumerate(items):
            if item.source_page != gt.source_page or item.unit != gt.unit:
                continue
            score = _qty_match(item.quantity, gt.quantity) + _jaccard(
                _tokens(item.description_raw), gt_tokens
            )
            if score >= PAIR_MIN_SCORE:
                candidates.append((score, gi, ii))
    candidates.sort(key=lambda t: (-t[0], t[1], t[2]))

    used_gt: set = set()
    used_item: set = set()
    pairs: List[Tuple[int, int, float]] = []
    for score, gi, ii in candidates:
        if gi in used_gt or ii in used_item:
            continue
        used_gt.add(gi)
        used_item.add(ii)
        pairs.append((gi, ii, score))
    return pairs


# ---------------------------------------------------------------------------
# Report
# ---------------------------------------------------------------------------
# Fields compared only when language-independent. The ground-truth descriptions
# are human English summaries ("Supply air valve ... DN100") while the tender is
# German, so text similarity is not a meaningful accuracy signal here; quantity,
# product and install code are.
FIELD_KEYS = ["quantity", "product_id", "install_code", "status"]


@dataclass
class LatencyReport:
    read_s: float = 0.0
    parse_s: float = 0.0
    match_s: float = 0.0
    total_s: float = 0.0
    calls: int = 0
    call_ms: List[float] = field(default_factory=list)
    errors: int = 0
    retries: int = 0
    escalation_calls: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    cost_usd: float = 0.0

    @property
    def p50_ms(self) -> float:
        return float(median(self.call_ms)) if self.call_ms else 0.0

    @property
    def p95_ms(self) -> float:
        if not self.call_ms:
            return 0.0
        ordered = sorted(self.call_ms)
        idx = min(len(ordered) - 1, int(round(0.95 * (len(ordered) - 1))))
        return float(ordered[idx])

    def as_dict(self) -> dict:
        return {
            "read_s": round(self.read_s, 3),
            "parse_s": round(self.parse_s, 3),
            "match_s": round(self.match_s, 3),
            "total_s": round(self.total_s, 3),
            "calls": self.calls,
            "p50_ms": round(self.p50_ms, 1),
            "p95_ms": round(self.p95_ms, 1),
            "errors": self.errors,
            "retries": self.retries,
            "escalation_calls": self.escalation_calls,
            "input_tokens": self.input_tokens,
            "output_tokens": self.output_tokens,
            "cost_usd": round(self.cost_usd, 4),
        }


@dataclass
class EvalReport:
    label: str
    gt_total: int
    items_total: int
    items_on_gt_pages: int
    paired: int
    recall: float
    pairing_precision: float
    field_acc: Dict[str, float]
    per_row: List[dict] = field(default_factory=list)
    candidate_recall: Optional[float] = None
    latency: Optional[LatencyReport] = None

    def as_dict(self) -> dict:
        return {
            "label": self.label,
            "gt_total": self.gt_total,
            "items_total": self.items_total,
            "items_on_gt_pages": self.items_on_gt_pages,
            "paired": self.paired,
            "recall": round(self.recall, 4),
            "pairing_precision": round(self.pairing_precision, 4),
            "candidate_recall": (
                None if self.candidate_recall is None else round(self.candidate_recall, 4)
            ),
            "field_acc": {k: round(v, 4) for k, v in self.field_acc.items()},
            "per_row": self.per_row,
            "latency": self.latency.as_dict() if self.latency else None,
        }

    def format_table(self) -> str:
        out = []
        out.append("=== extraction eval%s ===" % (
            "" if self.gt_total else " (no ground truth)"))
        out.append("label             : %s" % self.label)
        out.append("extracted items   : %d" % self.items_total)
        if self.gt_total:
            out.append("ground truth rows : %d" % self.gt_total)
            out.append("items on GT pages : %d" % self.items_on_gt_pages)
            out.append("paired            : %d" % self.paired)
            out.append("")
            out.append("item_recall       : %d/%d  (%.1f%%)"
                       % (self.paired, self.gt_total, 100.0 * self.recall))
            out.append("gt-page items     : %d extracted, %d paired with a GT row"
                       % (self.items_on_gt_pages, self.paired))
            out.append("                    (the 22 GT rows are a curated sample, so extra")
            out.append("                     items on those pages are other real positions)")
            if self.candidate_recall is not None:
                out.append("candidate_recall  : %.1f%%  (GT product in candidate set)"
                           % (100.0 * self.candidate_recall))
            out.append("")
            out.append("field accuracy (on %d paired):" % max(self.paired, 1))
            for key in FIELD_KEYS:
                out.append("  %-13s : %.1f%%" % (key, 100.0 * self.field_acc.get(key, 0.0)))
        if self.latency is not None:
            lat = self.latency
            out.append("")
            out.append(
                "latency           : total %.2fs (read %.2f / parse %.2f / match %.2f)"
                % (lat.total_s, lat.read_s, lat.parse_s, lat.match_s)
            )
            if lat.calls:
                out.append(
                    "ai calls          : %d  p50 %.0fms  p95 %.0fms  errors %d  retries %d"
                    % (lat.calls, lat.p50_ms, lat.p95_ms, lat.errors, lat.retries)
                )
                out.append(
                    "tokens / cost     : %d in / %d out  $%.4f"
                    % (lat.input_tokens, lat.output_tokens, lat.cost_usd)
                )
        if self.gt_total:
            out.append("")
            out.append("per-row:")
            for row in self.per_row:
                mark = "OK " if row["paired"] else "-- "
                out.append(
                    "  %s %-7s p%-4s %-3s qty=%-6s prod=%-10s %s"
                    % (
                        mark,
                        row["lv_id"],
                        row["source_page"],
                        row["unit"] or "?",
                        row["gt_quantity"],
                        row["gt_product"],
                        row["note"],
                    )
                )
                if row["extracted"]:
                    out.append("        src: %s" % row["extracted"][:110])
        return "\n".join(out)


# ---------------------------------------------------------------------------
# Evaluation
# ---------------------------------------------------------------------------
def _field_accuracy(
    pairs: Sequence[Tuple[int, int, float]],
    items: Sequence[Item],
    gt_rows: Sequence[GroundTruthRow],
) -> Dict[str, float]:
    if not pairs:
        return {key: 0.0 for key in FIELD_KEYS}
    tally = {key: 0 for key in FIELD_KEYS}
    for gi, ii, _ in pairs:
        gt, item = gt_rows[gi], items[ii]
        if item.quantity is not None and gt.quantity is not None and abs(item.quantity - gt.quantity) < 0.01:
            tally["quantity"] += 1
        if item.match and item.match.product_id == gt.suggested_product_id:
            tally["product_id"] += 1
        if item.match and item.match.install_code == gt.expected_install_code:
            tally["install_code"] += 1
        if item.status.value == gt.ground_truth_status:
            tally["status"] += 1
    n = len(pairs)
    return {key: tally[key] / n for key in FIELD_KEYS}


def evaluate(
    items: Sequence[Item],
    data_dir: Path = DATA_DIR,
    gt_rows: Optional[Sequence[GroundTruthRow]] = None,
    label: str = "deterministic",
    latency: Optional[LatencyReport] = None,
    candidate_fn: Optional[Callable[[Item], set]] = None,
) -> EvalReport:
    gt_rows = list(gt_rows if gt_rows is not None else load_ground_truth(data_dir))
    items = list(items)

    gt_pages = {gt.source_page for gt in gt_rows}
    items_on_gt_pages = [it for it in items if it.source_page in gt_pages]

    pairs = pair_items(items, gt_rows)
    paired_gt = {gi for gi, _, _ in pairs}
    paired_items = {ii for _, ii, _ in pairs}

    per_row = []
    item_by_gt = {gi: ii for gi, ii, _ in pairs}
    for gi, gt in enumerate(gt_rows):
        ii = item_by_gt.get(gi)
        if ii is None:
            note = "not found"
            extracted = None
        else:
            item = items[ii]
            ok_prod = item.match is not None and item.match.product_id == gt.suggested_product_id
            note = "matched product" if ok_prod else (
                "product=%s" % (item.match.product_id if item.match else "none")
            )
            extracted = item.description_raw
        per_row.append(
            {
                "lv_id": gt.lv_id,
                "source_page": gt.source_page,
                "unit": gt.unit.value if gt.unit else None,
                "gt_quantity": gt.quantity,
                "gt_product": gt.suggested_product_id,
                "paired": gi in paired_gt,
                "note": note,
                "extracted": extracted,
            }
        )

    candidate_recall = None
    if candidate_fn is not None:
        hits = 0
        for gi, ii, _ in pairs:
            gt = gt_rows[gi]
            if gt.suggested_product_id and gt.suggested_product_id in candidate_fn(items[ii]):
                hits += 1
        candidate_recall = hits / len(gt_rows) if gt_rows else 0.0

    return EvalReport(
        label=label,
        gt_total=len(gt_rows),
        items_total=len(items),
        items_on_gt_pages=len(items_on_gt_pages),
        paired=len(paired_gt),
        recall=len(paired_gt) / len(gt_rows) if gt_rows else 0.0,
        pairing_precision=(
            len(paired_items) / len(items_on_gt_pages) if items_on_gt_pages else 0.0
        ),
        field_acc=_field_accuracy(pairs, items, gt_rows),
        per_row=per_row,
        candidate_recall=candidate_recall,
        latency=latency,
    )


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------
def run_deterministic(
    data_dir: Path = DATA_DIR,
    reader: Optional[PdfReader] = None,
    db: Optional[PricingDB] = None,
    pdf_path: Optional[Path] = None,
) -> Tuple[List[Item], LatencyReport]:
    """Run read -> parse -> canonicalize -> match with no AI calls."""
    reader = reader or default_reader()
    db = db or get_pricing_db()
    pdf_path = pdf_path or (data_dir / TENDER_FILE)
    latency = LatencyReport()

    t0 = time.perf_counter()
    document = read_pdf(reader, pdf_path)
    t1 = time.perf_counter()
    items = parse_document(document, reader, pdf_path, with_geometry=True)
    t2 = time.perf_counter()
    items = canonicalize_items(items)
    match_items(items, db)
    t3 = time.perf_counter()

    latency.read_s = t1 - t0
    latency.parse_s = t2 - t1
    latency.match_s = t3 - t2
    latency.total_s = t3 - t0
    return items, latency


def run_ai(
    data_dir: Path = DATA_DIR,
    reader: Optional[PdfReader] = None,
    db: Optional[PricingDB] = None,
    *,
    extract_model: Optional[str] = None,
    extract_effort: Optional[str] = None,
    match_model: Optional[str] = None,
    escalate: bool = True,
    pdf_path: Optional[Path] = None,
) -> Tuple[List[Item], LatencyReport]:
    """Run the AI pipeline (Responses extraction + Decisions matching)."""
    from .pipeline.ai import (
        UsageLedger,
        escalate_empty_pages,
        escalate_matches,
        extract_document,
        match_items_ai,
    )
    from . import config

    reader = reader or default_reader()
    db = db or get_pricing_db()
    pdf_path = pdf_path or (data_dir / TENDER_FILE)
    usage = UsageLedger()
    latency = LatencyReport()

    t0 = time.perf_counter()
    document = read_pdf(reader, pdf_path)
    t1 = time.perf_counter()
    items = extract_document(
        document,
        reader,
        pdf_path,
        model=extract_model or config.EXTRACT_MODEL,
        effort=extract_effort or config.EXTRACT_EFFORT,
        usage=usage,
    )
    if escalate:
        items.extend(escalate_empty_pages(document, items, reader, pdf_path, usage=usage))
    t2 = time.perf_counter()
    items = canonicalize_items(items)
    match_items_ai(items, db, model=match_model or config.MATCH_MODEL, usage=usage)
    if escalate:
        escalate_matches(items, db, usage=usage)
    t3 = time.perf_counter()

    latency.read_s = t1 - t0
    latency.parse_s = t2 - t1
    latency.match_s = t3 - t2
    latency.total_s = t3 - t0
    latency.calls = usage.calls
    latency.call_ms = list(usage.call_ms)
    latency.errors = usage.errors
    latency.retries = usage.retries
    latency.escalation_calls = usage.escalation_calls
    latency.input_tokens = usage.input_tokens
    latency.output_tokens = usage.output_tokens
    latency.cost_usd = usage.cost_usd
    return items, latency


def main(argv: Optional[Sequence[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Extraction accuracy eval.")
    parser.add_argument("--data-dir", type=Path, default=DATA_DIR)
    parser.add_argument("--tag", default=None)
    parser.add_argument("--ai", action="store_true", help="force the AI engine")
    parser.add_argument("--no-ai", action="store_true", help="force deterministic")
    parser.add_argument("--extract-model", default=None)
    parser.add_argument("--extract-effort", default=None)
    parser.add_argument("--match-model", default=None)
    parser.add_argument("--no-escalate", action="store_true")
    parser.add_argument(
        "--pdf",
        type=Path,
        default=None,
        help="a different tender PDF (then there is no ground truth: item/cost/latency only)",
    )
    parser.add_argument(
        "--json-out",
        type=Path,
        default=Path(__file__).resolve().parent.parent / "tmp" / "eval_report.json",
    )
    args = parser.parse_args(argv)

    db = get_pricing_db()
    reader = default_reader()
    candidate_fn = lambda item: {  # noqa: E731 - tiny local probe of the pre-filter
        p.product_id for p in candidate_products(item, db)
    }

    from . import config

    use_ai = (args.ai or config.ai_enabled()) and not args.no_ai
    if use_ai and not config.ai_enabled():
        print("error: --ai requires OPENAI_API_KEY (backend/.env)", file=sys.stderr)
        return 2

    custom = args.pdf is not None
    pdf_path = args.pdf

    if use_ai:
        label = args.tag or "ai-%s-%s" % (
            args.extract_model or config.EXTRACT_MODEL,
            args.extract_effort or config.EXTRACT_EFFORT,
        )
        items, latency = run_ai(
            data_dir=args.data_dir,
            reader=reader,
            db=db,
            extract_model=args.extract_model,
            extract_effort=args.extract_effort,
            match_model=args.match_model,
            escalate=not args.no_escalate,
            pdf_path=pdf_path,
        )
    else:
        label = args.tag or "deterministic"
        items, latency = run_deterministic(
            data_dir=args.data_dir, reader=reader, db=db, pdf_path=pdf_path
        )
    if custom:
        label = "%s:%s" % (label, pdf_path.name)

    report = evaluate(
        items,
        data_dir=args.data_dir,
        gt_rows=[] if custom else None,
        label=label,
        latency=latency,
        candidate_fn=None if custom else candidate_fn,
    )
    print(report.format_table())

    args.json_out.parent.mkdir(parents=True, exist_ok=True)
    existing: Dict[str, dict] = {}
    if args.json_out.exists():
        try:
            existing = json.loads(args.json_out.read_text(encoding="utf-8"))
        except (ValueError, OSError):
            existing = {}
    existing[label] = report.as_dict()
    args.json_out.write_text(json.dumps(existing, indent=2, ensure_ascii=False), encoding="utf-8")
    print("\nreport -> %s [%s]" % (args.json_out, label))
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
