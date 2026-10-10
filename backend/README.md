# Bando → Preventivo — Backend

Turns a tender PDF ("Bando") into a priced quote ("Preventivo") through a
seven-step pipeline. Standalone: it knows nothing about the frontend. The only
coupling is the frozen JSON contract in [`docs/contract/README.md`](docs/contract/README.md).

## Requirements

- Python 3.12.
- The pricing dataset in `../data/` (`catalog.csv`, `productivity.csv`,
  `project_parameters.json`, `example_lv_positions.csv`, `expected_output_example.json`,
  and the tender PDF).
- Optional: an `OPENAI_API_KEY` in `backend/.env` (copy `.env.example`). Without
  it the pipeline runs the deterministic parser/matcher and makes no API call.

## Run it (pick any one)

```bash
# uv (fastest)
uv venv && uv pip install -r requirements.txt
uv run uvicorn app.main:app --reload --port 8000

# pip
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn app.main:app --reload --port 8000

# poetry
poetry install && poetry run uvicorn app.main:app --reload --port 8000
```

Then open <http://localhost:8000/docs> for the interactive API.

On first start the archive is empty. Seed the demo Bando (the verified example)
with:

```bash
python -m app.seed        # or: .venv/bin/python -m app.seed
```

## Tests

```bash
.venv/bin/python -m pytest
```

The **golden test** (`tests/test_golden.py`) asserts that the seeded Bando
reproduces `data/expected_output_example.json` to the cent. It is the single
most important test in the repo: it guards the whole pricing pipeline.

`tests/test_ground_truth.py` is the extraction gate: it runs the pipeline on the
full tender and asserts recall against the 22 verified positions. Raise the bar
with `EVAL_MIN_RECALL=0.9 pytest`.

## Extraction accuracy benchmark

```bash
bando-eval                      # deterministic (no API call)
bando-eval --extract-model gpt-6-luna --extract-effort low
bando-eval --extract-model gpt-6-astra --tag astra-bench
```

Compares recall, quantity/product/install-code accuracy, pre-filter
`candidate_recall` and the latency/cost report, and appends the run to
`tmp/eval_report.json`. This is the instrument that decides the model, from
data rather than taste.

## Configuration (environment variables)

| Variable | Default | Meaning |
|---|---|---|
| `BANDO_DATA_DIR` | `../data` | where the pricing dataset is read from |
| `BANDO_RUNTIME_DIR` | `./runtime` | where Bandi and uploaded PDFs are stored |
| `BANDO_ALLOWED_ORIGINS` | `http://localhost:5173,...` | CORS origins for the frontend |
| `OPENAI_API_KEY` | *(empty)* | enables the AI engines; empty = deterministic only |
| `BANDO_AI_MODE` | `auto` | `auto` \| `off` \| `forced` |
| `BANDO_EXTRACT_MODEL` / `BANDO_EXTRACT_EFFORT` | `gpt-6-luna` / `none` | extraction (Responses API) |
| `BANDO_MATCH_MODEL` | `gpt-6-luna` | matching (Decisions API) |
| `BANDO_RETRIEVAL_MODE` | `auto` | candidate retrieval: `auto` \| `lexical` \| `semantic` |
| `BANDO_EMBED_MODEL` | `text-embedding-3-large` | embeddings for semantic retrieval |
| `BANDO_EMBED_DIMENSIONS` | `0` | embedding size; `0` = model default |
| `BANDO_SEMANTIC_WEIGHT` | `0.7` | cosine vs. lexical blend for candidate ranking |
| `BANDO_CANDIDATE_K` | `30` | candidate products offered to the matcher per position |
| `BANDO_ESCALATE_MODEL` / `_EFFORT` | `gpt-6-astra` / `medium` | uncertain-case escalation |
| `BANDO_AI_CONCURRENCY` | `8` | LV pages in flight |
| `BANDO_ESCALATION_BUDGET` | `20` | max escalation calls per run |

### Candidate retrieval

The catalogue is English while tenders are German/Italian/French, so the
deterministic token pre-filter offers the wrong products for most positions. In
`semantic` mode the pipeline embeds the catalogue once (cached under
`runtime/cache/`) and each run's item descriptions, and hands the matcher
candidates retrieved by meaning — a German `Kompaktschalldämpfer` reaches the
English `Compact silencer`. It blends with the lexical score and never drops a
product the lexical filter already found; with no key, or on any embedding
error, it silently falls back to lexical.

## Layout

```
app/
  main.py            FastAPI app factory (CORS, error envelope, optional static serve)
  config.py          paths + env (loads backend/.env)
  seed.py            builds the demo Bando from the verified example
  eval.py            extraction accuracy + latency/cost benchmark (bando-eval)
  domain/            pydantic models + enums: the contract types
  storage/           JSON store: index + one file per Bando
  pipeline/
    pricing_db.py    loads catalog / productivity / parameters
    pricing.py       the pricing engine + bid range (golden math)
    extractors/      PdfReader interface + pypdf + PyMuPDF implementations
    steps/           read, parse, classify, canonicalize, match, price, aggregate
    ai/              interchangeable AI engines: extract (Responses), match
                     (Decisions), escalate — each falls back to deterministic
    runner.py        sequences the steps, keeps per-step state
  api/               health, catalog, bandi routers
tests/               golden + API + AI-adapter + ground-truth tests
```

## The pipeline

`Read → Parse → Classify → Canonicalize → Match → Price → Aggregate`.

Each step is independently replaceable. The PDF reader is behind a small
interface (`pipeline/extractors`); the AI extraction and matching engines sit
behind `pipeline/ai` and fall back to the deterministic `Parse`/`Match` when
OpenAI is not configured. Everything a step cannot understand becomes a **flag**
on the Item, never a silent drop.

## Swapping the PDF engine

Implement the `PdfReader` protocol (`read` + `locate`) and pass it to
`run_pipeline(..., reader=MyReader())`. `default_reader()` prefers the
geometry-aware PyMuPDF reader and falls back to the text-only pypdf one.
