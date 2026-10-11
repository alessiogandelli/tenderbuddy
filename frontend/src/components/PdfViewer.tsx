import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import * as pdfjs from "pdfjs-dist";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { ChevronLeft, ChevronRight, Minus, MoveHorizontal, Plus, SquareDashed } from "lucide-react";
import type { CoverField, FormField, Item, PageType, PositionResult } from "../api/types";
import type { ItemState } from "../lib/flags";
import { PAGE_TYPE_COLORS } from "../lib/pageTypes";
import { cellAnchor, readTextRuns, type CellAnchor, type TextRun } from "../lib/pageText";
import { useI18n } from "../i18n";
import type { ItemPatch } from "./ItemCard";
import { PriceCell } from "./PriceCell";
import { FormCell } from "./FormCell";
import { CoverCell } from "./CoverCell";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const PAGE_GAP = 36;
const SIDE_PAD = 34;
const MIN_ZOOM = 0.4;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.25;
// Canvases are re-rendered at the new resolution only once the size settles;
// while a panel is dragged the pages are resized by CSS and the bitmaps stretch.
const RENDER_SETTLE_MS = 150;

/** Fit width follows the container; a manual zoom is an absolute scale. */
type Zoom = { mode: "fit" } | { mode: "manual"; scale: number };

type Size = { width: number; height: number };

export interface PdfViewerHandle {
  scrollToPage: (page: number, smooth?: boolean) => void;
}

function rectOf(box: number[]): CSSProperties {
  return {
    left: `${box[0] * 100}%`,
    top: `${box[1] * 100}%`,
    width: `${Math.max((box[2] - box[0]) * 100, 2)}%`,
    height: `${Math.max((box[3] - box[1]) * 100, 1)}%`,
  };
}

// Variants share one description block: draw its name box once and label the
// group. Their bottom edge can differ by a line, so group on (x0, x1, y0).
function blockKey(box: number[] | null): string | null {
  return box ? [box[0], box[2], box[1]].map((value) => value.toFixed(2)).join(",") : null;
}

interface PageProps {
  doc: PDFDocumentProxy;
  pageNumber: number;
  baseSize: Size;
  /** Resolution the canvas is drawn at; the on-screen size follows `--s`. */
  renderScale: number;
  type: PageType | undefined;
  items: Item[];
  results: Map<string, PositionResult>;
  states: Map<string, ItemState>;
  selectedId: string | null;
  showBoxes: boolean;
  root: HTMLDivElement | null;
  scenario: string;
  scenarioLabel: string;
  /** The position whose price is being edited on the page, if any. */
  editingId: string | null;
  onSelect: (lvId: string) => void;
  onEdit: (lvId: string | null) => void;
  onSavePrice: (lvId: string, patch: ItemPatch) => Promise<void>;
  /** The offer-form blanks on this page, and their values. */
  formFields: FormField[];
  formValues: Record<string, number | null>;
  onSaveFormField: (fieldId: string, value: number | null) => Promise<void>;
  /** The cover blanks on this page, and their computed values. */
  coverFields: CoverField[];
  coverValues: Record<string, string | null>;
  register: (page: number, node: HTMLDivElement | null) => void;
}

const PdfPage = memo(function PdfPage({
  doc,
  pageNumber,
  baseSize,
  renderScale,
  type,
  items,
  results,
  states,
  selectedId,
  showBoxes,
  root,
  scenario,
  scenarioLabel,
  editingId,
  onSelect,
  onEdit,
  onSavePrice,
  formFields,
  formValues,
  onSaveFormField,
  coverFields,
  coverValues,
  register,
}: PageProps) {
  const { t } = useI18n();
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [near, setNear] = useState(false);
  const [ownSize, setOwnSize] = useState<Size | null>(null);
  // The page's own text, read once, to put each price on its row's baseline.
  const [text, setText] = useState<{ runs: TextRun[]; reach: number } | null>(null);
  const size = ownSize ?? baseSize;

  // Render only the pages near the viewport, and free the far ones: a tender
  // can have hundreds of pages and every canvas holds megabytes.
  useEffect(() => {
    const node = wrapRef.current;
    if (!node || !root) return;
    const observer = new IntersectionObserver(
      (entries) => setNear(entries.some((entry) => entry.isIntersecting)),
      { root, rootMargin: "150% 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [root]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!near) {
      canvas.width = 0;
      canvas.height = 0;
      return;
    }
    let cancelled = false;
    let task: RenderTask | null = null;
    (async () => {
      const page = await doc.getPage(pageNumber);
      if (cancelled) return;
      const natural = page.getViewport({ scale: 1 });
      if (Math.abs(natural.width - size.width) > 1 || Math.abs(natural.height - size.height) > 1) {
        setOwnSize({ width: natural.width, height: natural.height });
      }
      const ratio = window.devicePixelRatio || 1;
      const viewport = page.getViewport({ scale: renderScale * ratio });
      // Draw off screen and swap when done, so the old bitmap (stretched by
      // CSS) stays visible meanwhile instead of flashing blank.
      const buffer = document.createElement("canvas");
      buffer.width = Math.floor(viewport.width);
      buffer.height = Math.floor(viewport.height);
      const bufferContext = buffer.getContext("2d");
      if (!bufferContext) return;
      task = page.render({ canvasContext: bufferContext, viewport });
      const ok = await task.promise.then(
        () => true,
        () => false,
      );
      const context = canvas.getContext("2d");
      if (!ok || cancelled || !context) return;
      canvas.width = buffer.width;
      canvas.height = buffer.height;
      context.drawImage(buffer, 0, 0);
    })();
    return () => {
      cancelled = true;
      task?.cancel();
    };
    // `size` only seeds ownSize; re-rendering on it would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [near, renderScale, doc, pageNumber]);

  useEffect(() => {
    if (!near || text) return;
    let cancelled = false;
    doc
      .getPage(pageNumber)
      .then(readTextRuns)
      .then((read) => {
        if (!cancelled) setText(read);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [near, text, doc, pageNumber]);

  const anchors = useMemo(() => {
    const map = new Map<string, CellAnchor>();
    if (!text) return map;
    for (const item of items) {
      if (item.price_bbox) map.set(item.lv_id, cellAnchor(item.price_bbox, text.runs, text.reach));
    }
    return map;
  }, [items, text]);

  const nameGroups = useMemo(() => {
    const map = new Map<string, Item[]>();
    for (const item of items) {
      const key = blockKey(item.name_bbox ?? item.source_bbox) ?? `solo-${item.lv_id}`;
      map.set(key, [...(map.get(key) ?? []), item]);
    }
    return [...map.values()];
  }, [items]);

  const color = type ? PAGE_TYPE_COLORS[type] : PAGE_TYPE_COLORS.other;

  return (
    <div
      className="pg"
      ref={(node) => {
        wrapRef.current = node;
        register(pageNumber, node);
      }}
      style={{ "--pc": color } as CSSProperties}
    >
      {/* The page type rides on the sheet's top edge; the page number is in the toolbar. */}
      <div className="pg__label" aria-label={t("pdf.page", { page: pageNumber })}>
        <span className="pg__type">{type ? t(`pageType.${type}`) : t("pdf.unclassified")}</span>
      </div>
      <div
        className="pg__sheet"
        style={{
          width: `calc(var(--s) * ${size.width}px)`,
          height: `calc(var(--s) * ${size.height}px)`,
        }}
      >
        <canvas ref={canvasRef} />
        {showBoxes &&
          nameGroups.map((group) => {
            const first = group[0];
            const box = first.name_bbox ?? first.source_bbox;
            if (!box) return null;
            const active = group.some((item) => item.lv_id === selectedId);
            const state = states.get(first.lv_id) ?? "open";
            const label =
              group.length > 1
                ? `${first.lv_id}–${group[group.length - 1].lv_id}`
                : first.lv_id;
            return (
              <button
                key={`n-${first.lv_id}`}
                type="button"
                data-lv={first.lv_id}
                className={`hl hl--name hl--${state} ${active ? "is-active" : ""}`}
                style={rectOf(box)}
                aria-label={t("pdf.boxAria", { id: label })}
                onClick={() => onSelect(active ? (selectedId as string) : first.lv_id)}
              >
                <span className="hl__tag">{label}</span>
              </button>
            );
          })}
        {/* The offer form: every blank, filled as the export fills it. */}
        {formFields.map((field) => (
          <FormCell
            key={field.id}
            field={field}
            value={formValues[field.id] ?? null}
            style={rectOf(field.bbox)}
            editing={editingId === `form:${field.id}`}
            outlined={showBoxes}
            onOpen={() => onEdit(`form:${field.id}`)}
            onClose={() => onEdit(null)}
            onSave={(value) => onSaveFormField(field.id, value)}
          />
        ))}
        {/* The cover: the bidder and the Netto, as the export writes them. */}
        {coverFields.map((field) => (
          <CoverCell
            key={field.id}
            field={field}
            value={coverValues[field.id] ?? null}
            style={rectOf(field.bbox)}
            outlined={showBoxes}
          />
        ))}
        {/* The prices are the offer's content: always shown, like the print. */}
        {items.map((item) => {
          if (!item.price_bbox) return null;
          const amount =
            item.offer_price_chf ?? results.get(item.lv_id)?.offer_prices_chf?.[scenario] ?? null;
          return (
            <PriceCell
              key={`p-${item.lv_id}`}
              item={item}
              state={states.get(item.lv_id) ?? "open"}
              amount={amount}
              scenarioLabel={scenarioLabel}
              style={rectOf(item.price_bbox)}
              anchor={anchors.get(item.lv_id) ?? null}
              active={item.lv_id === selectedId}
              editing={item.lv_id === editingId}
              outlined={showBoxes}
              onOpen={() => {
                onSelect(item.lv_id);
                onEdit(item.lv_id);
              }}
              onClose={() => onEdit(null)}
              onSave={(patch) => onSavePrice(item.lv_id, patch)}
            />
          );
        })}
      </div>
    </div>
  );
});

export const PdfViewer = forwardRef<
  PdfViewerHandle,
  {
    url: string;
    items: Item[];
    results: Map<string, PositionResult>;
    states: Map<string, ItemState>;
    pageTypes: Map<number, PageType>;
    selectedId: string | null;
    /** Bumped when the document should bring the selected item into view. */
    focusKey: number;
    onSelect: (lvId: string) => void;
    onPageChange: (page: number) => void;
    onPageCount: (count: number) => void;
    /** Controls shown first in the toolbar (e.g. the panel collapse button). */
    leading?: ReactNode;
    /** The bid scenario whose offer prices are written in the price cells. */
    scenario: string;
    onSavePrice: (lvId: string, patch: ItemPatch) => Promise<void>;
    formFields: FormField[];
    formValues: Record<string, number | null>;
    onSaveFormField: (fieldId: string, value: number | null) => Promise<void>;
    coverFields: CoverField[];
    coverValues: Record<string, string | null>;
  }
>(function PdfViewer(
  {
    url,
    items,
    results,
    states,
    pageTypes,
    selectedId,
    focusKey,
    onSelect,
    onPageChange,
    onPageCount,
    leading,
    scenario,
    onSavePrice,
    formFields,
    formValues,
    onSaveFormField,
    coverFields,
    coverValues,
  },
  ref,
) {
  const { t } = useI18n();
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [baseSize, setBaseSize] = useState<Size | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [width, setWidth] = useState(0);
  const [zoom, setZoom] = useState<Zoom>({ mode: "fit" });
  const [showBoxes, setShowBoxes] = useState(true);
  const [current, setCurrent] = useState(1);
  const [pageDraft, setPageDraft] = useState<string | null>(null);
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const scenarioLabel = t(`price.scenario.${scenario}`);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  useEffect(() => {
    let cancelled = false;
    setDoc(null);
    setError(null);
    const task = pdfjs.getDocument({ url });
    task.promise
      .then(async (loaded) => {
        const first = await loaded.getPage(1);
        const viewport = first.getViewport({ scale: 1 });
        if (cancelled) return;
        setBaseSize({ width: viewport.width, height: viewport.height });
        setDoc(loaded);
        onPageCount(loaded.numPages);
      })
      .catch(() => {
        if (!cancelled) setError(t("pdf.openError"));
      });
    return () => {
      cancelled = true;
      void task.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  useEffect(() => {
    if (!scroller) return;
    const observer = new ResizeObserver(() => setWidth(scroller.clientWidth));
    observer.observe(scroller);
    setWidth(scroller.clientWidth);
    return () => observer.disconnect();
  }, [scroller]);

  const fitScale = baseSize && width ? Math.max((width - SIDE_PAD * 2) / baseSize.width, 0.2) : 1;
  const scale = zoom.mode === "fit" ? fitScale : zoom.scale;
  const measured = Boolean(baseSize && width);

  // The canvases follow `scale` only once it settles (the first real one at once).
  const [renderScale, setRenderScale] = useState(scale);
  const settled = useRef(false);
  useEffect(() => {
    if (!measured) return;
    if (!settled.current) {
      settled.current = true;
      setRenderScale(scale);
      return;
    }
    const timer = window.setTimeout(() => setRenderScale(scale), RENDER_SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [scale, measured]);

  // Reading position: the page at the top of the viewport and how far into it.
  // Kept up to date while scrolling, restored whenever the scale changes, so a
  // resize or a zoom never moves the reader to another place.
  const anchor = useRef<{ page: number; ratio: number } | null>(null);
  const sheetOf = (page: number) => {
    const node = pageRefs.current.get(page);
    const sheet = node?.querySelector<HTMLElement>(".pg__sheet");
    return node && sheet ? { top: node.offsetTop + sheet.offsetTop, height: sheet.offsetHeight } : null;
  };

  const fieldsByPage = useMemo(() => {
    const map = new Map<number, FormField[]>();
    for (const field of formFields) map.set(field.page, [...(map.get(field.page) ?? []), field]);
    return map;
  }, [formFields]);
  const noFields = useMemo<FormField[]>(() => [], []);
  const coverByPage = useMemo(() => {
    const map = new Map<number, CoverField[]>();
    for (const field of coverFields) map.set(field.page, [...(map.get(field.page) ?? []), field]);
    return map;
  }, [coverFields]);
  const noCover = useMemo<CoverField[]>(() => [], []);

  const byPage = useMemo(() => {
    const map = new Map<number, Item[]>();
    for (const item of items) {
      if (!item.source_page) continue;
      map.set(item.source_page, [...(map.get(item.source_page) ?? []), item]);
    }
    return map;
  }, [items]);

  const register = useCallback((page: number, node: HTMLDivElement | null) => {
    if (node) pageRefs.current.set(page, node);
    else pageRefs.current.delete(page);
  }, []);

  const scrollToPage = useCallback(
    (page: number, smooth = true) => {
      const node = pageRefs.current.get(page);
      if (!node || !scroller) return;
      scroller.scrollTo({ top: node.offsetTop - 10, behavior: smooth ? "smooth" : "auto" });
    },
    [scroller],
  );

  useImperativeHandle(ref, () => ({ scrollToPage }), [scrollToPage]);

  // Which page sits under the upper third of the viewport, and the anchor.
  useEffect(() => {
    if (!scroller || !doc) return;
    let frame = 0;
    const pageAt = (y: number) => {
      let page = 1;
      for (let number = 1; number <= doc.numPages; number += 1) {
        const node = pageRefs.current.get(number);
        if (!node) continue;
        if (node.offsetTop <= y) page = number;
        else break;
      }
      return page;
    };
    const update = () => {
      frame = 0;
      setCurrent(pageAt(scroller.scrollTop + scroller.clientHeight * 0.33));
      const top = pageAt(scroller.scrollTop);
      const sheet = sheetOf(top);
      if (sheet && sheet.height > 0) {
        anchor.current = { page: top, ratio: (scroller.scrollTop - sheet.top) / sheet.height };
      }
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      scroller.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
    // Re-bound only for a new document; the scale is handled by the anchor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scroller, doc]);

  useLayoutEffect(() => {
    const saved = anchor.current;
    if (!scroller || !saved) return;
    const sheet = sheetOf(saved.page);
    if (sheet) scroller.scrollTop = sheet.top + saved.ratio * sheet.height;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scale, scroller]);

  useEffect(() => onPageChange(current), [current, onPageChange]);

  // Bring the selected item's row into view, a third down the viewport. A
  // nearby row is reached by a plain smooth scroll. A far one would stream
  // dozens of half-drawn pages past, so the pages fade out, the view jumps to
  // just short of the row, waits for that page to be drawn, then fades back in
  // while gliding the last stretch; the row's box pulses once on arrival.
  useEffect(() => {
    if (!focusKey || !selectedId || !scroller) return;
    const item = items.find((candidate) => candidate.lv_id === selectedId);
    if (!item?.source_page) return;
    const node = pageRefs.current.get(item.source_page);
    if (!node) return;
    const box = item.name_bbox ?? item.source_bbox ?? item.price_bbox;
    const sheet = node.querySelector<HTMLElement>(".pg__sheet");
    const sheetTop = node.offsetTop + (sheet?.offsetTop ?? 0);
    const y = box ? sheetTop + box[1] * (sheet?.offsetHeight ?? node.offsetHeight) : node.offsetTop;
    const top = Math.max(y - scroller.clientHeight * 0.3, 0);
    const distance = top - scroller.scrollTop;

    let cancelled = false;
    const timers: number[] = [];
    const later = (ms: number) =>
      new Promise<void>((resolve) => timers.push(window.setTimeout(resolve, ms)));
    const pulse = () => {
      const hl = node.querySelector<HTMLElement>(".hl.is-active");
      if (!hl) return;
      hl.classList.remove("is-arriving");
      void hl.offsetWidth; // restart the animation
      hl.classList.add("is-arriving");
    };

    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (still || Math.abs(distance) < scroller.clientHeight * 1.5) {
      scroller.scrollTo({ top, behavior: still ? "auto" : "smooth" });
      if (!still) void later(Math.min(Math.abs(distance), 600) + 120).then(() => !cancelled && pulse());
      return () => {
        cancelled = true;
        timers.forEach(window.clearTimeout);
      };
    }

    void (async () => {
      scroller.classList.add("is-jumping");
      await later(170);
      if (cancelled) return;
      // Land a little short, on the side we come from, to glide the rest.
      scroller.scrollTop = top - Math.sign(distance) * scroller.clientHeight * 0.28;
      const canvas = sheet?.querySelector("canvas");
      for (let waited = 0; waited < 500 && canvas && canvas.width === 0; waited += 40) {
        await later(40);
        if (cancelled) return;
      }
      scroller.classList.remove("is-jumping");
      scroller.scrollTo({ top, behavior: "smooth" });
      await later(420);
      if (!cancelled) pulse();
    })();
    return () => {
      cancelled = true;
      timers.forEach(window.clearTimeout);
      scroller.classList.remove("is-jumping");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey]);

  // A manual zoom leaves fit width until it is chosen again.
  const zoomBy = (direction: 1 | -1) => {
    const next = Math.round((scale + direction * ZOOM_STEP) / ZOOM_STEP) * ZOOM_STEP;
    setZoom({ mode: "manual", scale: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next)) });
  };

  const numPages = doc?.numPages ?? 0;
  const currentType = pageTypes.get(current);
  const commitPage = () => {
    const value = Number.parseInt(pageDraft ?? "", 10);
    setPageDraft(null);
    if (Number.isFinite(value)) scrollToPage(Math.min(Math.max(value, 1), numPages));
  };

  return (
    <section className="pdf">
      {error && <p className="banner banner--error pdf__error">{error}</p>}
      <div className="pdf__scroll" ref={setScroller}>
        {doc && baseSize ? (
          <div className="pdf__pages" style={{ gap: PAGE_GAP, "--s": scale } as CSSProperties}>
            {Array.from({ length: doc.numPages }, (_, index) => index + 1).map((pageNumber) => (
              <PdfPage
                key={pageNumber}
                doc={doc}
                pageNumber={pageNumber}
                baseSize={baseSize}
                renderScale={renderScale}
                type={pageTypes.get(pageNumber)}
                items={byPage.get(pageNumber) ?? []}
                results={results}
                states={states}
                selectedId={selectedId}
                showBoxes={showBoxes}
                root={scroller}
                scenario={scenario}
                scenarioLabel={scenarioLabel}
                editingId={editingId}
                onSelect={onSelect}
                onEdit={setEditingId}
                onSavePrice={onSavePrice}
                formFields={fieldsByPage.get(pageNumber) ?? noFields}
                formValues={formValues}
                onSaveFormField={onSaveFormField}
                coverFields={coverByPage.get(pageNumber) ?? noCover}
                coverValues={coverValues}
                register={register}
              />
            ))}
          </div>
        ) : (
          !error && <p className="pdf__loading">{t("pdf.loading")}</p>
        )}
      </div>
      <footer className="pdf__bar">
        <div className="pdf__nav">
          {leading}
          <button
            type="button"
            className="iconbtn"
            aria-label={t("pdf.prev")}
            disabled={current <= 1}
            onClick={() => scrollToPage(current - 1)}
          >
            <ChevronLeft size={18} />
          </button>
          <input
            className="pdf__page"
            aria-label={t("pdf.pageInput")}
            value={pageDraft ?? String(current)}
            inputMode="numeric"
            onFocus={(event) => event.target.select()}
            onChange={(event) => setPageDraft(event.target.value)}
            onBlur={commitPage}
            onKeyDown={(event) => {
              if (event.key === "Enter") (event.target as HTMLInputElement).blur();
            }}
          />
          <span className="pdf__total">/ {numPages || "…"}</span>
          <button
            type="button"
            className="iconbtn"
            aria-label={t("pdf.next")}
            disabled={current >= numPages}
            onClick={() => scrollToPage(current + 1)}
          >
            <ChevronRight size={18} />
          </button>
          {currentType && (
            <span
              className="typechip"
              style={{ "--pc": PAGE_TYPE_COLORS[currentType] } as CSSProperties}
            >
              {t(`pageType.${currentType}`)}
            </span>
          )}
        </div>
        <div className="pdf__tools">
          <button
            type="button"
            className={`iconbtn ${showBoxes ? "is-on" : ""}`}
            aria-pressed={showBoxes}
            title={t("pdf.toggleBoxes")}
            aria-label={t("pdf.toggleBoxes")}
            onClick={() => setShowBoxes((value) => !value)}
          >
            <SquareDashed size={17} />
          </button>
          <span className="pdf__sep" />
          <button
            type="button"
            className="iconbtn"
            aria-label={t("pdf.zoomOut")}
            disabled={scale <= MIN_ZOOM}
            onClick={() => zoomBy(-1)}
          >
            <Minus size={17} />
          </button>
          <span className="pdf__zoom" aria-live="polite">
            {Math.round(scale * 100)}%
          </span>
          <button
            type="button"
            className="iconbtn"
            aria-label={t("pdf.zoomIn")}
            disabled={scale >= MAX_ZOOM}
            onClick={() => zoomBy(1)}
          >
            <Plus size={17} />
          </button>
          <button
            type="button"
            className={`pdf__fit ${zoom.mode === "fit" ? "is-on" : ""}`}
            aria-pressed={zoom.mode === "fit"}
            onClick={() => setZoom({ mode: "fit" })}
          >
            <MoveHorizontal size={15} aria-hidden /> {t("pdf.fit")}
          </button>
        </div>
      </footer>
    </section>
  );
});
