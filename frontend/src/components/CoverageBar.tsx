import type { Coverage } from "../api/types";
import { STATUS_LABELS } from "../lib/flags";

const ORDER = [
  "calculated",
  "supplier_quote_required",
  "review_required",
  "insufficient_information",
  "assumption_applied",
  "out_of_scope",
  "non_priceable",
] as const;

export function CoverageBar({ coverage, total }: { coverage: Coverage; total: number }) {
  return (
    <div className="coverage">
      <div className="coverage__bar" role="img" aria-label="Copertura del preventivo">
        {ORDER.map((status) =>
          coverage[status] > 0 ? (
            <span
              key={status}
              className={`coverage__seg coverage__seg--${status}`}
              style={{ flexGrow: coverage[status] }}
              title={`${STATUS_LABELS[status]}: ${coverage[status]}`}
            />
          ) : null,
        )}
      </div>
      <ul className="coverage__legend">
        {ORDER.map((status) => (
          <li key={status}>
            <span className={`dot dot--${status}`} aria-hidden />
            {STATUS_LABELS[status]}
            <b>{coverage[status]}</b>
            <span className="muted">/ {total}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
