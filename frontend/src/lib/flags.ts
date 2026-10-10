// Contract-enum logic and presentation constants that are language-independent.
// Display labels for the enum values live in the i18n bundles, keyed by the
// English contract values (e.g. `t("status." + status)`), so categorization
// stays English and only the label is translated.
import type { ItemFlag, ItemStatus, PageType, PipelineStep } from "../api/types";

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
