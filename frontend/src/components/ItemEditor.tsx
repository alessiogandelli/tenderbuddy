import { useState } from "react";
import type { Item, ItemStatus, Product, Unit } from "../api/types";
import { STATUS_LABELS } from "../lib/flags";

const UNITS: Unit[] = ["pc", "m", "m2", "h", "LS", "system"];
const STATUSES: ItemStatus[] = [
  "calculated",
  "supplier_quote_required",
  "review_required",
  "insufficient_information",
];

export function ItemEditor({
  item,
  products,
  onSave,
  onClose,
}: {
  item: Item | null;
  products: Product[];
  onSave: (item: Partial<Item>) => void;
  onClose: () => void;
}) {
  const [description, setDescription] = useState(item?.description_raw ?? "");
  const [quantity, setQuantity] = useState(
    item?.quantity !== null && item?.quantity !== undefined ? String(item.quantity) : "",
  );
  const [unit, setUnit] = useState<Unit>(item?.unit ?? "pc");
  const [productId, setProductId] = useState(item?.match?.product_id ?? "");
  const [status, setStatus] = useState<ItemStatus>(item?.status ?? "review_required");

  const product = products.find((candidate) => candidate.product_id === productId);

  const submit = () => {
    const next: Partial<Item> = {
      lv_id: item?.lv_id,
      description_raw: description || null,
      description_normalized: description || null,
      quantity: quantity === "" ? null : Number(quantity.replace(",", ".")),
      unit,
      status,
      flags: item?.flags ?? [],
      match: productId
        ? {
            product_id: productId,
            install_code: product?.install_code ?? null,
            confidence: 0.9,
            price_source: product?.supplier_quote_required ? "supplier_package" : "catalog",
          }
        : null,
    };
    onSave(next);
  };

  return (
    <div className="modal" role="dialog" aria-modal="true">
      <div className="modal__panel">
        <header className="modal__head">
          <h3>{item ? `Modifica ${item.lv_id}` : "Nuova posizione"}</h3>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Chiudi
          </button>
        </header>
        <div className="form">
          <label className="field">
            <span>Descrizione</span>
            <input
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="es. Valvola di mandata DN100"
            />
          </label>
          <div className="field-row">
            <label className="field">
              <span>Quantità</span>
              <input
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
                inputMode="decimal"
                placeholder="5"
              />
            </label>
            <label className="field">
              <span>Unità</span>
              <select value={unit} onChange={(event) => setUnit(event.target.value as Unit)}>
                {UNITS.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="field">
            <span>Prodotto dal Catalogo</span>
            <select value={productId} onChange={(event) => setProductId(event.target.value)}>
              <option value="">— nessuno (resta da rivedere) —</option>
              {products.map((candidate) => (
                <option key={candidate.product_id} value={candidate.product_id}>
                  {candidate.product_id} · {candidate.description}
                </option>
              ))}
            </select>
          </label>
          {product && (
            <p className="caption">
              Install code <b>{product.install_code}</b> · costo netto{" "}
              <b>{product.net_cost_chf} CHF</b>
              {product.supplier_quote_required && " · richiede preventivo fornitore"}
            </p>
          )}
          <label className="field">
            <span>Stato</span>
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value as ItemStatus)}
            >
              {STATUSES.map((value) => (
                <option key={value} value={value}>
                  {STATUS_LABELS[value]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <footer className="modal__foot">
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Annulla
          </button>
          <button type="button" className="btn btn--primary" onClick={submit}>
            Salva posizione
          </button>
        </footer>
      </div>
    </div>
  );
}
