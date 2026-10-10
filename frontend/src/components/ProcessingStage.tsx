import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { AlertTriangle, RotateCcw, Upload } from "lucide-react";
import type { Bando, PageType } from "../api/types";
import { PIPELINE_ORDER } from "../lib/flags";
import { formatNumber } from "../lib/format";
import { PAGE_TYPE_COLORS, pageTypeCounts, pageTypeMap } from "../lib/pageTypes";
import { useI18n } from "../i18n";
import type { MorphStart } from "./TapeMorph";

// The tape never fills faster than this, so a fast run still reads as reading.
const FILL_SECONDS = 1.4;
// Colours sweep across the tape left to right, then hold so the legend reads.
const COLOR_WAVE_MS = 700;
const COLOR_FADE_MS = 350;
const HOLD_MS = 1100;
const LEAVE_MS = 320;

/** Counts up to `target` at a bounded speed, so the number and the tape move together. */
function useCountUp(target: number, total: number): number {
  const [value, setValue] = useState(0);
  const valueRef = useRef(0);

  useEffect(() => {
    if (target <= valueRef.current) {
      valueRef.current = target;
      setValue(target);
      return;
    }
    const speed = Math.max(total, 1) / FILL_SECONDS;
    let last = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const elapsed = (now - last) / 1000;
      last = now;
      valueRef.current = Math.min(target, valueRef.current + speed * elapsed);
      setValue(valueRef.current);
      if (valueRef.current < target) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, total]);

  return value;
}

/**
 * The reading screen: only the pages. A counter and a tape with one cell per
 * page fill up as the tender is read; once the pages are classified every cell
 * takes its page type's colour. When the whole run is done the tape hands
 * itself over (`onDone`) to fly into the review screen as the page rail.
 */
export function ProcessingStage({
  bando,
  onDone,
  onRetry,
  onUploadAnother,
}: {
  bando: Bando;
  onDone: (start: MorphStart) => void;
  onRetry: () => void;
  onUploadAnother: () => void;
}) {
  const { t } = useI18n();
  const { pipeline } = bando;
  const total = pipeline.pages_total || bando.page_count || 0;
  const read = pipeline.status === "done" ? total : (pipeline.pages_read ?? 0);
  const shown = useCountUp(read, total);
  const shownWhole = Math.floor(shown);
  const failed = pipeline.status === "failed";
  const done = pipeline.status === "done";

  const types = useMemo(() => pageTypeMap(bando.page_types), [bando.page_types]);
  const counts = useMemo(() => pageTypeCounts(bando.page_types), [bando.page_types]);
  const colored = total > 0 && types.size > 0 && shown >= total;
  const extracting =
    colored && !done && PIPELINE_ORDER.indexOf(pipeline.step) <= PIPELINE_ORDER.indexOf("parse");

  const [leaving, setLeaving] = useState(false);
  const tapeRef = useRef<HTMLDivElement | null>(null);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  // Done and coloured: let the colours land and the legend read, then hand over.
  const ready = done && (colored || total === 0 || types.size === 0) && shown >= total;
  useEffect(() => {
    if (!ready) return;
    const hold = types.size > 0 ? COLOR_WAVE_MS + COLOR_FADE_MS + HOLD_MS : 300;
    const leave = window.setTimeout(() => setLeaving(true), hold);
    const handOver = window.setTimeout(() => {
      const cells = tapeRef.current?.querySelectorAll<HTMLElement>("[data-tape-tick]") ?? [];
      const rects = [...cells].map((cell) => cell.getBoundingClientRect());
      const colors = [...cells].map((cell) => cell.dataset.color ?? "transparent");
      onDoneRef.current({ rects, colors });
    }, hold + LEAVE_MS);
    return () => {
      window.clearTimeout(leave);
      window.clearTimeout(handOver);
    };
  }, [ready, types.size]);

  const status = () => {
    if (failed) return pipeline.error ?? t("processing.stopped");
    // The tape is still filling: say what the tape shows, not what runs ahead.
    if (total > 0 && shown < total) return t("processing.status.classify_pages");
    if (done) return t("processing.status.done", { count: pipeline.item_count });
    if (pipeline.step === "parse" && (pipeline.lv_pages_total ?? 0) > 0) {
      return t("processing.status.parsePages", {
        done: pipeline.lv_pages_done ?? 0,
        total: pipeline.lv_pages_total,
      });
    }
    if (pipeline.step === "match" && pipeline.item_count > 0) {
      return t("processing.status.matchCount", { count: pipeline.item_count });
    }
    return t(`processing.status.${pipeline.step}`);
  };

  return (
    <div className={`proc ${leaving ? "is-leaving" : ""}`}>
      <div className="proc__inner">
        <p className="proc__file">{bando.source_file}</p>
        <h1 className="proc__title">
          {failed ? t("processing.failedTitle") : t("processing.title")}
        </h1>

        <div className="proc__count" aria-live="polite">
          <span className="proc__num">{formatNumber(shownWhole, 0)}</span>
          <span className="proc__of">/ {total > 0 ? formatNumber(total, 0) : "…"}</span>
          <span className="proc__unit">{t("processing.pagesRead")}</span>
        </div>

        <div
          ref={tapeRef}
          className={`tape ${total > 120 ? "tape--dense" : ""}`}
          role="img"
          aria-label={t("processing.tapeAria", { read: shownWhole, total })}
        >
          {Array.from({ length: total }, (_, index) => {
            const page = index + 1;
            const type: PageType | undefined = types.get(page);
            const color = type ? PAGE_TYPE_COLORS[type] : undefined;
            const state = colored && color ? "is-typed" : page <= shownWhole ? "is-read" : "";
            const scanning = extracting && type === "lv_table";
            return (
              <span
                key={page}
                data-tape-tick
                data-color={color ?? "var(--tape-read)"}
                className={`tape__tick ${state} ${scanning ? "is-scan" : ""}`}
                style={
                  {
                    "--c": color,
                    "--d": `${Math.round((index / Math.max(total, 1)) * COLOR_WAVE_MS)}ms`,
                  } as CSSProperties
                }
              />
            );
          })}
        </div>

        <p className={`proc__status ${failed ? "is-error" : ""}`}>
          {failed && <AlertTriangle size={16} aria-hidden />}
          {status()}
        </p>

        <ul className={`legend ${colored ? "is-shown" : ""}`} aria-label={t("legend.title")}>
          {counts.map(({ type, count }) => (
            <li key={type} className="legend__item">
              <span className="legend__swatch" style={{ background: PAGE_TYPE_COLORS[type] }} />
              {t(`pageType.${type}`)}
              <span className="legend__count">{count}</span>
            </li>
          ))}
        </ul>

        {failed && (
          <div className="proc__actions">
            <button type="button" className="btn btn--primary" onClick={onRetry}>
              <RotateCcw size={16} aria-hidden /> {t("processing.retry")}
            </button>
            <button type="button" className="btn" onClick={onUploadAnother}>
              <Upload size={16} aria-hidden /> {t("processing.another")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
