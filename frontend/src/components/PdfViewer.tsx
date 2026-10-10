import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import * as pdfjs from "pdfjs-dist";
import type { PDFDocumentProxy } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { Detection, Item, PageClassification, PageType, PositionResult } from "../api/types";
import { formatChf } from "../lib/format";
import { PAGE_TYPE_COLORS, PAGE_TYPE_LABELS } from "../lib/flags";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const SCALE = 1.25;

type Rect = { left: string; top: string; width: string; height: string };

function rectOf(box: number[]): Rect {
  return {
    left: `${box[0] * 100}%`,
    top: `${box[1] * 100}%`,
    width: `${Math.max((box[2] - box[0]) * 100, 2)}%`,
    height: `${Math.max((box[3] - box[1]) * 100, 1)}%`,
  };
}

function PdfPage({
  doc,
  pageNumber,
  pageType,
  highlights,
  discarded,
  pricesById,
  showBoxes,
  selectedId,
  onSelect,
  onVisible,
  registerRef,
}: {
  doc: PDFDocumentProxy;
  pageNumber: number;
  pageType: PageClassification | undefined;
  highlights: Item[];
  discarded: Detection[];
  pricesById: Map<string, PositionResult>;
  showBoxes: boolean;
  selectedId: string | null;
  onSelect: (lvId: string) => void;
  onVisible: (page: number) => void;
  registerRef: (page: number, node: HTMLDivElement | null) => void;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [rendered, setRendered] = useState(false);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    const node = wrapRef.current;
    if (!node) return;
    const lazy = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setRendered(true);
      },
      { rootMargin: "600px" },
    );
    const current = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.intersectionRatio >= 0.5) onVisible(pageNumber);
        }
      },
      { threshold: [0.5] },
    );
    lazy.observe(node);
    current.observe(node);
    return () => {
      lazy.disconnect();
      current.disconnect();
    };
  }, [pageNumber, onVisible]);

  useEffect(() => {
    if (!rendered || size) return;
    let cancelled = false;
    (async () => {
      const page = await doc.getPage(pageNumber);
      if (cancelled) return;
      const viewport = page.getViewport({ scale: SCALE });
      const canvas = canvasRef.current;
      if (!canvas) return;
      const context = canvas.getContext("2d");
      if (!context) return;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: context, viewport }).promise;
      if (!cancelled) setSize({ width: viewport.width, height: viewport.height });
    })();
    return () => {
      cancelled = true;
    };
  }, [rendered, size, doc, pageNumber]);

  const type = pageType?.type ?? "other";

  // Variants share one description block: draw the name box once per block and
  // label the group, instead of stacking N identical boxes.
  // Variants share the description block's top-left and width but their bottom
  // can differ by a line, so group on (x0, x1, y0) rather than the whole box.
  const blockKey = (box: number[] | null) =>
    box ? [box[0], box[2], box[1]].map((value) => value.toFixed(2)).join(",") : null;

  const nameGroups = useMemo(() => {
    const map = new Map<string, Item[]>();
    for (const item of highlights) {
      const box = item.name_bbox ?? item.source_bbox;
      const key = blockKey(box) ?? `solo-${item.lv_id}`;
      const list = map.get(key) ?? [];
      list.push(item);
      map.set(key, list);
    }
    return [...map.values()].sort((a, b) => {
      const ya = (a[0].name_bbox ?? a[0].source_bbox ?? [0, 0])[1];
      const yb = (b[0].name_bbox ?? b[0].source_bbox ?? [0, 0])[1];
      return ya - yb;
    });
  }, [highlights]);

  const discardedGroups = useMemo(() => {
    const seen = new Set<string>();
    const out: Detection[] = [];
    for (const detection of discarded) {
      const key = blockKey(detection.name_bbox);
      if (key && seen.has(key)) continue;
      if (key) seen.add(key);
      out.push(detection);
    }
    return out;
  }, [discarded]);

  return (
    <div
      className="pdf-page"
      ref={(node) => {
        wrapRef.current = node;
        registerRef(pageNumber, node);
      }}
    >
      <div className="pdf-page__label">
        <span>Pagina {pageNumber}</span>
        {pageType && (
          <span
            className={`pdf-type pdf-type--${pageType.type}`}
            title={`${PAGE_TYPE_LABELS[pageType.type]} · confidenza ${pageType.confidence}${
              pageType.reason ? ` · ${pageType.reason}` : ""
            }`}
          >
            {PAGE_TYPE_LABELS[pageType.type]}
          </span>
        )}
      </div>
      <div
        className={`pdf-page__canvas pdf-page__canvas--${type}`}
        style={size ? { width: size.width, height: size.height } : { minHeight: 400 }}
      >
        <canvas ref={canvasRef} />
        {showBoxes &&
          nameGroups.map((group) => {
            const first = group[0];
            const nameBox = first.name_bbox ?? first.source_bbox;
            if (!nameBox) return null;
            const active = group.some((item) => item.lv_id === selectedId);
            const status = !first.match ? "missing" : first.flags.length ? "soft" : "ok";
            const note = !first.match ? " · senza match nel catalogo" : "";
            const label =
              group.length > 1
                ? `${first.lv_id}–${group[group.length - 1].lv_id} · ${group.length} varianti`
                : first.lv_id;
            return (
              <button
                key={`n-${first.lv_id}`}
                type="button"
                data-lv={first.lv_id}
                className={`pdf-hl pdf-hl--name pdf-hl--${status} ${active ? "is-active" : ""}`}
                style={rectOf(nameBox)}
                title={`${label} · ${first.description_raw ?? ""}${note}`}
                onClick={() => onSelect(first.lv_id)}
              >
                <span className="pdf-hl__tag">
                  {status === "missing" ? "⚠ " : ""}
                  {label}
                </span>
              </button>
            );
          })}
        {showBoxes &&
          highlights.map((item) => {
            const priceBox = item.price_bbox;
            if (!priceBox) return null;
            const active = item.lv_id === selectedId;
            const price = pricesById.get(item.lv_id)?.material_cost_chf ?? null;
            return (
              <button
                key={`p-${item.lv_id}`}
                type="button"
                data-lv={item.lv_id}
                className={`pdf-hl pdf-hl--price ${active ? "is-active" : ""}`}
                style={rectOf(priceBox)}
                title={`Prezzo da scrivere qui${price != null ? ` · ${formatChf(price)}` : ""}`}
                onClick={() => onSelect(item.lv_id)}
              >
                <span className="pdf-hl__tag">
                  {price != null ? formatChf(price) : "prezzo"}
                </span>
              </button>
            );
          })}
        {showBoxes &&
          discardedGroups.map((detection, index) => {
            const nameBox = detection.name_bbox;
            const priceBox = detection.price_bbox;
            if (!nameBox && !priceBox) return null;
            return (
              <Fragment key={`d-${detection.page}-${index}`}>
                {nameBox && (
                  <span
                    className="pdf-hl pdf-hl--discarded"
                    style={rectOf(nameBox)}
                    title={`Riga scartata (${detection.reason ?? "n/d"}) · ${detection.description ?? ""}`}
                  />
                )}
                {priceBox && (
                  <span
                    className="pdf-hl pdf-hl--discarded pdf-hl--discarded-price"
                    style={rectOf(priceBox)}
                  />
                )}
              </Fragment>
            );
          })}
      </div>
    </div>
  );
}

type FilterKey = "all" | "lv_table" | "with_detections" | `type:${PageType}`;

export function PdfViewer({
  url,
  items,
  detections,
  pageTypes,
  pricesById,
  selectedId,
  expanded,
  onToggleExpanded,
  onSelect,
}: {
  url: string;
  items: Item[];
  detections: Detection[];
  pageTypes: PageClassification[];
  pricesById: Map<string, PositionResult>;
  selectedId: string | null;
  expanded: boolean;
  onToggleExpanded: () => void;
  onSelect: (lvId: string) => void;
}) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showBoxes, setShowBoxes] = useState(true);
  const [navOpen, setNavOpen] = useState(true);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    setDoc(null);
    setError(null);
    const task = pdfjs.getDocument({ url });
    task.promise
      .then((loaded) => {
        if (!cancelled) setDoc(loaded);
      })
      .catch(() => {
        if (!cancelled) setError("Impossibile aprire il PDF di questo bando.");
      });
    return () => {
      cancelled = true;
      task.destroy();
    };
  }, [url]);

  const byPage = useMemo(() => {
    const map = new Map<number, Item[]>();
    for (const item of items) {
      if (!item.source_page) continue;
      const list = map.get(item.source_page) ?? [];
      list.push(item);
      map.set(item.source_page, list);
    }
    return map;
  }, [items]);

  const discardedByPage = useMemo(() => {
    const map = new Map<number, Detection[]>();
    for (const detection of detections) {
      if (detection.kept) continue;
      const list = map.get(detection.page) ?? [];
      list.push(detection);
      map.set(detection.page, list);
    }
    return map;
  }, [detections]);

  const pageTypeByPage = useMemo(() => {
    const map = new Map<number, PageClassification>();
    for (const pageType of pageTypes) map.set(pageType.page, pageType);
    return map;
  }, [pageTypes]);

  const counts = useMemo(() => {
    const byType: Record<string, number> = {};
    let lvTable = 0;
    for (const pageType of pageTypes) {
      byType[pageType.type] = (byType[pageType.type] ?? 0) + 1;
      if (pageType.type === "lv_table") lvTable += 1;
    }
    return { byType, lvTable };
  }, [pageTypes]);

  const allPages = useMemo(
    () => (doc ? Array.from({ length: doc.numPages }, (_, index) => index + 1) : []),
    [doc],
  );

  const contentCount = (page: number) =>
    (byPage.get(page)?.length ?? 0) + (discardedByPage.get(page)?.length ?? 0);

  const pagesToRender = useMemo(() => {
    if (filter === "all") return allPages;
    if (filter === "lv_table") {
      return allPages.filter((page) => pageTypeByPage.get(page)?.type === "lv_table");
    }
    if (filter === "with_detections") {
      return allPages.filter((page) => contentCount(page) > 0);
    }
    const wanted = filter.slice(5) as PageType;
    return allPages.filter((page) => pageTypeByPage.get(page)?.type === wanted);
  }, [allPages, filter, pageTypeByPage, byPage, discardedByPage]);

  const registerRef = (page: number, node: HTMLDivElement | null) => {
    if (node) pageRefs.current.set(page, node);
    else pageRefs.current.delete(page);
  };

  const jumpTo = (page: number) => {
    pageRefs.current.get(page)?.scrollIntoView({ block: "start" });
  };

  // Two-way sync: selecting a row scrolls the PDF to that item's exact region.
  useEffect(() => {
    if (!selectedId || !scrollRef.current) return;
    const marker = scrollRef.current.querySelector(`[data-lv="${selectedId}"]`);
    if (marker) {
      marker.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
    }
  }, [selectedId, items]);

  const highlightedPages = useMemo(() => [...byPage.keys()].sort((a, b) => a - b), [byPage]);

  // On first load, land on the first page that actually has highlights.
  useEffect(() => {
    if (!doc || selectedId || highlightedPages.length === 0) return;
    pageRefs.current.get(highlightedPages[0])?.scrollIntoView({ block: "start" });
  }, [doc, selectedId, highlightedPages]);

  // When the filter hides the current page, jump to the first visible one.
  useEffect(() => {
    if (pagesToRender.length === 0) return;
    if (!pagesToRender.includes(currentPage)) jumpTo(pagesToRender[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, pagesToRender.length]);

  return (
    <section className={`pdf-card ${expanded ? "is-expanded" : ""}`}>
      <header className="pdf-card__head">
        <button
          type="button"
          className="btn btn--icon"
          aria-label={navOpen ? "Nascondi indice pagine" : "Mostra indice pagine"}
          onClick={() => setNavOpen((value) => !value)}
        >
          ☰
        </button>
        <h3>Documento di gara</h3>
        <span className="pdf-card__meta">
          {doc ? `${doc.numPages} pagine` : "…"} · {counts.lvTable} Tabella LV
        </span>
        <select
          className="pdf-filter"
          value={filter}
          onChange={(event) => setFilter(event.target.value as FilterKey)}
          aria-label="Filtra pagine"
        >
          <option value="all">Tutte le pagine</option>
          <option value="lv_table">Solo Tabella LV</option>
          <option value="with_detections">Con rilevamenti</option>
          {(Object.keys(PAGE_TYPE_LABELS) as PageType[]).map((type) => (
            <option key={type} value={`type:${type}`}>
              {PAGE_TYPE_LABELS[type]}
            </option>
          ))}
        </select>
        <label className="pdf-toggle">
          <input
            type="checkbox"
            checked={showBoxes}
            onChange={(event) => setShowBoxes(event.target.checked)}
          />
          Box
        </label>
        <button type="button" className="btn btn--ghost" onClick={onToggleExpanded}>
          {expanded ? "Riduci" : "Schermo intero"}
        </button>
      </header>
      {error && <p className="pdf-card__error">{error}</p>}
      <div className="pdf-card__body">
        {navOpen && doc && (
          <nav className="pdf-nav" aria-label="Indice pagine">
            {pagesToRender.map((page) => {
              const pageType = pageTypeByPage.get(page)?.type ?? "other";
              const count = contentCount(page);
              return (
                <button
                  key={page}
                  type="button"
                  className={`pdf-nav__item ${page === currentPage ? "is-current" : ""}`}
                  onClick={() => jumpTo(page)}
                  title={`${PAGE_TYPE_LABELS[pageType]}${count ? ` · ${count} righe` : ""}`}
                >
                  <span
                    className="pdf-nav__dot"
                    style={{ background: PAGE_TYPE_COLORS[pageType] }}
                  />
                  <span className="pdf-nav__num">{page}</span>
                  {count > 0 && <span className="pdf-nav__count">{count}</span>}
                </button>
              );
            })}
            {pagesToRender.length === 0 && <p className="pdf-nav__empty">Nessuna pagina.</p>}
          </nav>
        )}
        <div className="pdf-scroll" ref={scrollRef}>
          {doc ? (
            pagesToRender.map((pageNumber) => (
              <PdfPage
                key={pageNumber}
                doc={doc}
                pageNumber={pageNumber}
                pageType={pageTypeByPage.get(pageNumber)}
                highlights={byPage.get(pageNumber) ?? []}
                discarded={discardedByPage.get(pageNumber) ?? []}
                pricesById={pricesById}
                showBoxes={showBoxes}
                selectedId={selectedId}
                onSelect={onSelect}
                onVisible={setCurrentPage}
                registerRef={registerRef}
              />
            ))
          ) : (
            !error && <p className="pdf-card__loading">Carico il documento…</p>
          )}
        </div>
      </div>
    </section>
  );
}
