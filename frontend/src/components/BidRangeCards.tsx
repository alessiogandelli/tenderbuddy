import type { BidRange } from "../api/types";
import { formatChf, formatPercent } from "../lib/format";
import { Term } from "./Term";

const TONE: Record<string, string> = {
  Aggressive: "tone--aggressive",
  Target: "tone--target",
  Conservative: "tone--conservative",
};

const HINT: Record<string, string> = {
  Aggressive: "Prezzo più basso, probabilità di vincere più alta.",
  Target: "Equilibrio fra margine e probabilità.",
  Conservative: "Margine più alto, probabilità più bassa.",
};

export function BidRangeCards({ range }: { range: BidRange | null }) {
  if (!range) return null;
  return (
    <section className="card bidrange">
      <header className="bidrange__head">
        <h3>
          <Term>Fascia di offerta</Term>
        </h3>
        <p className="caption">
          Tre scenari per decidere l'offerta. Il contributo atteso è il guadagno
          probabile, non solo il prezzo.
        </p>
      </header>
      <div className="bidrange__grid">
        {range.scenarios.map((scenario) => (
          <article key={scenario.scenario} className={`tone ${TONE[scenario.scenario] ?? ""}`}>
            <h4>{scenario.scenario}</h4>
            <p className="tone__hint">{HINT[scenario.scenario]}</p>
            <p className="tone__price">{formatChf(scenario.bid_price_chf)}</p>
            <dl className="tone__facts">
              <div>
                <dt>Margine</dt>
                <dd>{scenario.margin_pct}%</dd>
              </div>
              <div>
                <dt>Prob. di vincere</dt>
                <dd>{formatPercent(scenario.estimated_win_probability)}</dd>
              </div>
              <div>
                <dt>Contributo atteso</dt>
                <dd>{formatChf(scenario.expected_contribution_chf)}</dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
      <p className="caption">{range.selection_logic}</p>
    </section>
  );
}
