// Human Italian labels for the contract enums, plus the glossary used by
// tooltips. Domain terms come from CONTEXT.md at the repo root.
import type {
  Classification,
  ItemFlag,
  ItemStatus,
  PipelineStatus,
  PipelineStep,
} from "../api/types";

export const STATUS_LABELS: Record<ItemStatus, string> = {
  calculated: "Calcolato",
  supplier_quote_required: "Serve preventivo fornitore",
  assumption_applied: "Ipotesi applicata",
  review_required: "Da rivedere",
  insufficient_information: "Informazioni insufficienti",
  out_of_scope: "Fuori ambito",
  non_priceable: "Non prezzabile",
};

export const FLAG_LABELS: Record<ItemFlag, string> = {
  missing_quantity: "Quantità mancante",
  missing_unit: "Unità mancante",
  unclear_unit: "Unità poco chiara",
  no_match: "Nessun prodotto in catalogo",
  low_confidence_match: "Match incerto",
  multi_variant_ambiguous: "Varianti ambigue",
  multi_variant_expanded: "Varianti espanse",
  missing_description: "Descrizione mancante",
  unparsed_row: "Riga non interpretata",
  out_of_scope: "Fuori ambito",
  language_uncertain: "Lingua incerta",
};

export const STEP_LABELS: Record<PipelineStep, string> = {
  read: "Lettura PDF",
  parse: "Estrazione posizioni",
  classify: "Classificazione bando",
  canonicalize: "Normalizzazione",
  match: "Match catalogo",
  price: "Calcolo prezzo",
  aggregate: "Sintesi e offerta",
};

export const PIPELINE_ORDER: PipelineStep[] = [
  "read",
  "parse",
  "classify",
  "canonicalize",
  "match",
  "price",
  "aggregate",
];

export const PIPELINE_STATUS_LABELS: Record<PipelineStatus, string> = {
  pending: "In attesa",
  running: "In corso",
  done: "Completato",
  failed: "Errore",
};

export const CLASSIFICATION_LABELS: Record<Classification, string> = {
  ventilation: "Ventilazione",
  hvac: "Riscaldamento / climatizzazione",
  plumbing: "Sanitario",
  electrical: "Elettrico",
  building: "Edile",
  other: "Altro",
};

// Only flags that mean "a human must look at this".
export const ATTENTION_FLAGS: ItemFlag[] = [
  "missing_quantity",
  "missing_unit",
  "unclear_unit",
  "no_match",
  "low_confidence_match",
  "multi_variant_ambiguous",
  "missing_description",
  "unparsed_row",
  "language_uncertain",
];

export function itemNeedsAttention(status: ItemStatus, flags: ItemFlag[]): boolean {
  if (status !== "calculated" && status !== "out_of_scope") return true;
  return flags.some((flag) => ATTENTION_FLAGS.includes(flag));
}

export const GLOSSARY: Record<string, string> = {
  Bando: "Il documento di gara pubblicato dal committente, unità di lavoro dell'app.",
  Item: "Un'unità prezzabile estratta dal Bando, o creata a mano.",
  "Cost Baseline":
    "La base di costo del Bando: costo diretto maggiorato di overhead e trasporto. Non include i costi di progetto (engineering, commissioning, igiene, documentazione).",
  "Prezzo indicativo": "Il prezzo di vendita calcolato dal Cost Baseline e dal Margine.",
  "Fascia di offerta":
    "I tre scenari (Aggressive, Target, Conservative) con prezzo, margine, probabilità di aggiudicazione e contributo atteso.",
  "Pagina sorgente": "La pagina del PDF da cui un Item è stato estratto.",
  Catalogo: "L'elenco curato di Prodotti e Pacchetti fornitore contro cui si prezza.",
  "Pacchetto fornitore":
    "Una voce di Catalogo che non possiamo prezzare e che richiede un preventivo del fornitore.",
  Match: "L'assegnazione di un Item a un Prodotto, con una confidenza.",
  "Install Code": "La chiave che lega un Item alla relativa Regola di produttività.",
  "Regola di produttività": "Le ore base per unità e il ruolo di manodopera per un Install Code.",
  "Parametri di progetto":
    "I fattori, le maggiorazioni e le condizioni commerciali specifici del progetto.",
  Copertura: "Quanta parte del Bando è prezzata rispetto a quanto resta da sistemare.",
  Flag: "Ciò che non è stato capito o che manca in un Item.",
  Preventivo: "Il risultato prezzato di un Bando.",
};
