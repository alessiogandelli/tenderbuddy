import type { CSSProperties } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { Plus } from "lucide-react";
import { LANGUAGES, useI18n } from "../i18n";

export function Layout() {
  const { locale, setLocale, t } = useI18n();
  const onUpload = useLocation().pathname === "/";
  const active = Math.max(
    0,
    LANGUAGES.findIndex((language) => language.locale === locale),
  );

  return (
    <div className="app">
      <header className="topbar">
        <Link to="/" className="topbar__brand">
          <span className="topbar__mark" aria-hidden>
            TB
          </span>
          <span className="topbar__name">TenderBuddy</span>
        </Link>
        <div className="topbar__right">
          <div
            className="lang"
            role="radiogroup"
            aria-label={t("language.label")}
            style={{ "--i": active } as CSSProperties}
          >
            <span className="lang__pill" aria-hidden />
            {LANGUAGES.map((language) => (
              <button
                key={language.locale}
                type="button"
                role="radio"
                aria-checked={locale === language.locale}
                title={language.label}
                className={`lang__opt ${locale === language.locale ? "is-active" : ""}`}
                onClick={() => setLocale(language.locale)}
              >
                {language.short}
              </button>
            ))}
          </div>
          {!onUpload && (
            <Link to="/" className="topbar__new">
              <Plus size={17} aria-hidden /> {t("nav.newTender")}
            </Link>
          )}
        </div>
      </header>
      <main className="app__main">
        <Outlet />
      </main>
    </div>
  );
}
