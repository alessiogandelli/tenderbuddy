import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, Check, Download } from "lucide-react";
import type { Bando } from "../api/types";
import { itemState } from "../lib/flags";
import { useI18n } from "../i18n";
import { ExportDialog } from "./ExportDialog";

type StepKey = "review" | "factors" | "price";

const STEPS: StepKey[] = ["review", "factors", "price"];
const PATHS = ["", "parameters", "price"];

/** Which step the current URL belongs to. */
function stepIndex(pathname: string): number {
  if (pathname.endsWith("/price")) return 2;
  if (pathname.endsWith("/parameters")) return 1;
  return 0;
}

/**
 * The bottom bar that carries the estimate flow: it shows the three steps, lets
 * the reader jump between them, and holds the one forward action — Next, with
 * what is still unpriced as a reminder, and Export on the last step.
 */
export function StepBar({
  bando,
  scenario,
  setScenario,
}: {
  bando: Bando;
  scenario: string;
  setScenario: (scenario: string) => void;
}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const current = stepIndex(useLocation().pathname);
  const [exporting, setExporting] = useState(false);
  const base = `/bandi/${bando.id}`;

  const open = useMemo(() => {
    const results = new Map(bando.position_results.map((result) => [result.lv_id, result]));
    return bando.items.filter((item) => itemState(item, results.get(item.lv_id)) === "open").length;
  }, [bando]);

  const go = (index: number) => navigate(index === 0 ? base : `${base}/${PATHS[index]}`);
  const label = (key: StepKey) => t(`tender.steps.${key}`);

  return (
    <nav className="stepbar" aria-label={t("tender.sections")}>
      <div className="stepbar__start">
        <button
          type="button"
          className="btn btn--ghost"
          disabled={current === 0}
          onClick={() => go(current - 1)}
        >
          <ArrowLeft size={16} aria-hidden /> {t("tender.back")}
        </button>
      </div>

      <ol className="steps">
        {STEPS.map((key, index) => (
          <li key={key} className="steps__item">
            <button
              type="button"
              className={`steps__btn ${index === current ? "is-active" : ""} ${
                index < current ? "is-done" : ""
              }`}
              aria-current={index === current ? "step" : undefined}
              onClick={() => go(index)}
            >
              <span className="steps__num" aria-hidden>
                {index < current ? <Check size={14} /> : index + 1}
              </span>
              <span className="steps__label">{label(key)}</span>
            </button>
          </li>
        ))}
      </ol>

      <div className="stepbar__end">
        <span className="stepbar__progress">
          {t("tender.stepOf", { n: current + 1, total: STEPS.length })}
        </span>
        {current === 0 && open > 0 && (
          <span className="stepbar__reminder">{t("tender.openReminder", { count: open })}</span>
        )}
        {current < STEPS.length - 1 ? (
          <button type="button" className="btn btn--primary" onClick={() => go(current + 1)}>
            {t("tender.nextTo", { step: label(STEPS[current + 1]) })}
            <ArrowRight size={16} aria-hidden />
          </button>
        ) : (
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => setExporting(true)}
          >
            <Download size={16} aria-hidden /> {t("tender.export")}
          </button>
        )}
      </div>

      <ExportDialog
        bando={bando}
        open={exporting}
        scenario={scenario}
        onScenario={setScenario}
        onClose={() => setExporting(false)}
      />
    </nav>
  );
}
