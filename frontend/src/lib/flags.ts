// Human Italian labels for the contract enums, plus the glossary used by
// tooltips. Domain terms come from CONTEXT.md at the repo root.
import type {
  Classification,
  ItemFlag,
  ItemStatus,
  PageType,
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
  classify_pages: "Classificazione pagine",
  parse: "Estrazione posizioni",
  overview: "Panoramica del documento",
  classify: "Classificazione bando",
  canonicalize: "Normalizzazione",
  match: "Match catalogo",
  price: "Calcolo prezzo",
  aggregate: "Sintesi e offerta",
};

export const PIPELINE_ORDER: PipelineStep[] = [
  "read",
  "classify_pages",
  "parse",
  "overview",
  "classify",
  "canonicalize",
  "match",
  "price",
  "aggregate",
];

export const PAGE_TYPE_LABELS: Record<PageType, string> = {
  lv_table: "Tabella LV",
  lv_other: "LV altro formato",
  cover: "Copertina",
  index: "Indice",
  captions: "Divisore",
  legal: "Legale",
  specifications: "Specifiche tecniche",
  modulo_offerta: "Modulo offerta",
  preziario: "Preziario",
  other: "Altro",
};

export const PAGE_TYPE_COLORS: Record<PageType, string> = {
  lv_table: "#16a34a",
  lv_other: "#d59a08",
  cover: "#7c3aed",
  index: "#64748b",
  captions: "#94a3b8",
  legal: "#dc2626",
  specifications: "#2563eb",
  modulo_offerta: "#0d9488",
  preziario: "#ea580c",
  other: "#94a3b8",
};

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
