# Bando → Preventivo — Webapp

The single webapp for the tender→quote flow: upload a tender, watch it being
read, check how every item was mapped to the catalogue next to the PDF, tune the
pricing parameters, read the price. It talks to the backend **only** through the frozen JSON contract in
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

- **Upload** (`/`) — a single dropzone. Uploading is the only thing to do here.
- **Reading** (`/bandi/:id` while the pipeline runs) — only the pages: a counter
  of pages read and a tape with one cell per page that fills as the tender is
  read (`pipeline.pages_read`). When the pages are classified every cell takes
  its page type's colour and a legend appears; quantity-table pages pulse while
  their positions are extracted. When the run is done the tape flies into the
  next screen and becomes its page rail — no button to press.
- **Items** (`/bandi/:id`) — a resizable split (`react-resizable-panels`): a
  compact list of every item (name, quantity, direct cost, grouped by system;
  filters *No price / To check / Priced*) on the left; on the right the **page
  rail** (one cell per page coloured by type; it marks the page in view and the
  selected item's page, click or drag to move, the palette button opens the
  colour legend) and the PDF with the name and price boxes of every item and a
  coloured page-type marker on every page.
  - *Split*: the grip on the rail's left edge resizes (list ≥ 320px, document
    ≥ 400px; arrows 16px, Shift+arrows 64px, Enter collapses the list,
    double-click resets). Each side can take the full width. The ratio is saved
    per browser.
  - *Document*: fit width by default, recomputed on resize; a manual zoom leaves
    fit width until it is chosen again. While resizing, pages are resized by CSS
    and their canvases re-rendered only once the size settles; the reading
    position (page and offset) is kept.
  - *Item card*: selecting an item in the list or a box in the PDF opens it in
    focus mode (the other rows dim; J/K or ‹ › move, Esc closes). The header
    shows name, LV code, page link, quantity (editable) and status. Two rows,
    **Material** and **Labour**, show what was matched and what it costs, with
    a status dot; each opens a panel: the product (article, net price + waste,
    match, warnings, change/remove) or the labour operation (hours formula with
    the project factors, rate, change operation). Then the direct cost, and a
    footer with one **next step** for the first missing link (add the quantity,
    pick a product, pick the labour operation, type a price, confirm the price)
    and the quiet alternative (type a price instead, undo a confirmation). The
    list header is one row: the filters, a magnifier that opens into the search,
    and the panel button; the tender's title sits next to the logo.
  - *Prices on the page*: every position's price cell (`price_bbox`) shows the
    amount the offer will print for the scenario chosen on the price page, in
    the print's own type (Helvetica 9pt, scaled with the page): **black** when
    final (priced, confirmed or typed by hand), **amber** when still to check
    (not printed until confirmed), empty when there is no price. Clicking a
    cell opens an editor to type the printed total, confirm an amber price, or
    go back to the computed price.
  - *Offer form*: the blanks of the first page classified "offer form" (the
    CRB conditions form) are filled the same way: Brutto = the sum of the final
    prices, then Rabatt, Skonto, Bauabzüge, MWST and Netto, computed by the
    backend. Every blank is editable on the page; Rabatt % and Skonto % typed
    there become the tender's parameters; the client's "Revidiert" column stays
    empty. The export prints the same values.
- **Parameters** (`/bandi/:id/parameters`) — every pricing parameter in
  collapsible, colour-coded groups with − / + steppers; each change re-prices
  the tender. Each row says what its value does (e.g. "13.6% more time than
  standard", "420 h × CHF 145 = CHF 60,900", a scenario's bid and win chance)
  and, once changed on the page, what it did to the offer (the backend's
  before/after). A sticky aside shows the chosen strategy's offer with its
  change since the page opened, a donut of what the offer is made of (hovering
  a group marks the parts it moves) and the list of changes, each undoable.
- **Price & bid** (`/bandi/:id/price`) — one offer: the chosen strategy's
  (the same amount as in the tab header, shared by every tab). Parameter chips
  (overhead, transport, the strategy's margin) edit in place through the
  parameters API. The hero shows the offer (reference price in its tooltip),
  margin set vs effective after rounding, chance to win, expected contribution
  and how many items are priced / to check; a segmented control picks the
  strategy. One hand-drawn SVG waterfall goes from material and labour (solid =
  verified, hatched = to check) through direct cost, overhead, transport and
  cost baseline to margin and offer; unpriced positions are a dashed "?"
  column, never added. Every column is focusable, explains its calculation base
  in a tooltip and has a hidden data-table fallback; material, labour and the
  unpriced column open the Items tab filtered (`?status=…&component=…`).
  The chart switches between bars and a pie (remembered per browser): the pie
  is a two-ring donut — inside priced positions, project costs, surcharges and
  margin; outside their parts — where verified and to-check prices are the two
  halves of the priced positions, as the grouped legend shows. Bars grow in on
  entry, arcs sweep in and slide when the strategy changes.

## Brand

The app is **Ender** ("The end of tenders."), from `../ender-brand-kit`: the
on-navy lockup in the top bar (`src/assets/ender-lockup-dark.svg`), the icon as
favicon (`public/`), and the kit's colours as the tokens at the top of
`src/styles.css` (ink, night, mint, teal, paper, slate and the status pairs).
Fonts (Manrope) and rounded corners are still the app's own.

## Languages

The UI ships in Switzerland's three main official languages — **German
(`de-CH`), French (`fr-CH`), Italian (`it-CH`)** — plus **English** as the
canonical fallback. A switcher in the top bar persists the choice per browser;
when the browser language isn't Swiss, the app falls back to English.

Categorization stays **English**: the backend's contract enums (`classification`,
`page_type`, `status`, `flag`, `step`) are the canonical values, and the UI maps
each one to a localized label at render time. Labels live in
`src/i18n/<locale>.ts`, keyed by the English value (e.g.
`t("status." + item.status)`, `t("classification." + bando.classification)`), so
the English bundle is the source of truth and a missing key fails `pnpm
typecheck`. Numbers, CHF amounts and dates follow the active locale.

## Layout

```
src/
  api/          typed contract client + types (this side of the seam)
  components/   Layout, TenderHeader, ProcessingStage (page tape), TapeMorph
                (tape → rail hand-over), SplitLayout, PageRail, PdfViewer,
                ItemList, ItemCard (pricing chain + hand fixes), AnimatedChf,
                Waterfall + CostMix (price charts), Donut
  pages/        UploadPage, TenderPage (phases + tabs), ReviewPage,
                ParametersPage, PricePage
  i18n/         locale bundles (en, de-CH, fr-CH, it-CH) + provider/hook
  lib/          locale-aware formatting, item states, pricing chain,
                page-type colours, parameter groups
  styles.css    the design system (high contrast, readable, no framework)
```

## UX notes

The people who must adopt this are not technical, so the interface is deliberately
small: one dropzone, one review screen. Statuses are words, not just colours;
the *No price* filter makes what is missing impossible to miss; page colours
always come with a label (tooltip, legend, page marker); and every price figure
traces back to a page of the PDF — clicking a row scrolls the document to the
exact region it came from.
