import type { Overview } from "../api/types";

export function OverviewPanel({ overview }: { overview: Overview | null }) {
  if (!overview) return null;
  const engine = overview.engine === "luna" ? "Letta da Luna sull'intero documento" : "Sintesi deterministica";
  return (
    <section className="section overview">
      <header className="section__head">
        <h2>Panoramica del progetto</h2>
        <span className="section__hint">{engine}</span>
      </header>
      {overview.summary && <p className="overview__summary">{overview.summary}</p>}
      <div className="overview__cols">
        <div className="overview__col">
          <h3>Materiali necessari</h3>
          {overview.materials_needed.length ? (
            <div className="chips">
              {overview.materials_needed.map((value) => (
                <span key={value} className="chip chip--soft">
                  {value}
                </span>
              ))}
            </div>
          ) : (
            <p className="muted">—</p>
          )}
        </div>
        <div className="overview__col">
          <h3>Forza lavoro necessaria</h3>
          {overview.labour_needed.length ? (
            <div className="chips">
              {overview.labour_needed.map((value) => (
                <span key={value} className="chip chip--soft">
                  {value}
                </span>
              ))}
            </div>
          ) : (
            <p className="muted">—</p>
          )}
        </div>
      </div>
    </section>
  );
}
