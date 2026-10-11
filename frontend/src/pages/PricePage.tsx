import { useId, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  ChartColumn,
  ChartPie,
  CircleCheck,
  Info,
  Loader2,
  Shield,
  SlidersHorizontal,
  Swords,
  Target,
  type LucideIcon,
} from "lucide-react";
import { api } from "../api/client";
import type { BidScenario } from "../api/types";
import { AnimatedChf } from "../components/AnimatedChf";
import { CostMix } from "../components/CostMix";
import { Tip } from "../components/Tip";
import { Waterfall, type ItemsFilter } from "../components/Waterfall";
import { itemState, type ItemState } from "../lib/flags";
import { formatChf, formatNumber, formatPercent } from "../lib/format";
import { ALL_FIELDS, clamp, patchFor } from "../lib/parameters";
import { useTween } from "../lib/useTween";
import { buildWaterfall, type ColumnKey } from "../lib/waterfall";
import { useI18n } from "../i18n";
import { useTender } from "./tenderContext";

const SCENARIO_ICON: Record<string, LucideIcon> = { Aggressive: Swords, Target, Conservative: Shield };
const VIEW_KEY = "tenderbuddy.price.chart";
type ChartView = "bars" | "pie";

function readView(): ChartView {
  try {
    return window.localStorage.getItem(VIEW_KEY) === "pie" ? "pie" : "bars";
  } catch {
    return "bars";
  }
}

/** One editable parameter chip: click, type, Enter (or leave) to save, Esc to cancel. */
function ParamChip({
  label,
  value,
  fieldId,
  onSave,
}: {
  label: string;
  value: number | undefined;
  fieldId: string;
  onSave: (value: number) => Promise<void>;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const cancelled = useRef(false);
  const field = ALL_FIELDS.find((entry) => entry.id === fieldId);

  const commit = async () => {
    if (draft === null) return;
    if (cancelled.current) {
      cancelled.current = false;
      setDraft(null);
      return;
    }
    const parsed = Number.parseFloat(draft.replace(",", "."));
    setDraft(null);
    if (!Number.isFinite(parsed) || parsed === value) return;
    setBusy(true);
    try {
      await onSave(field ? clamp(field, parsed) : parsed);
    } finally {
      setBusy(false);
    }
  };

  if (draft !== null) {
    return (
      <form
        className="pchip is-editing"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          void commit();
        }}
      >
        <span className="pchip__label">{label}</span>
        <input
          autoFocus
          className="pchip__input"
          inputMode="decimal"
          aria-label={label}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => void commit()}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              cancelled.current = true;
              (event.target as HTMLInputElement).blur();
            }
          }}
        />
        <span className="pchip__unit">%</span>
      </form>
    );
  }
  return (
    <button
      type="button"
      className="pchip"
      title={t("price.chipHint")}
      onClick={() => setDraft(value != null ? String(value) : "")}
    >
      <span className="pchip__label">{label}</span>
      <strong>{value != null ? `${formatNumber(value)}%` : "—"}</strong>
      {busy && <Loader2 size={13} className="spin" aria-hidden />}
    </button>
  );
}

/**
 * The offer: one number (the chosen strategy's), how reliable it is, what it is
 * made of (one waterfall from cost to offer) and what each strategy changes.
 * Every amount is the backend's; the page only subtracts the cost baseline from
 * the offer to show the strategy's margin.
 */
export function PricePage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const uid = useId();
  const { bando, setBando, scenario, setScenario } = useTender();
  const summary = bando.summary;
  const params = bando.parameters;
  const scenarios = bando.recommended_bid_range?.scenarios ?? [];
  const chosen: BidScenario | undefined =
    scenarios.find((entry) => entry.scenario === scenario) ?? scenarios[1] ?? scenarios[0];
  const offer = chosen?.bid_price_chf ?? summary.indicative_selling_price_chf;
  const animatedOffer = useTween(offer);
  const baseline = summary.cost_baseline_chf;

  const { states, results, counts } = useMemo(() => {
    const results = new Map(bando.position_results.map((result) => [result.lv_id, result]));
    const states = new Map<string, ItemState>();
    const counts: Record<ItemState, number> = { open: 0, check: 0, priced: 0, manual: 0 };
    for (const item of bando.items) {
      const state = itemState(item, results.get(item.lv_id));
      states.set(item.lv_id, state);
      counts[state] += 1;
    }
    return { states, results, counts };
  }, [bando]);
  const total = bando.items.length;
  const priced = total - counts.open;
  const legendCounts = { verified: counts.priced + counts.manual, check: counts.check, open: counts.open };
  const [view, setView] = useState<ChartView>(readView);
  const chooseView = (next: ChartView) => {
    setView(next);
    try {
      window.localStorage.setItem(VIEW_KEY, next);
    } catch {
      /* the choice holds for this visit */
    }
  };

  const columns = useMemo(
    () => buildWaterfall(bando, states, results, animatedOffer),
    [bando, states, results, animatedOffer],
  );

  // Margins: as set for the strategy, and as it really is after rounding up.
  const setMargin = chosen?.margin_pct ?? params?.commercial?.target_margin_pct ?? 0;
  const effectiveMargin = offer > 0 ? ((offer - baseline) / offer) * 100 : 0;
  const markup = setMargin < 100 ? (setMargin / (100 - setMargin)) * 100 : 0;
  const pct = (value: number | undefined, digits = 2) => (value == null ? "—" : `${formatNumber(value, digits)}%`);
  const overhead = params?.commercial?.overhead_pct;
  const transport = params?.allowances?.transport_equipment_pct;
  const roundTo = params?.commercial?.round_to_chf ?? 1000;
  const scenarioName = (name: string) => t(`price.scenario.${name}`);

  const describe = (key: ColumnKey): string => {
    switch (key) {
      case "material":
        return t("price.base.material", { waste: pct(params?.allowances?.material_waste_pct) });
      case "direct":
        return summary.include_project_costs ? t("price.base.directWithProject") : t("price.base.direct");
      case "overhead":
        return t("price.base.overhead", { pct: pct(overhead) });
      case "transport":
        return t("price.base.transport", { pct: pct(transport) });
      case "margin":
        return t("price.base.margin", {
          pct: pct(setMargin),
          markup: pct(markup),
          effective: pct(effectiveMargin),
          round: formatChf(roundTo),
        });
      case "offer":
        return t("price.base.offer", { pct: pct(setMargin), round: formatChf(roundTo) });
      default:
        return t(`price.base.${key}`);
    }
  };

  const saveParam = async (path: string, value: number) => {
    setBando(await api.patchParameters(bando.id, patchFor(path, value)));
  };

  const openItems = (filter: ItemsFilter) => {
    const query = new URLSearchParams();
    if (filter.status) query.set("status", filter.status);
    if (filter.component) query.set("component", filter.component);
    navigate(`/bandi/${bando.id}?${query.toString()}`);
  };

  const reliabilityTone = counts.open > 0 ? "open" : counts.check > 0 ? "check" : "ok";

  return (
    <div className="price-page">
      <div className="price">
        <div className="pused">
          <SlidersHorizontal size={16} aria-hidden />
          <strong>{t("price.paramsUsed")}</strong>
          <ParamChip
            label={t("price.chip.overhead")}
            fieldId="overhead"
            value={overhead}
            onSave={(value) => saveParam("commercial.overhead_pct", value)}
          />
          <ParamChip
            label={t("price.chip.transport")}
            fieldId="transport_equipment"
            value={transport}
            onSave={(value) => saveParam("allowances.transport_equipment_pct", value)}
          />
          {chosen && (
            <ParamChip
              label={t("price.chip.margin", { scenario: scenarioName(chosen.scenario) })}
              fieldId="margin_target"
              value={chosen.margin_pct}
              onSave={(value) => saveParam(`stretch_bid_optimization.scenario_margins_pct.${chosen.scenario}`, value)}
            />
          )}
          <Link className="linkbtn pused__edit" to={`/bandi/${bando.id}/parameters`}>
            {t("price.editParams")} <ArrowRight size={14} aria-hidden />
          </Link>
        </div>

        <section className="offer" aria-labelledby={`${uid}-offer`}>
          <div className="offer__main">
            <p className="offer__kicker" id={`${uid}-offer`}>
              {t("price.yourOffer")}
              {chosen && <span className="offer__scenario"> · {scenarioName(chosen.scenario)}</span>}
            </p>
            <Tip
              className="offer__headline"
              placement="bottom"
              content={t("price.referenceTip", {
                value: formatChf(summary.indicative_selling_price_chf),
                margin: pct(params?.commercial?.target_margin_pct, 1),
              })}
            >
              <span className="offer__cur">CHF</span>
              <span className="offer__amount">
                <AnimatedChf value={offer} bare />
              </span>
            </Tip>
            <p className="offer__sub">
              {summary.include_project_costs ? t("price.exclVatWithProject") : t("price.exclVat")}
            </p>
            {chosen && (
              <dl className="offer__facts">
                <div>
                  <dt>{t("price.margin")}</dt>
                  <dd>
                    {pct(setMargin, 1)} <span className="offer__qual">{t("price.set")}</span>
                    <span className="offer__sep">·</span>
                    {pct(effectiveMargin)} <span className="offer__qual">{t("price.effective")}</span>
                  </dd>
                </div>
                <div>
                  <dt>{t("price.winChance")}</dt>
                  <dd>{formatPercent(chosen.estimated_win_probability)}</dd>
                </div>
                <div>
                  <dt>
                    <Tip content={t("price.contributionTip")} label={t("price.contributionHelp")}>
                      {t("price.contribution")} <Info size={13} aria-hidden />
                    </Tip>
                  </dt>
                  <dd>{formatChf(chosen.expected_contribution_chf)}</dd>
                </div>
              </dl>
            )}
            <Link
              className={`rely rely--${reliabilityTone}`}
              to={`/bandi/${bando.id}?status=${counts.check ? "check" : "open"}`}
            >
              {reliabilityTone === "ok" ? <CircleCheck size={15} aria-hidden /> : <AlertTriangle size={15} aria-hidden />}
              <span>
                {t("price.reliability", { priced, total, check: counts.check })}
                {counts.open > 0 && ` · ${t("price.withoutPrice", { count: counts.open })}`}
              </span>
              <ArrowRight size={14} aria-hidden />
            </Link>
          </div>

          {scenarios.length > 0 && (
            <div className="offer__side">
              <p className="offer__label" id={`${uid}-strategy`}>
                {t("price.strategy")}
              </p>
              <div className="seg" role="radiogroup" aria-labelledby={`${uid}-strategy`}>
                {scenarios.map((entry) => {
                  const Icon = SCENARIO_ICON[entry.scenario] ?? Target;
                  const selected = entry.scenario === chosen?.scenario;
                  const tip = `${uid}-${entry.scenario}`;
                  return (
                    <label key={entry.scenario} className={`seg__opt ${selected ? "is-active" : ""}`}>
                      <input
                        type="radio"
                        name="strategy"
                        className="sr-only"
                        checked={selected}
                        aria-describedby={selected ? undefined : tip}
                        onChange={() => setScenario(entry.scenario)}
                      />
                      <Icon size={15} aria-hidden />
                      {scenarioName(entry.scenario)}
                      {!selected && (
                        <span role="tooltip" id={tip} className="seg__tip">
                          <strong>{formatChf(entry.bid_price_chf)}</strong>
                          <span>
                            {t("price.margin")} {pct(entry.margin_pct, 1)}
                          </span>
                          <span>
                            {t("price.winChance")} {formatPercent(entry.estimated_win_probability)}
                          </span>
                          <span>
                            {t("price.contribution")} {formatChf(entry.expected_contribution_chf)}
                          </span>
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>
              <p className="offer__disclaimer">{t("price.bidNote")}</p>
            </div>
          )}
        </section>

        <section className="card wf-card" aria-labelledby={`${uid}-chart`}>
          <div className="wf-card__head">
            <div>
              <h3 className="card__title" id={`${uid}-chart`}>
                {t("price.chartTitle")}
              </h3>
              <p className="muted wf-card__intro">{t(view === "pie" ? "price.mix.intro" : "price.chartIntro")}</p>
            </div>
            <div className="vseg" role="radiogroup" aria-label={t("price.view.label")}>
              {(["bars", "pie"] as ChartView[]).map((option) => {
                const Icon = option === "bars" ? ChartColumn : ChartPie;
                return (
                  <button
                    key={option}
                    type="button"
                    role="radio"
                    aria-checked={view === option}
                    className={`vseg__opt ${view === option ? "is-active" : ""}`}
                    onClick={() => chooseView(option)}
                  >
                    <Icon size={15} aria-hidden /> {t(`price.view.${option}`)}
                  </button>
                );
              })}
            </div>
          </div>
          {/* Keyed by view: switching replays the chart's entrance. */}
          <div key={view} className="wf-card__view">
            {view === "bars" ? (
              <Waterfall
                columns={columns}
                offer={animatedOffer}
                counts={legendCounts}
                describe={describe}
                onOpenItems={openItems}
              />
            ) : (
              <CostMix
                columns={columns}
                offer={animatedOffer}
                scenarioLabel={chosen ? scenarioName(chosen.scenario) : ""}
                counts={legendCounts}
                describe={describe}
                onOpenItems={openItems}
              />
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
