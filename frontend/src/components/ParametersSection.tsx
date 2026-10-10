import { useEffect, useState } from "react";
import type { BidRange, ProjectParameters, Summary } from "../api/types";
import { formatChf, formatPercent } from "../lib/format";

const FACTOR_LABELS: Record<string, string> = {
  site_efficiency: "Efficienza di cantiere",
  school_logistics: "Logistica scuola",
  mounting_height_school: "Altezza montaggio scuola",
  mounting_height_sports_hall: "Altezza montaggio palestra",
  timber_interface: "Interfaccia legno",
};

const ALLOWANCE_LABELS: Record<string, string> = {
  material_waste_pct: "Scarto materiale",
  small_material_pct: "Piccoli materiali",
  transport_equipment_pct: "Trasporto e attrezzature",
  supplier_package_contingency_pct: "Contingenza pacchetti fornitore",
};

const PROJECT_COST_LABELS: Record<string, string> = {
  engineering_hours: "Ingegneria — ore",
  engineering_rate_chf_per_h: "Ingegneria — tariffa",
  commissioning_hours: "Collaudo — ore",
  commissioning_rate_chf_per_h: "Collaudo — tariffa",
  hygiene_inspection_chf: "Ispezione igiene",
  documentation_chf: "Documentazione",
};

function NumberField({
  label,
  value,
  suffix,
  onCommit,
}: {
  label: string;
  value: number;
  suffix?: string;
  onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value ?? ""));
  useEffect(() => setDraft(String(value ?? "")), [value]);

  const commit = () => {
    const parsed = Number.parseFloat(draft.replace(",", "."));
    if (Number.isFinite(parsed) && parsed !== value) onCommit(parsed);
    else setDraft(String(value ?? ""));
  };

  return (
    <label className="pfield">
      <span className="pfield__label">{label}</span>
      <span className="pfield__input">
        <input
          value={draft}
          inputMode="decimal"
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") (event.target as HTMLInputElement).blur();
            if (event.key === "Escape") setDraft(String(value ?? ""));
          }}
        />
        {suffix && <em>{suffix}</em>}
      </span>
    </label>
  );
}

function Waterfall({ summary }: { summary: Summary }) {
  const lines: [string, number, boolean][] = [
    ["Materiali", summary.material_cost_chf, false],
    ["Manodopera", summary.labour_cost_chf, false],
  ];
  if (summary.include_project_costs) {
    lines.push(["Costi di progetto", summary.project_costs_chf, false]);
  }
  return (
    <ul className="waterfall">
      {lines.map(([label, value]) => (
        <li key={label}>
          <span>{label}</span>
          <span>{formatChf(value)}</span>
        </li>
      ))}
      <li className="waterfall__sum">
        <span>Costo diretto</span>
        <span>{formatChf(summary.direct_cost_chf)}</span>
      </li>
      <li className="waterfall__muted">
        <span>Cost Baseline (overhead + trasporto)</span>
        <span>{formatChf(summary.cost_baseline_chf)}</span>
      </li>
      <li className="waterfall__sum waterfall__sum--price">
        <span>Prezzo indicativo</span>
        <span>{formatChf(summary.indicative_selling_price_chf)}</span>
      </li>
    </ul>
  );
}

function Scenarios({ range }: { range: BidRange | null }) {
  if (!range?.scenarios?.length) return null;
  return (
    <div className="scenarios">
      {range.scenarios.map((scenario) => (
        <div key={scenario.scenario} className={`scenario scenario--${scenario.scenario.toLowerCase()}`}>
          <span className="scenario__name">{scenario.scenario}</span>
          <span className="scenario__price">{formatChf(scenario.bid_price_chf)}</span>
          <span className="scenario__meta">
            margine {scenario.margin_pct.toFixed(1)}% · win{" "}
            {formatPercent(scenario.estimated_win_probability)}
          </span>
        </div>
      ))}
    </div>
  );
}

export function ParametersSection({
  parameters,
  summary,
  range,
  onPatch,
}: {
  parameters: ProjectParameters | null;
  summary: Summary;
  range: BidRange | null;
  onPatch: (partial: Record<string, unknown>) => void;
}) {
  if (!parameters) return null;
  const factors = parameters.productivity_factors ?? {};
  const allowances = parameters.allowances ?? {};
  const projectCosts = parameters.project_costs ?? {};
  const commercial = parameters.commercial;
  const scenarioMargins = parameters.stretch_bid_optimization?.scenario_margins_pct ?? {};

  return (
    <section className="section section--params">
      <header className="section__head">
        <div>
          <h2>Margini e altri parametri</h2>
          <span className="section__hint">
            Ogni modifica ricalcola il preventivo: il prezzo in alto si aggiorna.
          </span>
        </div>
      </header>

      <div className="params__groups">
        <div className="params__group">
          <h3 className="params__group-title">
            Dal bando / profilo di prezzatura <small>fissati dal progetto</small>
          </h3>
          <div className="params__grid">
            {Object.entries(factors).map(([key, value]) => (
              <NumberField
                key={key}
                label={FACTOR_LABELS[key] ?? key}
                value={value}
                suffix="×"
                onCommit={(next) => onPatch({ productivity_factors: { [key]: next } })}
              />
            ))}
            {Object.entries(allowances).map(([key, value]) => (
              <NumberField
                key={key}
                label={ALLOWANCE_LABELS[key] ?? key}
                value={value}
                suffix="%"
                onCommit={(next) => onPatch({ allowances: { [key]: next } })}
              />
            ))}
            {Object.entries(projectCosts).map(([key, value]) => (
              <NumberField
                key={key}
                label={PROJECT_COST_LABELS[key] ?? key}
                value={value}
                suffix={key.endsWith("_chf") || key.endsWith("_chf_per_h") ? "CHF" : ""}
                onCommit={(next) => onPatch({ project_costs: { [key]: next } })}
              />
            ))}
          </div>
          <label className="switch switch--inline">
            <input
              type="checkbox"
              checked={summary.include_project_costs}
              onChange={() => onPatch({ include_project_costs: !summary.include_project_costs })}
            />
            Includi i costi di progetto nel prezzo
          </label>
        </div>

        <div className="params__group">
          <h3 className="params__group-title">
            Decisi dal preventivatore <small>scelte commerciali</small>
          </h3>
          <div className="params__grid">
            <NumberField
              label="Overhead"
              value={commercial.overhead_pct}
              suffix="%"
              onCommit={(next) => onPatch({ commercial: { overhead_pct: next } })}
            />
            <NumberField
              label="Margine target"
              value={commercial.target_margin_pct}
              suffix="%"
              onCommit={(next) => onPatch({ commercial: { target_margin_pct: next } })}
            />
            <NumberField
              label="Arrotondamento offerta"
              value={commercial.round_to_chf}
              suffix="CHF"
              onCommit={(next) => onPatch({ commercial: { round_to_chf: next } })}
            />
            {Object.entries(scenarioMargins).map(([name, value]) => (
              <NumberField
                key={name}
                label={`Margine ${name}`}
                value={value}
                suffix="%"
                onCommit={(next) =>
                  onPatch({
                    stretch_bid_optimization: { scenario_margins_pct: { [name]: next } },
                  })
                }
              />
            ))}
          </div>
          <Scenarios range={range} />
        </div>
      </div>

      <Waterfall summary={summary} />
    </section>
  );
}
