import { useMemo } from "react";
import { NavLink } from "react-router-dom";
import { Download } from "lucide-react";
import { api } from "../api/client";
import type { Bando } from "../api/types";
import { itemState } from "../lib/flags";
import { formatChf } from "../lib/format";
import { changedFields } from "../lib/parameters";
import { useI18n } from "../i18n";

/** The tender bar: its title, the three tabs (with what is left in each) and export. */
export function TenderHeader({
  bando,
  defaults,
}: {
  bando: Bando;
  defaults: Record<string, unknown> | null;
}) {
  const { t } = useI18n();
  const open = useMemo(() => {
    const results = new Map(bando.position_results.map((result) => [result.lv_id, result]));
    return bando.items.filter((item) => itemState(item, results.get(item.lv_id)) === "open").length;
  }, [bando]);
  const changed = changedFields(bando.parameters, defaults).length;
  const base = `/bandi/${bando.id}`;
  const tab = ({ isActive }: { isActive: boolean }) => `tabs__tab ${isActive ? "is-active" : ""}`;

  return (
    <header className="thead">
      <div className="thead__title">
        <h1 title={bando.description ?? undefined}>
          {bando.title || bando.source_file || t("common.untitledTender")}
        </h1>
        <span className="thead__meta">
          {bando.classification !== "other" && (
            <span className="chip">{t(`classification.${bando.classification}`)}</span>
          )}
          {t("common.pages", { count: bando.page_count })}
        </span>
      </div>
      <nav className="tabs" aria-label={t("tender.sections")}>
        <NavLink to={base} end className={tab}>
          {t("tender.tabReview")}
          {open > 0 && <span className="tabs__badge tabs__badge--open">{open}</span>}
        </NavLink>
        <NavLink to={`${base}/parameters`} className={tab}>
          {t("tender.tabParameters")}
          {changed > 0 && (
            <span className="tabs__badge">{t("tender.changed", { count: changed })}</span>
          )}
        </NavLink>
        <NavLink to={`${base}/price`} className={tab}>
          {t("tender.tabPrice")}
          <span className="tabs__price">{formatChf(bando.summary.indicative_selling_price_chf)}</span>
        </NavLink>
      </nav>
      <a className="btn btn--outline" href={api.exportUrl(bando.id, "csv")}>
        <Download size={16} aria-hidden /> {t("tender.export")}
      </a>
    </header>
  );
}
