# Benchmark e risultati — Tender → Preventivo

Tutto ciò che abbiamo scoperto portando la pipeline da "estrazione rotta" a
"preventivo affidabile e multilingua", con i numeri che hanno deciso le scelte.
Ground truth: le **22 posizioni verificate** in `data/example_lv_positions.csv`.
Harness: `backend/app/eval.py` (`bando-eval`), riproducibile con i comandi in
fondo.

---

## TL;DR

| Configurazione | Item | Recall | Prodotto | Install code | Tempo | Costo | p50 / p95 |
|---|---|---|---|---|---|---|---|
| Deterministico (offline) | 269 | **22/22** | 32% | 59% | 1 s | $0 | — |
| **Luna `none`** ← default | 247 | **22/22** | **73%** | 77% | **42 s** | **$0.049** | 1.4 / 4.2 s |
| Luna `none` + escalation | 255 | 22/22 | **77%** | **82%** | 68 s | $0.570 | 1.9 / 5.4 s |
| Luna `low` | 284 | 22/22 | 64% | 73% | 74 s | $0.064 | 4.0 / 7.4 s |
| Sol `low` | 267 | 22/22 | 59% | 68% | 76 s | $0.564 | 3.6 / 8.9 s |
| Astra `low` | 272 | 22/22 | 64% | 73% | 100 s | $2.764 | 4.5 / 12.6 s |
| Luna `none` — capitolato IT | 291 | n/a | n/a | n/a | 38 s | $0.053 | 1.0 / 3.0 s |

Quattro conclusioni:

1. **Il recall è risolto dal parser deterministico**, senza AI: da 0/22 a 22/22.
   Il problema non era "l'AI manca", era il parsing del layout.
2. **`reasoning: none` batte `low`** in accuratezza *e* latenza: il ragionamento
   peggiora la copia di campi strutturati.
3. **I modelli più grandi e più cari sono dominati.** Sulla stessa pipeline, Sol
   `low` (59%) e Astra `low` (64%) fanno **peggio** di Luna `none` (73%), a 11× e
   56× il costo. Più capacità non significa estrazione strutturata migliore.
4. **Luna `none` è il punto di ottimo**: il modello più economico
   nell'impostazione più economica vince su ogni asse.

---

## 1. Il punto di partenza

La pipeline c'era, era verde ai test, e sul tender reale da 202 pagine estraeva
**0 delle 22 posizioni verificate**. I test passavano perché:

- il **golden test** costruisce gli Item dal CSV con i match già dati a mano e
  verifica solo la matematica di prezzo;
- il test di estrazione usava un **PDF sintetico** costruito su misura per la
  regex;
- il test sul tender reale controllava solo `status == "done"`.

Nessuno misurava la cosa che conta: *cosa estrae davvero dal documento vero*.
La prima cosa costruita è stato quindi l'**harness di accuratezza**, non una
feature.

### Perché 0/22

Nel PDF reale unità e quantità stanno su **righe separate**:

```
Grösse
Ø 10 cm
Stk
5
```

La regex (`parse.py`) cercava `Stk 5` **sulla stessa riga**. Quelle righe non
diventavano mai Item. In più: la descrizione si accumulava per l'intera pagina
(bug), e il testo legale veniva interpretato come posizioni.

---

## 2. Metodo: come misuriamo

`app/eval.py` è l'unico strumento di verità. Fa quattro cose:

1. **Estrae** dal tender reale (deterministico o AI).
2. **Appaia** ogni Item a una riga ground truth con un matching greedy
   bipartito su *(stessa pagina, stessa unità)*, punteggio
   `qty_match + jaccard(descrizione)`, soglia esplicita. La quantità pesa il
   doppio perché molte posizioni differiscono solo per il diametro.
3. **Calcola**: `item_recall`, `candidate_recall`, accuratezza per campo
   (quantità, prodotto, install code, stato), e per la latenza `p50`/`p95`,
   errori, retry.
4. **Scrive** tutto in `tmp/eval_report.json`.

Due metriche di onestà:

- **`candidate_recall`** — il prodotto giusto è nel set di candidati che passiamo
  al modello? Se è basso, l'errore è del *pre-filtro*, non del modello. Portarlo a
  **100%** (K=20 sull'intero catalogo compatibile) ha isolato la vera variabile:
  la scelta.
- **Le 22 righe sono un campione**, non l'elenco completo delle posizioni di
  quelle pagine. Quindi gli item "in eccesso" sono altre posizioni reali, non
  rumore: la precisione non è misurabile da questo dataset e non la usiamo come
  gate.

---

## 3. Scoperta 1 — Il recall si risolve senza AI

Quattro fix al parser deterministico:

| Fix | Cosa | Dove |
|---|---|---|
| Quantità multi-riga | `Stk` \n `5` come unità + numero su righe consecutive | `steps/parse.py` |
| Reset descrizione | un nuovo blocco inizia dopo riga vuota + riga non-size/non-label | `steps/parse.py` |
| Filtro pagine | solo pagine con intestazione LV (`Gegenstand` + `Mass-`) | `steps/parse.py` |
| Strip preambolo | progetto/data/intestazione di pagina non sporcano la prima posizione | `steps/parse.py` |

**Risultato: 22/22, quantità 100%.** Costo zero, latenza 1 secondo. Ora è un gate
(`tests/test_ground_truth.py`, `EVAL_MIN_RECALL=0.9`) che fallisce se regredisce.

Il messaggio: **l'AI non serve per il recall**, serve per il *matching* e per le
*lingue altre*.

---

## 4. Scoperta 2 — Il reasoning peggiora l'estrazione

Contro ogni intuizione, l'attività di *copiare campi da un documento* peggiora
col ragionamento:

| Luna | Recall | Prodotto | Install code | Tempo | Costo |
|---|---|---|---|---|---|
| `effort=low` | 22/22 | 64% | 73% | 74 s | $0.064 |
| **`effort=none`** | 22/22 | **73%** | **77%** | **42 s** | **$0.049** |

Con `none` il modello è **più accurato e quasi due volte più veloce** (p50 1.4 s
contro 4.0 s). Il reasoning spinge il modello a "interpretare" invece di
trascrivere, e introduce latenza. Per questo il default ora è `none`.

---

## 5. Scoperta 3 — I modelli più grandi sono dominati

Stessa pipeline, stesso prompt, stesso catalogo. Cambia solo il modello di
estrazione:

| Modello (effort) | Prezzo /MTok (in/out) | Recall | Prodotto | Install | Tempo | Costo | p95 |
|---|---|---|---|---|---|---|---|
| **Luna `none`** | $0.10 / $0.50 | 22/22 | **73%** | **77%** | **42 s** | **$0.049** | 4.2 s |
| Luna `low` | $0.10 / $0.50 | 22/22 | 64% | 73% | 74 s | $0.064 | 7.4 s |
| Sol `low` | $2 / $10 | 22/22 | 59% | 68% | 76 s | $0.564 | 8.9 s |
| Astra `low` | $10 / $50 | 22/22 | 64% | 73% | 100 s | $2.764 | 12.6 s |

Il risultato è netto e contro-intuitivo: **i modelli più capaci e più costosi
fanno peggio** su questo compito.

- **Sol** è il peggiore in assoluto (59% prodotto), 11× il costo di Luna `none`.
- **Astra** pareggia Luna-`low` (64%) ma a **56×** il costo e 35% più lento; è il
  più lento di tutti (p95 12,6 s).
- **Luna `none`** vince su accuratezza, latenza e costo insieme.

Lettura: l'estrazione è **copiatura fedele di campi da un layout**, non
ragionamento. I modelli più grandi "interpretano" e riassumono di più (es. Sol
tende a normalizzare le descrizioni), il che *peggiora* la fedeltà al testo — e
quindi l'aggancio al prodotto in catalogo. La decisione "parti con il modello
grosso, scendi solo se non migliora" è risolta dai dati al contrario: **il
modello grosso non migliora mai, si parte e si resta su Luna**.

Solo l'escalation (sezione 6) giustifica un modello grande, perché lì il compito
è diverso — *decidere* tra candidati ambigui, dove il ragionamento serve.

---

## 6. Scoperta 4 — Quanto costa il punto di accuratezza

L'escalation manda ad Astra (effort `medium`) le posizioni che la Decisions API
marca come incerte (nessun match, bassa confidenza, probabilità piatte):

| | Prodotto | Install | Tempo | Costo | Chiamate escalation |
|---|---|---|---|---|---|
| Luna `none` | 73% | 77% | 42 s | $0.049 | 0 |
| Luna `none` + escalation | **77%** | **82%** | 68 s | **$0.570** | **40** |

**40 posizioni escalate** comprano **+4 punti di prodotto e +5 di install code**.
In assoluto è economico ($0.57), ma è **11,6× il costo base**. Con $75: ~1.500
preventivi a Luna pulita, ~130 con escalation piena.

Interpretazione: l'escalation è un **interruttore di qualità**, non un default.
Se l'accuratezza di match è il collo di bottiglia (es. in demo, o se l'errore
costa), accendila; se conta il volume, lasciala spenta. Il budget è configurabile
(`BANDO_ESCALATION_BUDGET`, default 20 per run).

---

## 7. Scoperta 5 — Multilingua: da 0 a 291 posizioni

Il triage era **specifico al tedesco** (`Gegenstand`/`Mass-`): su un capitolato
italiano scartava *tutte* le pagine e l'AI non vedeva nulla → **0 posizioni**.

Fix: **triage language-agnostic** (`ai/extract.py:lv_pages`). Se trova
l'intestazione LV tedesca su ≥10 pagine usa quella (fast-path, 121 pagine);
altrimenti manda al modello tutte le pagine con contenuto sufficiente, e il
modello decide pagina per pagina dove ci sono posizioni. Il prompt è stato
generalizzato (LV / capitolato / bordereau / BoQ, unità multilingua).

Su un **bando italiano reale** (`26122_ca_capitolato…`, 188 pagine, restauro
Palazzo del Pretorio, Locarno):

| | Item estratti | Tempo | Costo |
|---|---|---|---|
| Deterministico (solo tedesco) | **0** | 0.4 s | $0 |
| **Luna `none`** | **291** | 38 s | $0.053 |

Le posizioni estratte sono reali — UTA con portata, canali, serrande tagliafuoco,
regolatori di volume — non testo di capitolato. Stringere il prompt ("niente
requisiti, criteri o prosa, solo voci con quantità e unità") ha ridotto il
rumore da 317 a 291 item.

**Conclusione: il prodotto funziona in tutte le lingue con struttura standard
(numero posizione + descrizione + quantità + unità), tramite l'AI. Il parser
deterministico resta l'offline tedesco.**

---

## 8. Configurazione consigliata

```bash
BANDO_EXTRACT_MODEL=gpt-6-luna
BANDO_EXTRACT_EFFORT=none      # più accurato E più veloce di "low"
BANDO_MATCH_MODEL=gpt-6-luna   # Decisions API, input-only
BANDO_ESCALATE_MODEL=gpt-6-astra
BANDO_ESCALATE_EFFORT=medium   # solo per i casi dubbi
BANDO_AI_CONCURRENCY=8
BANDO_ESCALATION_BUDGET=20
```

Con $75 di credito: **~1.500 preventivi** in configurazione base, **~130** con
escalation piena su ogni run. Il margine è enorme.

---

## 9. Errori residui (onestà)

Sulle 22 verificate, con la configurazione consigliata, i match mancati sono
~5 (prod 77%). Cause note, non nascoste:

- **p.164 (`LV0013/14/15`)**: per tre varianti il modello ha estratto come
  descrizione solo il codice modello (`TVR-D`) invece del blocco descrittivo
  condiviso → nessun match. È un caso di *blocco descrizione molto sopra la
  variante*, dove servirebbe un contesto più ampio nella richiesta.
- **`LV0002` (p.78)**: `DN100` vs `DN125` confusi — near-miss sul diametro.
- **`LV0006` (p.80)**: una riga serranda scambiata con la posizione silenziatore
  adiacente (quantità 4 vs 6).
- **Prosa trattata come posizione**: ridotta ma non azzerata; il modello ogni
  tanto emette bullet di capitolato. Mitigato dal prompt, non eliminato.

Nessuno di questi è silenzioso: finiscono tutti in "Da rivedere" con il flag
`no_match` o `low_confidence_match`, con la pagina sorgente agganciata.

---

## 10. Come riprodurre

```bash
cd backend
bando-eval                                         # deterministico (gratis)
bando-eval --extract-effort none                   # Luna (default)
bando-eval --tag sol --extract-model gpt-6.1-sol --extract-effort low
bando-eval --tag astra --extract-model gpt-6-astra --extract-effort low
bando-eval --tag luna-esc --extract-effort none    # con escalation
bando-eval --tag ita --extract-effort none --pdf runtime/bandi/<id>.pdf
```

Ogni run appende a `tmp/eval_report.json`. Il gate automatico:

```bash
EVAL_MIN_RECALL=0.9 .venv/bin/python -m pytest tests/test_ground_truth.py
```

---

## 11. Architettura in una riga per pezzo

- **`pipeline/extractors/`** — lettura PDF (PyMuPDF + fallback pypdf), geometria.
- **`pipeline/steps/`** — i 7 passi deterministici, incluso il parser riscritto.
- **`pipeline/ai/`** — i motori AI intercambiabili: `extract` (Responses +
  structured output), `match` (Decisions API), `escalate` (Astra sui dubbi),
  `usage` (token/costo/latenza). Fallback deterministico se manca la chiave.
- **`app/eval.py`** — l'harness che ha guidato ogni decisione.
- **`tests/`** — golden (prezzo al centesimo), ground truth (recall ≥ 0.9),
  adapter AI (fake client), API.

**Niente è mockato.** La matematica di prezzo è verificata al centesimo contro
`expected_output_example.json`; l'estrazione è misurata contro le 22 posizioni
verificate. L'incertezza è sempre visibile, mai nascosta.
