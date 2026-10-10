import { useMemo, useState } from "react";
import type { Item, PositionResult } from "../api/types";
import { formatChf, formatNumber } from "../lib/format";
import { FLAG_LABELS, STATUS_LABELS, itemNeedsAttention } from "../lib/flags";
import { StatusPill } from "./StatusPill";

type SortKey = "lv_id" | "quantity" | "direct";

export function ItemTable({
  items,
  positions,
  selectedId,
  onSelect,
  onOpenPage,
}: {
  items: Item[];
  positions: PositionResult[];
  selectedId: string | null;
  onSelect: (lvId: string) => void;
  onOpenPage: (page: number) => void;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("lv_id");
  const [filter, setFilter] = useState<string>("all");

  const byId = useMemo(
    () => new Map(positions.map((result) => [result.lv_id, result])),
    [positions],
  );

  const rows = useMemo(() => {
    const filtered = items.filter((item) => {
      if (filter === "all") return true;
      if (filter === "attention") return itemNeedsAttention(item.status, item.flags);
      return item.status === filter;
    });
    const sorted = [...filtered];
    sorted.sort((a, b) => {
      if (sortKey === "quantity") return (b.quantity ?? 0) - (a.quantity ?? 0);
      if (sortKey === "direct") {
        const da = byId.get(a.lv_id)?.direct_position_cost_chf ?? 0;
        const db = byId.get(b.lv_id)?.direct_position_cost_chf ?? 0;
        return db - da;
      }
      return a.lv_id.localeCompare(b.lv_id);
    });
    return sorted;
  }, [items, filter, sortKey, byId]);

  return (
    <section className="card table-card">
      <header className="table-card__head">
        <h3>Posizioni ({rows.length})</h3>
        <div className="table-card__controls">
          <label>
            Filtra
            <select value={filter} onChange={(event) => setFilter(event.target.value)}>
              <option value="all">Tutte</option>
              <option value="attention">Da rivedere</option>
              <option value="calculated">{STATUS_LABELS.calculated}</option>
              <option value="supplier_quote_required">
                {STATUS_LABELS.supplier_quote_required}
              </option>
              <option value="insufficient_information">
                {STATUS_LABELS.insufficient_information}
              </option>
            </select>
          </label>
          <label>
            Ordina
            <select
              value={sortKey}
              onChange={(event) => setSortKey(event.target.value as SortKey)}
            >
              <option value="lv_id">Posizione</option>
              <option value="quantity">Quantità</option>
              <option value="direct">Costo diretto</option>
            </select>
          </label>
        </div>
      </header>
      <div className="table-scroll">
        <table className="items">
          <thead>
            <tr>
              <th>Pos.</th>
              <th>Descrizione</th>
              <th className="num">Qtà</th>
              <th>Unità</th>
              <th>Prodotto</th>
              <th className="num">Materiale</th>
              <th className="num">Manodopera</th>
              <th className="num">Diretto</th>
              <th>Stato</th>
              <th>Pagina</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((item) => {
              const result = byId.get(item.lv_id);
              const attention = itemNeedsAttention(item.status, item.flags);
              return (
                <tr
                  key={item.lv_id}
                  className={`${selectedId === item.lv_id ? "is-selected" : ""} ${
                    attention ? "is-attention" : ""
                  }`}
                  onClick={() => onSelect(item.lv_id)}
                >
                  <td className="mono">{item.lv_id}</td>
                  <td>
                    <span className="cell-desc">
                      {item.description_normalized ??
                        item.description_raw ??
                        "Senza descrizione"}
                    </span>
                    {item.flags.length > 0 && (
                      <span className="cell-flags">
                        {item.flags.map((flag) => (
                          <span key={flag} className="tag tag--warn">
                            {FLAG_LABELS[flag]}
                          </span>
                        ))}
                      </span>
                    )}
                  </td>
                  <td className="num">{formatNumber(item.quantity)}</td>
                  <td>{item.unit ?? "—"}</td>
                  <td className="mono">{item.match?.product_id ?? "—"}</td>
                  <td className="num">
                    {formatChf(result?.material_cost_chf, true)}
                  </td>
                  <td className="num">{formatChf(result?.labour_cost_chf, true)}</td>
                  <td className="num strong">
                    {formatChf(result?.direct_position_cost_chf, true)}
                  </td>
                  <td>
                    <StatusPill status={item.status} />
                  </td>
                  <td>
                    {item.source_page ? (
                      <button
                        type="button"
                        className="page-link"
                        onClick={(event) => {
                          event.stopPropagation();
                          onOpenPage(item.source_page as number);
                        }}
                      >
                        p. {item.source_page}
                      </button>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
