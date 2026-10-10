# Contratto Bando — schema_version 2.0

Questo è l'**unico** documento che tiene insieme `backend/` e `frontend/`. Nessuno dei due deve importare codice dall'altro: comunicano solo via REST e questo JSON.

Regole:
- Il campo `schema_version` è obbligatorio e vale `"2.0"`.
- **Additive-only**: si possono aggiungere campi, mai rimuoverne o cambiarne il significato senza alzare `schema_version`.
- I campi marcati *required* devono sempre esserci. Gli altri possono mancare o essere `null`.
- Le copie di questo documento dentro `backend/docs/contract/` e `frontend/docs/contract/` devono restare identiche a questa.

---

## 1. Il documento: `Bando`

```jsonc
{
  "schema_version": "2.0",
  "id": "bnd_01H...",                  // stringa stabile, generata dal backend
  "title": "Sistema di ventilazione",  // auto-detect, correggibile
  "description": "BKP 244 Lüftungsanlagen — scuola primaria Oberglatt",
  "classification": "ventilation",     // vedi enum §5
  "source_file": "BKP_244_LV_Lueftung_260804.pdf",
  "page_count": 202,
  "created_at": "2026-10-10T09:00:00Z", // ISO 8601
  "updated_at": "2026-10-10T09:05:00Z",

  "pipeline": {
    "step": "price",        // step corrente o ultimo completato: §5
    "status": "done",       // "pending" | "running" | "done" | "failed"
    "updated_at": "2026-10-10T09:05:00Z",
    "error": null,          // stringa quando status = "failed"
    "item_count": 269,      // progresso live: posizioni estratte finora
    "message": "Completato" // progresso live: testo dello step in corso
  },

  "profile": {              // Profilo di prezzatura applicato
    "catalog_version": "catalog.csv",
    "productivity_version": "productivity.csv",
    "parameters_version": "project_parameters.json"
  },

  "coverage": {             // conteggi per Stato, la somma = items.length
    "calculated": 18,
    "supplier_quote_required": 4,
    "assumption_applied": 0,
    "review_required": 0,
    "insufficient_information": 0,
    "out_of_scope": 0,
    "non_priceable": 0
  },

  "items": [ Item ],            // §2
  "position_results": [ ... ],  // §3
  "summary": { ... },           // §3
  "recommended_bid_range": { ... }, // §3

  // Additivo. Panoramica dell'intero documento, prodotta da Luna (o dal
  // fallback deterministico): utile all'utente e al match dei prodotti.
  "overview": {
    "summary": "Impianto di ventilazione per la scuola di Oberglatt …",
    "systems": ["244.01 LA01 Nebenraeume UG"],
    "materials_needed": ["valvole di mandata", "serrande tagliafuoco"],
    "labour_needed": ["posa canali", "bilanciamento", "collaudo"],
    "engine": "luna"                 // "luna" | "deterministic"
  },

  // Additivo. I Parametri di prezzatura di questo Bando: copia editabile di
  // project_parameters.json. Assente => si applicano i default del dataset.
  // `include_project_costs` decide se i costi di progetto entrano nel prezzo.
  "parameters": { ...project_parameters..., "include_project_costs": false },

  // Additivo. Presente solo quando il preventivo è stato prodotto dall'AI
  // (extraction + matching): token, costo e latenza del run. `null` in modalità
  // deterministica o sui bandi creati a mano.
  "usage": {
    "calls": 23, "p50_ms": 820.4, "p95_ms": 2140.1,
    "errors": 0, "retries": 1, "escalation_calls": 3,
    "input_tokens": 148230, "output_tokens": 9120, "cost_usd": 0.0455
  }
}
```

`Bando` in forma compatta (`BandoSummary`), usata dall'archivio:

```jsonc
{
  "id": "...", "title": "...", "description": "...", "classification": "...",
  "source_file": "...", "page_count": 202,
  "created_at": "...", "updated_at": "...",
  "pipeline": { "step": "...", "status": "..." },
  "coverage": { ... },
  "totals": { "direct_cost_chf": 372700.12, "indicative_price_chf": 438612.83 }
}
```

---

## 2. `Item` — il risultato dell'estrazione, prima del prezzo

Ogni riga prezzabile del Bando. Nasce dalla pipeline **o** dalla compilazione manuale: non c'è differenza nel formato.

```jsonc
{
  "lv_id": "LV0001",                 // identificatore univoco nel Bando
  "system": "244.01 LA01 Nebenraeume UG", // sistema/Lot di appartenenza, o null
  "source_page": 78,                 // Pagina sorgente (1-based), o null
  "source_bbox": [0.12, 0.44, 0.61, 0.47], // [x0, y0, x1, y1] normalizzati 0..1, o null

  "description_raw": "Zuluft - Tellerventil ... Grösse Ø 10 cm",
  "description_normalized": "Supply air valve DN100",
  "attributes": {                    // chiavi libere, le note sono:
    "size": "DN100",                 // dimensione normalizzata
    "dn": 100,
    "fire_class": "EI90",            // o null
    "manufacturer_hint": "Trox Hesco",
    "model_hint": "Z-LVS"
  },

  "quantity": 5.0,
  "unit": "pc",                      // enum §5

  "match": {                         // o null se non matchato
    "product_id": "P-AIR-001",
    "install_code": "DIFFUSER",
    "confidence": 0.92,
    "price_source": "catalog"        // "catalog" | "supplier_package"
  },

  "status": "calculated",            // enum §5
  "flags": ["multi_variant_expanded"] // array, può essere vuoto; enum §5
}
```

**Flag** = *ciò che non è stato capito o che manca*. Sono obbligatori nel contratto: un refactoring non può farli sparire.

---

## 3. `position_results`, `summary`, `recommended_bid_range`

Identici allo schema già presente in `data/expected_output_example.json`. Sintassi:

```jsonc
// position_results[i]
{
  "lv_id": "LV0001", "source_page": 78,
  "matched_product_id": "P-AIR-001", "install_code": "DIFFUSER",
  "quantity": 5.0, "unit": "pc",
  "net_unit_cost_chf": 74.8,
  "material_cost_chf": 388.96,
  "adjusted_install_hours": 4.35,
  "labour_cost_chf": 417.3,
  "direct_position_cost_chf": 806.26,
  "price_source": "catalog",
  "match_confidence": 0.92,
  "review_required": false,
  "status": "calculated",
  // Additivi: i termini del calcolo manodopera, così la riga si spiega da sé.
  "base_hours_per_unit": 0.65,
  "hourly_rate_chf": 96.0,
  "factor_product": 0.9572
}

// summary
{
  "material_cost_chf": 277626.29,
  "labour_cost_chf": 95073.83,
  "direct_cost_chf": 372700.12,
  "cost_baseline_chf": 414489.12,
  "indicative_selling_price_chf": 438612.83,  // aggiuntivo, vedi §4
  // Additivi: costi di progetto e se sono inclusi in direct_cost_chf.
  "project_costs_chf": 0.0,
  "include_project_costs": false
}

// recommended_bid_range
{
  "scenarios": [
    { "scenario": "Aggressive",   "bid_price_chf": 426000, "margin_pct": 2.5,
      "estimated_win_probability": 0.69, "expected_contribution_chf": 7986.03 },
    { "scenario": "Target",       "bid_price_chf": 432000, "margin_pct": 4.0,
      "estimated_win_probability": 0.63, "expected_contribution_chf": 10951.01 },
    { "scenario": "Conservative", "bid_price_chf": 444000, "margin_pct": 6.5,
      "estimated_win_probability": 0.49, "expected_contribution_chf": 14418.68 }
  ],
  "selection_logic": "Compare bid price, margin, estimated win probability and expected contribution."
}
```

---

## 4. La matematica golden — va riprodotta **al centesimo**

Da `data/catalog.csv`, `data/productivity.csv`, `data/project_parameters.json`.
`waste = material_waste_pct`, `overhead = overhead_pct`, `transport = transport_equipment_pct`, `target = target_margin_pct`.

**Per Item:**
```
material_cost   = quantity × net_unit_cost × (1 + waste/100)
factor_product  = Π factor_keys, dove site_efficiency si applica come 1/site_efficiency
                  (tutti gli altri fattori si moltiplicano così come sono)
adjusted_hours  = quantity × base_hours_per_unit × factor_product     # NON arrotondato
labour_cost     = adjusted_hours × default_hourly_rate_chf            # usa le ore non arrotondate
direct_cost     = material_cost + labour_cost
```
L'`adjusted_install_hours` mostrato in output è arrotondato a 2 decimali; il calcolo del costo usa il valore pieno.

**Progetto:**
```
cost_baseline = Σ direct_cost × (1 + overhead/100) × (1 + transport/100)
indicative_selling_price = cost_baseline / (1 - target/100)      # mostrato, non è la base dei bid
```
> **Attenzione:** il `cost_baseline` golden **esclude** `project_costs` (engineering, commissioning, hygiene, documentation), `small_material_pct` e `supplier_package_contingency_pct`, nonostante `data/README.md` li includa nel build-up. La ground truth vince. Il preventivatore può però **accendere il toggle** `parameters.include_project_costs`: allora `Σ project_costs` entra in `direct_cost_chf` e quindi in baseline/prezzo (resta il default spento).

**Fascia di offerta** (margini `scenario_margins_pct`: 2.5 / 4.0 / 6.5):
```
reference_price = cost_baseline / (1 - target/100)
bid_price       = ceil_to( cost_baseline / (1 - margin/100), round_to_chf )   # 1000

prob_pct        = (reference_price - bid_price) / reference_price × 100
prob_raw        = clamp( reference_win_probability
                         + strategic_appetite_adjustment
                         + competition_adjustment
                         + price_sensitivity_probability_points_per_1pct_price × prob_pct,
                         minimum_probability, maximum_probability )

expected_contribution = (bid_price - cost_baseline) × prob_raw      # prob NON arrotondata
estimated_win_probability (mostrato) = round(prob_raw, 2)
```
Con i parametri forniti: `reference_win_probability = 0.55`, `strategic_appetite = +0.05`, `competition = -0.05`, `sensitivity = 0.05`, clamp `[0.05, 0.95]`, `round_to_chf = 1000`.

**Verificato esattamente:** LV0001 → `material 388.96`, `hours 4.35 (4.3469 pieno)`, `labour 417.30`, `direct 806.26`; summary → `372700.12`, baseline `414489.12`; Aggressive `426000 / 0.69 / 7986.03`.

---

## 5. Enum

**`unit`**: `pc` | `m` | `m2` | `h` | `LS` | `system` — i documenti in tedesco usano `Stk` → `pc`.

**`status`** (Stato di un Item):
`calculated` | `supplier_quote_required` | `assumption_applied` | `review_required` | `insufficient_information` | `out_of_scope` | `non_priceable`

**`flags`** (Flag di incertezza, array):
`missing_quantity` | `missing_unit` | `unclear_unit` | `no_match` | `low_confidence_match` | `multi_variant_ambiguous` | `multi_variant_expanded` | `missing_description` | `unparsed_row` | `out_of_scope` | `language_uncertain`

**`price_source`**: `catalog` | `supplier_package`

**`pipeline.step`**: `read` | `parse` | `overview` | `classify` | `canonicalize` | `match` | `price` | `aggregate`

**`pipeline.status`**: `pending` | `running` | `done` | `failed`

**`pipeline.message`** / **`pipeline.item_count`**: progresso live per la schermata di elaborazione. Il frontend li legge mentre lo stato è `running` per mostrare il passo corrente e contare le posizioni già estratte.

**`overview`** (additivo): panorama dell'intero documento. `engine` è `luna` quando la legge un modello, `deterministic` quando è ricavata dagli Item (AI spenta o fallita). `materials_needed` e `labour_needed` sono usati dall'utente e dal match.

**`parameters`** (additivo): i Parametri di prezzatura del Bando (copia di `project_parameters.json`, editabile). Includono `include_project_costs` (default `false`). `null`/assente => default del dataset.

**`usage`**: additivo, `null` se il preventivo è deterministico. Quando l'AI è attiva riporta `calls`, `p50_ms`, `p95_ms`, `errors`, `retries`, `escalation_calls`, `input_tokens`, `output_tokens`, `cost_usd`.

**`classification`**: `ventilation` | `hvac` | `plumbing` | `electrical` | `building` | `other`

---

## 6. Superficie API

| Metodo | Path | Scopo | Ritorna |
|---|---|---|---|
| GET | `/api/health` | stato + versione contratto | `{status, contract_version}` |
| GET | `/api/bandi` | archivio | `BandoSummary[]` |
| POST | `/api/bandi` | upload PDF (`multipart/form-data`, campo `file`; campi opzionali `title`, `description`) | `Bando` |
| GET | `/api/bandi/{id}` | dettaglio completo | `Bando` |
| PATCH | `/api/bandi/{id}` | correggi `title`/`description`/`classification` | `Bando` |
| PATCH | `/api/bandi/{id}/parameters` | correggi i Parametri (merge parziale di `parameters`, es. `commercial.target_margin_pct`, `include_project_costs`) | `Bando` |
| DELETE | `/api/bandi/{id}` | rimuovi il Bando | `{ok}` |
| GET | `/api/bandi/{id}/pipeline` | stato pipeline | `pipeline` |
| POST | `/api/bandi/{id}/run` | rilancia la pipeline | `Bando` |
| PUT | `/api/bandi/{id}/items` | sostituisci gli `items` (percorso manuale) | `Bando` |
| POST | `/api/bandi/{id}/items` | aggiungi un Item manuale | `Bando` |
| PATCH | `/api/bandi/{id}/items/{lv_id}` | correggi una posizione (`description_raw`, `quantity`, `unit`, `product_id`, `install_code`, `confidence`) | `Bando` |
| GET | `/api/bandi/{id}/pdf` | il PDF sorgente | `application/pdf` |
| GET | `/api/bandi/{id}/export` | export del preventivo | JSON o CSV |
| GET | `/api/catalog` | Prodotti | `Product[]` |
| GET | `/api/productivity` | Regole di produttività | `ProductivityRule[]` |
| GET | `/api/parameters` | Parametri di progetto | oggetto `project_parameters` |

Dopo ogni scrittura (`POST /run`, `PUT /items`, `POST /items`, `PATCH /items/{lv_id}`, `PATCH /parameters`) il backend **ricalcola** `position_results`, `summary` e `recommended_bid_range` e restituisce il `Bando` aggiornato. Il frontend non calcola mai il prezzo: lo mostra.

---

## 7. Errori

Tutte le risposte di errore hanno `{"error": {"code": "...", "message": "..."}}`.
Codici: `not_found` | `invalid_input` | `pipeline_failed` | `unsupported_contract_version`.
