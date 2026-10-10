// Formatting helpers. Swiss formatting: CHF with apostrophe thousands.

const chf = new Intl.NumberFormat("de-CH", {
  style: "currency",
  currency: "CHF",
  maximumFractionDigits: 0,
});

const chfPrecise = new Intl.NumberFormat("de-CH", {
  style: "currency",
  currency: "CHF",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatChf(value: number | null | undefined, precise = false): string {
  if (value === null || value === undefined) return "—";
  return precise ? chfPrecise.format(value) : chf.format(value);
}

export function formatNumber(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined) return "—";
  return value.toLocaleString("it-CH", { maximumFractionDigits: digits });
}

export function formatPercent(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("it-CH", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
