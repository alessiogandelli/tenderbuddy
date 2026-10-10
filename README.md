# TenderBuddy — from Bando to first price

Turn a **Bando** (a construction tender PDF) into a readable, defensible
**Preventivo** (quote): upload the document, the engine extracts the positions,
matches them against pricing data, and produces costs, an indicative price and a
bid range — marking everything it did not understand instead of hiding it.

Built at the EQUANS Sprint'd Zurich hackathon.

## What it does

- **Upload** a tender PDF from a single dropzone.
- **Extract** the priceable positions from the Leistungsverzeichnis (LV) tables,
  including quantity, unit and the region of the page each one came from.
- **Match** every position against the catalogue and price it (material +
  labour), or flag it as needing a supplier quote / a human decision.
- **Review** inside a two-pane workbench: the position list on the left, the
  embedded PDF on the right, with two-way highlight sync — click a row and the
  document scrolls to the exact region it came from, and vice versa.
- **Quote**: direct cost, Cost Baseline, indicative price and the
  Aggressive / Target / Conservative bid scenarios, recomputed live as you edit.
- **Multilingual UI** in Switzerland's three main official languages (German,
  French, Italian) plus English; categories are canonical English values,
  translated at render time.

Every number traces back to a page, and every uncertainty is a visible flag.
Nothing is silently dropped.

## Architecture

Two runnable trees, decoupled by a frozen JSON contract
([`docs/contract/README.md`](docs/contract/README.md)):

| Tree | Stack | Role |
|---|---|---|
| [`backend/`](backend/README.md) | Python 3.12 · FastAPI | Reads the PDF, extracts/matches/ prices, serves the API. Owns all pricing math. |
| [`frontend/`](frontend/README.md) | React · TypeScript · Vite | The webapp. Talks to the backend only through the contract; never computes prices. |

## How it works — the pipeline

The backend runs a fixed sequence of independently replaceable steps. Each one
takes the document state, enriches it and passes it on; only the resulting
`Bando` JSON is observable from outside (the one test seam). The AI engines sit
**behind** the Parse and Match steps, and every step degrades gracefully to
deterministic code when `OPENAI_API_KEY` is absent or a call fails — the pipeline
never blocks on the model.

`Read → Classify pages → Parse → Overview → Classify → Canonicalize → Match →
Price → Aggregate`

| # | Step | What it does | Fallback when AI is off/fails |
|---|---|---|---|
| 1 | `read` | Reads the PDF into per-page text, with geometry (bboxes) via PyMuPDF; text-only via pypdf. | pypdf text |
| 2 | `classify_pages` | Labels **every page** before extraction (`cover`, `index`, `legal`, `specifications`, `modulo_offerta`, `preziario`, `lv_table`, …) so only the six-column LV tables are read. | header heuristic (`Gegenstand` + `Mass-`) |
| 3 | `parse` | Extracts priceable positions from the `lv_table` pages. A vision model returns each row's description, quantity, unit and the `name_bbox`/`price_bbox` regions. | text-AI extraction, then the deterministic parser |
| 4 | `overview` | Builds a whole-document overview (systems, materials and labour needed); also fed to the matcher as context. | derived from the extracted Items |
| 5 | `classify` | Detects the title, description and classification (`ventilation`, `hvac`, …) for the archive. | heuristics on the document |
| 6 | `canonicalize` | Normalises descriptions, units and attributes (e.g. `Stk` → `pc`, `DN100`). | same code |
| 7 | `match` | Assigns each Item to a catalogue Product + Install Code with a confidence, or flags it (`no_match`, `low_confidence_match`). | deterministic matcher |
| 8 | `price` | Material cost (× waste), labour hours (× productivity factors × rate) and direct cost per Item. **The golden math, reproduced to the cent.** | one implementation |
| 9 | `aggregate` | Cost Baseline, indicative price and the Aggressive / Target / Conservative bid range with win probabilities. | one implementation |

Two optional **deep** passes (`--deep` / "Rilancia profonda") raise quality at
extra cost: a model-written whole-document overview and a selective escalation
of uncertain matches to a larger reasoning model.

### The two AI engines

- **Extraction** (step 3) — the Responses API with a strict JSON schema. The
  model receives one rendered page image at a time and returns structured rows
  plus boxes. It is *copying* fields from a layout, so `reasoning: none` is both
  more accurate and faster than `low` (see [`docs/benchmark.md`](docs/benchmark.md)).
- **Matching** (step 7) — a candidate product set is pre-filtered from the
  catalogue, then the model *decides* among the candidates (the Decisions API).
  This is where reasoning helps, so escalation to a bigger model lives here.

### Traceability and uncertainty

Every Item keeps the region of the page it came from (`name_bbox`) and the
rightmost `Betrag` cell where the price will be written (`price_bbox`). Clicking
a row in the workbench scrolls the PDF to that exact region and pulses the box,
and clicking a box selects the row. Anything the engine could not understand
becomes a **flag** on the Item, never a silent drop: flagged items surface under
"Da rivedere" with a reason and their source page.

### Live re-pricing

After any write — re-running the pipeline, editing an Item, or changing the
project Parameters — the backend **recomputes** the position results, summary and
bid range and returns the updated `Bando`. The frontend never computes a price;
it only displays what the backend returns.

## Quickstart

```bash
# 1. Backend (Python 3.12)
cd backend
uv venv && uv pip install -r requirements.txt   # or: pip / poetry, see backend/README.md
cp .env.example .env                            # optional: paste OPENAI_API_KEY
.venv/bin/uvicorn app.main:app --reload         # http://localhost:8000/docs

# 2. Frontend (Node 18+, pnpm) — new terminal
cd frontend
pnpm install
pnpm dev                                        # http://localhost:5173
```

The dev server proxies `/api` to the backend, and when `frontend/dist/` exists
the backend serves it too, so the whole demo can run on a single port.

The pricing dataset lives in `data/` and is **not committed** (it contains
client tender PDFs). Provide it locally before running the pipeline.

## Tests and benchmark

```bash
cd backend
.venv/bin/python -m pytest      # golden pricing + API + geometry + AI adapters
bando-eval                      # extraction accuracy / latency / cost report
```

The golden test asserts the seeded Bando reproduces
`data/expected_output_example.json` to the cent; `test_ground_truth.py` is the
extraction gate against the 22 verified positions. See
[`docs/benchmark.md`](docs/benchmark.md).

## Repository layout

```
backend/    FastAPI app, pipeline (extractors / steps / ai), tests
frontend/   React workbench webapp (archive, review, quote, PDF highlights)
data/       pricing dataset + tender PDFs (gitignored)
docs/       contract, benchmark, demo script, tender notes
dashboard/  planning board (milestones / progress)
.scratch/   spec + issue tickets
CONTEXT.md  the domain glossary (Bando, Item, Preventivo, Cost Baseline, …)
```

## Docs

- [`CONTEXT.md`](CONTEXT.md) — the shared domain vocabulary.
- [`docs/contract/README.md`](docs/contract/README.md) — the frozen backend↔frontend JSON contract.
- [`backend/README.md`](backend/README.md) — pipeline, configuration, tests.
- [`frontend/README.md`](frontend/README.md) — screens and UX notes.
- [`docs/demo.md`](docs/demo.md) — the two-minute demo script.
- [`docs/benchmark.md`](docs/benchmark.md) — extraction accuracy benchmark.

## Fixing highlight geometry

Highlight boxes are fractions of the page (`[x0, y0, x1, y1]` in 0..1). The price
box spans the **actual** `Betrag` column (read from the table's own cell
borders), not a fixed width off the header word, so it never overshoots the
table's right edge. See `backend/app/pipeline/extractors/pymupdf_reader.py`.
