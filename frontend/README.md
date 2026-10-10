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

- **Carica un bando** (`/`) — a single dropzone and a compact list of recent
  bandi (Titolo, classificazione, prezzo indicativo).
- **Workbench** (`/bandi/:id`) — a full-screen processing overlay while the
  pipeline runs, then a two-pane review: the position list on the left (inline
  editing, filter by "Da rivedere"/"Senza match", search, arrow-key navigation)
  and the PDF on the right with two-way highlight sync that scrolls to the exact
  region. A sticky header shows the live indicative price; a footer strip shows
  the cost breakdown, the three bid scenarios and the AI usage badge.

## Layout

```
src/
  api/          typed contract client + types (this side of the seam)
  components/   Layout, PositionRow, SummaryBar, ProcessingOverlay,
                PdfViewer, AnimatedChf, StatusPill
  pages/        LandingPage, WorkbenchPage
  lib/          formatting + Italian labels for the contract enums
  styles.css    the design system (high contrast, readable, no framework)
```

## UX notes

The people who must adopt this are not technical, so the interface is deliberately
small: one dropzone, one workbench. Statuses are words, not just colours; the
"Da rivedere" filter makes uncertainty impossible to miss; and every price figure
traces back to a page of the PDF — clicking a row scrolls the document to the
exact region it came from.
