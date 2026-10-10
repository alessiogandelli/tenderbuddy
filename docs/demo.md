# Demo — dal bando al primo prezzo

Traccia per la dimostrazione. Tutto gira in locale; l'AI è opzionale.

## Avvio

```bash
# backend (Python 3.12)
cd backend
cp .env.example .env            # se serve; in alternativa incolla la chiave in .env
.venv/bin/uvicorn app.main:app --reload

# frontend (nuovo terminale)
cd frontend
pnpm dev                        # http://localhost:5173
```

Il bando di esempio è già in archivio (`bnd_seed_oberglatt`, 22 posizioni
verificate). Con `OPENAI_API_KEY` vuoto si usa il motore deterministico; con la
chiave si usa Luna per l'estrazione, la Decisions API per il match e Astra solo
per i casi dubbi.

## La narrazione (2 minuti)

1. **Apri l'app.** Una dropzone. Nessun menu, nessun catalogo da esplorare.
2. **Trascina il PDF di gara** (`data/BKP_244_LV_Lueftung_260804.pdf`, 202 pagine).
   Compare la schermata di elaborazione: 7 passi, un anello che avanza, il
   contatore delle posizioni estratte che sale.
3. **Arriva il workbench.** In alto a destra il prezzo indicativo. Sotto, le
   posizioni: ogni riga è una voce del capitolato con descrizione, quantità,
   prodotto di catalogo, costo diretto e stato.
4. **Il wow: la tracciabilità.** Clicca una riga → il PDF salta **esattamente**
   alla regione da cui è stata presa, che pulsa. Clicca un'evidenza nel PDF → la
   riga si seleziona. Ogni numero ha una pagina dietro.
5. **Correggi e guarda il prezzo muoversi.** Doppio clic su una riga, cambia la
   quantità, Salva. Il prezzo in alto scorre al nuovo valore in mezzo secondo —
   il preventivo è vivo, non un PDF congelato.
6. **Il costo dell'intelligenza.** In basso a destra il badge viola:
   `0.045 $ · 23 call`. Hai usato un modello per estrarre e uno per decidere, e
   sai esattamente quanto è costato.

## Punti da dire ad alta voce

- **Niente è mockato.** La matematica di prezzo è verificata al centesimo contro
  `data/expected_output_example.json`; l'estrazione è misurata contro le 22
  posizioni verificate con lo stesso harness (`bando-eval`).
- **L'AI è intercambiabile.** Estrazione e matching sono due adapter dietro le
  stesse fasi; con la chiave spenta il pipeline gira identico, in locale.
- **L'incertezza è visibile.** Le posizioni che richiedono una persona sono
  filtrate in "Da rivedere"; il pallino accanto all'id dice quanta fiducia ha il
  match. Niente viene nascosto.

## Numeri da citare

| | Valore |
|---|---|
| Recall sulle 22 posizioni verificate | 22/22 |
| Accuratezza quantità | 100% |
| Match prodotto (vs 32% deterministico) | 73% |
| Costo per tender (Luna `none` + Decisions) | ~0.05 $ |
| Tempo per tender (202 pagine) | ~42 s |
| Bando italiano (188 pagine) | 0 → 291 posizioni |

Dettaglio completo e metodo in [`benchmark.md`](benchmark.md).
