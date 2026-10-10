import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Shield, SlidersHorizontal, Swords, Target, type LucideIcon } from "lucide-react";
import { AnimatedChf } from "../components/AnimatedChf";
import { ITEM_STATES, itemState, type ItemState } from "../lib/flags";
import { readScenario, saveScenario } from "../lib/scenario";
import { formatChf, formatNumber, formatPercent } from "../lib/format";
import { useI18n } from "../i18n";
import { useTender } from "./tenderContext";

const SCENARIO_ICON: Record<string, LucideIcon> = {
  Aggressive: Swords,
  Target,
  Conservative: Shield,
};

type Slice = { key: string; amount: number; note?: string };

/**
 * The price: the offer for the chosen bid scenario, how complete it is, and how
 * it is built from the direct cost. Every amount comes from the backend.
 */
export function PricePage() {
  const { t } = useI18n();
  const { bando } = useTender();
  const summary = bando.summary;
  const params = bando.parameters;
  const scenarios = bando.recommended_bid_range?.scenarios ?? [];
  const [scenario, setScenario] = useState<string>(() => readScenario(bando.id));
  const chosen = scenarios.find((entry) => entry.scenario === scenario) ?? scenarios[1] ?? scenarios[0];
  const choose = (name: string) => {
    setScenario(name);
    saveScenario(bando.id, name);
  };

  const coverage = useMemo(() => {
    const results = new Map(bando.position_results.map((result) => [result.lv_id, result]));
    const counts: Record<ItemState, number> = { open: 0, check: 0, priced: 0, manual: 0 };
    for (const item of bando.items) counts[itemState(item, results.get(item.lv_id))] += 1;
    return counts;
  }, [bando]);
  const total = bando.items.length;
  const priced = coverage.priced + coverage.manual + coverage.check;

  const pct = (value: number | undefined) => (value === undefined ? "—" : `${formatNumber(value)}%`);
  const slices: Slice[] = [
    { key: "material", amount: summary.material_cost_chf },
    { key: "labour", amount: summary.labour_cost_chf },
    ...(summary.include_project_costs ? [{ key: "project", amount: summary.project_costs_chf }] : []),
    { key: "overhead", amount: summary.overhead_chf ?? 0, note: pct(params?.commercial?.overhead_pct) },
    {
      key: "transport",
      amount: summary.transport_equipment_chf ?? 0,
      note: pct(params?.allowances?.transport_equipment_pct),
    },
    { key: "margin", amount: summary.margin_chf ?? 0, note: pct(params?.commercial?.target_margin_pct) },
  ];
  const indicative = summary.indicative_selling_price_chf || 1;
  const share = (amount: number) => `${Math.max((amount / indicative) * 100, 0)}%`;

  const ladder = [
    ...slices.slice(0, summary.include_project_costs ? 3 : 2).map((slice) => ({ ...slice, kind: "part" })),
    { key: "direct", amount: summary.direct_cost_chf, kind: "total" },
    ...slices.filter((slice) => slice.key === "overhead" || slice.key === "transport").map((slice) => ({ ...slice, kind: "part" })),
    { key: "baseline", amount: summary.cost_baseline_chf, kind: "total" },
    ...slices.filter((slice) => slice.key === "margin").map((slice) => ({ ...slice, kind: "part" })),
    { key: "indicative", amount: summary.indicative_selling_price_chf, kind: "final" },
  ] as (Slice & { kind: "part" | "total" | "final" })[];

  return (
    <div className="price-page">
      <div className="price">
        <div className="pused">
          <SlidersHorizontal size={16} aria-hidden />
          <strong>{t("price.paramsUsed")}</strong>
          <span className="muted">
            {t("price.paramsLine", {
              margin: pct(params?.commercial?.target_margin_pct),
              overhead: pct(params?.commercial?.overhead_pct),
              transport: pct(params?.allowances?.transport_equipment_pct),
            })}
          </span>
          <Link className="linkbtn pused__edit" to={`/bandi/${bando.id}/parameters`}>
            {t("price.editParams")} <ArrowRight size={14} aria-hidden />
          </Link>
        </div>

        <section className="hero">
          <div className="hero__main">
            <p className="hero__kicker">
              {t("price.yourOffer")}
              {chosen && <span className="hero__scenario"> · {t(`price.scenario.${chosen.scenario}`)}</span>}
            </p>
            <p className="hero__price">
              <span className="hero__cur">CHF</span>
              <span className="hero__amount">
                <AnimatedChf value={chosen?.bid_price_chf ?? summary.indicative_selling_price_chf} bare />
              </span>
            </p>
            <p className="hero__sub">
              {summary.include_project_costs ? t("price.exclVatWithProject") : t("price.exclVat")}
            </p>
            <p className="hero__basis">
              {t("price.basis", { priced, total })}
              {coverage.open > 0 && ` · ${t("price.notIncluded", { count: coverage.open })}`}
            </p>
            <p className="hero__ref">
              {t("price.reference", { value: formatChf(summary.indicative_selling_price_chf) })}
            </p>
          </div>
          <div className="hero__side">
            <p className="hero__side-title">{t("price.howComplete")}</p>
            <div className="cover" role="img" aria-label={t("price.coverAria", { priced, total })}>
              {ITEM_STATES.slice()
                .reverse()
                .map((state) =>
                  coverage[state] > 0 ? (
                    <span
                      key={state}
                      className={`cover__seg cover__seg--${state}`}
                      style={{ flexGrow: coverage[state] }}
                      title={`${t(`items.state.${state}`)}: ${coverage[state]}`}
                    />
                  ) : null,
                )}
            </div>
            <ul className="cover__legend">
              {(["priced", "manual", "check", "open"] as ItemState[]).map((state) => (
                <li key={state}>
                  <span className={`dot dot--${state}`} /> {t(`items.state.${state}`)}
                  <strong>{coverage[state]}</strong>
                </li>
              ))}
            </ul>
            {coverage.open > 0 && (
              <Link className="hero__link" to={`/bandi/${bando.id}`}>
                {t("price.toReview", { count: coverage.open })} <ArrowRight size={15} aria-hidden />
              </Link>
            )}
          </div>
        </section>

        <div className="price__grid">
          <section className="card ladder">
            <h3 className="card__title">{t("price.ladderTitle")}</h3>
            <ol>
              {ladder.map((row) => (
                <li key={row.key} className={`ladder__row ladder__row--${row.kind}`}>
                  <span className="ladder__label">
                    {row.kind === "part" && row.key !== "material" && (
                      <span className="ladder__op">+</span>
                    )}
                    {t(`price.slice.${row.key}`)}
                    {row.note && <span className="muted"> {row.note}</span>}
                  </span>
                  <span className="ladder__bar">
                    <span className={`ladder__fill ladder__fill--${row.key}`} style={{ width: share(row.amount) }} />
                  </span>
                  <span className="ladder__amount">{formatChf(row.amount)}</span>
                </li>
              ))}
            </ol>
          </section>

          <section className="card compo">
            <h3 className="card__title">{t("price.compoTitle")}</h3>
            <div className="compo__bar">
              {slices
                .filter((slice) => slice.amount > 0)
                .map((slice) => (
                  <span
                    key={slice.key}
                    className={`compo__seg ladder__fill--${slice.key}`}
                    style={{ flexGrow: slice.amount }}
                    title={`${t(`price.slice.${slice.key}`)} · ${formatChf(slice.amount)}`}
                  />
                ))}
            </div>
            <ul className="compo__legend">
              {slices.map((slice) => (
                <li key={slice.key}>
                  <span className={`compo__swatch ladder__fill--${slice.key}`} />
                  <span>
                    <strong>{t(`price.slice.${slice.key}`)}</strong>
                    <span className="muted">
                      {formatChf(slice.amount)} · {formatPercent(slice.amount / indicative, 1)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        {scenarios.length > 0 && (
          <section className="card bids">
            <h3 className="card__title">{t("price.bidTitle")}</h3>
            <p className="muted bids__intro">{t("price.bidIntro")}</p>
            <div className="bids__grid" role="radiogroup" aria-label={t("price.bidTitle")}>
              {scenarios.map((entry) => {
                const Icon = SCENARIO_ICON[entry.scenario] ?? Target;
                const active = entry.scenario === chosen?.scenario;
                return (
                  <label key={entry.scenario} className={`bid ${active ? "is-active" : ""}`}>
                    <input
                      type="radio"
                      name="scenario"
                      className="sr-only"
                      checked={active}
                      onChange={() => choose(entry.scenario)}
                    />
                    <span className="bid__name">
                      <Icon size={16} aria-hidden /> {t(`price.scenario.${entry.scenario}`)}
                    </span>
                    <span className="bid__price">{formatChf(entry.bid_price_chf)}</span>
                    <dl className="bid__facts">
                      <dt>{t("price.margin")}</dt>
                      <dd>{pct(entry.margin_pct)}</dd>
                      <dt>{t("price.winChance")}</dt>
                      <dd>{formatPercent(entry.estimated_win_probability)}</dd>
                      <dt>{t("price.contribution")}</dt>
                      <dd>{formatChf(entry.expected_contribution_chf)}</dd>
                    </dl>
                    <span className="bid__chance">
                      <span style={{ width: `${entry.estimated_win_probability * 100}%` }} />
                    </span>
                  </label>
                );
              })}
            </div>
            <p className="muted bids__note">{t("price.bidNote")}</p>
          </section>
        )}
      </div>
    </div>
  );
}
