// Formatting helpers. Swiss formatting is locale-driven: the active i18n
// locale is pushed here by the I18nProvider, and CHF/numbers/dates follow it.

let currentLocale = "en";

/** Called by the i18n provider whenever the active locale changes. */
export function setFormatLocale(locale: string): void {
  currentLocale = locale;
}

const cache = new Map<string, Intl.NumberFormat>();

function numberFormat(options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = `${currentLocale}|${JSON.stringify(options)}`;
  let format = cache.get(key);
  if (!format) {
    format = new Intl.NumberFormat(currentLocale, options);
    cache.set(key, format);
  }
  return format;
}

export function formatChf(value: number | null | undefined, precise = false): string {
  if (value === null || value === undefined) return "—";
  return numberFormat({
    style: "currency",
    currency: "CHF",
    minimumFractionDigits: precise ? 2 : 0,
    maximumFractionDigits: precise ? 2 : 0,
  }).format(value);
}

export function formatNumber(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined) return "—";
  return numberFormat({ maximumFractionDigits: digits }).format(value);
}

export function formatPercent(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(currentLocale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

/**
 * An amount as the offer prints it, whatever the UI language: Swiss style with
 * an apostrophe and two decimals (12'345.60), like the exported PDF.
 */
export function formatOffer(value: number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const [whole, cents] = value.toFixed(2).split(".");
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, "'")}.${cents}`;
}

/** A short amount for tight labels: 860 · 8.5k · 137k · 1'126k (locale-aware). */
export function formatCompact(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const abs = Math.abs(value);
  if (abs < 1000) return formatNumber(value, 0);
  const thousands = value / 1000;
  return `${numberFormat({ maximumFractionDigits: abs < 100_000 ? 1 : 0 }).format(thousands)}k`;
}

/** An amount with two decimals and the locale's separators, no currency: 1'196.00. */
export function formatAmount(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return numberFormat({ minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}
