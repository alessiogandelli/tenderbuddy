# Demo — from tender document to first price

Walkthrough for the demonstration. Everything runs locally; AI is optional.

## Startup

```bash
# backend (Python 3.12)
cd backend
cp .env.example .env            # if needed; otherwise paste the key into .env
.venv/bin/uvicorn app.main:app --reload

# frontend (new terminal)
cd frontend
pnpm dev                        # http://localhost:5173
```

The example tender document is already in the archive (`bnd_seed_oberglatt`, 22 verified
positions). With an empty `OPENAI_API_KEY` the deterministic engine is used; with the
key, Luna is used for extraction, the Decisions API for matching, and Astra only
for dubious cases.

## The narrative (2 minutes)

1. **Open the app.** A dropzone. No menu, no catalogue to explore.
2. **Drag the tender PDF** (`data/BKP_244_LV_Lueftung_260804.pdf`, 202 pages).
   The processing screen appears: 7 steps, a ring that advances, the
   counter of extracted positions rising.
3. **The workbench appears.** At the top right the indicative price. Below, the
   positions: each row is a tender document entry with description, quantity,
   catalogue product, direct cost and status.
4. **The wow: traceability.** Click a row → the PDF jumps **exactly**
   to the region it was taken from, which pulses. Click an evidence marker in the PDF →
   the row is selected. Every number has a page behind it.
5. **Edit and watch the price move.** Double-click a row, change the
   quantity, Save. The price at the top scrolls to the new value in half a second —
   the quote is alive, not a frozen PDF.
6. **The cost of intelligence.** At the bottom right the purple badge:
   `0.045 $ · 23 call`. You used one model to extract and one to decide, and
   you know exactly what it cost.

## Points to say out loud

- **Nothing is mocked — in the live demo.** The pricing maths is verified to the cent against
  `data/expected_output_example.json`; extraction is measured against the 22
  verified positions with the same harness (`bando-eval`). (The app also has an
  *offline example* it falls back to when the backend is unreachable; it is
  labelled "Offline example" in the top bar and replays the same flow on the
  bundled `bnd_eb09ac9d83ea` tender with no backend.)
- **AI is interchangeable.** Extraction and matching are two adapters behind the
  same phases; with the key off the pipeline runs identically, locally.
- **Uncertainty is visible.** The positions that require a person are
  filtered into "Da rivedere"; the dot next to the id says how much confidence the
  match has. Nothing is hidden.

## Numbers to quote

| | Value |
|---|---|
| Recall on the 22 verified positions | 22/22 |
| Quantity accuracy | 100% |
| Product match (vs 32% deterministic) | 73% |
| Cost per tender (Luna `none` + Decisions) | ~0.05 $ |
| Time per tender (202 pages) | ~42 s |
| Italian tender document (188 pages) | 0 → 291 positions |

Full detail and method in [`benchmark.md`](benchmark.md).

## Remote demo — Cloudflare Worker (static assets) + Cloudflare Tunnel

```
https://tenderbuddy.gandelli.dev        Cloudflare Worker (the SPA)   ← always up
   │  cross-origin API calls
   └─ https://api.tenderbuddy.gandelli.dev   Cloudflare Tunnel → laptop :8000
                                                  │  laptop off → app shows the
                                                  └─ offline example + "Simulate an upload"
```

The frontend is a static SPA deployed as an **assets-only Cloudflare Worker**
(Workers Builds, connected to this GitHub repo, so a push to `main` deploys it),
always reachable at `tenderbuddy.gandelli.dev`. `frontend/wrangler.jsonc` points
wrangler at `dist/` and sets `not_found_handling: single-page-application`, so
deep links (`/bandi/:id`) get `index.html` with a 200 — no Vite plugin needed.
The backend runs on the demo laptop and is published by a Cloudflare Tunnel at
`api.tenderbuddy.gandelli.dev`. When the laptop is off, the app detects the
unreachable API and serves the bundled **offline example**; the upload page then
offers a **Simulate an upload** button that replays the whole pipeline on the
example tender.

**One-time setup (Cloudflare dashboard)**

1. Zero Trust → Networks → Tunnels → *the tunnel* → Public Hostnames: add
   `api.tenderbuddy.gandelli.dev` → `http://127.0.0.1:8000`.
2. Workers → Create → Connect to GitHub (`alessiogandelli/tenderbuddy`):
   Root directory `frontend`, Build command `pnpm build`, Deploy command
   `npx wrangler deploy`. (`VITE_API_BASE` is baked in via
   `frontend/.env.production`; set `NODE_VERSION=20` if the build image needs it.)
3. Workers → `tenderbuddy` → Custom domain: add `tenderbuddy.gandelli.dev`, then
   remove the `tenderbuddy.gandelli.dev` public hostname from the tunnel.

**Each demo run**

```bash
cd backend
.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000   # BANDO_ALLOWED_ORIGINS from .env
cloudflared tunnel run --token <tunnel-token>                 # already running at the demo
```

`backend/.env` must list the Worker origin so the browser is allowed to call the
API across origins:

```
BANDO_ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173,https://tenderbuddy.gandelli.dev
```

**The offline example.** `frontend/public/demo/` holds a real processed tender
(`bnd_eb09ac9d83ea`, 202 pages, 245 positions), the pricing dataset and the
tender PDF; the app replays the pipeline loading animation from a scripted
timeline (see `frontend/src/api/demo.ts`). It is committed, so no backend is
needed. Regenerate it after a pipeline change with:

```bash
python backend/scripts/export_demo_fixtures.py [bando_id]
```

**Caveats.** Export (PDF/CSV) needs the live backend and is disabled offline.
In offline mode, edits are kept in memory only (lost on reload).


