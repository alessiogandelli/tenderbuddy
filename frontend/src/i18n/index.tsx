// Tiny zero-dependency i18n: a provider plus a `t(key, vars?)` with `{var}`
// interpolation and plural selection (`_one` / `_other`). The active locale is
// persisted per browser and also drives number/date formatting.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { en } from "./en";
import { deCH } from "./de-CH";
import { frCH } from "./fr-CH";
import { itCH } from "./it-CH";
import type { Messages } from "./messages";
import { setFormatLocale } from "../lib/format";

export type Locale = "en" | "de-CH" | "fr-CH" | "it-CH";

const BUNDLES: Record<Locale, Messages> = {
  en,
  "de-CH": deCH,
  "fr-CH": frCH,
  "it-CH": itCH,
};

// Shipped language switcher entries, each in its own language.
export const LANGUAGES: { locale: Locale; label: string; short: string }[] = [
  { locale: "en", label: "English", short: "EN" },
  { locale: "de-CH", label: "Deutsch", short: "DE" },
  { locale: "fr-CH", label: "Français", short: "FR" },
  { locale: "it-CH", label: "Italiano", short: "IT" },
];

const STORAGE_KEY = "tenderbuddy.locale";

function detectLocale(): Locale {
  if (typeof window !== "undefined") {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored && stored in BUNDLES) return stored as Locale;
  }
  const nav =
    typeof navigator !== "undefined" ? navigator.language.toLowerCase() : "";
  if (nav.startsWith("de")) return "de-CH";
  if (nav.startsWith("fr")) return "fr-CH";
  if (nav.startsWith("it")) return "it-CH";
  return "en";
}

function lookup(bundle: Messages, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>(
      (acc, key) => (acc == null ? undefined : (acc as Record<string, unknown>)[key]),
      bundle,
    );
}

function interpolate(template: string, vars?: Record<string, unknown>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) =>
    vars[name] != null ? String(vars[name]) : `{${name}}`,
  );
}

export interface I18nValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, vars?: Record<string, unknown>) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(detectLocale);
  const rules = useMemo(() => new Intl.PluralRules(locale), [locale]);

  // Keep the formatter locale in sync during render so first paint is correct.
  setFormatLocale(locale);

  const t = useCallback(
    (key: string, vars?: Record<string, unknown>) => {
      const resolve = (bundle: Messages): string | undefined => {
        let path = key;
        if (vars && typeof vars.count === "number") {
          const category = rules.select(vars.count);
          path = `${key}_${category}`;
          const plural = lookup(bundle, path);
          if (typeof plural !== "string") {
            const other = lookup(bundle, `${key}_other`);
            if (typeof other === "string") return other;
            const base = lookup(bundle, key);
            return typeof base === "string" ? base : undefined;
          }
          return plural;
        }
        const value = lookup(bundle, path);
        return typeof value === "string" ? value : undefined;
      };
      const template = resolve(BUNDLES[locale]) ?? resolve(en) ?? key;
      return interpolate(template, vars);
    },
    [locale, rules],
  );

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* localStorage may be unavailable; ignore */
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo<I18nValue>(
    () => ({ locale, setLocale, t }),
    [locale, setLocale, t],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const context = useContext(I18nContext);
  if (!context) throw new Error("useI18n must be used within <I18nProvider>");
  return context;
}
