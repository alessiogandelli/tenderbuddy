import { useEffect, useMemo, useRef, useState } from "react";
import * as pdfjs from "pdfjs-dist";
import type { PDFDocumentProxy } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { Item } from "../api/types";

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const SCALE = 1.25;

function PdfPage({
  doc,
  pageNumber,
  highlights,
  selectedId,
  onSelect,
  registerRef,
}: {
  doc: PDFDocumentProxy;
  pageNumber: number;
  highlights: Item[];
  selectedId: string | null;
  onSelect: (lvId: string) => void;
  registerRef: (page: number, node: HTMLDivElement | null) => void;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [rendered, setRendered] = useState(false);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    const node = wrapRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setRendered(true);
      },
      { rootMargin: "400px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

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

  return (
    <div
      className="pdf-page"
      ref={(node) => {
        wrapRef.current = node;
        registerRef(pageNumber, node);
      }}
    >
      <div className="pdf-page__label">Pagina {pageNumber}</div>
      <div
        className="pdf-page__canvas"
        style={size ? { width: size.width, height: size.height } : { minHeight: 400 }}
      >
        <canvas ref={canvasRef} />
        {highlights.map((item) => {
          const bbox = item.source_bbox;
          if (!bbox) return null;
          const [x0, y0, x1, y1] = bbox;
          const active = item.lv_id === selectedId;
          return (
            <button
              key={item.lv_id}
              type="button"
              className={`pdf-hl ${active ? "is-active" : ""}`}
              style={{
                left: `${x0 * 100}%`,
                top: `${y0 * 100}%`,
                width: `${(x1 - x0) * 100}%`,
                height: `${(y1 - y0) * 100}%`,
              }}
              title={`${item.lv_id} · ${item.description_raw ?? ""}`}
              onClick={() => onSelect(item.lv_id)}
            >
              <span className="pdf-hl__tag">{item.lv_id}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function PdfViewer({
  url,
  items,
  selectedId,
  onSelect,
  jumpToPage,
}: {
  url: string;
  items: Item[];
  selectedId: string | null;
  onSelect: (lvId: string) => void;
  jumpToPage: number | null;
}) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const containerRef = useRef<HTMLDivElement | null>(null);

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

  const registerRef = (page: number, node: HTMLDivElement | null) => {
    if (node) pageRefs.current.set(page, node);
    else pageRefs.current.delete(page);
  };

  // Two-way sync: selecting a row scrolls the PDF to that item's region.
  useEffect(() => {
    if (!selectedId) return;
    const item = items.find((candidate) => candidate.lv_id === selectedId);
    if (!item?.source_page) return;
    const node = pageRefs.current.get(item.source_page);
    node?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [selectedId, items]);

  // Clicking a page badge jumps here.
  useEffect(() => {
    if (!jumpToPage) return;
    const node = pageRefs.current.get(jumpToPage);
    node?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [jumpToPage]);

  const highlightedPages = useMemo(() => [...byPage.keys()].sort((a, b) => a - b), [byPage]);

  // On first load, land on the first page that actually has highlights.
  useEffect(() => {
    if (!doc || selectedId || highlightedPages.length === 0) return;
    const first = pageRefs.current.get(highlightedPages[0]);
    first?.scrollIntoView({ block: "start" });
  }, [doc, selectedId, highlightedPages]);

  return (
    <section className="card pdf-card">
      <header className="pdf-card__head">
        <h3>Documento di gara</h3>
        <span className="caption">
          {highlightedPages.length > 0
            ? `Posizioni evidenziate alle pagine ${highlightedPages.slice(0, 8).join(", ")}${
                highlightedPages.length > 8 ? "…" : ""
              }`
            : "Nessuna posizione evidenziata"}
        </span>
      </header>
      {error && <p className="pdf-card__error">{error}</p>}
      <div className="pdf-scroll" ref={containerRef}>
        {doc ? (
          Array.from({ length: doc.numPages }, (_, index) => index + 1).map((pageNumber) => (
            <PdfPage
              key={pageNumber}
              doc={doc}
              pageNumber={pageNumber}
              highlights={byPage.get(pageNumber) ?? []}
              selectedId={selectedId}
              onSelect={onSelect}
              registerRef={registerRef}
            />
          ))
        ) : (
          !error && <p className="pdf-card__loading">Carico il documento…</p>
        )}
      </div>
    </section>
  );
}
