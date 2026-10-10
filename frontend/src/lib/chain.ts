// The pricing chain of one item: tender text → product → labour → price.
// Each node says whether that link is done, missing, needs a check, or is
// replaced by a hand-typed price; the first missing node gives the item's one
// next action. Only reads backend data, never computes a price.
import type { Item, PositionResult, Product, ProductivityRule } from "../api/types";

export type ChainKey = "text" | "product" | "labour" | "price";
export type NodeStatus = "done" | "missing" | "check" | "replaced";

/** What the "Next step" button does. */
export type NextAction = "quantity" | "product" | "confirmPrice" | "labour" | "price";

export interface ChainNode {
  key: ChainKey;
  status: NodeStatus;
  action?: NextAction;
}

export const CHAIN_ORDER: ChainKey[] = ["text", "product", "labour", "price"];

const TEXT_CHECK_FLAGS = ["unclear_unit", "missing_unit", "missing_description", "unparsed_row", "language_uncertain"];
const PRODUCT_CHECK_FLAGS = ["low_confidence_match", "multi_variant_ambiguous"];

export function pricingChain(
  item: Item,
  result: PositionResult | undefined,
  product: Product | undefined,
  rule: ProductivityRule | undefined,
): ChainNode[] {
  // Priced by hand: a unit cost, or the offer total itself.
  const manual = item.manual_unit_price_chf != null || item.offer_price_chf != null;
  const priced = result?.direct_position_cost_chf != null;

  const text: ChainNode =
    item.quantity == null
      ? // A typed offer total does not need the quantity to be printed.
        item.offer_price_chf != null
        ? { key: "text", status: "check" }
        : { key: "text", status: "missing", action: "quantity" }
      : item.flags.some((flag) => TEXT_CHECK_FLAGS.includes(flag))
        ? { key: "text", status: "check" }
        : { key: "text", status: "done" };

  let productNode: ChainNode;
  if (manual) productNode = { key: "product", status: "replaced" };
  else if (!item.match || !product) productNode = { key: "product", status: "missing", action: "product" };
  // Matched, but the catalogue has no price for it: a price must be typed.
  else if (product.net_cost_chf == null) productNode = { key: "product", status: "missing", action: "price" };
  // Confirmed by the estimator: the doubt below no longer holds the price back.
  else if (item.price_confirmed) productNode = { key: "product", status: "done" };
  else if (item.status === "supplier_quote_required")
    productNode = { key: "product", status: "check", action: "confirmPrice" };
  else if (item.flags.some((flag) => PRODUCT_CHECK_FLAGS.includes(flag)))
    productNode = { key: "product", status: "check", action: "confirmPrice" };
  else productNode = { key: "product", status: "done" };

  let labour: ChainNode;
  if (manual) labour = { key: "labour", status: "replaced" };
  // No product yet: labour comes from the product, so it waits on it.
  else if (!item.match) labour = { key: "labour", status: "missing", action: "product" };
  // A supplier package is quoted labour included: no rule of ours is needed.
  else if (!rule && product?.supplier_quote_required) labour = { key: "labour", status: "done" };
  else if (!rule) labour = { key: "labour", status: "missing", action: "labour" };
  else labour = { key: "labour", status: "done" };

  const price: ChainNode = priced
    ? { key: "price", status: "done" }
    : { key: "price", status: "missing", action: "price" };

  return [text, productNode, labour, price];
}

/** The one thing to do next: the first missing link, else the first to check. */
export function nextAction(chain: ChainNode[]): { node: ChainKey; action: NextAction } | null {
  const missing = chain.find((node) => node.status === "missing" && node.action);
  if (missing) return { node: missing.key, action: missing.action as NextAction };
  const check = chain.find((node) => node.status === "check" && node.action);
  return check ? { node: check.key, action: check.action as NextAction } : null;
}
