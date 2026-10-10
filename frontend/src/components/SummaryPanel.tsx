import type { Summary } from "../api/types";
import { formatChf } from "../lib/format";
import { Term } from "./Term";

const PROJECT_COST_LABELS: Record<string, string> = {
  engineering_hours: "Ore engineering",
  engineering_rate_chf_per_h: "Tariffa engineering",
  commissioning_hours: "Ore commissioning",
  commissioning_rate_chf_per_h: "Tariffa commissioning",
  hygiene_inspection_chf: "Ispezione igiene",
  documentation_chf: "Documentazione",
};

export function SummaryPanel({
  summary,
  marginPct,
  projectCosts,
}: {
  summary: Summary;
  marginPct: number;
  projectCosts?: Record<string, number> | null;
}) {
  const rows: [string, number][] = [
    ["Materiale", summary.material_cost_chf],
    ["Manodopera", summary.labour_cost_chf],
    ["Costo diretto", summary.direct_cost_chf],
    ["Cost Baseline", summary.cost_baseline_chf],
  ];
  return (
    <section className="card summary">
      <h3>Preventivo del progetto</h3>
      <dl className="summary__list">
        {rows.map(([label, value]) => (
          <div key={label} className="summary__row">
            <dt>{label === "Cost Baseline" ? <Term>Cost Baseline</Term> : label}</dt>
            <dd>{formatChf(value, true)}</dd>
          </div>
        ))}
      </dl>
      <div className="summary__price">
        <span>
          <Term>Prezzo indicativo</Term> · margine {marginPct}%
        </span>
        <strong>{formatChf(summary.indicative_selling_price_chf)}</strong>
      </div>
      {projectCosts && (
        <details className="summary__extra">
          <summary>Costi di progetto (esclusi dal Cost Baseline)</summary>
          <ul>
            {Object.entries(projectCosts).map(([key, value]) => (
              <li key={key}>
                <span>{PROJECT_COST_LABELS[key] ?? key}</span>
                <b>{formatChf(value, true)}</b>
              </li>
            ))}
          </ul>
        </details>
      )}
      <p className="caption">
        Il Cost Baseline include overhead e trasporto/equipaggiamento. I costi di
        progetto qui sopra sono informativi e non entrano nel numero di testa.
      </p>
    </section>
  );
}
