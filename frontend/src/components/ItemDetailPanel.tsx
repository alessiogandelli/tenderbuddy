import type { Item, PositionResult, Product, ProjectParameters } from "../api/types";
import { formatChf, formatNumber } from "../lib/format";
import { FLAG_LABELS, STATUS_LABELS } from "../lib/flags";

// "Because this price": the catalog product an item was matched to and the
// parameters that built the number. Opens when a row or a PDF box is selected.
export function ItemDetailPanel({
  item,
  result,
  product,
  parameters,
  onClose,
}: {
  item: Item;
  result: PositionResult | undefined;
  product: Product | undefined;
  parameters: ProjectParameters | null;
  onClose: () => void;
}) {
  const waste = parameters?.allowances?.material_waste_pct;
  const overhead = parameters?.commercial?.overhead_pct;
  const margin = parameters?.commercial?.target_margin_pct;
  const factors = parameters?.productivity_factors ?? {};

  return (
    <aside className="detail" aria-label={`Dettaglio posizione ${item.lv_id}`}>
      <header className="detail__head">
        <div>
          <span className="detail__id">{item.lv_id}</span>
          <span className={`detail__status detail__status--${item.status}`}>
            {STATUS_LABELS[item.status]}
          </span>
        </div>
        <button type="button" className="btn btn--icon" aria-label="Chiudi" onClick={onClose}>
          ✕
        </button>
      </header>

      <p className="detail__desc">
        {item.description_normalized ?? item.description_raw ?? "Senza descrizione"}
      </p>
      <p className="detail__meta">
        {formatNumber(item.quantity)} {item.unit ?? "?"}
        {item.source_page ? ` · pagina ${item.source_page}` : ""}
      </p>

      <section className="detail__block">
        <h4>Match catalogo</h4>
        {item.match ? (
          <>
            <div className="detail__row">
              <span>Prodotto</span>
              <span>
                {item.match.product_id}
                {product?.description ? ` · ${product.description}` : ""}
              </span>
            </div>
            <div className="detail__row">
              <span>Install code</span>
              <span>{item.match.install_code ?? "—"}</span>
            </div>
            <div className="detail__row">
              <span>Confidenza</span>
              <span>{formatNumber(item.match.confidence, 2)}</span>
            </div>
          </>
        ) : (
          <p className="detail__empty">Nessun prodotto: la posizione va prezzata a mano.</p>
        )}
      </section>

      {result && (
        <section className="detail__block">
          <h4>Materiale</h4>
          <div className="detail__row">
            <span>Costo netto unitario</span>
            <span>{formatChf(result.net_unit_cost_chf, true)}</span>
          </div>
          <div className="detail__row">
            <span>Scarto applicato</span>
            <span>{percent(waste)}</span>
          </div>
          <div className="detail__row detail__row--total">
            <span>Costo materiale</span>
            <span>{formatChf(result.material_cost_chf, true)}</span>
          </div>
        </section>
      )}

      {result && (
        <section className="detail__block">
          <h4>Manodopera</h4>
          <div className="detail__row">
            <span>Ore base / unità</span>
            <span>{formatNumber(result.base_hours_per_unit, 2)} h</span>
          </div>
          <div className="detail__row">
            <span>Fattori progetto</span>
            <span>{factorList(factors)}</span>
          </div>
          <div className="detail__row">
            <span>Ore totali</span>
            <span>{formatNumber(result.adjusted_install_hours, 2)} h</span>
          </div>
          <div className="detail__row">
            <span>Tariffa oraria</span>
            <span>{formatChf(result.hourly_rate_chf, true)}/h</span>
          </div>
          <div className="detail__row detail__row--total">
            <span>Costo manodopera</span>
            <span>{formatChf(result.labour_cost_chf, true)}</span>
          </div>
        </section>
      )}

      {result && (
        <section className="detail__block">
          <h4>Costo diretto</h4>
          <div className="detail__row detail__row--total">
            <span>Costo diretto posizione</span>
            <span>{formatChf(result.direct_position_cost_chf, true)}</span>
          </div>
          <p className="detail__note">
            Sopra: overhead {percent(overhead)} e margine target {percent(margin)} si applicano a
            livello di bando, non per posizione.
          </p>
        </section>
      )}

      {item.flags.length > 0 && (
        <section className="detail__block">
          <h4>Da rivedere</h4>
          <ul className="detail__flags">
            {item.flags.map((flag) => (
              <li key={flag}>{FLAG_LABELS[flag]}</li>
            ))}
          </ul>
        </section>
      )}
    </aside>
  );
}

function percent(value: number | undefined): string {
  return value === undefined ? "—" : `${value}%`;
}

function factorList(factors: Record<string, number>): string {
  const entries = Object.entries(factors).filter(([key]) => key !== "site_efficiency");
  const label = "1/" + (factors.site_efficiency ?? "?") + " efficienza";
  return [label, ...entries.map(([key, value]) => `${key} ${value}`)].join(" · ");
}
