import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { Plus, RotateCcw, X } from "lucide-react";
import type { FormField } from "../api/types";
import { formatOffer } from "../lib/format";
import { useI18n } from "../i18n";

function parseAmount(value: string): number | null {
  const parsed = Number.parseFloat(value.replace(/['’\s]/g, "").replace(",", "."));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

/** A value as the form prints it: an amount (12'345.60) or a rate (2.00). */
export function formatFormValue(value: number, kind: FormField["kind"]): string {
  return kind === "percent" ? value.toFixed(2) : formatOffer(value);
}

/** Edit one blank; the draft starts from the shown value before the input focuses. */
function FormEditor({
  field,
  name,
  value,
  up,
  onSave,
  onClose,
}: {
  field: FormField;
  name: string;
  value: number | null;
  up: boolean;
  onSave: (value: number | null) => Promise<void>;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const formRef = useRef<HTMLFormElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [draft, setDraft] = useState(value != null ? value.toFixed(2) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const typed = field.override != null;
  const isRate = field.kind === "percent";

  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
    inputRef.current?.select();
  }, []);

  // A click anywhere else closes the editor without saving.
  useEffect(() => {
    const onDown = (event: MouseEvent) => {
      if (!formRef.current?.contains(event.target as Node)) onClose();
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [onClose]);

  const run = async (next: number | null) => {
    setBusy(true);
    setError(null);
    try {
      await onSave(next);
      onClose();
    } catch {
      setError(t("priceCell.saveError"));
      setBusy(false);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const parsed = draft.trim() === "" ? null : parseAmount(draft);
    if (draft.trim() !== "" && parsed == null) return setError(t("priceCell.invalid"));
    if (isRate && parsed != null && parsed >= 100) return setError(t("formCell.rateInvalid"));
    void run(parsed);
  };

  return (
    <form
      ref={formRef}
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
        <span className="pc-edit__id">{name}</span>
        <button type="button" className="iconbtn iconbtn--sm" aria-label={t("card.close")} onClick={onClose}>
          <X size={14} />
        </button>
      </div>
      <label className="pc-edit__label" htmlFor={`fc-${field.id}`}>
        {t(isRate ? "formCell.rateLabel" : "formCell.amountLabel")}
      </label>
      <span className="input-affix pc-edit__input">
        <span>{isRate ? "%" : "CHF"}</span>
        <input
          id={`fc-${field.id}`}
          ref={inputRef}
          className="input input--num"
          inputMode="decimal"
          value={draft}
          placeholder="0.00"
          onChange={(event) => setDraft(event.target.value)}
        />
      </span>
      <p className="pc-edit__hint">
        {t(`formCell.hint.${isRate ? "rate" : field.column === "revidiert" ? "revidiert" : typed ? "typed" : "computed"}`)}
      </p>
      {error && (
        <p className="banner banner--error banner--sm" role="alert">
          {error}
        </p>
      )}
      <div className="pc-edit__actions">
        {typed && !isRate && (
          <button type="button" className="btn btn--ghost btn--sm" disabled={busy} onClick={() => void run(null)}>
            <RotateCcw size={13} aria-hidden /> {t("formCell.backToComputed")}
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
 * One blank of the offer form, on the page where the PDF prints it: the value
 * covers the dotted leader and sits on its baseline, as the export writes it.
 * Clicking opens an editor; a typed value wins over the computed one (a rate
 * typed here becomes the tender's parameter).
 */
export function FormCell({
  field,
  value,
  style,
  editing,
  outlined,
  onOpen,
  onClose,
  onSave,
}: {
  field: FormField;
  value: number | null;
  style: CSSProperties;
  editing: boolean;
  outlined: boolean;
  onOpen: () => void;
  onClose: () => void;
  onSave: (value: number | null) => Promise<void>;
}) {
  const { t } = useI18n();
  const cellRef = useRef<HTMLButtonElement | null>(null);
  const name = `${t(`formCell.row.${field.row}`)} · ${t(`formCell.column.${field.column}`)}`;
  const typed = field.override != null;
  const isRate = field.kind === "percent";
  const height = field.bbox[3] - field.bbox[1];
  const baseline = height > 0 ? (field.baseline - field.bbox[1]) / height : 0.8;
  const up = field.bbox[1] > 0.5;

  const close = () => {
    onClose();
    cellRef.current?.focus({ preventScroll: true });
  };

  return (
    <div className={`fc ${outlined ? "is-outlined" : ""} ${editing ? "is-editing" : ""} ${typed ? "is-typed" : ""}`} style={style}>
      <button
        ref={cellRef}
        type="button"
        className="fc__cell"
        aria-label={`${name}: ${value != null ? formatFormValue(value, field.kind) : t("formCell.empty")}`}
        title={t(`formCell.title.${isRate ? "rate" : typed ? "typed" : value != null ? "computed" : "empty"}`)}
        onClick={onOpen}
      >
        {value != null ? (
          <span className="fc__value" style={{ top: `${baseline * 100}%` }}>
            {formatFormValue(value, field.kind)}
          </span>
        ) : (
          <Plus className="pc__add" aria-hidden />
        )}
      </button>
      {editing && (
        <FormEditor field={field} name={name} value={value} up={up} onSave={onSave} onClose={close} />
      )}
    </div>
  );
}
