# Spec — Tender to Quote

Status: ready-for-agent
Feature: tender-to-price

## Problem Statement

An estimator receives a **tender**: a PDF of hundreds of pages, in German, full of tables. Turning it into a **quote** today is manual, slow and fragile: you have to read the positions, understand quantities and units, search the **catalogue** for the right **products**, estimate the installation hours with the **productivity rules**, apply the **project parameters** and finally decide a price.

Three concrete pains:
1. **You cannot see what was not understood.** Ambiguous or incomplete positions disappear into a number that looks precise but is not.
2. **You cannot defend the number.** There is no link between the price and the PDF page it comes from.
3. **Every tender starts from scratch.** Previous tenders are not consultable, and when an extraction engine gets it wrong there is no way to correct it by hand other than redoing everything.

Moreover: the app must be **adopted by people who are not used to tools of this kind**. If it is not guided and readable, they will not use it.

## Solution

A **backend** that exposes APIs and a **webapp** (a single application) that consumes them. The two are independent trees in the same repo, connected **only** by a frozen, versioned JSON contract.

The flow: you upload the PDF of a tender → the **extraction engine** reads it, classifies the tender (generating a readable **title** and **description**, e.g. "Sistema di ventilazione"), extracts the **items**, attaches them to the **pricing profile** (catalogue + productivity rules + project parameters) and produces the **quote**: costs per position, summary, **indicative price** and **bid range**.

Everything doubtful or missing is a first-class citizen: every item has **status**, confidence and **uncertainty flags**, and the webapp has a "to review" panel that lists them plainly. The PDF is embedded in the page with the positions highlighted (MinerU style) and table ↔ evidence are linked: I click a row, the PDF region lights up, and vice versa.

The app also works **manually**: you can create or correct an item directly, consulting a dedicated **catalogue** page. The pipeline fills it in, the human corrects it, the result is the same contract.

Multiple tenders coexist in an **archive** with title, description, date and **coverage**: you browse, reopen and compare them.

## User Stories

1. As an estimator, I want to upload a tender PDF, so that I can start pricing without rekeying the whole document.
2. As an estimator, I want the tender to get an automatic title and description, so that I recognize it at a glance in the archive.
3. As an estimator, I want to correct the auto-detected title and description, so that the archive stays meaningful for my team.
4. As an estimator, I want to see which classification was detected and which pricing profile was applied, so that I trust the numbers I am reading.
5. As an estimator, I want to see the extraction progress step by step, so that I know the process is alive and where it is.
6. As an estimator, I want a prominent "to review" panel listing every doubtful or missing item, so that nothing silently wrong enters my price.
7. As an estimator, I want each item to carry an explicit status and confidence, so that I can triage what to fix first.
8. As an estimator, I want flags that say exactly what is wrong (missing quantity, unclear unit, no catalogue match, ambiguous multi-variant, out of scope), so that I know what to do about it.
9. As an estimator, I want to open a flagged item and fix it inline, so that the price becomes correct without leaving the page.
10. As an estimator, I want the extracted items shown as a table with description, quantity, unit, matched product and source page, so that I can review the whole tender quickly.
11. As an estimator, I want to replace a matched product with another from the catalogue, so that the match reflects what will really be installed.
12. As an estimator, I want a dedicated catalogue page with search and filters, so that I can find the right product while reviewing.
13. As an estimator, I want to consult the productivity rules and the project parameters, so that I understand where hours and factors come from.
14. As an estimator, I want to create or edit an item entirely by hand, so that the app works even where extraction fails.
15. As an estimator, I want manually entered items and pipeline items to produce the same kind of result, so that I have one single way of reading the quote.
16. As an estimator, I want the PDF embedded in the page with extracted positions highlighted, so that I can verify the extraction against the source document.
17. As an estimator, I want clicking a table row to highlight the corresponding PDF region, and clicking a highlight to select the row, so that I can move between data and document without losing my place.
18. As an estimator, I want every price figure to expose its source page, so that my offer is defensible in front of a client.
19. As an estimator, I want material cost, labour cost and direct cost per item, so that I understand the build-up of each line.
20. As an estimator, I want the project summary of material, labour, direct cost and cost baseline, so that I see the overall picture at a glance.
21. As an estimator, I want the indicative price with its margin, so that I can make a first price quickly.
22. As an estimator, I want the bid range with three scenarios showing bid price, margin, estimated win probability and expected contribution, so that I can choose a bid instead of guessing one number.
23. As an estimator, I want costs aggregated by system and by category, so that I can see where the money goes.
24. As an estimator, I want a coverage report (calculated / needs supplier quote / needs review / out of scope), so that I know how complete the price actually is.
25. As an estimator, I want all previous tenders in an archive with title, description, date and coverage, so that I can come back to them later.
26. As an estimator, I want to reopen an archived tender and see its quote unchanged, so that I can compare or update it.
27. As an estimator, I want to export the priced offer, so that I can share it with my team and the client.
28. As an estimator, I want empty and error states that tell me what to do next, so that I never get stuck.
29. As an estimator, I want a simple, guided, high-contrast interface, so that I can use it without training or fear of breaking something.
30. As an estimator, I want live recalculation when I edit an item, so that I immediately see the effect on the price.
31. As an estimator, I want to re-run the extraction after changing inputs, so that the quote reflects the latest document.
32. As an estimator, I want to see when an item needs a supplier quote instead of a catalogue price, so that I never invent a price.
33. As an estimator, I want multi-variant rows (one description, several sizes) expanded into distinct items, so that quantities are not lost.
34. As an estimator, I want units normalized to a consistent vocabulary, so that quantities and costs add up correctly.
35. As an estimator, I want to see which project parameters (waste, overhead, margin) were applied, so that I can explain the price to anyone asking.
36. As a team member, I want the extraction output to be a stable versioned JSON, so that frontend and backend can be developed and tested independently.
37. As a team member, I want to edit that JSON as data, so that I can correct extraction mistakes precisely where they happen.
38. As a team member, I want the backend to run standalone with its own README, so that I can start working without knowing anything about the frontend.
39. As a team member, I want the frontend to run standalone with its own README, so that I can start working without knowing anything about the backend internals.
40. As a team member, I want the setup to work with uv, poetry and pip alike, so that nobody is blocked by their tooling.
41. As a developer, I want PDF reading behind a swappable interface, so that I can try a different engine when one misbehaves.
42. As a developer, I want the pipeline split into steps with inspectable intermediate output, so that I can improve one step at a time without breaking the others.
43. As a developer, I want a golden test asserting the 22 verified positions reproduce the expected numbers exactly, so that refactoring never silently changes the price.
44. As a developer, I want uncertainty flags to be part of the frozen contract, so that they cannot be dropped by accident in a future refactor.
45. As a developer, I want the extraction engine to be one of several implementations behind the same interface, so that a future engine (LLM, MinerU, other) drops in without touching pricing or UI.

## Implementation Decisions

**Topology.** Two independent trees inside the repo, `backend/` and `frontend/`, each with its own manifest and README, each startable alone. No cross-imports, no submodule, no monorepo tooling. They communicate only over REST and the frozen JSON contract. A single webapp, not two.

**Contract.** The frozen seam is the tender JSON. It starts from the provided `expected_output_example.json` (schema v2.0) and extends it additively: a `bando` envelope (id, title, description, classification, source file, page count, pipeline state, coverage), an `items[]` array carrying the pre-price extraction result with `flags[]` and `source_bbox` for PDF highlighting, and `match{}`. `position_results[]`, the summary and `recommended_bid_range` keep their existing shape. A `schema_version` field versions it, and the same document is mirrored in both trees' `docs/contract/`.

Contract shape (decision, trimmed to the decision-rich parts):

```
Bando {
  schema_version, id, title, description, classification,
  source_file, page_count, created_at,
  pipeline: { step: <read|parse|classify|canonicalize|match|price|aggregate>, status, updated_at },
  coverage: { calculated, supplier_quote_required, review_required, ... },
  items: [ Item ],
  position_results: [ ... ],        // unchanged from golden schema
  summary: { ... },                 // unchanged
  recommended_bid_range: { ... }    // unchanged
}

Item {
  lv_id, system, source_page, source_bbox: [x0,y0,x1,y1],
  description_raw, description_normalized,
  attributes: { size, dn, fire_class, ... },
  quantity, unit,
  match: { product_id, install_code, confidence, price_source },
  status, flags: [missing_quantity | unclear_unit | no_match |
                  multi_variant_ambiguous | out_of_scope | ...]
}
```

**Pipeline.** Seven steps, each with inspectable intermediate output and its own state: Read (0), Parse (1), Classify (2), Canonicalize (3), Match (4), Price (5), Aggregate + Bid (6). The two nodes deliberately left crude first are Parse and Match: they are the fragile ones and will be improved iteratively. Price, Aggregate and Bid are deterministic and already verified to the cent.

**Classify.** Tender title and description are auto-detected from the extracted text (type, language, subject matter, e.g. "Sistema di ventilazione"), then user-editable. Classification selects the pricing profile.

**Extraction engine is pluggable.** PDF reading sits behind an interface with interchangeable implementations (a pure-text reader and a geometry-aware reader). The rest of the pipeline does not know which engine runs, so a broken engine can be swapped and tested without touching pricing or UI.

**Uncertainty is first-class.** Every item carries `status`, confidence and `flags[]`; the aggregate of flags is the coverage report and the "to review" panel. The contract forbids dropping them.

**Manual path is a first-class path.** The app must work when the pipeline produces nothing: items can be created and edited by hand, and the catalogue is browsable in a dedicated page. Both paths write the same contract.

**Golden math (verified exactly, must be reproduced).** Per item: `material = quantity × net_unit_cost × (1 + waste/100)`; hours = `quantity × base_hours_per_unit × Π factors`, with `site_efficiency` applied as its reciprocal; `labour = unrounded_hours × hourly_rate`; `direct = material + labour`. Project level: `cost_baseline = Σ direct × (1 + overhead/100) × (1 + transport_equipment/100)` — i.e. **exactly** the golden behaviour, which excludes `project_costs` and the other allowances despite `data/README.md` describing a fuller build-up. The full build-up is presented as an explicitly labelled extra breakdown, never as the headline number. Bid range: `bid = ceil_to_1000(cost_baseline / (1 − scenario_margin/100))` for margins 2.5/4.0/6.5; the win probability uses the reference price derived from the target margin, is clamped to [0.05, 0.95] and is fed to the expected contribution **unrounded** (only the displayed probability is rounded to two decimals).

**Storage.** One JSON per tender plus an index file, in a gitignored runtime directory. No database.

**Backend.** FastAPI on Python 3.8, standard PEP 621 manifest plus lockfile and exported requirements, so uv, poetry and pip all work. Everything else is replaceable.

**Frontend.** Vite + React + TypeScript. PDF rendered in-page with an overlay of highlighted regions drawn from `source_bbox`, click-to-sync in both directions. Guided flow, high contrast, explicit statuses: adoption by non-technical users is a hard requirement, not a nicety.

**Multi-language.** Out of scope now; the pipeline must be able to grow into it because tenders come from a multilingual country and from multiple sources.

## Testing Decisions

**What makes a good test here.** Only external behaviour is asserted: what the system returns for a given tender input. Nothing about which step produced it, which engine read the PDF, or how modules are named — those must stay free to change, because the whole point of this build is that the fragile steps get replaced.

**The seam.** One, and it is the highest one available: **the tender JSON contract as served by the backend API**. Feed a tender PDF (or the provided fixture) and the pricing data in, assert on the returned tender JSON. Extraction, classification, matching, pricing, aggregation and bid range are all covered through that single door. The pipeline's individual steps are deliberately not tested as external behaviour.

**Priorities.**
1. *Golden test*: the 22 verified positions reproduce `expected_output_example.json` to the cent — material, labour, direct cost per item, the summary, the cost baseline and all three bid scenarios including the unrounded win probability. This is the single most valuable test in the repo and it runs as a script/CI check.
2. *Uncertainty test*: items that are ambiguous or incomplete come back with the right `status` and `flags`, and the coverage totals add up.
3. *Classification test*: a tender comes back with a sensible auto-detected title and description and a pricing profile.
4. *Manual path test*: an item written through the manual edit endpoint prices exactly like one produced by the pipeline.

**Prior art.** There is none in the repo yet — this is a greenfield build. `data/expected_output_example.json` serves as the golden fixture and as the contract's worked example. The frontend is a renderer of the same contract; its internals are not unit-tested, only smoke-checked against a contract fixture.

## Out of Scope

- Real multi-language extraction and UI i18n (the roadmap shows it; this spec does not build it).
- Real versioning or "BIM1/BIM2" snapshots — the concept was clarified as a multi-tender archive, not document versioning.
- Authentication and multi-user permissions.
- Real supplier quotations, RFQ generation and supplier portals.
- LLM-based or MinerU-based extraction (the engine interface allows them in later; none is built now).
- A real monitoring feature (SIT/BEV style dashboards).
- Deployment, production infrastructure, CI hosting.
- Splitting into two separate git repos: they stay as independent trees in one repo, cloneable and extractable later.
- Adding `project_costs` and the remaining allowances into the cost baseline: deliberately excluded, because the golden numbers are the ground truth being reproduced.

## Further Notes

**The README contradiction is intentional and must stay visible.** `data/README.md` describes a cost baseline that includes engineering/commissioning/hygiene/documentation costs and extra allowances; the golden `expected_output_example.json` demonstrably does not. The golden wins for the headline number, and the divergence is recorded as a decision so nobody "fixes" it later by accident.

**The risky part is Parse.** The PDF is text-based and fully extractable (202 pages), but the LV tables come out with scrambled column order (variant lines read like `Ø 10 cm Stk 5`) and there are no real position numbers — the `LV0001…` identifiers are synthetic. Matching text to items is the fragile step; everything downstream of a correct item is arithmetic.

**Adoption is the product.** The whole point is that people who are not enthusiasts use this daily. Clarity of status, visibility of what is uncertain, traceability to the PDF page and a guided flow weigh as much as extraction accuracy.

**Two people will work on opposite sides of the seam.** Contract changes are therefore a deliberate, versioned act, and the contract document is mirrored in both trees so neither side depends on the other to be readable.
