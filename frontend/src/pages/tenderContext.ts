import { useOutletContext } from "react-router-dom";
import type { Bando, Product, ProductivityRule } from "../api/types";

/** What every tab of a tender shares: the Bando and the pricing data around it. */
export interface TenderContext {
  bando: Bando;
  setBando: (bando: Bando) => void;
  products: Product[];
  productsById: Map<string, Product>;
  rules: Map<string, ProductivityRule>;
  /** The dataset's default Parameters, to show what changed and reset it. */
  defaults: Record<string, unknown> | null;
  /** True while the page tape is flying into place as the rail. */
  arriving: boolean;
}

export function useTender(): TenderContext {
  return useOutletContext<TenderContext>();
}
