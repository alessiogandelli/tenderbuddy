import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { AlertTriangle, RotateCcw, Upload } from "lucide-react";
import type { Bando, PageType } from "../api/types";
import { PIPELINE_ORDER } from "../lib/flags";
import { formatNumber } from "../lib/format";
import { PAGE_TYPE_COLORS, pageTypeCounts, pageTypeMap } from "../lib/pageTypes";
import { useLagTicker } from "../lib/useLagTicker";
import { useI18n } from "../i18n";
import { VisionProgress } from "./VisionProgress";
import type { MorphStart } from "./TapeMorph";

// The tape never fills faster than this, so a fast run still reads as reading.
const FILL_SECONDS = 1.4;
// Colours sweep across the tape left to right, then hold so the legend reads.
const COLOR_WAVE_MS = 700;
const COLOR_FADE_MS = 350;
const HOLD_MS = 1100;
const LEAVE_MS = 320;

const PARSE_INDEX = PIPELINE_ORDER.indexOf("parse");

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
 * The reading screen, in three acts, one hero at a time:
 *
 *  1. Read — a counter and a tape that fills, one cell per page.
 *  2. Classify — every cell takes its page type's colour in a wave; the legend
 *     appears. (Both 1 and 2 are the tape.)
 *  3. Vision — the tape shrinks to a dimmed context strip and a progress bar
 *     rises as the hero: one segment per quantity-table page, read one by one.
 *     The positions counter then takes over and trails the real count.
 *
 * When the run is done the tape hands itself over (`onDone`) to fly into the
 * review screen as the page rail.
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

  const stepIndex = PIPELINE_ORDER.indexOf(pipeline.step);
  const atParse = stepIndex === PARSE_INDEX;
  const pastParse = stepIndex > PARSE_INDEX;
  // Hovering a legend row lights up the pages of that kind, on the tape and bar.
  const [hoverType, setHoverType] = useState<PageType | null>(null);

  const types = useMemo(() => pageTypeMap(bando.page_types), [bando.page_types]);
  const counts = useMemo(() => pageTypeCounts(bando.page_types), [bando.page_types]);
  // The quantity-table pages the vision engine reads, in document order.
  const visionPages = useMemo(
    () =>
      bando.page_types
        .filter((entry) => entry.type === "lv_table")
        .map((entry) => entry.page)
        .sort((a, b) => a - b),
    [bando.page_types],
  );
  const visionTotal = visionPages.length;
  const visionDone =
    visionTotal > 0
      ? Math.min(pipeline.lv_pages_done ?? 0, visionTotal)
      : pipeline.lv_pages_done ?? 0;

  const colored = total > 0 && types.size > 0 && shown >= total;

  // Let the classification colour wave finish before the tape steps back and
  // the vision bar rises, so the two "wow" moments are not spent at once.
  const canArmVision = colored && !failed && visionTotal > 0 && (atParse || pastParse);
  const [visionArmed, setVisionArmed] = useState(false);
  useEffect(() => {
    if (!canArmVision) {
      setVisionArmed(false);
      return;
    }
    if (visionArmed) return;
    const timer = window.setTimeout(
      () => setVisionArmed(true),
      COLOR_WAVE_MS + COLOR_FADE_MS,
    );
    return () => window.clearTimeout(timer);
  }, [canArmVision, visionArmed]);

  const showBar = visionArmed;
  const inVision = visionArmed && !done && atParse;
  const scanPage = inVision ? visionPages[Math.min(visionDone, visionTotal - 1)] : null;
  const currentVisionPage = visionTotal > 0 ? visionPages[Math.min(visionDone, visionTotal - 1)] : null;

  // The positions counter is unknown until the parse step has produced items,
  // then it trails the real count and sprints to land before the hand-over.
  const positionsTarget = pastParse || done ? pipeline.item_count ?? 0 : 0;
  const positions = Math.floor(useLagTicker(positionsTarget, done));
  const showPositions = pastParse || done;
  const positionsSettled = !showPositions || positions >= (pipeline.item_count ?? 0);

  // One hero number at a time: pages while reading, quantity tables during
  // vision, positions once they exist.
  const head = showPositions
    ? { value: positions, total: null as number | null, unit: t("processing.positionsLabel") }
    : visionArmed
      ? { value: visionDone, total: visionTotal, unit: t("processing.tablesRead") }
      : { value: shownWhole, total, unit: t("processing.pagesRead") };

  const title = failed
    ? t("processing.failedTitle")
    : pastParse
      ? t("processing.titleFinishing")
      : visionArmed && atParse
        ? t("processing.titleVision")
        : t("processing.title");

  const [leaving, setLeaving] = useState(false);
  const tapeRef = useRef<HTMLDivElement | null>(null);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  // Done and coloured: let the colours land and the legend read, then hand over.
  const ready =
    done && (colored || total === 0 || types.size === 0) && shown >= total && positionsSettled;
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

  // Kept out of the per-frame render: the tape only changes when the fill, the
  // colours or the scanned page change, not when the positions counter ticks.
  const tapeCells = useMemo(
    () =>
      Array.from({ length: total }, (_, index) => {
        const page = index + 1;
        const type: PageType | undefined = types.get(page);
        const color = type ? PAGE_TYPE_COLORS[type] : undefined;
        const state = colored && color ? "is-typed" : page <= shownWhole ? "is-read" : "";
        const isLv = type === "lv_table";
        const scanning = scanPage === page;
        const hot = hoverType != null && type === hoverType;
        return (
          <span
            key={page}
            data-tape-tick
            data-color={color ?? "var(--tape-read)"}
            className={`tape__tick ${state} ${isLv ? "is-lv" : ""} ${scanning ? "is-scan" : ""} ${hot ? "is-hot" : ""}`}
            style={
              {
                "--c": color,
                "--d": `${Math.round((index / Math.max(total, 1)) * COLOR_WAVE_MS)}ms`,
              } as CSSProperties
            }
          />
        );
      }),
    [total, types, colored, shownWhole, scanPage, hoverType],
  );

  const status = () => {
    if (failed) return pipeline.error ?? t("processing.stopped");
    // The tape is still filling: say what the tape shows, not what runs ahead.
    if (total > 0 && shown < total) return t("processing.status.classify_pages");
    if (done) return t("processing.status.done", { count: pipeline.item_count });
    if (pipeline.step === "parse" && (pipeline.lv_pages_total ?? 0) > 0) {
      return t("processing.status.parseCurrent", { page: currentVisionPage ?? 1 });
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
        <h1 key={title} className="proc__title">
          {title}
        </h1>

        <div className="proc__count" aria-live="polite">
          <span className="proc__num">{formatNumber(head.value, 0)}</span>
          {head.total != null && (
            <span className="proc__of">
              / {head.total > 0 ? formatNumber(head.total, 0) : "…"}
            </span>
          )}
          <span className="proc__unit">{head.unit}</span>
        </div>

        {showBar && (
          <VisionProgress
            total={visionTotal}
            done={visionDone}
            active={inVision}
            dimmed={hoverType != null && hoverType !== "lv_table"}
            ariaLabel={t("processing.visionAria", { done: visionDone, total: visionTotal })}
          />
        )}

        <div
          ref={tapeRef}
          className={`tape ${total > 120 ? "tape--dense" : ""} ${showBar ? "is-compact" : ""} ${hoverType ? "is-hovering" : ""}`}
          role="img"
          aria-label={t("processing.tapeAria", { read: shownWhole, total })}
        >
          {tapeCells}
        </div>

        <p className={`proc__status ${failed ? "is-error" : ""}`}>
          {failed && <AlertTriangle size={16} aria-hidden />}
          {status()}
        </p>

        <ul
          className={`legend ${colored ? "is-shown" : ""} ${hoverType ? "is-hovering" : ""}`}
          aria-label={t("legend.title")}
        >
          {counts.map(({ type, count }) => (
            <li
              key={type}
              className={`legend__item ${hoverType === type ? "is-hot" : ""}`}
              onMouseEnter={() => setHoverType(type)}
              onMouseLeave={() => setHoverType(null)}
              onFocus={() => setHoverType(type)}
              onBlur={() => setHoverType(null)}
              tabIndex={0}
            >
              <span className="legend__swatch" style={{ background: PAGE_TYPE_COLORS[type] }} />
              <span className="legend__name">{t(`pageType.${type}`)}</span>
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
