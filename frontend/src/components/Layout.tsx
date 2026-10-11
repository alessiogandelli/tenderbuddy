import { useEffect, useRef, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { Check, ChevronDown, Globe, Plus } from "lucide-react";
import { LANGUAGES, useI18n } from "../i18n";

/** Where a page can render its own title, in the middle of the top bar. */
export const TOPBAR_SLOT = "topbar-slot";

/** A globe with the current language's code; the four languages open from it. */
function LanguageMenu() {
  const { locale, setLocale, t } = useI18n();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const current = LANGUAGES.find((language) => language.locale === locale) ?? LANGUAGES[0];

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    rootRef.current?.querySelector<HTMLButtonElement>(".langmenu__opt[aria-checked='true']")?.focus();
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  const close = () => {
    setOpen(false);
    buttonRef.current?.focus();
  };

  return (
    <div className="langmenu" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className={`langmenu__btn ${open ? "is-open" : ""}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${t("language.label")}: ${current.label}`}
        title={t("language.label")}
        onClick={() => setOpen((value) => !value)}
      >
        <Globe size={17} aria-hidden />
        <span className="langmenu__code">{current.short}</span>
        <ChevronDown size={14} className="langmenu__caret" aria-hidden />
      </button>
      {open && (
        <div
          className="langmenu__pop"
          role="menu"
          aria-label={t("language.label")}
          onKeyDown={(event) => {
            const options = [...(rootRef.current?.querySelectorAll<HTMLButtonElement>(".langmenu__opt") ?? [])];
            const index = options.indexOf(document.activeElement as HTMLButtonElement);
            if (event.key === "Escape") close();
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              const step = event.key === "ArrowDown" ? 1 : -1;
              options[(index + step + options.length) % options.length]?.focus();
            }
          }}
        >
          {LANGUAGES.map((language) => (
            <button
              key={language.locale}
              type="button"
              role="menuitemradio"
              aria-checked={locale === language.locale}
              className="langmenu__opt"
              onClick={() => {
                setLocale(language.locale);
                close();
              }}
            >
              <span className="langmenu__short">{language.short}</span>
              <span className="langmenu__label">{language.label}</span>
              {locale === language.locale && <Check size={15} className="langmenu__check" aria-hidden />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Layout() {
  const { t } = useI18n();
  const onUpload = useLocation().pathname === "/";

  return (
    <div className="app">
      <header className="topbar">
        <Link to="/" className="topbar__brand">
          <span className="topbar__mark" aria-hidden>
            TB
          </span>
          <span className="topbar__name">TenderBuddy</span>
        </Link>
        {/* A tender page puts its title here, centred on the page (see TenderTitle). */}
        <div id={TOPBAR_SLOT} className="topbar__slot" />
        <div className="topbar__right">
          <LanguageMenu />
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
