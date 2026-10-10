import type { Item, PositionResult, Product, ProjectParameters } from "../api/types";
import { formatChf, formatNumber } from "../lib/format";
import { useI18n } from "../i18n";

// "Because this price": the catalog product an item was matched to and the
// parameters that built the number. Opens when a row or a PDF box is selected.
export function ItemDetailPanel({
  item,
  result,
  product,
  parameters,
  onClose,
}: {
  item: Item;
  result: PositionResult | undefined;
  product: Product | undefined;
  parameters: ProjectParameters | null;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const waste = parameters?.allowances?.material_waste_pct;
  const overhead = parameters?.commercial?.overhead_pct;
  const margin = parameters?.commercial?.target_margin_pct;
  const factors = parameters?.productivity_factors ?? {};

  return (
    <aside className="detail" aria-label={t("detail.aria", { id: item.lv_id })}>
      <header className="detail__head">
        <div>
          <span className="detail__id">{item.lv_id}</span>
          <span className={`detail__status detail__status--${item.status}`}>
            {t(`status.${item.status}`)}
          </span>
        </div>
        <button
          type="button"
          className="btn btn--icon"
          aria-label={t("common.close")}
          onClick={onClose}
        >
          ✕
        </button>
      </header>

      <p className="detail__desc">
        {item.description_normalized ?? item.description_raw ?? t("quote.noDescription")}
      </p>
      <p className="detail__meta">
        {formatNumber(item.quantity)} {item.unit ?? "?"}
        {item.source_page ? ` · ${t("common.sourcePage", { count: item.source_page })}` : ""}
      </p>

      <section className="detail__block">
        <h4>{t("detail.match")}</h4>
        {item.match ? (
          <>
            <div className="detail__row">
              <span>{t("detail.product")}</span>
              <span>
                {item.match.product_id}
                {product?.description ? ` · ${product.description}` : ""}
              </span>
            </div>
            <div className="detail__row">
              <span>{t("detail.installCode")}</span>
              <span>{item.match.install_code ?? "—"}</span>
            </div>
            <div className="detail__row">
              <span>{t("detail.confidence")}</span>
              <span>{formatNumber(item.match.confidence, 2)}</span>
            </div>
          </>
        ) : (
          <p className="detail__empty">{t("detail.noProduct")}</p>
        )}
      </section>

      {result && (
        <section className="detail__block">
          <h4>{t("detail.material")}</h4>
          <div className="detail__row">
            <span>{t("detail.netUnitCost")}</span>
            <span>{formatChf(result.net_unit_cost_chf, true)}</span>
          </div>
          <div className="detail__row">
            <span>{t("detail.wasteApplied")}</span>
            <span>{percent(waste)}</span>
          </div>
          <div className="detail__row detail__row--total">
            <span>{t("detail.materialCost")}</span>
            <span>{formatChf(result.material_cost_chf, true)}</span>
          </div>
        </section>
      )}

      {result && (
        <section className="detail__block">
          <h4>{t("detail.labour")}</h4>
          <div className="detail__row">
            <span>{t("detail.baseHours")}</span>
            <span>{formatNumber(result.base_hours_per_unit, 2)} h</span>
          </div>
          <div className="detail__row">
            <span>{t("detail.projectFactors")}</span>
            <span>{factorList(factors, t)}</span>
          </div>
          <div className="detail__row">
            <span>{t("detail.totalHours")}</span>
            <span>{formatNumber(result.adjusted_install_hours, 2)} h</span>
          </div>
          <div className="detail__row">
            <span>{t("detail.hourlyRate")}</span>
            <span>{formatChf(result.hourly_rate_chf, true)}/h</span>
          </div>
          <div className="detail__row detail__row--total">
            <span>{t("detail.labourCost")}</span>
            <span>{formatChf(result.labour_cost_chf, true)}</span>
          </div>
        </section>
      )}

      {result && (
        <section className="detail__block">
          <h4>{t("detail.directCost")}</h4>
          <div className="detail__row detail__row--total">
            <span>{t("detail.directPositionCost")}</span>
            <span>{formatChf(result.direct_position_cost_chf, true)}</span>
          </div>
          <p className="detail__note">
            {t("detail.note", { overhead: percent(overhead), margin: percent(margin) })}
          </p>
        </section>
      )}

      {item.flags.length > 0 && (
        <section className="detail__block">
          <h4>{t("detail.review")}</h4>
          <ul className="detail__flags">
            {item.flags.map((flag) => (
              <li key={flag}>{t(`flag.${flag}`)}</li>
            ))}
          </ul>
        </section>
      )}
    </aside>
  );
}

function percent(value: number | undefined): string {
  return value === undefined ? "—" : `${value}%`;
}

function factorList(
  factors: Record<string, number>,
  t: (key: string, vars?: Record<string, unknown>) => string,
): string {
  const entries = Object.entries(factors).filter(([key]) => key !== "site_efficiency");
  const label = t("detail.labourEfficiency", { value: factors.site_efficiency ?? "?" });
  return [label, ...entries.map(([key, value]) => `${key} ${value}`)].join(" · ");
}
