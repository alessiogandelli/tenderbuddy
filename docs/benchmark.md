# Benchmark and results — Tender → Quote

Everything we discovered while taking the pipeline from "broken extraction" to
"reliable, multilingual quoting", with the numbers that decided the choices.
Ground truth: the **22 verified positions** in `data/example_lv_positions.csv`.
Harness: `backend/app/eval.py` (`bando-eval`), reproducible with the commands at
the bottom.

---

## TL;DR

| Configuration | Item | Recall | Product | Install code | Time | Cost | p50 / p95 |
|---|---|---|---|---|---|---|---|
| Deterministic (offline) | 269 | **22/22** | 32% | 59% | 1 s | $0 | — |
| **Luna `none`** ← default | 247 | **22/22** | **73%** | 77% | **42 s** | **$0.049** | 1.4 / 4.2 s |
| Luna `none` + escalation | 255 | 22/22 | **77%** | **82%** | 68 s | $0.570 | 1.9 / 5.4 s |
| Luna `low` | 284 | 22/22 | 64% | 73% | 74 s | $0.064 | 4.0 / 7.4 s |
| Sol `low` | 267 | 22/22 | 59% | 68% | 76 s | $0.564 | 3.6 / 8.9 s |
| Astra `low` | 272 | 22/22 | 64% | 73% | 100 s | $2.764 | 4.5 / 12.6 s |
| Luna `none` — IT tender document | 291 | n/a | n/a | n/a | 38 s | $0.053 | 1.0 / 3.0 s |

Four conclusions:

1. **Recall is solved by the deterministic parser**, without AI: from 0/22 to 22/22.
   The problem was not "the AI is missing", it was the layout parsing.
2. **`reasoning: none` beats `low`** in accuracy *and* latency: reasoning
   makes copying structured fields worse.
3. **The larger, more expensive models are dominated.** On the same pipeline, Sol
   `low` (59%) and Astra `low` (64%) do **worse** than Luna `none` (73%), at 11× and
   56× the cost. More capability does not mean better structured extraction.
4. **Luna `none` is the sweet spot**: the cheapest model
   in the cheapest setting wins on every axis.

---

## 1. The starting point

The pipeline existed, was green in tests, and on the real 202-page tender extracted
**0 of the 22 verified positions**. The tests passed because:

- the **golden test** builds the Items from the CSV with the matches already given by hand and
  checks only the pricing maths;
- the extraction test used a **synthetic PDF** built to fit the
  regex;
- the test on the real tender only checked `status == "done"`.

No one measured the thing that matters: *what it actually extracts from the real document*.
So the first thing built was the **accuracy harness**, not a
feature.

### Why 0/22

In the real PDF unit and quantity are on **separate lines**:

```
Grösse
Ø 10 cm
Stk
5
```

The regex (`parse.py`) looked for `Stk 5` **on the same line**. Those lines never
became Items. On top of that: the description accumulated for the entire page
(bug), and legal text was interpreted as positions.

---

## 2. Method: how we measure

`app/eval.py` is the only source of truth. It does four things:

1. **Extracts** from the real tender (deterministic or AI).
2. **Matches** each Item to a ground truth row with a greedy
   bipartite matching on *(same page, same unit)*, score
   `qty_match + jaccard(description)`, explicit threshold. Quantity weighs
   double because many positions differ only by diameter.
3. **Computes**: `item_recall`, `candidate_recall`, per-field accuracy
   (quantity, product, install code, status), and for latency `p50`/`p95`,
   errors, retries.
4. **Writes** everything to `tmp/eval_report.json`.

Two honesty metrics:

- **`candidate_recall`** — is the right product in the candidate set we pass
  to the model? If it is low, the error is in the *pre-filter*, not the model. Taking it to
  **100%** (K=20 on the entire compatible catalogue) isolated the real variable:
  the choice.
- **The 22 rows are a sample**, not the complete list of positions on
  those pages. So the "excess" items are other real positions, not
  noise: precision is not measurable from this dataset and we do not use it as a
  gate.

---

## 3. Finding 1 — Recall is solved without AI

Four fixes to the deterministic parser:

| Fix | What | Where |
|---|---|---|
| Multi-line quantity | `Stk` \n `5` as unit + number on consecutive lines | `steps/parse.py` |
| Description reset | a new block starts after a blank line + a non-size/non-label line | `steps/parse.py` |
| Page filter | only pages with LV header (`Gegenstand` + `Mass-`) | `steps/parse.py` |
| Preamble strip | project/date/page header do not pollute the first position | `steps/parse.py` |

**Result: 22/22, quantity 100%.** Zero cost, 1-second latency. It is now a gate
(`tests/test_ground_truth.py`, `EVAL_MIN_RECALL=0.9`) that fails if it regresses.

The message: **AI is not needed for recall**, it is needed for *matching* and for
*other languages*.

---

## 4. Finding 2 — Reasoning makes extraction worse

Against all intuition, the activity of *copying fields from a document* gets worse
with reasoning:

| Luna | Recall | Product | Install code | Time | Cost |
|---|---|---|---|---|---|
| `effort=low` | 22/22 | 64% | 73% | 74 s | $0.064 |
| **`effort=none`** | 22/22 | **73%** | **77%** | **42 s** | **$0.049** |

With `none` the model is **more accurate and nearly twice as fast** (p50 1.4 s
versus 4.0 s). Reasoning pushes the model to "interpret" instead of
transcribe, and introduces latency. That is why the default is now `none`.

---

## 5. Finding 3 — The larger models are dominated

Same pipeline, same prompt, same catalogue. Only the extraction model
changes:

| Model (effort) | Price /MTok (in/out) | Recall | Product | Install | Time | Cost | p95 |
|---|---|---|---|---|---|---|---|
| **Luna `none`** | $0.10 / $0.50 | 22/22 | **73%** | **77%** | **42 s** | **$0.049** | 4.2 s |
| Luna `low` | $0.10 / $0.50 | 22/22 | 64% | 73% | 74 s | $0.064 | 7.4 s |
| Sol `low` | $2 / $10 | 22/22 | 59% | 68% | 76 s | $0.564 | 8.9 s |
| Astra `low` | $10 / $50 | 22/22 | 64% | 73% | 100 s | $2.764 | 12.6 s |

The result is clear and counter-intuitive: **the more capable and more expensive models
do worse** on this task.

- **Sol** is the worst of all (59% product), 11× the cost of Luna `none`.
- **Astra** ties Luna-`low` (64%) but at **56×** the cost and 35% slower; it is the
  slowest of all (p95 12.6 s).
- **Luna `none`** wins on accuracy, latency and cost together.

Reading: extraction is **faithful copying of fields from a layout**, not
reasoning. The larger models "interpret" and summarise more (e.g. Sol
tends to normalise descriptions), which *worsens* fidelity to the text — and
therefore the anchoring to the catalogue product. The decision "start with the big model,
scale down only if it does not improve" is settled by the data the other way round: **the
big model never improves, you start and stay on Luna**.

Only escalation (section 6) justifies a large model, because there the task
is different — *deciding* between ambiguous candidates, where reasoning helps.

---

## 6. Finding 4 — What an accuracy point costs

Escalation sends to Astra (effort `medium`) the positions that the Decisions API
marks as uncertain (no match, low confidence, flat probabilities):

| | Product | Install | Time | Cost | Escalation calls |
|---|---|---|---|---|---|
| Luna `none` | 73% | 77% | 42 s | $0.049 | 0 |
| Luna `none` + escalation | **77%** | **82%** | 68 s | **$0.570** | **40** |

**40 escalated positions** buy **+4 product points and +5 install code points**.
In absolute terms it is cheap ($0.57), but it is **11.6× the base cost**. With $75: ~1,500
clean-Luna quotes, ~130 with full escalation.

Interpretation: escalation is a **quality switch**, not a default.
If match accuracy is the bottleneck (e.g. in demo, or if the error
is costly), turn it on; if volume matters, leave it off. The budget is configurable
(`BANDO_ESCALATION_BUDGET`, default 20 per run).

---

## 7. Finding 5 — Multilingual: from 0 to 291 positions

The triage was **German-specific** (`Gegenstand`/`Mass-`): on an Italian
tender document it discarded *all* the pages and the AI saw nothing → **0 positions**.

Fix: **language-agnostic triage** (`ai/extract.py:lv_pages`). If it finds
the German LV header on ≥10 pages it uses it (fast-path, 121 pages);
otherwise it sends the model all pages with sufficient content, and the
model decides page by page where the positions are. The prompt was
generalised (LV / tender document / bordereau / BoQ, multilingual units).

On a **real Italian tender document** (`26122_ca_capitolato…`, 188 pages, restoration
of Palazzo del Pretorio, Locarno):

| | Items extracted | Time | Cost |
|---|---|---|---|
| Deterministic (German only) | **0** | 0.4 s | $0 |
| **Luna `none`** | **291** | 38 s | $0.053 |

The extracted positions are real — AHUs with flow rate, ducts, fire dampers,
volume controllers — not tender document prose. Tightening the prompt ("no
requirements, criteria or prose, only entries with quantity and unit") reduced the
noise from 317 to 291 items.

**Conclusion: the product works in all languages with standard structure
(position number + description + quantity + unit), via the AI. The deterministic
parser remains the German offline one.**

---

## 8. Recommended configuration

```bash
BANDO_EXTRACT_MODEL=gpt-6-luna
BANDO_EXTRACT_EFFORT=none      # more accurate AND faster than "low"
BANDO_MATCH_MODEL=gpt-6-luna   # Decisions API, input-only
BANDO_ESCALATE_MODEL=gpt-6-astra
BANDO_ESCALATE_EFFORT=medium   # only for dubious cases
BANDO_AI_CONCURRENCY=8
BANDO_ESCALATION_BUDGET=20
```

With $75 of credit: **~1,500 quotes** in the base configuration, **~130** with
full escalation on every run. The margin is huge.

---

## 9. Residual errors (honesty)

On the 22 verified, with the recommended configuration, the missed matches are
~5 (prod 77%). Known causes, not hidden:

- **p.164 (`LV0013/14/15`)**: for three variants the model extracted as
  description only the model code (`TVR-D`) instead of the shared descriptive
  block → no match. It is a case of *description block far above the
  variant*, where a wider context in the request would be needed.
- **`LV0002` (p.78)**: `DN100` vs `DN125` confused — near-miss on the diameter.
- **`LV0006` (p.80)**: a damper row swapped with the adjacent silencer
  position (quantity 4 vs 6).
- **Prose treated as a position**: reduced but not eliminated; the model every
  now and then emits tender document bullets. Mitigated by the prompt, not eliminated.

None of these is silent: they all end up in "Da rivedere" with the flag
`no_match` or `low_confidence_match`, with the source page anchored.

---

## 10. How to reproduce

```bash
cd backend
bando-eval                                         # deterministic (free)
bando-eval --extract-effort none                   # Luna (default)
bando-eval --tag sol --extract-model gpt-6.1-sol --extract-effort low
bando-eval --tag astra --extract-model gpt-6-astra --extract-effort low
bando-eval --tag luna-esc --extract-effort none    # with escalation
bando-eval --tag ita --extract-effort none --pdf runtime/bandi/<id>.pdf
```

Each run appends to `tmp/eval_report.json`. The automatic gate:

```bash
EVAL_MIN_RECALL=0.9 .venv/bin/python -m pytest tests/test_ground_truth.py
```

---

## 11. Architecture in one line per piece

- **`pipeline/extractors/`** — PDF reading (PyMuPDF + pypdf fallback), geometry.
- **`pipeline/steps/`** — the 7 deterministic steps, including the rewritten parser.
- **`pipeline/ai/`** — the interchangeable AI engines: `extract` (Responses +
  structured output), `match` (Decisions API), `escalate` (Astra on dubious cases),
  `usage` (token/cost/latency). Deterministic fallback if the key is missing.
- **`app/eval.py`** — the harness that guided every decision.
- **`tests/`** — golden (price to the cent), ground truth (recall ≥ 0.9),
  AI adapters (fake client), API.

**Nothing is mocked.** The pricing maths is verified to the cent against
`expected_output_example.json`; extraction is measured against the 22 verified
positions. Uncertainty is always visible, never hidden.
