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

Every number traces back to a page, and every uncertainty is a visible flag.
Nothing is silently dropped.

## Architecture

Two runnable trees, decoupled by a frozen JSON contract
([`docs/contract/README.md`](docs/contract/README.md)):

| Tree | Stack | Role |
|---|---|---|
| [`backend/`](backend/README.md) | Python 3.12 · FastAPI | Reads the PDF, extracts/matches/ prices, serves the API. Owns all pricing math. |
| [`frontend/`](frontend/README.md) | React · TypeScript · Vite | The webapp. Talks to the backend only through the contract; never computes prices. |

The pipeline is `Read → Parse → Classify → Canonicalize → Match → Price →
Aggregate`. Each step is independently replaceable; the AI extractor/matcher sit
behind the same interfaces and fall back to the deterministic engine when no
`OPENAI_API_KEY` is configured.

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
