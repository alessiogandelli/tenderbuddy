import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  FileText,
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
import { CHECK_FLAGS, type ItemState } from "../lib/flags";
import { formatChf, formatNumber } from "../lib/format";
import { posNumber, searchProducts, suggestedProducts } from "../lib/items";
import { PAGE_TYPE_COLORS } from "../lib/pageTypes";
import { useI18n } from "../i18n";

const UNITS: Unit[] = ["pc", "m", "m2", "h", "LS", "system"];
const PICKER_LIMIT = 60;

export interface ItemPatch {
  quantity?: number;
  unit?: Unit;
  product_id?: string | null;
  confidence?: number;
  manual_unit_price_chf?: number | null;
}

type Mode = "view" | "pick" | "price" | "quantity";

function parseNumber(value: string): number | null {
  const parsed = Number.parseFloat(value.replace(/['’\s]/g, "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

/** Search the catalogue and pick the product this item is. */
function CatalogPicker({
  item,
  products,
  currentId,
  busy,
  onPick,
  onCancel,
}: {
  item: Item;
  products: Product[];
  currentId: string | null;
  busy: boolean;
  onPick: (product: Product) => void;
  onCancel: () => void;
}) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => inputRef.current?.focus(), []);

  const suggested = useMemo(() => suggestedProducts(item, products), [item, products]);
  const found = useMemo(() => searchProducts(products, query), [products, query]);
  const list = query.trim() ? found : [...suggested, ...products.filter((p) => !suggested.includes(p))];

  return (
    <div className="picker" onKeyDown={(event) => event.key === "Escape" && onCancel()}>
      <div className="picker__head">
        <label className="search search--small">
          <Search size={15} aria-hidden />
          <input
            ref={inputRef}
            value={query}
            placeholder={t("detail.pickerSearch")}
            aria-label={t("detail.pickerSearch")}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <button type="button" className="iconbtn" aria-label={t("common.cancel")} onClick={onCancel}>
          <X size={16} />
        </button>
      </div>
      {!query.trim() && suggested.length > 0 && (
        <p className="picker__note">
          {t("detail.pickerSuggested", { size: String(item.attributes.size ?? "") })}
        </p>
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
        {list.length === 0 && <li className="picker__empty">{t("detail.pickerEmpty")}</li>}
      </ul>
      {list.length > PICKER_LIMIT && (
        <p className="picker__note">{t("detail.pickerMore", { count: list.length - PICKER_LIMIT })}</p>
      )}
    </div>
  );
}

/**
 * How one item was read and mapped: the text read from the tender, the
 * catalogue product it was matched to and the price that came out — plus the
 * hand fixes (pick a product, type a price, correct the quantity).
 */
export function ItemDetail({
  item,
  result,
  state,
  product,
  products,
  rule,
  pageType,
  parameters,
  onShowInPdf,
  onSave,
}: {
  item: Item;
  result: PositionResult | undefined;
  state: ItemState;
  product: Product | undefined;
  products: Product[];
  rule: ProductivityRule | undefined;
  pageType: PageType | undefined;
  parameters: ProjectParameters | null;
  onShowInPdf: () => void;
  onSave: (patch: ItemPatch) => Promise<void>;
}) {
  const { t } = useI18n();
  const [mode, setMode] = useState<Mode>("view");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [priceDraft, setPriceDraft] = useState("");
  const [qtyDraft, setQtyDraft] = useState("");
  const [unitDraft, setUnitDraft] = useState<Unit>(item.unit ?? "pc");

  useEffect(() => {
    setMode("view");
    setError(null);
    setExpanded(false);
  }, [item.lv_id]);

  const save = async (patch: ItemPatch) => {
    setBusy(true);
    setError(null);
    try {
      await onSave(patch);
      setMode("view");
    } catch {
      setError(t("detail.saveError"));
    } finally {
      setBusy(false);
    }
  };

  const openPrice = () => {
    setPriceDraft(item.manual_unit_price_chf != null ? String(item.manual_unit_price_chf) : "");
    setQtyDraft(item.quantity != null ? String(item.quantity) : "");
    setUnitDraft(item.unit ?? "pc");
    setMode("price");
  };
  const openQuantity = () => {
    setQtyDraft(item.quantity != null ? String(item.quantity) : "");
    setUnitDraft(item.unit ?? "pc");
    setMode("quantity");
  };

  const submitPrice = (event: FormEvent) => {
    event.preventDefault();
    const price = parseNumber(priceDraft);
    const quantity = item.quantity ?? parseNumber(qtyDraft);
    if (price == null || price < 0) return setError(t("detail.priceInvalid"));
    if (quantity == null || quantity <= 0) return setError(t("detail.quantityInvalid"));
    void save({
      manual_unit_price_chf: price,
      ...(item.quantity == null ? { quantity, unit: unitDraft } : {}),
    });
  };
  const submitQuantity = (event: FormEvent) => {
    event.preventDefault();
    const quantity = parseNumber(qtyDraft);
    if (quantity == null || quantity <= 0) return setError(t("detail.quantityInvalid"));
    void save({ quantity, unit: unitDraft });
  };

  const description = item.description_raw ?? item.description_normalized ?? "";
  const long = description.split("\n").length > 5 || description.length > 360;
  const manual = result?.price_source === "manual";
  const waste = parameters?.allowances?.material_waste_pct;
  const flags = item.flags.filter(
    (flag) => flag !== "no_match" && (CHECK_FLAGS.includes(flag) || flag.startsWith("missing") || flag === "unparsed_row"),
  );
  const confidence = item.match ? Math.round(item.match.confidence * 100) : null;
  const sure = item.match ? item.match.confidence >= 0.7 : false;
  const number = posNumber(item);

  return (
    <div className="detail" aria-label={t("detail.aria", { id: item.lv_id })}>
      <div className="detail__top">
        <span className="detail__id">
          {item.lv_id}
          {number ? ` · ${t("detail.pos", { number })}` : ""}
        </span>
        {item.source_page && (
          <button
            type="button"
            className="typechip typechip--btn"
            style={{ "--pc": PAGE_TYPE_COLORS[pageType ?? "other"] } as CSSProperties}
            onClick={onShowInPdf}
            title={t("detail.showInPdf")}
          >
            <FileText size={13} aria-hidden />
            {t("pdf.page", { page: item.source_page })}
            {pageType ? ` · ${t(`pageType.${pageType}`)}` : ""}
          </button>
        )}
        <span className={`detail__state detail__state--${state}`}>{t(`items.state.${state}`)}</span>
      </div>

      {/* 1 — what was read in the tender */}
      <section className="step">
        <h4 className="step__title">
          <span className="step__n">1</span> {t("detail.readTitle")}
        </h4>
        <p className={`detail__text ${long && !expanded ? "is-clamped" : ""}`}>
          {description || t("items.noDescription")}
        </p>
        {long && (
          <button type="button" className="linkbtn" onClick={() => setExpanded((value) => !value)}>
            {expanded ? t("detail.showLess") : t("detail.showMore")}
          </button>
        )}
        {mode === "quantity" ? (
          <form className="inline-form" onSubmit={submitQuantity}>
            <input
              autoFocus
              className="input input--num"
              value={qtyDraft}
              inputMode="decimal"
              aria-label={t("detail.quantity")}
              onChange={(event) => setQtyDraft(event.target.value)}
            />
            <select
              className="input"
              value={unitDraft}
              aria-label={t("detail.unit")}
              onChange={(event) => setUnitDraft(event.target.value as Unit)}
            >
              {UNITS.map((unit) => (
                <option key={unit} value={unit}>
                  {unit}
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
        ) : (
          <p className="detail__qty">
            <span className="muted">{t("detail.quantity")}</span>
            <strong>
              {item.quantity != null
                ? `${formatNumber(item.quantity)} ${item.unit ?? ""}`
                : t("detail.noQuantity")}
            </strong>
            <button
              type="button"
              className="iconbtn iconbtn--sm"
              aria-label={t("detail.editQuantity")}
              title={t("detail.editQuantity")}
              onClick={openQuantity}
            >
              <PencilLine size={14} />
            </button>
          </p>
        )}
      </section>

      {/* 2 — what it was mapped to */}
      <section className="step">
        <h4 className="step__title">
          <span className="step__n">2</span> {t("detail.mapTitle")}
        </h4>
        {mode === "pick" ? (
          <CatalogPicker
            item={item}
            products={products}
            currentId={item.match?.product_id ?? null}
            busy={busy}
            onCancel={() => setMode("view")}
            onPick={(picked) =>
              void save({ product_id: picked.product_id, confidence: 1, manual_unit_price_chf: null })
            }
          />
        ) : item.match ? (
          <div className="product">
            <div className="product__main">
              <p className="product__desc">{product?.description ?? item.match.product_id}</p>
              <p className="product__meta">
                {item.match.product_id}
                {product?.category ? ` · ${product.category}` : ""}
                {product?.manufacturer ? ` · ${product.manufacturer} ${product.model ?? ""}` : ""}
              </p>
              {rule && (
                <p className="product__meta">
                  {t("detail.work", { work: rule.work_type ?? rule.install_code })}
                </p>
              )}
            </div>
            {confidence != null && (
              <span className={`conf ${sure ? "conf--sure" : "conf--unsure"}`}>
                <span className="conf__bar">
                  <span style={{ width: `${confidence}%` }} />
                </span>
                {sure ? t("detail.sure", { pct: confidence }) : t("detail.unsure", { pct: confidence })}
              </span>
            )}
          </div>
        ) : (
          <p className="detail__empty">{t("detail.noProduct")}</p>
        )}
        {mode !== "pick" && (
          <div className="detail__actions">
            <button type="button" className="btn btn--sm" onClick={() => setMode("pick")}>
              <BookOpen size={14} aria-hidden />
              {item.match ? t("detail.changeProduct") : t("detail.pickProduct")}
            </button>
            {item.match && (
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                disabled={busy}
                onClick={() => void save({ product_id: null })}
              >
                <Trash2 size={14} aria-hidden /> {t("detail.removeProduct")}
              </button>
            )}
          </div>
        )}
      </section>

      {/* 3 — the price that came out */}
      <section className="step">
        <h4 className="step__title">
          <span className="step__n">3</span> {t("detail.priceTitle")}
        </h4>
        {mode === "price" ? (
          <form className="inline-form inline-form--price" onSubmit={submitPrice}>
            {item.quantity == null && (
              <>
                <input
                  className="input input--num"
                  value={qtyDraft}
                  inputMode="decimal"
                  placeholder={t("detail.quantity")}
                  aria-label={t("detail.quantity")}
                  onChange={(event) => setQtyDraft(event.target.value)}
                />
                <select
                  className="input"
                  value={unitDraft}
                  aria-label={t("detail.unit")}
                  onChange={(event) => setUnitDraft(event.target.value as Unit)}
                >
                  {UNITS.map((unit) => (
                    <option key={unit} value={unit}>
                      {unit}
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
                aria-label={t("detail.unitPrice")}
                onChange={(event) => setPriceDraft(event.target.value)}
              />
              <span>/ {item.unit ?? unitDraft}</span>
            </span>
            <button type="submit" className="btn btn--primary btn--sm" disabled={busy}>
              {t("common.save")}
            </button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setMode("view")}>
              {t("common.cancel")}
            </button>
            <p className="inline-form__hint">{t("detail.manualHint")}</p>
          </form>
        ) : result?.direct_position_cost_chf != null ? (
          <dl className="calc">
            {manual ? (
              <div className="calc__row">
                <dt>{t("detail.manualPrice")}</dt>
                <dd>
                  {formatNumber(result.quantity)} {result.unit ?? ""} ×{" "}
                  {formatChf(result.net_unit_cost_chf, true)}
                </dd>
              </div>
            ) : (
              <>
                <div className="calc__row">
                  <dt>{t("detail.material")}</dt>
                  <dd>
                    <span className="calc__how">
                      {formatNumber(result.quantity)} {result.unit ?? ""} ×{" "}
                      {formatChf(result.net_unit_cost_chf, true)}
                      {waste != null ? ` + ${formatNumber(waste)}% ${t("detail.waste")}` : ""}
                    </span>
                    {formatChf(result.material_cost_chf, true)}
                  </dd>
                </div>
                <div className="calc__row">
                  <dt>{t("detail.labour")}</dt>
                  <dd>
                    <span className="calc__how">
                      {formatNumber(result.adjusted_install_hours)} h ×{" "}
                      {formatChf(result.hourly_rate_chf, true)}/h
                    </span>
                    {formatChf(result.labour_cost_chf, true)}
                  </dd>
                </div>
              </>
            )}
            <div className="calc__row calc__row--total">
              <dt>{t("detail.directCost")}</dt>
              <dd>{formatChf(result.direct_position_cost_chf, true)}</dd>
            </div>
          </dl>
        ) : (
          <p className="detail__empty">
            {item.quantity == null ? t("detail.noPriceQuantity") : t("detail.noPrice")}
          </p>
        )}
        {mode !== "price" && (
          <div className="detail__actions">
            <button type="button" className="btn btn--sm" onClick={openPrice}>
              <PencilLine size={14} aria-hidden />
              {manual ? t("detail.changePrice") : t("detail.typePrice")}
            </button>
            {manual && (
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                disabled={busy}
                onClick={() => void save({ manual_unit_price_chf: null })}
              >
                <Trash2 size={14} aria-hidden /> {t("detail.removePrice")}
              </button>
            )}
          </div>
        )}
      </section>

      {(flags.length > 0 || item.status === "supplier_quote_required") && (
        <ul className="notes">
          {item.status === "supplier_quote_required" && (
            <li>
              <AlertTriangle size={14} aria-hidden /> {t("detail.supplierQuote")}
            </li>
          )}
          {flags.map((flag) => (
            <li key={flag}>
              <AlertTriangle size={14} aria-hidden /> {t(`flag.${flag}`)}
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p className="banner banner--error banner--sm" role="alert">
          {error}
        </p>
      )}
      {state === "open" && mode === "view" && (
        <p className="detail__next">
          <ArrowRight size={14} aria-hidden /> {t("detail.openHint")}
        </p>
      )}
    </div>
  );
}
