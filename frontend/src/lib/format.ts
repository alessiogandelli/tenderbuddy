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
