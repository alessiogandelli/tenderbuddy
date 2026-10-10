import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronUp,
  FileText,
  Hand,
  PencilLine,
  Search,
  Trash2,
  X,
} from "lucide-react";
import type {
  Item,
  PageType,
  PositionResult,
  Product,
  ProductivityRule,
  ProjectParameters,
  Unit,
} from "../api/types";
import { CHAIN_ORDER, nextAction, pricingChain, type ChainKey, type NextAction, type NodeStatus } from "../lib/chain";
import type { ItemState } from "../lib/flags";
import { formatChf, formatNumber } from "../lib/format";
import { itemName, posNumber, searchProducts, suggestedProducts } from "../lib/items";
import { PAGE_TYPE_COLORS } from "../lib/pageTypes";
import { useI18n } from "../i18n";

const UNITS: Unit[] = ["pc", "m", "m2", "h", "LS", "system"];
const PICKER_LIMIT = 60;
// Flags that only the tender-text section explains; the others are the chain's.
const TEXT_NOTE_FLAGS = ["unclear_unit", "missing_unit", "multi_variant_ambiguous", "unparsed_row", "language_uncertain"];

export interface ItemPatch {
  quantity?: number;
  unit?: Unit;
  product_id?: string | null;
  install_code?: string;
  confidence?: number;
  manual_unit_price_chf?: number | null;
}

type Mode = "view" | "quantity" | "pick" | "labour" | "price";

const MODE_OF: Record<NextAction, Mode> = {
  quantity: "quantity",
  product: "pick",
  confirm: "pick",
  labour: "labour",
  price: "price",
  supplier: "price",
};
const SECTION_OF: Record<Mode, ChainKey | null> = {
  view: null,
  quantity: null,
  pick: "product",
  labour: "labour",
  price: "price",
};

function parseNumber(value: string): number | null {
  const parsed = Number.parseFloat(value.replace(/['’\s]/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

/** A value of the formula strip; `null` renders as a warning dash. */
function Term({ value, title }: { value: string | null; title: string }) {
  return value == null ? (
    <span className="fx__term fx__term--missing" title={title}>
      —
    </span>
  ) : (
    <span className="fx__term" title={title}>
      {value}
    </span>
  );
}

const STATUS_ICON: Record<NodeStatus, ReactNode> = {
  done: <Check size={12} strokeWidth={3} />,
  missing: <X size={12} strokeWidth={3} />,
  check: <AlertTriangle size={11} strokeWidth={2.5} />,
  replaced: <Hand size={11} strokeWidth={2.5} />,
};

/** Search the catalogue and pick the product this item is. */
function CatalogPicker({
  item,
  products,
  currentId,
  busy,
  onPick,
  onCancel,
  alternative,
}: {
  item: Item;
  products: Product[];
  currentId: string | null;
  busy: boolean;
  onPick: (product: Product) => void;
  onCancel: () => void;
  alternative?: ReactNode;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => inputRef.current?.focus({ preventScroll: true }), []);

  const suggested = useMemo(() => suggestedProducts(item, products), [item, products]);
  const found = useMemo(() => searchProducts(products, query), [products, query]);
  const list = query.trim() ? found : [...suggested, ...products.filter((p) => !suggested.includes(p))];

  return (
    <div
      className="picker"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onCancel();
        }
      }}
    >
      <div className="picker__head">
        <label className="search search--small">
          <Search size={15} aria-hidden />
          <input
            ref={inputRef}
            value={query}
            placeholder={t("card.pickerSearch")}
            aria-label={t("card.pickerSearch")}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <button type="button" className="iconbtn" aria-label={t("common.cancel")} onClick={onCancel}>
          <X size={16} />
        </button>
      </div>
      {!query.trim() && suggested.length > 0 && (
        <p className="picker__note">{t("card.pickerSuggested", { size: String(item.attributes.size ?? "") })}</p>
      )}
      <ul className="picker__list">
        {list.slice(0, PICKER_LIMIT).map((product) => (
          <li key={product.product_id}>
            <button
              type="button"
              disabled={busy}
              className={`picker__row ${product.product_id === currentId ? "is-current" : ""} ${
                suggested.includes(product) ? "is-suggested" : ""
              }`}
              onClick={() => onPick(product)}
            >
              <span className="picker__desc">{product.description ?? product.product_id}</span>
              <span className="picker__meta">
                {product.product_id}
                {product.category ? ` · ${product.category}` : ""}
                {product.manufacturer ? ` · ${product.manufacturer} ${product.model ?? ""}` : ""}
              </span>
              <span className="picker__price">
                {product.net_cost_chf != null ? formatChf(product.net_cost_chf, true) : "—"}
                <small>/{product.unit ?? "?"}</small>
              </span>
            </button>
          </li>
        ))}
        {list.length === 0 && <li className="picker__empty">{t("card.pickerEmpty")}</li>}
      </ul>
      {list.length > PICKER_LIMIT && (
        <p className="picker__note">{t("card.pickerMore", { count: list.length - PICKER_LIMIT })}</p>
      )}
      {alternative && <div className="picker__alt">{alternative}</div>}
    </div>
  );
}

/** Pick the labour operation (productivity rule) priced for this item. */
function LabourPicker({
  item,
  rules,
  currentCode,
  busy,
  onPick,
  onCancel,
}: {
  item: Item;
  rules: ProductivityRule[];
  currentCode: string | null;
  busy: boolean;
  onPick: (rule: ProductivityRule) => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => inputRef.current?.focus({ preventScroll: true }), []);

  const list = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    const matching = rules.filter((rule) => {
      const text = `${rule.install_code} ${rule.work_type ?? ""} ${rule.labour_role ?? ""}`.toLowerCase();
      return words.every((word) => text.includes(word));
    });
    // Operations measured in the item's own unit first.
    return [...matching].sort((a, b) => Number(b.unit === item.unit) - Number(a.unit === item.unit));
  }, [rules, query, item.unit]);

  return (
    <div
      className="picker"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          onCancel();
        }
      }}
    >
      <div className="picker__head">
        <label className="search search--small">
          <Search size={15} aria-hidden />
          <input
            ref={inputRef}
            value={query}
            placeholder={t("card.labourSearch")}
            aria-label={t("card.labourSearch")}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <button type="button" className="iconbtn" aria-label={t("common.cancel")} onClick={onCancel}>
          <X size={16} />
        </button>
      </div>
      <ul className="picker__list">
        {list.map((rule) => (
          <li key={rule.install_code}>
            <button
              type="button"
              disabled={busy}
              className={`picker__row ${rule.install_code === currentCode ? "is-current" : ""} ${
                rule.unit === item.unit ? "is-suggested" : ""
              }`}
              onClick={() => onPick(rule)}
            >
              <span className="picker__desc">{rule.work_type ?? rule.install_code}</span>
              <span className="picker__meta">
                {rule.install_code}
                {rule.labour_role ? ` · ${rule.labour_role}` : ""}
              </span>
              <span className="picker__price">
                {formatNumber(rule.base_hours_per_unit, 2)} h<small>/{rule.unit ?? "?"}</small>
              </span>
            </button>
          </li>
        ))}
        {list.length === 0 && <li className="picker__empty">{t("card.pickerEmpty")}</li>}
      </ul>
    </div>
  );
}

export interface ItemCardHandle {
  focus: () => void;
}

/**
 * One item under investigation: a sticky header (what it is, what it costs,
 * how the cost is built, and the one next step) above the four links of its
 * pricing chain — the tender text, the product we supply, the labour, the cost.
 */
export const ItemCard = forwardRef<
  ItemCardHandle,
  {
    item: Item;
    result: PositionResult | undefined;
    state: ItemState;
    product: Product | undefined;
    products: Product[];
    rule: ProductivityRule | undefined;
    rules: ProductivityRule[];
    pageType: PageType | undefined;
    parameters: ProjectParameters | null;
    hasPrev: boolean;
    hasNext: boolean;
    onPrev: () => void;
    onNext: () => void;
    onClose: () => void;
    onShowInPdf: () => void;
    onSave: (patch: ItemPatch) => Promise<void>;
  }
>(function ItemCard(
  {
    item,
    result,
    state,
    product,
    products,
    rule,
    rules,
    pageType,
    parameters,
    hasPrev,
    hasNext,
    onPrev,
    onNext,
    onClose,
    onShowInPdf,
    onSave,
  },
  ref,
) {
  const { t } = useI18n();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const sectionRefs = useRef<Partial<Record<ChainKey, HTMLElement | null>>>({});
  const [mode, setMode] = useState<Mode>("view");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [priceDraft, setPriceDraft] = useState("");
  const [qtyDraft, setQtyDraft] = useState("");
  const [unitDraft, setUnitDraft] = useState<Unit>(item.unit ?? "pc");

  useImperativeHandle(ref, () => ({ focus: () => rootRef.current?.focus({ preventScroll: true }) }), []);

  useEffect(() => {
    setMode("view");
    setError(null);
    setExpanded(false);
  }, [item.lv_id]);

  const chain = pricingChain(item, result, product, rule);
  const next = nextAction(chain);
  const blocked = chain.some((node) => node.status === "missing");
  const manual = item.manual_unit_price_chf != null;

  const scrollTo = (key: ChainKey) =>
    sectionRefs.current[key]?.scrollIntoView({ behavior: "smooth", block: "nearest" });

  const open = (nextMode: Mode) => {
    setError(null);
    if (nextMode === "price") {
      setPriceDraft(item.manual_unit_price_chf != null ? String(item.manual_unit_price_chf) : "");
    }
    if (nextMode === "quantity" || nextMode === "price") {
      setQtyDraft(item.quantity != null ? String(item.quantity) : "");
      setUnitDraft(item.unit ?? "pc");
    }
    setMode(nextMode);
    const section = SECTION_OF[nextMode];
    if (section) requestAnimationFrame(() => scrollTo(section));
  };

  const save = async (patch: ItemPatch) => {
    setBusy(true);
    setError(null);
    try {
      await onSave(patch);
      setMode("view");
    } catch {
      setError(t("card.saveError"));
    } finally {
      setBusy(false);
    }
  };

  const submitQuantity = (event: FormEvent) => {
    event.preventDefault();
    const quantity = parseNumber(qtyDraft);
    if (quantity == null || quantity <= 0) return setError(t("card.quantityInvalid"));
    void save({ quantity, unit: unitDraft });
  };
  const submitPrice = (event: FormEvent) => {
    event.preventDefault();
    const price = parseNumber(priceDraft);
    const quantity = item.quantity ?? parseNumber(qtyDraft);
    if (price == null || price < 0) return setError(t("card.priceInvalid"));
    if (quantity == null || quantity <= 0) return setError(t("card.quantityInvalid"));
    void save({ manual_unit_price_chf: price, ...(item.quantity == null ? { quantity, unit: unitDraft } : {}) });
  };

  const name = itemName(item) ?? t("items.noDescription");
  const number = posNumber(item);
  const description = item.description_raw ?? item.description_normalized ?? "";
  const long = description.split("\n").length > 5 || description.length > 360;
  const waste = parameters?.allowances?.material_waste_pct;
  const factors = parameters?.productivity_factors ?? {};
  const confidence = item.match ? Math.round(item.match.confidence * 100) : null;
  const sure = item.match ? item.match.confidence >= 0.7 : false;
  const notes = item.flags.filter((flag) => TEXT_NOTE_FLAGS.includes(flag));
  const unit = item.unit ?? "";
  const qty = item.quantity != null ? `${formatNumber(item.quantity)} ${unit}`.trim() : null;
  const factorLabel = (key: string) => {
    const label = t(`params.fields.${key}.label`);
    return label.startsWith("params.") ? key : label;
  };
  const attributes = [
    item.attributes.size != null ? String(item.attributes.size) : null,
    item.attributes.dn != null && !String(item.attributes.size ?? "").includes(String(item.attributes.dn))
      ? `DN${String(item.attributes.dn)}`
      : null,
    item.attributes.width_mm != null && item.attributes.height_mm != null
      ? `${String(item.attributes.width_mm)} × ${String(item.attributes.height_mm)} mm`
      : null,
    item.attributes.fire_class != null ? String(item.attributes.fire_class) : null,
  ].filter((value): value is string => Boolean(value));

  // The formula only shows backend values; what is not there yet is a dash.
  const net = result?.net_unit_cost_chf ?? product?.net_cost_chf ?? null;
  const hours = result?.base_hours_per_unit ?? rule?.base_hours_per_unit ?? null;
  const rate = result?.hourly_rate_chf ?? rule?.default_hourly_rate_chf ?? null;
  const direct = result?.direct_position_cost_chf ?? null;

  const quantityForm = (
    <form className="inline-form" onSubmit={submitQuantity}>
      <input
        autoFocus
        className="input input--num"
        value={qtyDraft}
        inputMode="decimal"
        aria-label={t("card.quantity")}
        onChange={(event) => setQtyDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            setMode("view");
          }
        }}
      />
      <select
        className="input"
        value={unitDraft}
        aria-label={t("card.unit")}
        onChange={(event) => setUnitDraft(event.target.value as Unit)}
      >
        {UNITS.map((value) => (
          <option key={value} value={value}>
            {value}
          </option>
        ))}
      </select>
      <button type="submit" className="btn btn--primary btn--sm" disabled={busy}>
        {t("common.save")}
      </button>
      <button type="button" className="btn btn--ghost btn--sm" onClick={() => setMode("view")}>
        {t("common.cancel")}
      </button>
    </form>
  );

  const typePriceLink = (
    <button type="button" className="linkbtn" onClick={() => open("price")}>
      {t("card.orTypePrice")} <ArrowRight size={13} aria-hidden />
    </button>
  );

  const section = (key: ChainKey, children: ReactNode) => {
    const node = chain.find((entry) => entry.key === key);
    return (
      <section
        className={`csec csec--${node?.status ?? "done"}`}
        ref={(element) => {
          sectionRefs.current[key] = element;
        }}
        aria-labelledby={`csec-${item.lv_id}-${key}`}
      >
        <h4 className="csec__title" id={`csec-${item.lv_id}-${key}`}>
          <span className={`chain__icon chain__icon--${node?.status ?? "done"}`}>
            {STATUS_ICON[node?.status ?? "done"]}
          </span>
          {t(`card.section.${key}`)}
        </h4>
        {children}
      </section>
    );
  };

  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      className={`icard icard--${state}`}
      aria-label={t("card.aria", { name })}
    >
      {/* sticky header: the item, its cost, how the cost is built, what to do next */}
      <header className="chead">
        <div className="chead__top">
          <span className={`dot dot--${state}`} aria-hidden />
          <h3 className="chead__name" title={name}>
            {name}
          </h3>
          <div className="chead__nav">
            <button
              type="button"
              className="iconbtn iconbtn--sm"
              disabled={!hasPrev}
              aria-label={t("card.prev")}
              title={`${t("card.prev")} (K)`}
              onClick={onPrev}
            >
              <ChevronUp size={16} />
            </button>
            <button
              type="button"
              className="iconbtn iconbtn--sm"
              disabled={!hasNext}
              aria-label={t("card.next")}
              title={`${t("card.next")} (J)`}
              onClick={onNext}
            >
              <ChevronDown size={16} />
            </button>
            <button
              type="button"
              className="iconbtn iconbtn--sm"
              aria-label={t("card.close")}
              title={`${t("card.close")} (Esc)`}
              onClick={onClose}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="chead__meta">
          <span className="chead__id">
            {item.lv_id}
            {number ? ` · ${t("card.pos", { number })}` : ""}
          </span>
          {item.source_page && (
            <button
              type="button"
              className="typechip typechip--btn"
              style={{ "--pc": PAGE_TYPE_COLORS[pageType ?? "other"] } as CSSProperties}
              onClick={onShowInPdf}
              title={t("card.showInPdf")}
            >
              <FileText size={13} aria-hidden />
              {t("pdf.page", { page: item.source_page })}
              {pageType ? ` · ${t(`pageType.${pageType}`)}` : ""}
            </button>
          )}
          {mode === "quantity" ? (
            quantityForm
          ) : (
            <span className="chead__qty">
              {qty ?? <span className="warn-text">{t("card.noQuantity")}</span>}
              <button
                type="button"
                className="iconbtn iconbtn--sm"
                aria-label={t("card.editQuantity")}
                title={t("card.editQuantity")}
                onClick={() => open("quantity")}
              >
                <PencilLine size={13} />
              </button>
            </span>
          )}
          <span className={`pill pill--${state}`}>{t(`items.state.${state}`)}</span>
          <span className="chead__cost">{direct != null ? formatChf(direct, true) : "—"}</span>
        </div>

        <p className="fx" aria-label={t("card.formulaAria")}>
          <Term value={qty} title={t("card.fx.qty")} />
          <span className="fx__op">×</span>
          {manual ? (
            <>
              <Term value={formatChf(item.manual_unit_price_chf, true)} title={t("card.fx.manual")} />
              <span className="fx__note">{t("card.fx.byHand")}</span>
            </>
          ) : (
            <>
              <span className="fx__op">(</span>
              <Term value={net != null ? formatChf(net, true) : null} title={t("card.fx.material")} />
              {waste != null && (
                <span className="fx__note" title={t("card.fx.waste")}>
                  +{formatNumber(waste)}% {t("card.waste")}
                </span>
              )}
              <span className="fx__op">+</span>
              <Term value={hours != null ? `${formatNumber(hours, 2)} h` : null} title={t("card.fx.hours")} />
              <span className="fx__op">×</span>
              <Term
                value={result?.factor_product != null ? formatNumber(result.factor_product, 4) : null}
                title={t("card.fx.factor")}
              />
              <span className="fx__op">×</span>
              <Term value={rate != null ? `${formatChf(rate, true)}/h` : null} title={t("card.fx.rate")} />
              <span className="fx__op">)</span>
            </>
          )}
          <span className="fx__op">=</span>
          <Term value={direct != null ? formatChf(direct, true) : null} title={t("card.fx.direct")} />
        </p>

        <div className="chead__chain">
          <ol className="chain" aria-label={t("card.chainAria")}>
            {CHAIN_ORDER.map((key) => {
              const node = chain.find((entry) => entry.key === key);
              const status = node?.status ?? "done";
              return (
                <li key={key} className={`chain__node chain__node--${status}`}>
                  <button
                    type="button"
                    onClick={() => scrollTo(key)}
                    title={`${t(`card.chain.${key}`)} · ${t(`card.status.${status}`)}`}
                  >
                    <span className={`chain__icon chain__icon--${status}`}>{STATUS_ICON[status]}</span>
                    <span className="chain__label">{t(`card.chain.${key}`)}</span>
                  </button>
                </li>
              );
            })}
          </ol>
          {next && mode === "view" && (
            <button type="button" className="btn btn--primary btn--sm chead__next" onClick={() => open(MODE_OF[next.action])}>
              {t(`card.nextStep.${next.action}`)} <ArrowRight size={14} aria-hidden />
            </button>
          )}
        </div>
      </header>

      {error && (
        <p className="banner banner--error banner--sm icard__error" role="alert">
          {error}
        </p>
      )}

      <div className="icard__body">
        {section(
          "text",
          <>
            <p className={`csec__text ${long && !expanded ? "is-clamped" : ""}`}>
              {description || t("items.noDescription")}
            </p>
            {long && (
              <button type="button" className="linkbtn" onClick={() => setExpanded((value) => !value)}>
                {expanded ? t("card.showLess") : t("card.showMore")}
              </button>
            )}
            {attributes.length > 0 && (
              <ul className="attrs" aria-label={t("card.attributes")}>
                {attributes.map((value) => (
                  <li key={value}>{value}</li>
                ))}
              </ul>
            )}
            {notes.length > 0 && (
              <ul className="notes">
                {notes.map((flag) => (
                  <li key={flag}>
                    <AlertTriangle size={14} aria-hidden /> {t(`flag.${flag}`)}
                  </li>
                ))}
              </ul>
            )}
          </>,
        )}

        {section(
          "product",
          mode === "pick" ? (
            <CatalogPicker
              item={item}
              products={products}
              currentId={item.match?.product_id ?? null}
              busy={busy}
              onCancel={() => setMode("view")}
              onPick={(picked) =>
                void save({ product_id: picked.product_id, confidence: 1, manual_unit_price_chf: null })
              }
              alternative={typePriceLink}
            />
          ) : manual ? (
            <p className="csec__empty">{t("card.replacedByHand")}</p>
          ) : item.match ? (
            <>
              <div className="product">
                <div className="product__main">
                  <p className="product__desc">{product?.description ?? item.match.product_id}</p>
                  <p className="product__meta">
                    {item.match.product_id}
                    {product?.category ? ` · ${product.category}` : ""}
                    {product?.manufacturer ? ` · ${product.manufacturer} ${product.model ?? ""}` : ""}
                  </p>
                  <p className="product__meta">
                    {t("card.netUnitCost")}:{" "}
                    {product?.net_cost_chf != null ? (
                      `${formatChf(product.net_cost_chf, true)} / ${product.unit ?? "?"}`
                    ) : (
                      <span className="warn-text">{t("card.noCatalogPrice")}</span>
                    )}
                  </p>
                </div>
                {confidence != null && (
                  <span className={`conf ${sure ? "conf--sure" : "conf--unsure"}`}>
                    <span className="conf__bar">
                      <span style={{ width: `${confidence}%` }} />
                    </span>
                    {sure ? t("card.sure", { pct: confidence }) : t("card.unsure", { pct: confidence })}
                  </span>
                )}
              </div>
              {item.status === "supplier_quote_required" && (
                <p className="csec__note">
                  <AlertTriangle size={14} aria-hidden /> {t("card.supplierQuote")}
                </p>
              )}
              {!blocked && (
                <div className="csec__actions">
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => open("pick")}>
                    {t("card.changeProduct")}
                  </button>
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    disabled={busy}
                    onClick={() => void save({ product_id: null })}
                  >
                    <Trash2 size={13} aria-hidden /> {t("card.removeProduct")}
                  </button>
                </div>
              )}
            </>
          ) : (
            <p className="csec__empty">{t("card.noProduct")}</p>
          ),
        )}

        {section(
          "labour",
          mode === "labour" && item.match ? (
            <LabourPicker
              item={item}
              rules={rules}
              currentCode={item.match.install_code}
              busy={busy}
              onCancel={() => setMode("view")}
              onPick={(picked) =>
                void save({
                  product_id: item.match?.product_id,
                  install_code: picked.install_code,
                  confidence: item.match?.confidence,
                })
              }
            />
          ) : manual ? (
            <p className="csec__empty">{t("card.replacedByHand")}</p>
          ) : !item.match ? (
            <p className="csec__empty">{t("card.labourNeedsProduct")}</p>
          ) : !rule ? (
            <p className="csec__empty">
              {t("card.noLabourRule", { code: item.match.install_code ?? "—" })}
            </p>
          ) : (
            <>
              <p className="product__desc">{rule.work_type ?? rule.install_code}</p>
              <p className="product__meta">
                {rule.install_code}
                {rule.labour_role ? ` · ${rule.labour_role}` : ""}
              </p>
              <dl className="calc calc--compact">
                <div className="calc__row">
                  <dt>{t("card.baseHours")}</dt>
                  <dd>
                    {formatNumber(rule.base_hours_per_unit, 2)} h / {rule.unit ?? "?"}
                  </dd>
                </div>
                {rule.factor_keys.length > 0 && (
                  <div className="calc__row">
                    <dt>{t("card.factors")}</dt>
                    <dd className="factors">
                      {rule.factor_keys.map((key) => (
                        <span key={key} className="factor" title={key}>
                          {factorLabel(key)}{" "}
                          <strong>
                            {key === "site_efficiency" ? "÷" : "×"} {formatNumber(factors[key], 2)}
                          </strong>
                        </span>
                      ))}
                    </dd>
                  </div>
                )}
                <div className="calc__row">
                  <dt>{t("card.totalHours")}</dt>
                  <dd>{result?.adjusted_install_hours != null ? `${formatNumber(result.adjusted_install_hours, 2)} h` : "—"}</dd>
                </div>
                <div className="calc__row">
                  <dt>{t("card.rate")}</dt>
                  <dd>{rate != null ? `${formatChf(rate, true)}/h` : "—"}</dd>
                </div>
                <div className="calc__row calc__row--total">
                  <dt>{t("card.labourCost")}</dt>
                  <dd>{result?.labour_cost_chf != null ? formatChf(result.labour_cost_chf, true) : "—"}</dd>
                </div>
              </dl>
              {!blocked && (
                <div className="csec__actions">
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => open("labour")}>
                    {t("card.changeLabour")}
                  </button>
                </div>
              )}
            </>
          ),
        )}

        {section(
          "price",
          mode === "price" ? (
            <form className="inline-form" onSubmit={submitPrice}>
              {item.quantity == null && (
                <>
                  <input
                    className="input input--num"
                    value={qtyDraft}
                    inputMode="decimal"
                    placeholder={t("card.quantity")}
                    aria-label={t("card.quantity")}
                    onChange={(event) => setQtyDraft(event.target.value)}
                  />
                  <select
                    className="input"
                    value={unitDraft}
                    aria-label={t("card.unit")}
                    onChange={(event) => setUnitDraft(event.target.value as Unit)}
                  >
                    {UNITS.map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                  <span className="muted">×</span>
                </>
              )}
              <span className="input-affix">
                <span>CHF</span>
                <input
                  autoFocus
                  className="input input--num"
                  value={priceDraft}
                  inputMode="decimal"
                  aria-label={t("card.unitPrice")}
                  onChange={(event) => setPriceDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.stopPropagation();
                      setMode("view");
                    }
                  }}
                />
                <span>/ {item.unit ?? unitDraft}</span>
              </span>
              <button type="submit" className="btn btn--primary btn--sm" disabled={busy}>
                {t("common.save")}
              </button>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setMode("view")}>
                {t("common.cancel")}
              </button>
              <p className="inline-form__hint">{t("card.manualHint")}</p>
            </form>
          ) : (
            <>
              <dl className="calc">
                {manual ? (
                  <div className="calc__row">
                    <dt>{t("card.manualPrice")}</dt>
                    <dd>
                      {qty ?? "—"} × {formatChf(item.manual_unit_price_chf, true)}
                    </dd>
                  </div>
                ) : (
                  <>
                    <div className="calc__row">
                      <dt>{t("card.material")}</dt>
                      <dd>{result?.material_cost_chf != null ? formatChf(result.material_cost_chf, true) : "—"}</dd>
                    </div>
                    <div className="calc__row">
                      <dt>{t("card.labour")}</dt>
                      <dd>{result?.labour_cost_chf != null ? formatChf(result.labour_cost_chf, true) : "—"}</dd>
                    </div>
                  </>
                )}
                <div className="calc__row calc__row--total">
                  <dt>{t("card.directCost")}</dt>
                  <dd className={direct == null ? "warn-text" : ""}>{direct != null ? formatChf(direct, true) : "—"}</dd>
                </div>
              </dl>
              {!blocked && (
                <div className="csec__actions">
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => open("price")}>
                    <PencilLine size={13} aria-hidden /> {manual ? t("card.changePrice") : t("card.typePriceInstead")}
                  </button>
                  {manual && (
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      disabled={busy}
                      onClick={() => void save({ manual_unit_price_chf: null })}
                    >
                      <Trash2 size={13} aria-hidden /> {t("card.removePrice")}
                    </button>
                  )}
                </div>
              )}
            </>
          ),
        )}
      </div>
    </div>
  );
});
