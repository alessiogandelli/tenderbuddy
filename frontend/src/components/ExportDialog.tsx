import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Download, FileSpreadsheet, FileText, Loader2, X } from "lucide-react";
import { api } from "../api/client";
import { useConnection } from "../api/connection";
import type { Bando } from "../api/types";
import { itemState, type ItemState } from "../lib/flags";
import { formatChf, formatNumber } from "../lib/format";
import { useI18n } from "../i18n";

/**
 * Export the offer: the tender PDF as received, with the selling price of each
 * priced position written in its price cell. Priced and hand-priced positions
 * always go in, positions without a price never do, and the ones still to check
 * only when chosen here. The amounts are the strategy chosen on the price page;
 * the dialog only shows it.
 */
export function ExportDialog({
  bando,
  open,
  scenario,
  onClose,
}: {
  bando: Bando;
  open: boolean;
  /** The tender's chosen strategy (set on the price page), used as is. */
  scenario: string;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const offline = useConnection() === "demo";
  const ref = useRef<HTMLDialogElement | null>(null);
  const scenarios = bando.recommended_bid_range?.scenarios ?? [];
  const [includeCheck, setIncludeCheck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ written: number; skipped: number; formWritten: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setDone(null);
      setError(null);
      dialog.showModal();
    }
    if (!open && dialog.open) dialog.close();
  }, [open, bando.id]);

  // Which positions go in, by state; a priced position also needs a price cell.
  const groups = useMemo(() => {
    const results = new Map(bando.position_results.map((result) => [result.lv_id, result]));
    const byState: Record<ItemState, string[]> = { priced: [], manual: [], check: [], open: [] };
    let noCell = 0;
    for (const item of bando.items) {
      const state = itemState(item, results.get(item.lv_id));
      byState[state].push(item.lv_id);
      if (state !== "open" && (!item.price_bbox || !item.source_page)) noCell += 1;
    }
    return { byState, noCell };
  }, [bando]);

  const chosen = scenarios.find((entry) => entry.scenario === scenario) ?? null;
  const ids = [
    ...groups.byState.priced,
    ...groups.byState.manual,
    ...(includeCheck ? groups.byState.check : []),
  ];
  const margin = chosen?.margin_pct ?? bando.parameters?.commercial?.target_margin_pct;
  const pct = (value: number | undefined) => (value === undefined ? "—" : `${formatNumber(value)}%`);

  const download = async () => {
    setBusy(true);
    setError(null);
    try {
      const file = await api.exportOfferPdf(bando.id, {
        lv_ids: ids,
        scenario: chosen ? chosen.scenario : null,
      });
      const url = URL.createObjectURL(file.blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = file.filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setDone({ written: file.written, skipped: file.skipped, formWritten: file.formWritten });
    } catch {
      setError(t("export.error"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <dialog
      ref={ref}
      className="xdlg"
      aria-labelledby="xdlg-title"
      onClose={onClose}
      onClick={(event) => {
        // A click on the backdrop (the dialog element itself) closes it.
        if (event.target === ref.current) onClose();
      }}
    >
      <div className="xdlg__panel">
        <header className="xdlg__head">
          <span className="xdlg__icon">
            <FileText size={20} aria-hidden />
          </span>
          <div>
            <h2 id="xdlg-title">{t("export.title")}</h2>
            <p className="muted">{t("export.intro")}</p>
          </div>
          <button type="button" className="iconbtn" aria-label={t("card.close")} onClick={onClose}>
            <X size={18} />
          </button>
        </header>

        {chosen && (
          <div className="xdlg__block">
            <p className="xdlg__label">{t("export.scenario")}</p>
            <div className="xopt xopt--fixed">
              <span className="xopt__name">{t(`price.scenario.${chosen.scenario}`)}</span>
              <span className="xopt__meta">
                {t("price.margin")} {pct(chosen.margin_pct)} · {formatChf(chosen.bid_price_chf)}
              </span>
              <span className="xopt__hint">{t("export.scenarioHint")}</span>
            </div>
          </div>
        )}

        <div className="xdlg__block">
          <p className="xdlg__label">{t("export.whatGoesIn")}</p>
          <ul className="xlist">
            <li>
              <span className="dot dot--priced" />
              <span className="xlist__name">{t("export.priced")}</span>
              <span className="xlist__count">{groups.byState.priced.length}</span>
              <span className="xlist__tag xlist__tag--in">{t("export.included")}</span>
            </li>
            <li>
              <span className="dot dot--manual" />
              <span className="xlist__name">{t("export.manual")}</span>
              <span className="xlist__count">{groups.byState.manual.length}</span>
              <span className="xlist__tag xlist__tag--in">{t("export.included")}</span>
            </li>
            <li className="xlist__toggle">
              <span className="dot dot--check" />
              <label className="xlist__name" htmlFor="export-check">
                {t("export.check")}
                <span className="xlist__hint">{t("export.checkHint")}</span>
              </label>
              <span className="xlist__count">{groups.byState.check.length}</span>
              <input
                id="export-check"
                type="checkbox"
                className="switch"
                checked={includeCheck}
                disabled={groups.byState.check.length === 0}
                onChange={(event) => {
                  setIncludeCheck(event.target.checked);
                  setDone(null);
                }}
              />
            </li>
            <li>
              <span className="dot dot--open" />
              <span className="xlist__name">{t("export.open")}</span>
              <span className="xlist__count">{groups.byState.open.length}</span>
              <span className="xlist__tag">{t("export.leftBlank")}</span>
            </li>
          </ul>
          {groups.noCell > 0 && <p className="xdlg__warn">{t("export.noCell", { count: groups.noCell })}</p>}
        </div>

        <p className="xdlg__note">
          {t("export.amountNote", {
            overhead: pct(bando.parameters?.commercial?.overhead_pct),
            transport: pct(bando.parameters?.allowances?.transport_equipment_pct),
            margin: pct(margin),
          })}
        </p>

        {done && (
          <p className="xdlg__done" role="status">
            <CheckCircle2 size={16} aria-hidden /> {t("export.done", { count: done.written })}
            {done.skipped > 0 && ` ${t("export.skipped", { count: done.skipped })}`}
            {done.formWritten > 0 && ` ${t("export.formDone", { count: done.formWritten, page: bando.offer_form?.page ?? "" })}`}
          </p>
        )}
        {error && (
          <p className="banner banner--error banner--sm" role="alert">
            {error}
          </p>
        )}
        {offline && <p className="xdlg__warn">{t("export.disabled")}</p>}

        <footer className="xdlg__foot">
          {offline ? (
            <button type="button" className="btn btn--ghost" disabled title={t("export.disabled")}>
              <FileSpreadsheet size={16} aria-hidden /> {t("export.csv")}
            </button>
          ) : (
            <a className="btn btn--ghost" href={api.exportUrl(bando.id, "csv")}>
              <FileSpreadsheet size={16} aria-hidden /> {t("export.csv")}
            </a>
          )}
          <button
            type="button"
            className="btn btn--primary"
            disabled={busy || ids.length === 0 || offline}
            title={offline ? t("export.disabled") : undefined}
            onClick={() => void download()}
          >
            {busy ? <Loader2 size={16} className="spin" aria-hidden /> : <Download size={16} aria-hidden />}
            {t("export.download", { count: ids.length })}
          </button>
        </footer>
      </div>
    </dialog>
  );
}
