import type { LocalizedText } from "../api/types";

type BaseLanguage = "en" | "de" | "fr" | "it";

/** Map an app locale ("de-CH") to the base language key ("de"). */
function baseLanguage(locale: string): BaseLanguage {
  const code = locale.slice(0, 2).toLowerCase();
  return code === "de" || code === "fr" || code === "it" ? code : "en";
}

/**
 * Pick the string for the active locale from a four-language value, falling
 * back to English and then to null. Null/undefined in, null out.
 */
export function pickLocalized(
  value: LocalizedText | null | undefined,
  locale: string,
): string | null {
  if (!value) return null;
  const chosen = value[baseLanguage(locale)];
  return chosen || value.en || null;
}
