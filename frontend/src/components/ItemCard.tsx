import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  PencilLine,
  Search,
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
import { nextAction, pricingChain, type NextAction, type NodeStatus } from "../lib/chain";
import type { ItemState } from "../lib/flags";
import { formatAmount, formatChf, formatNumber } from "../lib/format";
import { itemName, posNumber, searchProducts, suggestedProducts } from "../lib/items";
import { useI18n } from "../i18n";

const UNITS: Unit[] = ["pc", "m", "m2", "h", "LS", "system"];
const PICKER_LIMIT = 60;
// Flags about how the tender text was read; the product's own are in its panel.
const TEXT_NOTE_FLAGS = ["unclear_unit", "missing_unit", "unparsed_row", "language_uncertain"];
const PRODUCT_NOTE_FLAGS = ["low_confidence_match", "multi_variant_ambiguous"];

export interface ItemPatch {
  quantity?: number;
  unit?: Unit;
  product_id?: string | null;
  install_code?: string;
  confidence?: number;
  manual_unit_price_chf?: number | null;
  offer_price_chf?: number | null;
  price_confirmed?: boolean;
}

/** Which row of the card is open. */
type Panel = "material" | "labour" | "hand" | null;
/** What the open row is doing: reading, or one of the forms. */
type Mode = "view" | "quantity" | "pick" | "labour" | "price";

function parseNumber(value: string): number | null {
  const parsed = Number.parseFloat(value.replace(/['’\s]/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

/** Catalogue texts write m3 / m2; show them as units. */
function prettyUnits(text: string): string {
  return text.replace(/\bm3\b/g, "m³").replace(/\bm2\b/g, "m²");
}


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

/** One row of the card: label + status dot, what it is, its amount; opens a panel. */
function CostRow({
  label,
  status,
  title,
  muted,
  value,
  open,
  onToggle,
  children,
}: {
  label: string;
  status: NodeStatus | null;
  title: string;
  muted?: boolean;
  value: number | null;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const { t } = useI18n();
  return (
    <div className={`crow ${open ? "is-open" : ""}`}>
      <button type="button" className="crow__head" aria-expanded={open} onClick={onToggle}>
        <span className="crow__label">
          {label}
          {status && status !== "done" && (
            <span className={`crow__dot crow__dot--${status}`} title={t(`card.status.${status}`)} />
          )}
        </span>
        <span className={`crow__title ${muted ? "is-muted" : ""}`} title={title}>
          {title}
        </span>
        <span className="crow__value">{formatAmount(value)}</span>
        {open ? <ChevronDown size={16} aria-hidden /> : <ChevronRight size={16} aria-hidden />}
      </button>
      {open && <div className="crow__panel">{children}</div>}
    </div>
  );
}

/**
 * One item under investigation, as a compact card: what it is and where it
 * comes from (header), what it costs — material and labour, each opening on
 * how it was priced — the direct cost, and one next step in the footer.
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
    /** The bid scenario whose offer price is shown. */
    scenario: string;
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
  const chain = pricingChain(item, result, product, rule);
  const next = nextAction(chain);
  const blocked = chain.some((node) => node.status === "missing");
  const status = (key: "product" | "labour") => chain.find((node) => node.key === key)?.status ?? null;
  const typedOffer = item.offer_price_chf != null;
  const manual = item.manual_unit_price_chf != null || typedOffer;

  // Both rows start closed; the next step opens the one it needs.
  const [panel, setPanel] = useState<Panel>(null);
  const [mode, setMode] = useState<Mode>("view");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [priceDraft, setPriceDraft] = useState("");
  const [qtyDraft, setQtyDraft] = useState("");
  const [unitDraft, setUnitDraft] = useState<Unit>(item.unit ?? "pc");

  useImperativeHandle(ref, () => ({ focus: () => rootRef.current?.focus({ preventScroll: true }) }), []);

  useEffect(() => {
    setPanel(null);
    setMode("view");
    setError(null);
  }, [item.lv_id]);

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

  const open = (nextMode: Mode) => {
    setError(null);
    if (nextMode === "price") {
      setPriceDraft(
        item.offer_price_chf != null
          ? String(item.offer_price_chf)
          : item.manual_unit_price_chf != null
            ? String(item.manual_unit_price_chf)
            : "",
      );
      setPanel("hand");
    }
    if (nextMode === "quantity" || nextMode === "price") {
      setQtyDraft(item.quantity != null ? String(item.quantity) : "");
      setUnitDraft(item.unit ?? "pc");
    }
    if (nextMode === "pick") setPanel("material");
    if (nextMode === "labour") setPanel("labour");
    setMode(nextMode);
  };

  const runNext = (action: NextAction) => {
    if (action === "confirmPrice") void save({ price_confirmed: true });
    else if (action === "quantity") open("quantity");
    else if (action === "product") open("pick");
    else if (action === "labour") open("labour");
    else open("price");
  };

  const toggle = (row: Exclude<Panel, null>) => {
    setMode("view");
    setPanel((current) => (current === row ? null : row));
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
    if (price == null || price < 0) return setError(t("card.priceInvalid"));
    if (typedOffer) {
      void save({ offer_price_chf: price, price_confirmed: true });
      return;
    }
    const quantity = item.quantity ?? parseNumber(qtyDraft);
    if (quantity == null || quantity <= 0) return setError(t("card.quantityInvalid"));
    void save({ manual_unit_price_chf: price, ...(item.quantity == null ? { quantity, unit: unitDraft } : {}) });
  };

  const name = itemName(item) ?? t("items.noDescription");
  const number = posNumber(item);
  const waste = parameters?.allowances?.material_waste_pct;
  const factors = parameters?.productivity_factors ?? {};
  const unit = item.unit ?? "";
  const confidence = item.match ? Math.round(item.match.confidence * 100) : null;
  const notes = item.flags.filter((flag) => TEXT_NOTE_FLAGS.includes(flag));
  const productNotes = item.flags.filter((flag) => PRODUCT_NOTE_FLAGS.includes(flag));
  const direct = result?.direct_position_cost_chf ?? null;
  const hours = result?.adjusted_install_hours ?? null;
  const rate = result?.hourly_rate_chf ?? rule?.default_hourly_rate_chf ?? null;
  const factorLabel = (key: string) => {
    const label = t(`params.fields.${key}.label`);
    return label.startsWith("params.") ? key.replace(/_/g, " ") : label;
  };

  const unitSelect = (
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
  );
  const escape = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      setMode("view");
    }
  };

  // Labour row: what it says, depending on how far the item got.
  const labourTitle = !item.match
    ? t("card.labourNeedsProductShort")
    : !rule
      ? product?.supplier_quote_required
        ? t("card.labourBySupplierShort")
        : t("card.noLabourShort")
      : `${rule.work_type ?? rule.install_code}${hours != null ? ` · ${formatNumber(hours, 2)} h` : ""}`;

  // The one next step, hidden while its own form is open.
  const showNext = Boolean(next) && mode === "view";
  const footerStart = (() => {
    if (item.price_confirmed && state === "priced") {
      return (
        <button type="button" className="linkbtn linkbtn--muted" disabled={busy} onClick={() => void save({ price_confirmed: false })}>
          {t("card.unconfirm")}
        </button>
      );
    }
    if (!manual && !blocked && mode !== "price") {
      return (
        <button type="button" className="linkbtn linkbtn--muted" onClick={() => open("price")}>
          <PencilLine size={14} aria-hidden /> {t("card.typePriceInstead")}
        </button>
      );
    }
    return null;
  })();

  return (
    <div ref={rootRef} tabIndex={-1} className={`icard icard--${state}`} aria-label={t("card.aria", { name })}>
      <header className="ic-head">
        {/* A click on the title row, beside the name, closes the card (the
            buttons in it keep their own action). */}
        <div
          className="ic-head__top"
          title={t("card.close")}
          onClick={(event) => {
            if ((event.target as HTMLElement).closest("button, a, input, select, form")) return;
            if (window.getSelection()?.toString()) return; // selecting the name's text
            onClose();
          }}
        >
          <h3 className="ic-title" title={name}>
            {name}
          </h3>
          <div className="ic-nav">
            <button type="button" className="iconbtn iconbtn--sm" disabled={!hasPrev} aria-label={t("card.prev")} title={`${t("card.prev")} (K)`} onClick={onPrev}>
              <ChevronUp size={18} />
            </button>
            <button type="button" className="iconbtn iconbtn--sm" disabled={!hasNext} aria-label={t("card.next")} title={`${t("card.next")} (J)`} onClick={onNext}>
              <ChevronDown size={18} />
            </button>
            <button type="button" className="iconbtn iconbtn--sm" aria-label={t("card.close")} title={`${t("card.close")} (Esc)`} onClick={onClose}>
              <X size={18} />
            </button>
          </div>
        </div>
        <div className="ic-meta">
          <span className="ic-id" title={number ? t("card.pos", { number }) : undefined}>
            {item.lv_id}
          </span>
          {item.source_page && (
            <button type="button" className="ic-page" onClick={onShowInPdf} title={t("card.showInPdf")}>
              {t("pdf.page", { page: item.source_page })} <ArrowUpRight size={14} aria-hidden />
            </button>
          )}
          {mode === "quantity" ? (
            <form className="inline-form" onSubmit={submitQuantity}>
              <input
                autoFocus
                className="input input--num"
                value={qtyDraft}
                inputMode="decimal"
                aria-label={t("card.quantity")}
                onChange={(event) => setQtyDraft(event.target.value)}
                onKeyDown={escape}
              />
              {unitSelect}
              <button type="submit" className="btn btn--primary btn--sm" disabled={busy}>
                {t("common.save")}
              </button>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setMode("view")}>
                {t("common.cancel")}
              </button>
            </form>
          ) : (
            <span className="ic-qty">
              {item.quantity != null ? (
                `${formatNumber(item.quantity)} ${unit}`.trim()
              ) : (
                <span className="warn-text">{t("card.noQuantity")}</span>
              )}
              <button type="button" className="ic-edit" aria-label={t("card.editQuantity")} title={t("card.editQuantity")} onClick={() => open("quantity")}>
                <PencilLine size={14} />
              </button>
            </span>
          )}
          <span className={`pill pill--${state}`}>{t(`items.state.${state}`)}</span>
        </div>
        {notes.length > 0 && (
          <ul className="ic-notes">
            {notes.map((flag) => (
              <li key={flag}>
                <AlertTriangle size={13} aria-hidden /> {t(`flag.${flag}`)}
              </li>
            ))}
          </ul>
        )}
      </header>

      <div className="ic-rows">
        {(manual || mode === "price") ? (
          <CostRow
            label={t("card.byHand")}
            status={null}
            title={
              typedOffer
                ? t("card.typedOfferShort")
                : item.manual_unit_price_chf != null
                  ? `${formatChf(item.manual_unit_price_chf, true)} / ${unit || "?"}`
                  : t("card.typePriceShort")
            }
            muted={!manual}
            value={manual ? direct : null}
            open={panel === "hand"}
            onToggle={() => toggle("hand")}
          >
            {mode === "price" ? (
              <form className="inline-form" onSubmit={submitPrice}>
                {item.quantity == null && !typedOffer && (
                  <>
                    <input
                      className="input input--num"
                      value={qtyDraft}
                      inputMode="decimal"
                      placeholder={t("card.quantity")}
                      aria-label={t("card.quantity")}
                      onChange={(event) => setQtyDraft(event.target.value)}
                    />
                    {unitSelect}
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
                    aria-label={typedOffer ? t("card.typedOffer") : t("card.unitPrice")}
                    onChange={(event) => setPriceDraft(event.target.value)}
                    onKeyDown={escape}
                  />
                  {!typedOffer && <span>/ {item.unit ?? unitDraft}</span>}
                </span>
                <button type="submit" className="btn btn--primary btn--sm" disabled={busy}>
                  {t("common.save")}
                </button>
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => { setMode("view"); if (!manual) setPanel(null); }}>
                  {t("common.cancel")}
                </button>
                <p className="inline-form__hint">{typedOffer ? t("priceCell.hint.typed") : t("card.manualHint")}</p>
              </form>
            ) : (
              <>
                <p className="crow__text">{typedOffer ? t("priceCell.hint.typed") : t("card.manualHint")}</p>
                <div className="crow__actions">
                  <button type="button" className="linkbtn" onClick={() => open("price")}>
                    {t("card.changePrice")}
                  </button>
                  <button
                    type="button"
                    className="linkbtn linkbtn--muted"
                    disabled={busy}
                    onClick={() => void save(typedOffer ? { offer_price_chf: null } : { manual_unit_price_chf: null })}
                  >
                    {t("card.removePrice")}
                  </button>
                </div>
              </>
            )}
          </CostRow>
        ) : null}

        {!manual && (
          <>
            <CostRow
              label={t("card.material")}
              status={status("product")}
              title={product ? prettyUnits(product.description ?? product.product_id) : t("card.noProductShort")}
              muted={!product}
              value={result?.material_cost_chf ?? null}
              open={panel === "material"}
              onToggle={() => toggle("material")}
            >
              {mode === "pick" ? (
                <CatalogPicker
                  item={item}
                  products={products}
                  currentId={item.match?.product_id ?? null}
                  busy={busy}
                  onCancel={() => setMode("view")}
                  onPick={(picked) => void save({ product_id: picked.product_id, confidence: 1, manual_unit_price_chf: null })}
                  alternative={
                    <button type="button" className="linkbtn" onClick={() => open("price")}>
                      {t("card.orTypePrice")}
                    </button>
                  }
                />
              ) : product && item.match ? (
                <>
                  <p className="crow__strong">{prettyUnits(product.description ?? product.product_id)}</p>
                  <dl className="kv">
                    <dt>{t("card.article")}</dt>
                    <dd className="mono">
                      {product.product_id}
                      {product.manufacturer ? ` · ${product.manufacturer} ${product.model ?? ""}` : ""}
                    </dd>
                    <dt>{t("card.netPrice")}</dt>
                    <dd className="mono">
                      {product.net_cost_chf != null ? (
                        <>
                          {formatAmount(product.net_cost_chf)} / {product.unit ?? "?"}
                          {waste != null && ` + ${formatNumber(waste)}% ${t("card.waste")}`}
                        </>
                      ) : (
                        <span className="warn-text">{t("card.noCatalogPrice")}</span>
                      )}
                    </dd>
                    {confidence != null && (
                      <>
                        <dt>{t("card.match")}</dt>
                        <dd className="kv__match">
                          <span className={`conf__bar ${confidence >= 70 ? "is-sure" : "is-unsure"}`}>
                            <span style={{ width: `${confidence}%` }} />
                          </span>
                          {confidence}%
                        </dd>
                      </>
                    )}
                  </dl>
                  {item.status === "supplier_quote_required" && !item.price_confirmed && (
                    <p className="crow__warn">
                      <AlertTriangle size={15} aria-hidden /> {t("card.supplierQuote")}
                    </p>
                  )}
                  {!item.price_confirmed &&
                    productNotes.map((flag) => (
                      <p key={flag} className="crow__warn">
                        <AlertTriangle size={15} aria-hidden /> {t(`flag.${flag}`)}
                      </p>
                    ))}
                  <div className="crow__actions">
                    <button type="button" className="linkbtn" onClick={() => open("pick")}>
                      {t("card.changeProduct")}
                    </button>
                    <button type="button" className="linkbtn linkbtn--muted" disabled={busy} onClick={() => void save({ product_id: null })}>
                      {t("card.removeProduct")}
                    </button>
                  </div>
                </>
              ) : (
                <p className="crow__text">{t("card.noProduct")}</p>
              )}
            </CostRow>

            <CostRow
              label={t("card.labour")}
              status={item.match ? status("labour") : null}
              title={labourTitle}
              muted={!rule}
              value={result?.labour_cost_chf ?? null}
              open={panel === "labour"}
              onToggle={() => toggle("labour")}
            >
              {mode === "labour" && item.match ? (
                <LabourPicker
                  item={item}
                  rules={rules}
                  currentCode={item.match.install_code}
                  busy={busy}
                  onCancel={() => setMode("view")}
                  onPick={(picked) =>
                    void save({ product_id: item.match?.product_id, install_code: picked.install_code, confidence: item.match?.confidence })
                  }
                />
              ) : !item.match ? (
                <p className="crow__text">{t("card.labourNeedsProduct")}</p>
              ) : !rule ? (
                <>
                  <p className="crow__text">
                    {product?.supplier_quote_required ? t("card.labourBySupplier") : t("card.noLabourRule", { code: item.match.install_code ?? "—" })}
                  </p>
                  <div className="crow__actions">
                    <button type="button" className="linkbtn" onClick={() => open("labour")}>
                      {t("card.changeLabour")}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="crow__strong">
                    {rule.work_type ?? rule.install_code}
                    {rule.labour_role && <span className="muted"> · {rule.labour_role.replace(/_/g, " ")}</span>}
                  </p>
                  <p className="formula mono">
                    {item.quantity != null && item.quantity !== 1 && `${formatNumber(item.quantity)} × `}
                    {formatAmount(rule.base_hours_per_unit)} h
                    {rule.factor_keys.map((key) => (
                      <span key={key}>
                        {" "}
                        {key === "site_efficiency" ? "÷" : "×"} {formatAmount(factors[key])}
                      </span>
                    ))}{" "}
                    = {hours != null ? `${formatAmount(hours)} h` : "—"}
                  </p>
                  {rule.factor_keys.length > 0 && (
                    <ul className="chips">
                      {rule.factor_keys.map((key) => (
                        <li key={key}>
                          {factorLabel(key)} {formatAmount(factors[key])}
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="crow__line">
                    <span className="muted">
                      {hours != null ? formatNumber(hours, 2) : "—"} h × {rate != null ? formatChf(rate, true) : "—"} / h
                    </span>
                    <span className="mono">{formatAmount(result?.labour_cost_chf ?? null)}</span>
                  </p>
                  <div className="crow__actions">
                    <button type="button" className="linkbtn" onClick={() => open("labour")}>
                      {t("card.changeLabour")}
                    </button>
                  </div>
                </>
              )}
            </CostRow>
          </>
        )}

        <div className="ic-total">
          <span>{t("card.directCost")}</span>
          <strong className={`mono ${direct == null ? "warn-text" : ""}`}>
            {direct != null ? `CHF ${formatAmount(direct)}` : "—"}
          </strong>
        </div>
      </div>

      {error && (
        <p className="banner banner--error banner--sm icard__error" role="alert">
          {error}
        </p>
      )}

      {(showNext || footerStart) && (
        <footer className="ic-foot">
          <div className="ic-foot__start">{footerStart}</div>
          {showNext && next && (
            <button type="button" className="btn btn--dark" disabled={busy} onClick={() => runNext(next.action)}>
              {t(`card.nextStep.${next.action}`)}
            </button>
          )}
        </footer>
      )}
    </div>
  );
});
