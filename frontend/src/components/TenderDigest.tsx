import { useState } from "react";
import { ChevronDown, FileText, Layers, Package, Wrench } from "lucide-react";
import type { Bando } from "../api/types";
import { useI18n } from "../i18n";

/**
 * The tender's identity at the top of the items panel: its title and a compact
 * digest of the overview the pipeline produced (summary, systems, materials,
 * labour). Collapsed by default so it never pushes the items down; "Show the
 * breakdown" expands it into a readable card. The filename is the last resort
 * for the title and otherwise only shown as provenance.
 */
export function TenderDigest({ bando }: { bando: Bando }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const overview = bando.overview;
  const title = bando.title || bando.description || bando.source_file || t("common.untitledTender");
  const summary = overview?.summary?.trim() || null;

  const groups = [
    { key: "systems", icon: Layers, values: overview?.systems ?? [] },
    { key: "materials", icon: Package, values: overview?.materials_needed ?? [] },
    { key: "labour", icon: Wrench, values: overview?.labour_needed ?? [] },
  ].filter((group) => group.values.length > 0);
  const expandable = groups.length > 0 || Boolean(summary);

  return (
    <section className="digest" aria-label={t("overview.aria")}>
      <div className="digest__head">
        <div className="digest__id">
          <h1 className="digest__title" title={title}>
            {title}
          </h1>
          <p className="digest__meta">
            {bando.classification !== "other" && (
              <span className="chip">{t(`classification.${bando.classification}`)}</span>
            )}
            <span className="digest__pages">{t("common.pages", { count: bando.page_count })}</span>
            {bando.source_file && (
              <span className="digest__file" title={bando.source_file}>
                {bando.source_file}
              </span>
            )}
          </p>
        </div>
        {expandable && (
          <button
            type="button"
            className="digest__toggle"
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? t("overview.hide") : t("overview.show")}
            <ChevronDown size={15} className={open ? "is-open" : ""} aria-hidden />
          </button>
        )}
      </div>

      {summary && <p className={`digest__summary ${open ? "" : "is-clamped"}`}>{summary}</p>}

      {open && groups.length > 0 && (
        <dl className="digest__groups">
          {groups.map((group) => (
            <div key={group.key} className="digest__group">
              <dt className="digest__group-title">
                <group.icon size={14} aria-hidden />
                {t(`overview.${group.key}`)}
              </dt>
              <dd className="digest__values">
                {group.values.map((value, index) => (
                  <span key={`${value}-${index}`} className="digest__value">
                    {value}
                  </span>
                ))}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {open && bando.source_file && (
        <p className="digest__source">
          <FileText size={13} aria-hidden />
          <span className="digest__source-label">{t("overview.source")}</span>
          <span>{bando.source_file}</span>
        </p>
      )}
    </section>
  );
}
