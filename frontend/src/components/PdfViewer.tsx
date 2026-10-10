import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import * as pdfjs from "pdfjs-dist";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { ChevronLeft, ChevronRight, Maximize2, Minus, Plus, SquareDashed } from "lucide-react";
import type { Item, PageType, PositionResult } from "../api/types";
import type { ItemState } from "../lib/flags";
import { formatChf } from "../lib/format";
import { PAGE_TYPE_COLORS } from "../lib/pageTypes";
import { useI18n } from "../i18n";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const PAGE_GAP = 36;
const SIDE_PAD = 34;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;

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
  scale: number;
  type: PageType | undefined;
  items: Item[];
  results: Map<string, PositionResult>;
  states: Map<string, ItemState>;
  selectedId: string | null;
  showBoxes: boolean;
  root: HTMLDivElement | null;
  onSelect: (lvId: string) => void;
  register: (page: number, node: HTMLDivElement | null) => void;
}

const PdfPage = memo(function PdfPage({
  doc,
  pageNumber,
  baseSize,
  scale,
  type,
  items,
  results,
  states,
  selectedId,
  showBoxes,
  root,
  onSelect,
  register,
}: PageProps) {
  const { t } = useI18n();
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [near, setNear] = useState(false);
  const [ownSize, setOwnSize] = useState<Size | null>(null);
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
      const viewport = page.getViewport({ scale: scale * ratio });
      const context = canvas.getContext("2d");
      if (!context) return;
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      task = page.render({ canvasContext: context, viewport });
      await task.promise.catch(() => undefined);
    })();
    return () => {
      cancelled = true;
      task?.cancel();
    };
    // `size` only seeds ownSize; re-rendering on it would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [near, scale, doc, pageNumber]);

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
      <div className="pg__label">
        <span className="pg__num">{t("pdf.page", { page: pageNumber })}</span>
        <span className="pg__type">{type ? t(`pageType.${type}`) : t("pdf.unclassified")}</span>
      </div>
      <div
        className="pg__sheet"
        style={{ width: size.width * scale, height: size.height * scale }}
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
        {showBoxes &&
          items.map((item) => {
            if (!item.price_bbox) return null;
            const active = item.lv_id === selectedId;
            const state = states.get(item.lv_id) ?? "open";
            const cost = results.get(item.lv_id)?.direct_position_cost_chf ?? null;
            return (
              <button
                key={`p-${item.lv_id}`}
                type="button"
                className={`hl hl--price hl--${state} ${active ? "is-active" : ""}`}
                style={rectOf(item.price_bbox)}
                aria-label={t("pdf.priceAria", { id: item.lv_id })}
                onClick={() => onSelect(item.lv_id)}
              >
                <span className="hl__tag">{cost != null ? formatChf(cost) : t("pdf.noPrice")}</span>
              </button>
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
  }
>(function PdfViewer(
  { url, items, results, states, pageTypes, selectedId, focusKey, onSelect, onPageChange, onPageCount },
  ref,
) {
  const { t } = useI18n();
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [baseSize, setBaseSize] = useState<Size | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [width, setWidth] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [showBoxes, setShowBoxes] = useState(true);
  const [current, setCurrent] = useState(1);
  const [pageDraft, setPageDraft] = useState<string | null>(null);
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null);
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
  const scale = fitScale * zoom;

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

  // Which page sits under the upper third of the viewport.
  useEffect(() => {
    if (!scroller || !doc) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const probe = scroller.scrollTop + scroller.clientHeight * 0.33;
      let page = 1;
      for (let number = 1; number <= doc.numPages; number += 1) {
        const node = pageRefs.current.get(number);
        if (!node) continue;
        if (node.offsetTop <= probe) page = number;
        else break;
      }
      setCurrent(page);
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
  }, [scroller, doc, scale]);

  useEffect(() => onPageChange(current), [current, onPageChange]);

  // Bring the selected item's row into view, a third down the viewport.
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
    scroller.scrollTo({ top: Math.max(y - scroller.clientHeight * 0.3, 0), behavior: "smooth" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusKey]);

  // Keep the reading position when zooming.
  const setZoomKeeping = (next: number) => {
    const page = current;
    setZoom(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number(next.toFixed(2)))));
    requestAnimationFrame(() => requestAnimationFrame(() => scrollToPage(page, false)));
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
      <header className="pdf__bar">
        <div className="pdf__nav">
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
            onClick={() => setZoomKeeping(zoom - 0.25)}
          >
            <Minus size={17} />
          </button>
          <span className="pdf__zoom">{Math.round(zoom * 100)}%</span>
          <button
            type="button"
            className="iconbtn"
            aria-label={t("pdf.zoomIn")}
            onClick={() => setZoomKeeping(zoom + 0.25)}
          >
            <Plus size={17} />
          </button>
          <button
            type="button"
            className="iconbtn"
            title={t("pdf.fit")}
            aria-label={t("pdf.fit")}
            onClick={() => setZoomKeeping(1)}
          >
            <Maximize2 size={16} />
          </button>
        </div>
      </header>
      {error && <p className="banner banner--error pdf__error">{error}</p>}
      <div className="pdf__scroll" ref={setScroller}>
        {doc && baseSize ? (
          <div className="pdf__pages" style={{ gap: PAGE_GAP }}>
            {Array.from({ length: doc.numPages }, (_, index) => index + 1).map((pageNumber) => (
              <PdfPage
                key={pageNumber}
                doc={doc}
                pageNumber={pageNumber}
                baseSize={baseSize}
                scale={scale}
                type={pageTypes.get(pageNumber)}
                items={byPage.get(pageNumber) ?? []}
                results={results}
                states={states}
                selectedId={selectedId}
                showBoxes={showBoxes}
                root={scroller}
                onSelect={onSelect}
                register={register}
              />
            ))}
          </div>
        ) : (
          !error && <p className="pdf__loading">{t("pdf.loading")}</p>
        )}
      </div>
    </section>
  );
});
