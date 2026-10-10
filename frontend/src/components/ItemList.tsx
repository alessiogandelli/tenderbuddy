import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Search, X } from "lucide-react";
import type { Item, PageType, PositionResult, Product, ProductivityRule, ProjectParameters } from "../api/types";
import type { ItemState } from "../lib/flags";
import { formatChf, formatNumber } from "../lib/format";
import { itemName, posNumber } from "../lib/items";
import { useI18n } from "../i18n";
import { ItemDetail, type ItemPatch } from "./ItemDetail";

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
}) {
  const { t } = useI18n();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const rowRefs = useRef<Map<string, HTMLLIElement>>(new Map());

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
  }, [selectedId]);

  const move = (direction: 1 | -1) => {
    if (visible.length === 0) return;
    const index = visible.findIndex((item) => item.lv_id === selectedId);
    const next =
      index < 0
        ? visible[direction > 0 ? 0 : visible.length - 1]
        : visible[Math.min(Math.max(index + direction, 0), visible.length - 1)];
    onSelect(next.lv_id, "list");
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest("input, textarea, select, .detail")) return;
    if (event.key === "ArrowDown" || event.key === "j") {
      event.preventDefault();
      move(1);
    } else if (event.key === "ArrowUp" || event.key === "k") {
      event.preventDefault();
      move(-1);
    } else if (event.key === "Escape") {
      onSelect(null, "list");
    }
  };

  return (
    <div className="items" onKeyDown={onKeyDown}>
      <div className="items__head">
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
                    <button
                      type="button"
                      className="row__main"
                      aria-expanded={selected}
                      onClick={() => onSelect(selected ? null : item.lv_id, "list")}
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
                    {selected && (
                      <ItemDetail
                        item={item}
                        result={result}
                        state={state}
                        product={item.match ? productsById.get(item.match.product_id) : undefined}
                        products={products}
                        rule={item.match?.install_code ? rules.get(item.match.install_code) : undefined}
                        pageType={item.source_page ? types.get(item.source_page) : undefined}
                        parameters={parameters}
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
