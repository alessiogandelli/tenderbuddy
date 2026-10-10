import type { Item, Product } from "../api/types";

/** The item's name: the first line of its description, as written in the tender. */
export function itemName(item: Item): string | null {
  const text = item.description_normalized ?? item.description_raw ?? "";
  const line = text
    .split("\n")
    .map((part) => part.trim())
    .find(Boolean);
  return line ?? null;
}

/** The item's position number in the tender, when the extractor read one. */
export function posNumber(item: Item): string | null {
  const value = item.attributes?.pos_number;
  return typeof value === "string" && value.trim() ? value : null;
}

function normalize(text: string): string {
  return text.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");
}

function productText(product: Product): string {
  return normalize(
    [
      product.product_id,
      product.description,
      product.category,
      product.subcategory,
      product.manufacturer,
      product.model,
    ]
      .filter(Boolean)
      .join(" "),
  );
}

/** Catalogue search: every word typed must appear somewhere in the product. */
export function searchProducts(products: Product[], query: string): Product[] {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return products;
  return products.filter((product) => {
    const text = productText(product);
    return words.every((word) => text.includes(word));
  });
}

/**
 * Products that share the item's size (e.g. "DN125"), suggested first in the
 * catalogue picker. Only an exact size token counts, so a suggestion is never a
 * guess about what the item is.
 */
export function suggestedProducts(item: Item, products: Product[]): Product[] {
  const size = item.attributes?.size;
  if (typeof size !== "string" || !size.trim()) return [];
  const token = normalize(size.trim());
  return products.filter((product) => productText(product).split(/[\s,/()]+/).includes(token));
}
