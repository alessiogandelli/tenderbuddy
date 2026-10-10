# Bando → Preventivo — Backend

Turns a tender PDF ("Bando") into a priced quote ("Preventivo") through a
seven-step pipeline. Standalone: it knows nothing about the frontend. The only
coupling is the frozen JSON contract in [`docs/contract/README.md`](docs/contract/README.md).

## Requirements

- Python 3.8 (the repo's active interpreter).
- The pricing dataset in `../data/` (`catalog.csv`, `productivity.csv`,
  `project_parameters.json`, `example_lv_positions.csv`, `expected_output_example.json`,
  and the tender PDF).

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

## Configuration (environment variables)

| Variable | Default | Meaning |
|---|---|---|
| `BANDO_DATA_DIR` | `../data` | where the pricing dataset is read from |
| `BANDO_RUNTIME_DIR` | `./runtime` | where Bandi and uploaded PDFs are stored |
| `BANDO_ALLOWED_ORIGINS` | `http://localhost:5173,...` | CORS origins for the frontend |

## Layout

```
app/
  main.py            FastAPI app factory (CORS, error envelope, optional static serve)
  config.py          paths + env
  seed.py            builds the demo Bando from the verified example
  domain/            pydantic models + enums: the contract types
  storage/           JSON store: index + one file per Bando
  pipeline/
    pricing_db.py    loads catalog / productivity / parameters
    pricing.py       the pricing engine + bid range (golden math)
    extractors/      PdfReader interface + pypdf + PyMuPDF implementations
    steps/           read, parse, classify, canonicalize, match, price, aggregate
    runner.py        sequences the steps, keeps per-step state
  api/               health, catalog, bandi routers
tests/               golden + API behaviour tests
```

## The pipeline

`Read → Parse → Classify → Canonicalize → Match → Price → Aggregate`.

Each step is independently replaceable. The PDF reader is behind a small
interface (`pipeline/extractors`), so a different engine can be dropped in
without touching pricing or the API. `Parse` and `Match` are deliberately
crude and iterative: they are the fragile steps. Everything a step cannot
understand becomes a **flag** on the Item, never a silent drop.

## Swapping the PDF engine

Implement the `PdfReader` protocol (`read` + `locate`) and pass it to
`run_pipeline(..., reader=MyReader())`. `default_reader()` prefers the
geometry-aware PyMuPDF reader and falls back to the text-only pypdf one.
