import type { Item } from "../api/types";
import { FLAG_LABELS, STATUS_LABELS, itemNeedsAttention } from "../lib/flags";

export function ReviewPanel({
  items,
  selectedId,
  onSelect,
}: {
  items: Item[];
  selectedId: string | null;
  onSelect: (lvId: string) => void;
}) {
  const flagged = items.filter((item) => itemNeedsAttention(item.status, item.flags));

  return (
    <section className="card review">
      <header className="review__head">
        <h3>Da rivedere</h3>
        <span className={`count ${flagged.length ? "count--warn" : "count--ok"}`}>
          {flagged.length}
        </span>
      </header>
      {flagged.length === 0 ? (
        <p className="review__empty">
          Tutto chiaro: nessuna posizione incerta o incompleta. Il preventivo è
          pronto.
        </p>
      ) : (
        <>
          <p className="review__hint">
            Queste posizioni non sono state capite fino in fondo. Seleziona una
            riga per correggerla: nulla di incerto finisce nel prezzo senza che tu
            lo veda.
          </p>
          <ul className="review__list">
            {flagged.map((item) => (
              <li key={item.lv_id}>
                <button
                  type="button"
                  className={`review__row ${selectedId === item.lv_id ? "is-selected" : ""}`}
                  onClick={() => onSelect(item.lv_id)}
                >
                  <span className="review__id">{item.lv_id}</span>
                  <span className="review__desc">
                    {item.description_raw ?? item.description_normalized ?? "Senza descrizione"}
                  </span>
                  <span className="review__tags">
                    <span className="pill pill--soft">{STATUS_LABELS[item.status]}</span>
                    {item.flags.map((flag) => (
                      <span key={flag} className="tag tag--warn">
                        {FLAG_LABELS[flag]}
                      </span>
                    ))}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
