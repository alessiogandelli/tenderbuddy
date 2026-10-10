import type { BidRange, Summary, Usage } from "../api/types";
import { formatChf } from "../lib/format";

function Cost({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className={`cost ${strong ? "cost--strong" : ""}`}>
      <span className="cost__label">{label}</span>
      <span className="cost__value">{formatChf(value)}</span>
    </div>
  );
}

function UsageBadge({ usage }: { usage: Usage }) {
  return (
    <span
      className="usage"
      title={`${usage.calls} chiamate · p50 ${Math.round(usage.p50_ms)}ms · p95 ${Math.round(usage.p95_ms)}ms · ${usage.input_tokens} token in`}
    >
      <span className="usage__spark" aria-hidden />
      {usage.cost_usd.toFixed(3)} $ · {usage.calls} call
      {usage.escalation_calls > 0 ? ` · ${usage.escalation_calls} escal.` : ""}
    </span>
  );
}

export function SummaryBar({
  summary,
  range,
  usage,
}: {
  summary: Summary;
  range: BidRange | null;
  usage: Usage | null;
}) {
  return (
    <div className="summarybar">
      <div className="summarybar__costs">
        <Cost label="Materiale" value={summary.material_cost_chf} />
        <Cost label="Manodopera" value={summary.labour_cost_chf} />
        <Cost label="Costi diretti" value={summary.direct_cost_chf} />
        <Cost label="Cost Baseline" value={summary.cost_baseline_chf} strong />
      </div>

      <div className="summarybar__bids">
        {(range?.scenarios ?? []).map((scenario) => (
          <div
            key={scenario.scenario}
            className={`bidchip bidchip--${scenario.scenario.toLowerCase()}`}
          >
            <span className="bidchip__name">{scenario.scenario}</span>
            <span className="bidchip__price">{formatChf(scenario.bid_price_chf)}</span>
            <span className="bidchip__meta">
              {scenario.margin_pct.toFixed(1)}% ·{" "}
              {Math.round(scenario.estimated_win_probability * 100)}% win
            </span>
          </div>
        ))}
      </div>

      {usage && <UsageBadge usage={usage} />}
    </div>
  );
}
