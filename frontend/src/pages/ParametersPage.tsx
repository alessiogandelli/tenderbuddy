import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  ChevronDown,
  ClipboardList,
  Coins,
  HardHat,
  History,
  Loader2,
  Minus,
  Percent,
  Plus,
  RotateCcw,
  TrendingDown,
  TrendingUp,
  Trophy,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import { api } from "../api/client";
import type { Bando } from "../api/types";
import { AnimatedChf } from "../components/AnimatedChf";
import { Donut } from "../components/Donut";
import { COLUMN_COLORS } from "../components/Waterfall";
import { formatChf, formatCompact, formatNumber } from "../lib/format";
import {
  GROUPS,
  INCLUDE_PROJECT_COSTS,
  UNIT_SUFFIX,
  bounds,
  changedFields,
  clamp,
  getNumber,
  getPath,
  patchFor,
  stepValue,
  type ParamField,
} from "../lib/parameters";
import { offerOf } from "../lib/scenario";
import { priceParts, type PartKey } from "../lib/waterfall";
import { useI18n } from "../i18n";
import { useTender } from "./tenderContext";

const DEBOUNCE_MS = 400;
const OPEN_KEY = "tenderbuddy.params.open";

/** How each group looks, and which parts of the offer it moves. */
const GROUP_META: Record<string, { icon: LucideIcon; color: string; parts: PartKey[] }> = {
  productivity: { icon: HardHat, color: "#1b7350", parts: ["labour"] },
  allowances: { icon: Coins, color: "#d9822b", parts: ["material", "transport"] },
  projectCosts: { icon: ClipboardList, color: "#1a6b9f", parts: ["project"] },
  commercial: { icon: Percent, color: "#002439", parts: ["overhead", "margin"] },
  bid: { icon: Trophy, color: "#634a99", parts: ["margin"] },
};

/** One change made on this page: a value, before and after, and what it did to the offer. */
interface Change {
  id: string;
  path: string;
  from: number | boolean;
  to: number | boolean;
  delta: number;
}

type T = ReturnType<typeof useI18n>["t"];

const pctText = (value: number, digits = 1) => `${formatNumber(Math.abs(value), digits)}%`;
const signed = (value: number, digits = 0) => `${value > 0 ? "+" : value < 0 ? "−" : "±"}${formatNumber(Math.abs(value), digits)}`;

/** What a value does, in words and with the backend's own amounts where there are some. */
function effectOf(field: ParamField, value: number, bando: Bando, t: T): { main: string; sub?: string } {
  const params = bando.parameters;
  const summary = bando.summary;
  const scenarios = bando.recommended_bid_range?.scenarios ?? [];
  const projectNote = summary.include_project_costs ? undefined : t("params.effect.notInPrice");
  const hoursAndRate = (hoursPath: string, ratePath: string) => {
    const hours = getNumber(params, hoursPath) ?? 0;
    const rate = getNumber(params, ratePath) ?? 0;
    return t("params.effect.hours", {
      hours: formatNumber(hours, 0),
      rate: formatChf(rate),
      value: formatChf(hours * rate),
    });
  };
  switch (field.unit) {
    case "factor": {
      // Hours are divided by the site efficiency and multiplied by every other factor.
      const time = field.id === "site_efficiency" ? 1 / value : value;
      const change = (time - 1) * 100;
      if (Math.abs(change) < 0.05) return { main: t("params.effect.standardTime") };
      return {
        main: t(change > 0 ? "params.effect.moreTime" : "params.effect.lessTime", { pct: pctText(change) }),
        sub: t("params.effect.onLabour"),
      };
    }
    case "pct":
      switch (field.id) {
        case "material_waste":
          return { main: t("params.effect.onMaterial", { pct: pctText(value) }) };
        case "transport_equipment":
          return { main: `= ${formatChf(summary.transport_equipment_chf ?? 0)}`, sub: t("params.effect.onDirectOverhead") };
        case "overhead":
          return { main: `= ${formatChf(summary.overhead_chf ?? 0)}`, sub: t("params.effect.onDirect") };
        case "target_margin":
          return {
            main: t("params.effect.reference", { value: formatChf(summary.indicative_selling_price_chf) }),
            sub: t("params.effect.markup", { pct: pctText(value < 100 ? (value / (100 - value)) * 100 : 0, 2) }),
          };
        default: {
          const scenario = field.path.split(".").pop();
          const entry = scenarios.find((candidate) => candidate.scenario === scenario);
          return entry
            ? {
                main: formatChf(entry.bid_price_chf),
                sub: t("params.effect.win", { pct: `${Math.round(entry.estimated_win_probability * 100)}%` }),
              }
            : { main: "" };
        }
      }
    case "h":
      return {
        main: field.id === "engineering_hours"
          ? hoursAndRate("project_costs.engineering_hours", "project_costs.engineering_rate_chf_per_h")
          : hoursAndRate("project_costs.commissioning_hours", "project_costs.commissioning_rate_chf_per_h"),
        sub: projectNote ?? t("params.effect.weeks", { weeks: formatNumber(value / 40, 1) }),
      };
    case "chfh":
      return {
        main: field.id === "engineering_rate"
          ? hoursAndRate("project_costs.engineering_hours", "project_costs.engineering_rate_chf_per_h")
          : hoursAndRate("project_costs.commissioning_hours", "project_costs.commissioning_rate_chf_per_h"),
        sub: projectNote,
      };
    case "chf":
      if (field.id === "round_to") return { main: t("params.effect.roundTo", { value: formatChf(value) }) };
      return { main: t("params.effect.lumpSum"), sub: projectNote };
    case "prob":
      return { main: t("params.effect.winAtReference", { pct: `${Math.round(value * 100)}%` }) };
    case "pp":
      return field.id === "price_sensitivity"
        ? { main: t("params.effect.sensitivity", { pp: formatNumber(value * 100, 1) }) }
        : { main: t("params.effect.winShift", { pp: signed(value * 100, 1) }) };
  }
}

/**
 * One parameter: what it is, − value +, what the value does, and what it did
 * to the offer on this page. The steppers move the number at once and send it
 * after a short pause, so quick clicks make one request; typing saves on Enter
 * or when leaving the field. The backend re-prices the tender.
 */
function ParamRow({
  field,
  value,
  initial,
  change,
  effect,
  muted,
  onSave,
}: {
  field: ParamField;
  value: number;
  initial: number | undefined;
  change: Change | undefined;
  effect: { main: string; sub?: string };
  muted: boolean;
  onSave: (value: number) => void;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState<string | null>(null);
  const [pending, setPending] = useState<number | null>(null);
  const timer = useRef<number | null>(null);
  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);
  // The server's answer replaces the optimistic value.
  useEffect(() => setPending(null), [value]);

  const current = pending ?? value;
  const changed = initial !== undefined && current !== initial;
  const { min, max } = bounds(field);
  const label = t(`params.fields.${field.id}.label`);

  const send = (next: number) => {
    setPending(next);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => onSave(next), DEBOUNCE_MS);
  };
  const commit = () => {
    if (draft === null) return;
    const parsed = Number.parseFloat(draft.replace(",", "."));
    setDraft(null);
    if (Number.isFinite(parsed) && parsed !== current) send(clamp(field, parsed));
  };

  const delta = change ? Math.round(change.delta) : null;
  return (
    <div className={`param ${changed ? "is-changed" : ""} ${muted ? "is-muted" : ""}`}>
      <label className="param__text" htmlFor={`param-${field.id}`}>
        <span className="param__label">{label}</span>
        <span className="param__help">{t(`params.fields.${field.id}.help`)}</span>
      </label>
      <span className="param__control">
        <span className="stepper">
          <button
            type="button"
            disabled={current <= min}
            aria-label={t("params.decrease", { name: label })}
            onClick={() => send(stepValue(field, current, -1))}
          >
            <Minus size={15} />
          </button>
          <input
            id={`param-${field.id}`}
            inputMode="decimal"
            value={draft ?? String(current)}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === "Enter") commit();
              if (event.key === "Escape") setDraft(null);
            }}
          />
          <button
            type="button"
            disabled={current >= max}
            aria-label={t("params.increase", { name: label })}
            onClick={() => send(stepValue(field, current, 1))}
          >
            <Plus size={15} />
          </button>
        </span>
        <span className="param__unit">{UNIT_SUFFIX[field.unit]}</span>
      </span>
      <span className="param__effect">
        <span className="param__effect-main">{effect.main}</span>
        {effect.sub && <span className="param__effect-sub">{effect.sub}</span>}
      </span>
      <span className="param__impact">
        {changed && initial !== undefined && (
          <button
            type="button"
            className="iconbtn iconbtn--sm"
            title={t("params.reset", { name: label })}
            aria-label={t("params.reset", { name: label })}
            onClick={() => send(initial)}
          >
            <RotateCcw size={14} />
          </button>
        )}
        {delta !== null ? (
          <span
            key={`${change?.to}`}
            className={`impact ${delta > 0 ? "impact--up" : delta < 0 ? "impact--down" : "impact--zero"}`}
            title={t("params.impact.title")}
          >
            {delta === 0 ? t("params.impact.none") : `${delta > 0 ? "+" : "−"}${formatChf(Math.abs(delta))}`}
          </span>
        ) : changed && initial !== undefined ? (
          <span className="impact impact--default">{t("params.default", { value: formatNumber(initial, 4) })}</span>
        ) : (
          <span className="impact impact--same">{t("params.atDefault")}</span>
        )}
      </span>
    </div>
  );
}

/**
 * Every number the price is built with, grouped, editable in place, beside the
 * offer they make: its amount, what it is made of, and what each change on this
 * page did to it. Each change goes to the backend, which re-prices the tender.
 */
export function ParametersPage() {
  const { t } = useI18n();
  const { bando, setBando, defaults, scenario } = useTender();
  const [busy, setBusy] = useState(0);
  const [failed, setFailed] = useState(false);
  const offer = offerOf(bando, scenario);
  const [startOffer] = useState(offer);
  const [changes, setChanges] = useState<Change[]>([]);
  const [hotGroup, setHotGroup] = useState<string | null>(null);
  const [hotPart, setHotPart] = useState<string | null>(null);
  const latest = useRef(bando);
  latest.current = bando;
  const [open, setOpen] = useState<Set<string>>(() => {
    try {
      const stored = window.localStorage.getItem(OPEN_KEY);
      if (stored) return new Set(JSON.parse(stored) as string[]);
    } catch {
      /* storage unavailable: use the default */
    }
    return new Set(["productivity", "allowances", "projectCosts", "commercial"]);
  });

  const params = bando.parameters;
  const changed = changedFields(params, defaults);
  const delta = offer - startOffer;
  const includeProject = Boolean(getPath(params, INCLUDE_PROJECT_COSTS));
  const parts = priceParts(bando.summary, offer);
  const scenarioName = t(`price.scenario.${scenario}`);
  const partName = (key: string) => t(`price.col.${key}`);

  /** Send a change; when it is one value, remember what it did to the offer. */
  const patch = async (body: Record<string, unknown>, change?: Omit<Change, "delta">) => {
    setBusy((count) => count + 1);
    setFailed(false);
    try {
      const before = offerOf(latest.current, scenario);
      const next = await api.patchParameters(bando.id, body);
      const effect = offerOf(next, scenario) - before;
      setBando(next);
      if (change) {
        setChanges((list) => {
          const previous = list.find((entry) => entry.id === change.id);
          const merged: Change = previous
            ? { ...change, from: previous.from, delta: previous.delta + effect }
            : { ...change, delta: effect };
          const rest = list.filter((entry) => entry.id !== change.id);
          // Back where it started: nothing left to show.
          return merged.from === merged.to ? rest : [merged, ...rest];
        });
      }
    } catch {
      setFailed(true);
    } finally {
      setBusy((count) => count - 1);
    }
  };

  const saveField = (field: ParamField, value: number) => {
    const from = getNumber(latest.current.parameters, field.path);
    void patch(patchFor(field.path, value), { id: field.id, path: field.path, from: from ?? value, to: value });
  };

  const toggle = (key: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      try {
        window.localStorage.setItem(OPEN_KEY, JSON.stringify([...next]));
      } catch {
        /* ignore */
      }
      return next;
    });

  const resetAll = () => {
    if (!defaults) return;
    let body: Record<string, unknown> = {};
    for (const field of GROUPS.flatMap((group) => group.fields)) {
      const value = getNumber(defaults, field.path);
      if (value !== undefined) body = mergeDeep(body, patchFor(field.path, value));
    }
    body[INCLUDE_PROJECT_COSTS] = Boolean(getPath(defaults, INCLUDE_PROJECT_COSTS));
    setChanges([]);
    void patch(body);
  };

  const undo = (change: Change) => {
    if (change.id === INCLUDE_PROJECT_COSTS) {
      void patch({ [INCLUDE_PROJECT_COSTS]: change.from }, { ...change, from: change.to, to: change.from });
      return;
    }
    const field = GROUPS.flatMap((group) => group.fields).find((entry) => entry.id === change.id);
    if (field && typeof change.from === "number") saveField(field, change.from);
  };

  const changeName = (change: Change) =>
    change.id === INCLUDE_PROJECT_COSTS ? t("params.includeShort") : t(`params.fields.${change.id}.label`);
  const changeValue = (value: number | boolean) =>
    typeof value === "boolean" ? t(value ? "params.on" : "params.off") : formatNumber(value, 4);

  const marked = hotGroup ? GROUP_META[hotGroup]?.parts ?? [] : [];
  const activePart = hotPart ? parts.find((part) => part.key === hotPart) : null;

  return (
    <div className="params-page">
      <div className="params-page__scroll">
        <div className="params">
          <div className="params__main">
            <div className="params__head">
              <div>
                <h2 className="params__title">{t("params.title")}</h2>
                <p className="params__intro">{t("params.intro")}</p>
              </div>
              {changed.length > 0 && defaults && (
                <button type="button" className="btn" onClick={resetAll}>
                  <RotateCcw size={15} aria-hidden /> {t("params.resetAll", { count: changed.length })}
                </button>
              )}
            </div>
            {failed && (
              <p className="banner banner--error" role="alert">
                {t("params.error")}
              </p>
            )}
            {GROUPS.map((group) => {
              const meta = GROUP_META[group.key];
              const Icon = meta.icon;
              const isOpen = open.has(group.key);
              const fields = group.fields.filter((field) => getNumber(params, field.path) !== undefined);
              const groupChanged = fields.filter((field) => changed.includes(field.path)).length;
              const muted = group.key === "projectCosts" && !includeProject;
              return (
                <section
                  key={group.key}
                  className={`pgroup ${isOpen ? "is-open" : ""}`}
                  style={{ "--g": meta.color } as CSSProperties}
                  onMouseEnter={() => setHotGroup(group.key)}
                  onMouseLeave={() => setHotGroup(null)}
                >
                  <div className="pgroup__head">
                    <button
                      type="button"
                      className="pgroup__toggle"
                      aria-expanded={isOpen}
                      onClick={() => toggle(group.key)}
                    >
                      <span className="pgroup__icon" aria-hidden>
                        <Icon size={20} />
                      </span>
                      <span className="pgroup__text">
                        <span className="pgroup__title">
                          {t(`params.groups.${group.key}.title`)}
                          <span className="pgroup__count">{t("params.values", { count: fields.length })}</span>
                          {groupChanged > 0 && (
                            <span className="pgroup__changed">{t("tender.changed", { count: groupChanged })}</span>
                          )}
                        </span>
                        <span className="pgroup__intro">{t(`params.groups.${group.key}.intro`)}</span>
                      </span>
                      <span className="pgroup__moves" aria-label={t("params.moves")}>
                        {meta.parts
                          .filter((key) => parts.some((part) => part.key === key))
                          .map((key) => (
                            <span key={key} className="pgroup__part">
                              <span className="swatch" style={{ background: COLUMN_COLORS[key] }} aria-hidden />
                              {partName(key)}
                            </span>
                          ))}
                      </span>
                      <ChevronDown size={18} className={`pgroup__caret ${isOpen ? "is-open" : ""}`} aria-hidden />
                    </button>
                    {group.key === "projectCosts" && (
                      <label className="pgroup__switch">
                        <span>{t("params.includeShort")}</span>
                        <input
                          type="checkbox"
                          className="switch"
                          checked={includeProject}
                          onChange={(event) =>
                            void patch(
                              { [INCLUDE_PROJECT_COSTS]: event.target.checked },
                              {
                                id: INCLUDE_PROJECT_COSTS,
                                path: INCLUDE_PROJECT_COSTS,
                                from: includeProject,
                                to: event.target.checked,
                              },
                            )
                          }
                        />
                      </label>
                    )}
                  </div>
                  {isOpen && (
                    <div className="pgroup__body">
                      {muted && <p className="pgroup__note">{t("params.projectOff")}</p>}
                      {fields.map((field) => {
                        const value = getNumber(params, field.path) as number;
                        return (
                          <ParamRow
                            key={field.path}
                            field={field}
                            value={value}
                            initial={getNumber(defaults, field.path)}
                            change={changes.find((entry) => entry.id === field.id)}
                            effect={effectOf(field, value, bando, t)}
                            muted={muted}
                            onSave={(next) => saveField(field, next)}
                          />
                        );
                      })}
                    </div>
                  )}
                </section>
              );
            })}
          </div>

          <aside className="params__aside">
            <section className="pcard pcard--offer" aria-live="polite">
              <p className="pcard__kicker">
                {t("params.aside.offer")} <span className="pcard__scenario">· {scenarioName}</span>
                {busy > 0 && <Loader2 size={14} className="spin" aria-label={t("params.updating")} />}
              </p>
              <p className="pcard__price">
                <AnimatedChf value={offer} />
              </p>
              {Math.round(delta) !== 0 ? (
                <p key={Math.round(delta)} className={`pcard__delta ${delta > 0 ? "is-up" : "is-down"}`}>
                  {delta > 0 ? <TrendingUp size={15} aria-hidden /> : <TrendingDown size={15} aria-hidden />}
                  {delta > 0 ? "+" : "−"}
                  {formatChf(Math.abs(delta))}
                  <span>
                    {" "}
                    ({signed((delta / startOffer) * 100, 1)}%) {t("params.sinceOpen")}
                  </span>
                </p>
              ) : (
                <p className="pcard__delta">{t("params.aside.unchanged")}</p>
              )}
              <Link className="btn btn--primary pcard__cta" to={`/bandi/${bando.id}/price`}>
                {t("params.aside.openPrice")} <ArrowRight size={15} aria-hidden />
              </Link>
            </section>

            <section className="pcard">
              <h3 className="pcard__title">{t("params.aside.mixTitle")}</h3>
              <div className="pmix">
                <Donut
                  size={176}
                  total={offer}
                  rings={[
                    {
                      radius: 70,
                      width: 20,
                      segments: parts.map((part) => ({
                        key: part.key,
                        value: part.amount,
                        color: COLUMN_COLORS[part.key],
                        label: `${partName(part.key)}: ${formatChf(part.amount)}`,
                      })),
                    },
                  ]}
                  active={hotPart}
                  marked={marked}
                  onActive={setHotPart}
                  label={t("params.aside.mixTitle")}
                >
                  {activePart ? (
                    <>
                      <span className="donut__pct">{formatNumber((activePart.amount / offer) * 100, 1)}%</span>
                      <span className="donut__sub">{partName(activePart.key)}</span>
                    </>
                  ) : (
                    <>
                      <span className="donut__pct">{formatCompact(offer)}</span>
                      <span className="donut__sub">{t("price.col.offer")} · CHF</span>
                    </>
                  )}
                </Donut>
                <ul className="pmix__list">
                  {parts.map((part) => {
                    const lit = hotPart === part.key || marked.includes(part.key);
                    return (
                      <li
                        key={part.key}
                        className={`${lit ? "is-lit" : ""} ${(hotPart || marked.length) && !lit ? "is-dim" : ""}`}
                        onMouseEnter={() => setHotPart(part.key)}
                        onMouseLeave={() => setHotPart(null)}
                      >
                        <span className="swatch" style={{ background: COLUMN_COLORS[part.key] }} aria-hidden />
                        <span className="pmix__name">{partName(part.key)}</span>
                        <span className="pmix__num">{formatChf(part.amount)}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </section>

            <section className="pcard">
              <h3 className="pcard__title">
                <History size={15} aria-hidden /> {t("params.aside.changesTitle")}
              </h3>
              {changes.length === 0 ? (
                <p className="pcard__empty">{t("params.aside.changesEmpty")}</p>
              ) : (
                <ul className="pchanges">
                  {changes.map((change) => {
                    const amount = Math.round(change.delta);
                    return (
                      <li key={change.id}>
                        <span className="pchanges__text">
                          <span className="pchanges__name">{changeName(change)}</span>
                          <span className="pchanges__values">
                            {changeValue(change.from)} → {changeValue(change.to)}
                          </span>
                        </span>
                        <span
                          className={`impact ${amount > 0 ? "impact--up" : amount < 0 ? "impact--down" : "impact--zero"}`}
                        >
                          {amount === 0 ? "±0" : `${amount > 0 ? "+" : "−"}${formatChf(Math.abs(amount))}`}
                        </span>
                        <button
                          type="button"
                          className="iconbtn iconbtn--sm"
                          title={t("params.aside.undo", { name: changeName(change) })}
                          aria-label={t("params.aside.undo", { name: changeName(change) })}
                          onClick={() => undo(change)}
                        >
                          <Undo2 size={14} />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}

function mergeDeep(base: Record<string, unknown>, patch: unknown): Record<string, unknown> {
  if (!patch || typeof patch !== "object") return base;
  const out = { ...base };
  for (const [key, value] of Object.entries(patch as Record<string, unknown>)) {
    out[key] =
      value && typeof value === "object" && out[key] && typeof out[key] === "object"
        ? mergeDeep(out[key] as Record<string, unknown>, value)
        : value;
  }
  return out;
}
