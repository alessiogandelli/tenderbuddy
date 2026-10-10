import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Search, X } from "lucide-react";
import type { Item, PageType, PositionResult, Product, ProductivityRule, ProjectParameters } from "../api/types";
import type { ItemState } from "../lib/flags";
import { formatChf, formatNumber } from "../lib/format";
import { itemName, posNumber } from "../lib/items";
import { useI18n } from "../i18n";
import { ItemCard, type ItemCardHandle, type ItemPatch } from "./ItemCard";

type Filter = "all" | "open" | "check" | "priced";

const FILTERS: Filter[] = ["all", "open", "check", "priced"];

const inFilter = (filter: Filter, state: ItemState) =>
  filter === "all" ||
  (filter === "priced" ? state === "priced" || state === "manual" : state === filter);

export type SelectSource = "list" | "pdf";

/**
 * Every item read from the tender, one compact line each (name, quantity,
 * price), grouped by system in document order. Clicking a line opens how the
 * item was read and mapped, and highlights it in the document.
 */
export function ItemList({
  items,
  results,
  states,
  productsById,
  products,
  rules,
  types,
  parameters,
  selectedId,
  onSelect,
  onShowInPdf,
  onSave,
  headerAction,
}: {
  items: Item[];
  results: Map<string, PositionResult>;
  states: Map<string, ItemState>;
  productsById: Map<string, Product>;
  products: Product[];
  rules: Map<string, ProductivityRule>;
  types: Map<number, PageType>;
  parameters: ProjectParameters | null;
  selectedId: string | null;
  onSelect: (lvId: string | null, source: SelectSource) => void;
  onShowInPdf: (lvId: string) => void;
  onSave: (lvId: string, patch: ItemPatch) => Promise<void>;
  /** Extra control in the list header (e.g. the panel collapse button). */
  headerAction?: ReactNode;
}) {
  const { t } = useI18n();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const rowRefs = useRef<Map<string, HTMLLIElement>>(new Map());
  const cardRef = useRef<ItemCardHandle | null>(null);
  const ruleList = useMemo(() => [...rules.values()], [rules]);

  const counts = useMemo(() => {
    const out: Record<Filter, number> = { all: 0, open: 0, check: 0, priced: 0 };
    for (const item of items) {
      const state = states.get(item.lv_id) ?? "open";
      for (const key of FILTERS) if (inFilter(key, state)) out[key] += 1;
    }
    return out;
  }, [items, states]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return items.filter((item) => {
      if (!inFilter(filter, states.get(item.lv_id) ?? "open")) return false;
      if (!needle) return true;
      const product = item.match ? productsById.get(item.match.product_id) : undefined;
      return `${item.lv_id} ${posNumber(item) ?? ""} ${item.description_raw ?? ""} ${
        item.match?.product_id ?? ""
      } ${product?.description ?? ""}`
        .toLowerCase()
        .includes(needle);
    });
  }, [items, states, filter, query, productsById]);

  const groups = useMemo(() => {
    const out: { system: string; items: Item[] }[] = [];
    for (const item of visible) {
      const system = item.system?.trim() || "";
      const last = out[out.length - 1];
      if (last && last.system === system) last.items.push(item);
      else out.push({ system, items: [item] });
    }
    return out;
  }, [visible]);

  // Keep the selected line in view (it may have been picked in the document).
  useEffect(() => {
    if (!selectedId) return;
    const row = rowRefs.current.get(selectedId);
    row?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    // Keyboard focus follows the card (see `close` for the way back), so
    // J/K/Esc keep working without the mouse — unless focus is elsewhere.
    const active = document.activeElement as HTMLElement | null;
    if (!active || active === document.body || active.closest(".items")) cardRef.current?.focus();
  }, [selectedId]);

  const selectedIndex = visible.findIndex((item) => item.lv_id === selectedId);

  const move = (direction: 1 | -1) => {
    if (visible.length === 0) return;
    const index = visible.findIndex((item) => item.lv_id === selectedId);
    const next =
      index < 0
        ? visible[direction > 0 ? 0 : visible.length - 1]
        : visible[Math.min(Math.max(index + direction, 0), visible.length - 1)];
    onSelect(next.lv_id, "list");
  };

  const close = () => {
    if (!selectedId) return;
    const row = rowRefs.current.get(selectedId);
    onSelect(null, "list");
    requestAnimationFrame(() => row?.querySelector<HTMLButtonElement>(".row__main")?.focus());
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest("input, textarea, select, .picker")) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    if (key === "j" || (key === "ArrowDown" && !selectedId)) {
      event.preventDefault();
      move(1);
    } else if (key === "k" || (key === "ArrowUp" && !selectedId)) {
      event.preventDefault();
      move(-1);
    } else if (key === "Escape" && selectedId) {
      event.preventDefault();
      close();
    }
  };

  return (
    <div className={`items ${selectedId ? "has-focus" : ""}`} onKeyDown={onKeyDown}>
      <div className="items__head">
        <div className="items__toolbar">
        <label className="search">
          <Search size={16} aria-hidden />
          <input
            value={query}
            placeholder={t("items.search")}
            aria-label={t("items.search")}
            onChange={(event) => setQuery(event.target.value)}
          />
          {query && (
            <button type="button" aria-label={t("common.clear")} onClick={() => setQuery("")}>
              <X size={14} />
            </button>
          )}
        </label>
        {headerAction}
        </div>
        <div className="filters" role="tablist" aria-label={t("items.filterAria")}>
          {FILTERS.map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={filter === key}
              className={`filter ${filter === key ? "is-active" : ""}`}
              title={t(`items.filterHint.${key}`)}
              onClick={() => setFilter(key)}
            >
              {key !== "all" && <span className={`dot dot--${key === "priced" ? "priced" : key}`} />}
              {t(`items.filter.${key}`)}
              <span className="filter__count">{counts[key]}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="items__cols" aria-hidden>
        <span>{t("items.colItem")}</span>
        <span>{t("items.colQty")}</span>
        <span>{t("items.colPrice")}</span>
      </div>

      <div className="items__scroll">
        {visible.length === 0 && <p className="items__empty">{t("items.empty")}</p>}
        {groups.map((group, index) => (
          <section key={`${group.system}-${index}`} className="sys">
            <h3 className="sys__head">
              <span className="sys__name">{group.system || t("items.noSystem")}</span>
              <span className="sys__count">{group.items.length}</span>
            </h3>
            <ul className="sys__rows">
              {group.items.map((item) => {
                const state = states.get(item.lv_id) ?? "open";
                const result = results.get(item.lv_id);
                const selected = item.lv_id === selectedId;
                const cost = result?.direct_position_cost_chf;
                return (
                  <li
                    key={item.lv_id}
                    ref={(node) => {
                      if (node) rowRefs.current.set(item.lv_id, node);
                      else rowRefs.current.delete(item.lv_id);
                    }}
                    className={`row ${selected ? "is-selected" : ""}`}
                  >
                    {!selected && (
                    <button
                      type="button"
                      className="row__main"
                      aria-expanded={false}
                      onClick={() => onSelect(item.lv_id, "list")}
                    >
                      <span className={`dot dot--${state}`} title={t(`items.state.${state}`)} />
                      <span className="row__name">{itemName(item) ?? t("items.noDescription")}</span>
                      <span className="row__qty">
                        {item.quantity != null ? (
                          <>
                            {formatNumber(item.quantity)}
                            <small>{item.unit ?? ""}</small>
                          </>
                        ) : (
                          "—"
                        )}
                      </span>
                      <span className={`row__price ${cost == null ? "is-missing" : ""}`}>
                        {cost != null ? formatChf(cost) : "—"}
                      </span>
                    </button>
                    )}
                    {selected && (
                      <ItemCard
                        ref={cardRef}
                        item={item}
                        result={result}
                        state={state}
                        product={item.match ? productsById.get(item.match.product_id) : undefined}
                        products={products}
                        rule={item.match?.install_code ? rules.get(item.match.install_code) : undefined}
                        rules={ruleList}
                        pageType={item.source_page ? types.get(item.source_page) : undefined}
                        parameters={parameters}
                        hasPrev={selectedIndex > 0}
                        hasNext={selectedIndex >= 0 && selectedIndex < visible.length - 1}
                        onPrev={() => move(-1)}
                        onNext={() => move(1)}
                        onClose={close}
                        onShowInPdf={() => onShowInPdf(item.lv_id)}
                        onSave={(patch) => onSave(item.lv_id, patch)}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
