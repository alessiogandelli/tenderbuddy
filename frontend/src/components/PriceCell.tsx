import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { Check, Plus, RotateCcw, X } from "lucide-react";
import type { Item } from "../api/types";
import type { ItemState } from "../lib/flags";
import type { CellAnchor } from "../lib/pageText";
import { formatOffer } from "../lib/format";
import { useI18n } from "../i18n";
import type { ItemPatch } from "./ItemCard";

/** How a price reads on the page: final (printed, black), to check (amber), none. */
export type PriceTone = "final" | "check" | "open";

export function priceTone(state: ItemState): PriceTone {
  return state === "open" ? "open" : state === "check" ? "check" : "final";
}

function parseAmount(value: string): number | null {
  const parsed = Number.parseFloat(value.replace(/['’\s]/g, "").replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

/** Edit the printed amount of one position, right next to its price cell. */
function PriceEditor({
  item,
  tone,
  amount,
  scenarioLabel,
  up,
  onSave,
  onClose,
}: {
  item: Item;
  tone: PriceTone;
  amount: number | null;
  scenarioLabel: string;
  up: boolean;
  onSave: (patch: ItemPatch) => Promise<void>;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const ref = useRef<HTMLFormElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [draft, setDraft] = useState(amount != null ? amount.toFixed(2) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const typed = item.offer_price_chf != null;

  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
    inputRef.current?.select();
  }, []);

  // A click anywhere else closes the editor without saving.
  useEffect(() => {
    const onDown = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [onClose]);

  const run = async (patch: ItemPatch) => {
    setBusy(true);
    setError(null);
    try {
      await onSave(patch);
      onClose();
    } catch {
      setError(t("priceCell.saveError"));
      setBusy(false);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const value = parseAmount(draft);
    if (value == null) return setError(t("priceCell.invalid"));
    // Unchanged and computed: saving just confirms it, so it keeps following
    // the scenario. A new figure becomes the printed total, confirmed.
    if (amount != null && !typed && Math.abs(value - amount) < 0.005) {
      void run({ price_confirmed: true });
    } else {
      void run({ offer_price_chf: value, price_confirmed: true });
    }
  };

  return (
    <form
      ref={ref}
      className={`pc-edit ${up ? "pc-edit--up" : ""}`}
      onSubmit={submit}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }
      }}
      onClick={(event) => event.stopPropagation()}
    >
      <div className="pc-edit__head">
        <span className="pc-edit__id">{item.lv_id}</span>
        <span className={`pc-edit__tone pc-edit__tone--${tone}`}>{t(`priceCell.tone.${tone}`)}</span>
        <button type="button" className="iconbtn iconbtn--sm" aria-label={t("card.close")} onClick={onClose}>
          <X size={14} />
        </button>
      </div>
      <label className="pc-edit__label" htmlFor={`pc-${item.lv_id}`}>
        {t("priceCell.label", { scenario: scenarioLabel })}
      </label>
      <span className="input-affix pc-edit__input">
        <span>CHF</span>
        <input
          id={`pc-${item.lv_id}`}
          ref={inputRef}
          className="input input--num"
          inputMode="decimal"
          value={draft}
          placeholder="0.00"
          onChange={(event) => setDraft(event.target.value)}
        />
      </span>
      <p className="pc-edit__hint">{t(`priceCell.hint.${typed ? "typed" : tone}`)}</p>
      {error && (
        <p className="banner banner--error banner--sm" role="alert">
          {error}
        </p>
      )}
      <div className="pc-edit__actions">
        {tone === "check" && !typed && (
          <button type="button" className="btn btn--sm" disabled={busy} onClick={() => void run({ price_confirmed: true })}>
            <Check size={14} aria-hidden /> {t("priceCell.confirm")}
          </button>
        )}
        {typed && (
          <button type="button" className="btn btn--ghost btn--sm" disabled={busy} onClick={() => void run({ offer_price_chf: null })}>
            <RotateCcw size={13} aria-hidden /> {t("priceCell.backToComputed")}
          </button>
        )}
        <button type="submit" className="btn btn--primary btn--sm" disabled={busy}>
          {t("common.save")}
        </button>
      </div>
    </form>
  );
}

/**
 * The price cell of one position, drawn on the PDF like the offer will print
 * it: final prices in black, prices still to check in amber (not printed until
 * confirmed), an empty cell for positions without a price. Clicking it opens
 * the editor; every cell can be priced or re-priced by hand.
 */
export function PriceCell({
  item,
  state,
  amount,
  scenarioLabel,
  style,
  anchor,
  active,
  editing,
  outlined,
  onOpen,
  onClose,
  onSave,
}: {
  item: Item;
  state: ItemState;
  amount: number | null;
  scenarioLabel: string;
  style: CSSProperties;
  /** Where the row's baseline is, and whether the PDF already prints something here. */
  anchor: CellAnchor | null;
  active: boolean;
  editing: boolean;
  outlined: boolean;
  onOpen: () => void;
  onClose: () => void;
  onSave: (patch: ItemPatch) => Promise<void>;
}) {
  const { t } = useI18n();
  const tone = priceTone(state);
  const cellRef = useRef<HTMLButtonElement | null>(null);
  const shown = tone === "open" ? null : amount;
  // Cells low on the page open their editor upwards, so it stays on the sheet.
  const up = (item.price_bbox?.[1] ?? 0) > 0.5;

  const close = () => {
    onClose();
    cellRef.current?.focus({ preventScroll: true });
  };

  return (
    <div
      className={`pc pc--${tone} ${active ? "is-active" : ""} ${outlined ? "is-outlined" : ""} ${editing ? "is-editing" : ""}`}
      style={style}
    >
      <button
        ref={cellRef}
        type="button"
        className="pc__cell"
        aria-label={t("priceCell.aria", { id: item.lv_id, state: t(`priceCell.tone.${tone}`) })}
        title={t(`priceCell.title.${tone}`)}
        onClick={onOpen}
      >
        {shown != null ? (
          <span
            className={`pc__amount ${anchor?.baseline != null ? "is-anchored" : ""} ${
              anchor?.prefilled ? "is-masking" : ""
            }`}
            // On the row's baseline, like the exported PDF prints it.
            style={anchor?.baseline != null ? { top: `${anchor.baseline * 100}%` } : undefined}
          >
            {formatOffer(shown)}
          </span>
        ) : (
          <Plus className="pc__add" aria-hidden />
        )}
      </button>
      {editing && (
        <PriceEditor
          item={item}
          tone={tone}
          amount={shown}
          scenarioLabel={scenarioLabel}
          up={up}
          onSave={onSave}
          onClose={close}
        />
      )}
    </div>
  );
}
