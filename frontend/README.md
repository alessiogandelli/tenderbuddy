# Bando → Preventivo — Webapp

The single webapp for the tender→quote flow: archive of tenders, review of what
is uncertain, the priced quote, the embedded tender PDF with highlights, and the
Catalogo. It talks to the backend **only** through the frozen JSON contract in
[`docs/contract/README.md`](docs/contract/README.md). It never computes prices.

## Requirements

- Node 18+ (developed on Node 24) and **pnpm**.
- The backend running on `http://127.0.0.1:8000` (see `../backend/README.md`).

## Run it

```bash
pnpm install
pnpm dev          # http://localhost:5173
```

The dev server proxies `/api` to the backend, so there is no CORS to configure.
Override the target with `VITE_API_BASE` if the backend lives elsewhere.

```bash
pnpm build        # type-check + production build into dist/
pnpm preview      # serve the build
pnpm typecheck    # tsc --noEmit
```

When `dist/` exists, the backend serves it too, so the whole demo can run on a
single port.

## Screens

- **Archivio bandi** (`/`) — all tenders with Titolo, Descrizione, data and
  Copertura; drag & drop upload; opens the detail.
- **Dettaglio bando** (`/bandi/:id`) — header with editable title/description and
  classification; the **"Da rivedere"** panel (every uncertain or missing Item);
  coverage bar; the project quote (material, labour, Cost Baseline, Prezzo
  indicativo); the three **Fascia di offerta** scenarios; the embedded PDF with
  two-way highlight sync (row ↔ region); the Item table; manual Item editing.
- **Catalogo** (`/catalogo`) — searchable Prodotti, Regole di produttività and
  Parametri di progetto.

## Layout

```
src/
  api/          typed contract client + types (this side of the seam)
  components/   Layout, ReviewPanel, ItemTable, SummaryPanel, BidRangeCards,
                PdfViewer, PipelineProgress, ItemEditor, StatusPill, CoverageBar
  pages/        ArchivePage, BandoPage, CatalogPage
  lib/          formatting + Italian labels/glossary for the contract enums
  styles.css    the design system (high contrast, readable, no framework)
```

## UX notes

The people who must adopt this are not technical, so the interface is guided and
explicit: statuses are words, not just colours; the "Da rivedere" panel makes
uncertainty impossible to miss; domain terms carry a short glossary tooltip; and
every price figure traces back to a page of the PDF.
