import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { Palette } from "lucide-react";
import type { PageClassification, PageType } from "../api/types";
import { PAGE_TYPE_COLORS, pageTypeCounts } from "../lib/pageTypes";
import { useI18n } from "../i18n";

/**
 * The page rail between the item list and the document: one cell per page,
 * coloured by page type — the same tape the reading screen filled. It marks the
 * page in view and the selected item's page; click or drag it to move through
 * the document. The palette button opens the colour legend.
 */
export function PageRail({
  pageCount,
  pageTypes,
  types,
  itemsPerPage,
  current,
  selectedPage,
  hidden,
  onJump,
}: {
  pageCount: number;
  pageTypes: PageClassification[];
  types: Map<number, PageType>;
  itemsPerPage: Map<number, number>;
  current: number;
  selectedPage: number | null;
  hidden: boolean;
  onJump: (page: number, smooth: boolean) => void;
}) {
  const { t } = useI18n();
  const trackRef = useRef<HTMLDivElement | null>(null);
  const legendRef = useRef<HTMLDivElement | null>(null);
  const [hover, setHover] = useState<{ page: number; y: number } | null>(null);
  const [legendOpen, setLegendOpen] = useState(false);
  const counts = useMemo(() => pageTypeCounts(pageTypes), [pageTypes]);
  const dense = pageCount > 90;

  useEffect(() => {
    if (!legendOpen) return;
    const close = (event: MouseEvent) => {
      if (!legendRef.current?.contains(event.target as Node)) setLegendOpen(false);
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [legendOpen]);

  const pageAt = (clientY: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || pageCount === 0) return null;
    const ratio = Math.min(Math.max((clientY - rect.top) / rect.height, 0), 0.9999);
    return { page: Math.floor(ratio * pageCount) + 1, y: clientY - rect.top };
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const hit = pageAt(event.clientY);
    if (!hit) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    onJump(hit.page, false);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const hit = pageAt(event.clientY);
    setHover(hit);
    if (hit && event.buttons === 1) onJump(hit.page, false);
  };

  const share = pageCount > 0 ? 100 / pageCount : 0;
  const markerStyle = (page: number): CSSProperties => ({
    top: `${(page - 1) * share}%`,
    height: `max(${share}%, 3px)`,
  });
  const hoverType = hover ? types.get(hover.page) : undefined;
  const hoverItems = hover ? (itemsPerPage.get(hover.page) ?? 0) : 0;

  return (
    <div className={`rail ${hidden ? "is-hidden" : ""}`}>
      <div className="rail__legend" ref={legendRef}>
        <button
          type="button"
          className={`rail__legend-btn ${legendOpen ? "is-open" : ""}`}
          aria-expanded={legendOpen}
          aria-label={t("legend.title")}
          title={t("legend.title")}
          onClick={() => setLegendOpen((open) => !open)}
        >
          <Palette size={16} />
        </button>
        {legendOpen && (
          <div className="legend-pop" role="dialog" aria-label={t("legend.title")}>
            <p className="legend-pop__title">{t("legend.title")}</p>
            <p className="legend-pop__hint">{t("legend.hint")}</p>
            <ul>
              {counts.map(({ type, count }) => {
                const first = pageTypes.find((entry) => entry.type === type)?.page;
                return (
                  <li key={type}>
                    <button
                      type="button"
                      onClick={() => {
                        if (first) onJump(first, true);
                        setLegendOpen(false);
                      }}
                    >
                      <span className="legend__swatch" style={{ background: PAGE_TYPE_COLORS[type] }} />
                      <span className="legend-pop__name">{t(`pageType.${type}`)}</span>
                      <span className="legend__count">{t("common.pages", { count })}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      <div
        ref={trackRef}
        className={`rail__track ${dense ? "is-dense" : ""}`}
        role="slider"
        tabIndex={0}
        aria-label={t("rail.aria")}
        aria-valuemin={1}
        aria-valuemax={pageCount}
        aria-valuenow={current}
        aria-valuetext={t("pdf.page", { page: current })}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerLeave={() => setHover(null)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "PageDown") {
            event.preventDefault();
            onJump(Math.min(current + 1, pageCount), true);
          }
          if (event.key === "ArrowUp" || event.key === "PageUp") {
            event.preventDefault();
            onJump(Math.max(current - 1, 1), true);
          }
        }}
      >
        {Array.from({ length: pageCount }, (_, index) => {
          const type = types.get(index + 1);
          return (
            <span
              key={index}
              data-rail-tick
              className="rail__tick"
              style={{ background: type ? PAGE_TYPE_COLORS[type] : "var(--tape-read)" }}
            />
          );
        })}
        {selectedPage && <span className="rail__selected" style={markerStyle(selectedPage)} />}
        {pageCount > 0 && <span className="rail__current" style={markerStyle(current)} />}
        {hover && (
          <span className="rail__tip" style={{ top: hover.y }}>
            <span
              className="legend__swatch"
              style={{ background: hoverType ? PAGE_TYPE_COLORS[hoverType] : "var(--tape-read)" }}
            />
            <strong>{t("pdf.page", { page: hover.page })}</strong>
            {hoverType && <span>{t(`pageType.${hoverType}`)}</span>}
            {hoverItems > 0 && <span className="rail__tip-items">{t("rail.items", { count: hoverItems })}</span>}
          </span>
        )}
      </div>
    </div>
  );
}
