import { Link, Outlet } from "react-router-dom";
import { LANGUAGES, useI18n, type Locale } from "../i18n";

export function Layout() {
  const { locale, setLocale, t } = useI18n();

  return (
    <div className="app">
      <header className="topbar">
        <Link to="/" className="topbar__brand">
          <span className="topbar__mark" aria-hidden />
          <span className="topbar__name">
            Bando<span className="topbar__arrow">→</span>Preventivo
          </span>
        </Link>
        <div className="topbar__right">
          <span className="topbar__kicker">Equans · Sprintd Zurich</span>
          <label className="lang" title={t("language.label")}>
            <span className="lang__icon" aria-hidden>
              🌐
            </span>
            <select
              className="lang__select"
              aria-label={t("language.label")}
              value={locale}
              onChange={(event) => setLocale(event.target.value as Locale)}
            >
              {LANGUAGES.map((language) => (
                <option key={language.locale} value={language.locale}>
                  {language.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>
      <main className="app__main">
        <Outlet />
      </main>
    </div>
  );
}
