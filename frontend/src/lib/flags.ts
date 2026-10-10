// Contract-enum logic that is language-independent. Display labels for the enum
// values live in the i18n bundles, keyed by the English contract values (e.g.
// `t("flag." + flag)`), so categorization stays English and only the label is
// translated.
import type { Item, ItemFlag, PipelineStep, PositionResult } from "../api/types";

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

// Flags that mean "a human should look at this" even when the item has a price.
export const CHECK_FLAGS: ItemFlag[] = [
  "low_confidence_match",
  "multi_variant_ambiguous",
  "unclear_unit",
  "language_uncertain",
];

/**
 * Where an item stands, in the four words the review list uses:
 * - `priced`: priced from the catalogue with nothing to check, or confirmed;
 * - `manual`: priced by hand (a unit cost, or the offer total itself);
 * - `check`: priced, but the match is uncertain or needs a supplier quote,
 *   and the estimator has not confirmed it yet;
 * - `open`: no price yet (no catalogue product, or no quantity).
 */
export type ItemState = "priced" | "manual" | "check" | "open";

export const ITEM_STATES: ItemState[] = ["open", "check", "priced", "manual"];

export function itemState(item: Item, result: PositionResult | undefined): ItemState {
  if (item.offer_price_chf != null) return "manual";
  if (result?.direct_position_cost_chf == null) return "open";
  if (result.price_source === "manual") return "manual";
  // Confirmed by the estimator: whatever made it uncertain, the price is final.
  if (item.price_confirmed) return "priced";
  if (item.status === "supplier_quote_required") return "check";
  if (item.flags.some((flag) => CHECK_FLAGS.includes(flag))) return "check";
  return "priced";
}
