import { useEffect, useRef, useState } from "react";
import type { Item, PositionResult, Product, Unit } from "../api/types";
import { formatChf, formatNumber } from "../lib/format";
import { FLAG_LABELS } from "../lib/flags";

const UNITS: Unit[] = ["pc", "m", "m2", "h", "LS", "system"];

export type RowVariant = "material" | "labour";

interface Warning {
  level: "missing" | "soft";
  text: string;
}

// One symbol per row: a missing match is the loud one, the rest are a tooltip.
function warningFor(item: Item): Warning | null {
  if (!item.match) {
    return { level: "missing", text: "Nessun match nel catalogo — da prezzare a mano" };
  }
  if (item.flags.length === 0) return null;
  const soft = item.flags.some((flag) =>
    ["low_confidence_match", "multi_variant_ambiguous"].includes(flag),
  );
  return {
    level: soft ? "soft" : "soft",
    text: item.flags.map((flag) => FLAG_LABELS[flag]).join(" · "),
  };
}

function PositionEditor({
  item,
  products,
  onCancel,
  onSave,
}: {
  item: Item;
  products: Product[];
  onCancel: () => void;
  onSave: (patch: {
    description_raw?: string;
    quantity?: number;
    unit?: Unit;
    product_id?: string;
  }) => Promise<void>;
}) {
  const [description, setDescription] = useState(item.description_raw ?? "");
  const [quantity, setQuantity] = useState(item.quantity?.toString() ?? "");
  const [unit, setUnit] = useState<Unit>(item.unit ?? "pc");
  const [productId, setProductId] = useState(item.match?.product_id ?? "");
  const [saving, setSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const save = async () => {
    setSaving(true);
    const parsed = Number.parseFloat(quantity.replace(",", "."));
    await onSave({
      description_raw: description,
      quantity: Number.isFinite(parsed) ? parsed : undefined,
      unit,
      product_id: productId || undefined,
    });
    setSaving(false);
  };

  return (
    <div className="position is-editing">
      <textarea
        ref={textareaRef}
        className="position__edit-desc"
        value={description}
        rows={3}
        onChange={(event) => setDescription(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") onCancel();
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) void save();
        }}
      />
      <div className="position__edit-grid">
        <label>
          Quantità
          <input
            value={quantity}
            inputMode="decimal"
            onChange={(event) => setQuantity(event.target.value)}
          />
        </label>
        <label>
          Unità
          <select value={unit} onChange={(event) => setUnit(event.target.value as Unit)}>
            {UNITS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label className="position__edit-product">
          Prodotto
          <select value={productId} onChange={(event) => setProductId(event.target.value)}>
            <option value="">— nessuno —</option>
            {products.map((product) => (
              <option key={product.product_id} value={product.product_id}>
                {product.product_id} · {product.description ?? product.model ?? ""}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="position__edit-actions">
        <span className="position__edit-hint">⌘/Ctrl+Invio salva · Esc annulla</span>
        <button type="button" className="btn btn--ghost" onClick={onCancel}>
          Annulla
        </button>
        <button type="button" className="btn btn--primary" disabled={saving} onClick={save}>
          {saving ? "Salvo…" : "Salva"}
        </button>
      </div>
    </div>
  );
}

export function PositionRow({
  item,
  result,
  products,
  selected,
  variant,
  onSelect,
  onSave,
}: {
  item: Item;
  result: PositionResult | undefined;
  products: Product[];
  selected: boolean;
  variant: RowVariant;
  onSelect: () => void;
  onSave: (patch: {
    description_raw?: string;
    quantity?: number;
    unit?: Unit;
    product_id?: string;
  }) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const warning = warningFor(item);

  if (editing) {
    return (
      <PositionEditor
        item={item}
        products={products}
        onCancel={() => setEditing(false)}
        onSave={async (patch) => {
          await onSave(patch);
          setEditing(false);
        }}
      />
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      className={`position position--${variant} ${selected ? "is-selected" : ""} ${
        warning ? `has-warning has-warning--${warning.level}` : ""
      }`}
      onClick={onSelect}
      onDoubleClick={() => setEditing(true)}
      onKeyDown={(event) => {
        if (event.key === "Enter") setEditing(true);
        if (event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
    >
      <div className="position__body">
        <div className="position__head">
          <span className="position__id">{item.lv_id}</span>
          {warning && (
            <span className="position__warn" title={warning.text} aria-label={warning.text}>
              ⚠
            </span>
          )}
          <span className="position__desc">
            {item.description_normalized ?? item.description_raw ?? "Senza descrizione"}
          </span>
        </div>
        {variant === "material" && (
          <div className="position__sub">
            <span>{item.match?.product_id ?? "nessun prodotto"}</span>
            {item.source_page && <span>p. {item.source_page}</span>}
          </div>
        )}
        {variant === "labour" && (
          <div className="position__sub">
            <span>{result?.install_code ?? "—"}</span>
            {item.source_page && <span>p. {item.source_page}</span>}
          </div>
        )}
      </div>

      <div className="position__side">
        {variant === "material" ? (
          <>
            <span className="position__num">
              {formatNumber(item.quantity)} <small>{item.unit ?? "?"}</small>
            </span>
            <span className="position__num" title="Costo unitario netto">
              {formatChf(result?.net_unit_cost_chf, true)}
            </span>
            <span className="position__num position__num--cost" title="Costo materiale">
              {formatChf(result?.material_cost_chf, true)}
            </span>
          </>
        ) : (
          <>
            <span className="position__num" title="Ore per unità">
              {formatNumber(result?.base_hours_per_unit, 2)} h/{item.unit ?? "?"}
            </span>
            <span className="position__num" title="Ore totali">
              {formatNumber(result?.adjusted_install_hours, 2)} h
            </span>
            <span className="position__num" title="Tariffa oraria">
              {formatChf(result?.hourly_rate_chf, true)}/h
            </span>
            <span className="position__num position__num--cost" title="Costo manodopera">
              {formatChf(result?.labour_cost_chf, true)}
            </span>
          </>
        )}
      </div>

      <span
        className="position__edit"
        role="button"
        tabIndex={-1}
        aria-hidden
        onClick={(event) => {
          event.stopPropagation();
          setEditing(true);
        }}
      >
        ✎
      </span>
    </div>
  );
}
