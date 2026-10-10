import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ChevronDown, Minus, Plus, RotateCcw } from "lucide-react";
import { api } from "../api/client";
import { AnimatedChf } from "../components/AnimatedChf";
import { formatChf, formatNumber } from "../lib/format";
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
import { useI18n } from "../i18n";
import { useTender } from "./tenderContext";

const DEBOUNCE_MS = 400;
const OPEN_KEY = "tenderbuddy.params.open";

/**
 * One parameter: − value +. The steppers move the number at once and send it
 * after a short pause, so quick clicks make one request; typing saves on Enter
 * or when leaving the field. The backend re-prices the tender.
 */
function ParamRow({
  field,
  value,
  initial,
  onSave,
}: {
  field: ParamField;
  value: number;
  initial: number | undefined;
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

  return (
    <div className={`param ${changed ? "is-changed" : ""}`}>
      <label className="param__text" htmlFor={`param-${field.id}`}>
        <span className="param__label">{label}</span>
        <span className="param__help">
          {t(`params.fields.${field.id}.help`)}
          {changed && initial !== undefined && (
            <span className="param__was"> · {t("params.was", { value: formatNumber(initial, 4) })}</span>
          )}
        </span>
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
        {changed && initial !== undefined ? (
          <button
            type="button"
            className="iconbtn iconbtn--sm"
            title={t("params.reset", { name: label })}
            aria-label={t("params.reset", { name: label })}
            onClick={() => send(initial)}
          >
            <RotateCcw size={14} />
          </button>
        ) : (
          <span className="param__spacer" />
        )}
      </span>
    </div>
  );
}

/**
 * Every number the price is built with, grouped, editable in place. Each change
 * goes to the backend, which re-prices the whole tender.
 */
export function ParametersPage() {
  const { t } = useI18n();
  const { bando, setBando, defaults } = useTender();
  const [busy, setBusy] = useState(0);
  const [failed, setFailed] = useState(false);
  const [startPrice] = useState(bando.summary.indicative_selling_price_chf);
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
  const price = bando.summary.indicative_selling_price_chf;
  const delta = price - startPrice;
  const includeProject = Boolean(getPath(params, INCLUDE_PROJECT_COSTS));

  const patch = async (body: Record<string, unknown>) => {
    setBusy((count) => count + 1);
    setFailed(false);
    try {
      setBando(await api.patchParameters(bando.id, body));
    } catch {
      setFailed(true);
    } finally {
      setBusy((count) => count - 1);
    }
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
    void patch(body);
  };

  return (
    <div className="params-page">
      <div className="params-page__scroll">
        <div className="params">
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
            const isOpen = open.has(group.key);
            const fields = group.fields.filter((field) => getNumber(params, field.path) !== undefined);
            const groupChanged = fields.filter((field) => changed.includes(field.path)).length;
            return (
              <section key={group.key} className="pgroup">
                <button
                  type="button"
                  className="pgroup__head"
                  aria-expanded={isOpen}
                  onClick={() => toggle(group.key)}
                >
                  <ChevronDown size={18} className={`pgroup__caret ${isOpen ? "is-open" : ""}`} aria-hidden />
                  <span className="pgroup__text">
                    <span className="pgroup__title">{t(`params.groups.${group.key}.title`)}</span>
                    <span className="pgroup__intro">{t(`params.groups.${group.key}.intro`)}</span>
                  </span>
                  {groupChanged > 0 && (
                    <span className="tabs__badge">{t("tender.changed", { count: groupChanged })}</span>
                  )}
                  <span className="pgroup__count">{t("params.values", { count: fields.length })}</span>
                </button>
                {isOpen && (
                  <div className="pgroup__body">
                    {group.key === "projectCosts" && (
                      <label className="switch-row">
                        <span className="param__text">
                          <span className="param__label">{t("params.includeProject")}</span>
                          <span className="param__help">{t("params.includeProjectHelp")}</span>
                        </span>
                        <input
                          type="checkbox"
                          className="switch"
                          checked={includeProject}
                          onChange={(event) =>
                            void patch({ [INCLUDE_PROJECT_COSTS]: event.target.checked })
                          }
                        />
                      </label>
                    )}
                    {fields.map((field) => (
                      <ParamRow
                        key={field.path}
                        field={field}
                        value={getNumber(params, field.path) as number}
                        initial={getNumber(defaults, field.path)}
                        onSave={(value) => void patch(patchFor(field.path, value))}
                      />
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </div>
      <footer className="nextbar">
        <span className="nextbar__text">
          <span className="muted">{t("params.finalPrice")}</span>
          <strong className="nextbar__price">
            <AnimatedChf value={price} />
          </strong>
          {Math.round(delta) !== 0 && (
            <span className={`nextbar__delta ${delta > 0 ? "is-up" : "is-down"}`}>
              {delta > 0 ? "+" : "−"}
              {formatChf(Math.abs(delta))} {t("params.sinceOpen")}
            </span>
          )}
          {busy > 0 && <span className="muted">{t("params.updating")}</span>}
        </span>
        <Link className="btn btn--primary" to={`/bandi/${bando.id}/price`}>
          {t("params.continue")} <ArrowRight size={16} aria-hidden />
        </Link>
      </footer>
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
