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

## Remote demo — GitHub Pages + Cloudflare Tunnel

The frontend is deployed to GitHub Pages; the backend runs on the demo laptop and
is published through a Cloudflare Tunnel. When the laptop (or the tunnel) is
down, the deployed app drops to the bundled **offline example** so the link
always shows something.

**One-time setup**

1. Repo → Settings → Pages → **Source: GitHub Actions**.
2. (Optional) Repo → Settings → Variables → Actions → `VITE_API_BASE`, if the
   tunnel hostname ever changes (default is `https://tenderbuddy.gandelli.dev`).
3. Cloudflare: point the tunnel hostname at the local backend
   (`http://127.0.0.1:8000`).

**Each demo run**

```bash
# backend, with CORS open to the Pages origin
cd backend
BANDO_ALLOWED_ORIGINS=https://alessiogandelli.github.io \
  .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000

# tunnel (named tunnel already configured for tenderbuddy.gandelli.dev)
cloudflared tunnel run <tunnel-name>
```

Push to `main` (or run the *Deploy frontend to GitHub Pages* workflow) to publish
the frontend at <https://alessiogandelli.github.io/tenderbuddy/>. A push rebuilds
with `VITE_BASE=/tenderbuddy/` and `VITE_API_BASE=<tunnel>` baked in.

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

