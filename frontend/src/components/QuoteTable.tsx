import { useEffect, useMemo, useRef, useState } from "react";
import type { Item, PositionResult, Product, Unit } from "../api/types";
import { formatChf, formatNumber } from "../lib/format";
import { useI18n } from "../i18n";

const UNITS: Unit[] = ["pc", "m", "m2", "h", "LS", "system"];

// Sentinel for items without a system; rendered as a localized label.
const NO_SYSTEM = "";

export interface RowSavePatch {
  description_raw?: string;
  quantity?: number;
  unit?: Unit;
  product_id?: string;
}

function posNumber(item: Item): string | null {
  const value = item.attributes?.pos_number;
  return typeof value === "string" && value.trim() ? value : null;
}

function ItemEditor({
  item,
  products,
  onCancel,
  onSave,
}: {
  item: Item;
  products: Product[];
  onCancel: () => void;
  onSave: (patch: RowSavePatch) => Promise<void>;
}) {
  const { t } = useI18n();
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
    <div className="item item--editing">
      <textarea
        ref={textareaRef}
        className="item__edit-desc"
        value={description}
        rows={3}
        onChange={(event) => setDescription(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") onCancel();
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) void save();
        }}
      />
      <div className="item__edit-grid">
        <label>
          {t("quote.quantity")}
          <input
            value={quantity}
            inputMode="decimal"
            onChange={(event) => setQuantity(event.target.value)}
          />
        </label>
        <label>
          {t("quote.unit")}
          <select value={unit} onChange={(event) => setUnit(event.target.value as Unit)}>
            {UNITS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label className="item__edit-product">
          {t("quote.product")}
          <select value={productId} onChange={(event) => setProductId(event.target.value)}>
            <option value="">{t("quote.productNone")}</option>
            {products.map((product) => (
              <option key={product.product_id} value={product.product_id}>
                {product.product_id} · {product.description ?? product.model ?? ""}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="item__edit-actions">
        <span className="item__edit-hint">{t("quote.editHint")}</span>
        <button type="button" className="btn btn--ghost" onClick={onCancel}>
          {t("common.cancel")}
        </button>
        <button type="button" className="btn btn--primary" disabled={saving} onClick={save}>
          {saving ? t("common.saving") : t("common.save")}
        </button>
      </div>
    </div>
  );
}

function Amount({
  value,
  missing,
  tone = "strong",
}: {
  value: number | null | undefined;
  missing: boolean;
  tone?: "strong" | "soft";
}) {
  const { t } = useI18n();
  if (missing) {
    return <span className={tone === "soft" ? "todo-tag todo-tag--soft" : "todo-tag"}>
      {t("quote.toAdd")}
    </span>;
  }
  if (typeof value === "number" && value > 0) return <>{formatChf(value)}</>;
  return <span className="amount--muted">—</span>;
}

// One item = one block, two aligned lines: material on top, labour underneath.
function ItemCard({
  item,
  result,
  products,
  selected,
  onSelect,
  onSave,
}: {
  item: Item;
  result: PositionResult | undefined;
  products: Product[];
  selected: boolean;
  onSelect: () => void;
  onSave: (patch: RowSavePatch) => Promise<void>;
}) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const number = posNumber(item);

  if (editing) {
    return (
      <ItemEditor
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

  const missingMaterial = !item.match;
  const missingLabour = !result?.install_code;
  const tooltip = item.flags.map((flag) => t(`flag.${flag}`)).join(" · ");

  return (
    <div
      role="button"
      tabIndex={0}
      className={`item ${selected ? "is-selected" : ""} ${missingMaterial ? "has-missing" : ""}`}
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
      {/* line 1 — material */}
      <span className="item__pos">{number ?? item.lv_id}</span>
      <span className="item__desc" title={item.description_raw ?? undefined}>
        {item.description_normalized ?? item.description_raw ?? t("quote.noDescription")}
      </span>
      <span className="item__qty">
        {formatNumber(item.quantity)} <small>{item.unit ?? "?"}</small>
      </span>
      <span className="item__amount">
        <Amount value={result?.material_cost_chf} missing={missingMaterial} />
      </span>

      {/* line 2 — labour */}
      <span className="item__tag">{item.match?.product_id ?? "—"}</span>
      <span className="item__sub" title={tooltip || undefined}>
        {result?.install_code ?? t("quote.installCodeMissing")}
        {item.source_page ? ` · ${t("pdf.onPage", { page: item.source_page })}` : ""}
      </span>
      <span className="item__qty item__qty--labour">
        {result?.adjusted_install_hours != null
          ? `${formatNumber(result.adjusted_install_hours, 2)} h`
          : "—"}
      </span>
      <span className="item__amount">
        <Amount value={result?.labour_cost_chf} missing={missingLabour} tone="soft" />
      </span>
    </div>
  );
}

export interface QuoteGroup {
  system: string;
  items: Item[];
}

// Group by system so repeated CPN codes (UTA1 vs UTA2) stay distinguishable and
// the list is digestible. Groups keep the document order (first appearance);
// items without a system fall to the end. `system` is "" for "no system".
export function groupItems(items: Item[]): QuoteGroup[] {
  const groups = new Map<string, Item[]>();
  for (const item of items) {
    const key = item.system?.trim() || NO_SYSTEM;
    const list = groups.get(key) ?? [];
    list.push(item);
    groups.set(key, list);
  }
  return [...groups.entries()]
    .sort((a, b) => (a[0] === NO_SYSTEM ? 1 : b[0] === NO_SYSTEM ? -1 : 0))
    .map(([system, groupItems]) => ({ system, items: groupItems }));
}

function GroupBlock({
  group,
  positionsById,
  products,
  selectedId,
  onSelect,
  onSave,
}: {
  group: QuoteGroup;
  positionsById: Map<string, PositionResult>;
  products: Product[];
  selectedId: string | null;
  onSelect: (lvId: string) => void;
  onSave: (lvId: string, patch: RowSavePatch) => Promise<void>;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(true);
  const subtotal = useMemo(
    () =>
      group.items.reduce(
        (sum, item) => sum + (positionsById.get(item.lv_id)?.direct_position_cost_chf ?? 0),
        0,
      ),
    [group, positionsById],
  );

  return (
    <section className="group">
      <button type="button" className="group__head" onClick={() => setOpen((value) => !value)}>
        <span className={`group__caret ${open ? "is-open" : ""}`}>▸</span>
        <span className="group__name">{group.system || t("quote.noSystem")}</span>
        <span className="group__count">
          {t("common.entries", { count: group.items.length })}
        </span>
        <span className="group__total">
          {subtotal > 0 ? formatChf(subtotal) : <span className="amount--muted">—</span>}
        </span>
      </button>
      {open && (
        <div className="group__rows">
          {group.items.map((item) => (
            <ItemCard
              key={item.lv_id}
              item={item}
              result={positionsById.get(item.lv_id)}
              products={products}
              selected={selectedId === item.lv_id}
              onSelect={() => onSelect(item.lv_id)}
              onSave={(patch) => onSave(item.lv_id, patch)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export function QuoteList({
  items,
  positionsById,
  products,
  selectedId,
  onSelect,
  onSave,
}: {
  items: Item[];
  positionsById: Map<string, PositionResult>;
  products: Product[];
  selectedId: string | null;
  onSelect: (lvId: string) => void;
  onSave: (lvId: string, patch: RowSavePatch) => Promise<void>;
}) {
  const { t } = useI18n();
  const groups = useMemo(() => groupItems(items), [items]);
  if (items.length === 0) {
    return <p className="quote-empty">{t("quote.empty")}</p>;
  }
  return (
    <div className="quote">
      {groups.map((group) => (
        <GroupBlock
          key={group.system}
          group={group}
          positionsById={positionsById}
          products={products}
          selectedId={selectedId}
          onSelect={onSelect}
          onSave={onSave}
        />
      ))}
    </div>
  );
}
