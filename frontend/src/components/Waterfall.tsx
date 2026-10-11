import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import type { Column, ColumnKey, SegmentStatus } from "../lib/waterfall";
import { formatChf, formatCompact, formatNumber } from "../lib/format";
import { useI18n } from "../i18n";

const HEIGHT = 300;
const PAD_TOP = 30;
const PAD_BOTTOM = 8;
const GHOST_HEIGHT = 28;
const FULL_LABEL_SLOT = 104; // narrower columns get compact labels (1'126k)

export const COLUMN_COLORS: Record<ColumnKey, string> = {
  material: "#1f8a70",
  labour: "#6fbf9c",
  unpriced: "#c2413b",
  project: "#e89a2c",
  direct: "#4f6f86",
  overhead: "#8a97a3",
  transport: "#e2b23a",
  baseline: "#4f6f86",
  margin: "#2b4a63",
  offer: "#17796a",
};

/** Where clicking a part of the chart leads in the item list. */
export interface ItemsFilter {
  status: "priced" | "check" | "open" | null;
  component: "material" | "labour" | null;
}

interface Target {
  id: string;
  column: number;
  segment: SegmentStatus | null;
  filter: ItemsFilter | null;
}

/**
 * The single chart of the price page: from material and labour to the offer.
 * Totals stand on the axis, the steps float between them. Material and labour
 * show what is verified (solid) and still to check (hatched); positions without
 * a price get a dashed ghost column with no height, because no estimate exists.
 * Every part is focusable and explains itself in a tooltip.
 */
export function Waterfall({
  columns,
  offer,
  counts,
  describe,
  onOpenItems,
}: {
  columns: Column[];
  /** Positions by price state, for the legend. */
  counts: { verified: number; check: number; open: number };
  /** The offer the shares are taken of. */
  offer: number;
  /** The calculation base of a column, in plain words. */
  describe: (key: ColumnKey) => string;
  onOpenItems: (filter: ItemsFilter) => void;
}) {
  const { t } = useI18n();
  const uid = useId().replace(/:/g, "");
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(900);
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    const node = wrapRef.current;
    if (!node) return;
    const observer = new ResizeObserver(() => setWidth(node.clientWidth));
    observer.observe(node);
    setWidth(node.clientWidth);
    return () => observer.disconnect();
  }, []);

  const count = columns.length;
  const slot = width / Math.max(count, 1);
  const barWidth = Math.min(slot * 0.64, 84);
  const maxValue = Math.max(...columns.map((column) => Math.max(column.to, column.from)), 1);
  const plot = HEIGHT - PAD_TOP - PAD_BOTTOM;
  const y = (value: number) => PAD_TOP + plot * (1 - Math.max(value, 0) / maxValue);
  const x = (index: number) => index * slot + (slot - barWidth) / 2;
  const label = (value: number) => (slot >= FULL_LABEL_SLOT ? formatChf(value) : formatCompact(value));
  const name = (column: Column) =>
    column.key === "unpriced" ? t("price.col.unpriced", { count: column.count }) : t(`price.col.${column.key}`);

  const targets = useMemo<Target[]>(() => {
    const out: Target[] = [];
    columns.forEach((column, index) => {
      if (column.segments) {
        for (const segment of column.segments) {
          if (segment.amount <= 0) continue;
          out.push({
            id: `${column.key}-${segment.status}`,
            column: index,
            segment: segment.status,
            filter: {
              status: segment.status === "verified" ? "priced" : "check",
              component: column.key === "material" ? "material" : "labour",
            },
          });
        }
      } else {
        out.push({
          id: column.key,
          column: index,
          segment: null,
          filter: column.key === "unpriced" ? { status: "open", component: null } : null,
        });
      }
    });
    return out;
  }, [columns]);

  const activeTarget = targets.find((target) => target.id === active) ?? null;
  const activeColumn = activeTarget ? columns[activeTarget.column] : null;

  const onKey = (event: KeyboardEvent, target: Target) => {
    if (event.key === "Escape") setActive(null);
    if ((event.key === "Enter" || event.key === " ") && target.filter) {
      event.preventDefault();
      onOpenItems(target.filter);
    }
  };

  // Each interactive rectangle: hover/focus shows the tooltip, click navigates.
  const hit = (target: Target, rect: { x: number; y: number; width: number; height: number }, extra: object) => {
    const column = columns[target.column];
    const segment = target.segment ? column.segments?.find((entry) => entry.status === target.segment) : null;
    const amount = segment ? segment.amount : column.amount;
    const aria = [
      name(column),
      target.segment ? t(`price.segment.${target.segment}`) : null,
      amount != null ? formatChf(amount) : t("price.unknown"),
    ]
      .filter(Boolean)
      .join(", ");
    return (
      <rect
        key={target.id}
        {...rect}
        {...extra}
        height={Math.max(rect.height, 2)}
        className={`wf__bar ${target.filter ? "is-link" : ""} ${active === target.id ? "is-active" : ""}`}
        tabIndex={0}
        role={target.filter ? "link" : "img"}
        aria-label={aria}
        aria-describedby={active === target.id ? `${uid}-tip` : undefined}
        onMouseEnter={() => setActive(target.id)}
        onMouseLeave={() => setActive((current) => (current === target.id ? null : current))}
        onFocus={() => setActive(target.id)}
        onBlur={() => setActive((current) => (current === target.id ? null : current))}
        onKeyDown={(event) => onKey(event, target)}
        onClick={() => target.filter && onOpenItems(target.filter)}
      />
    );
  };

  const percentOfOffer = (amount: number | null) =>
    amount == null || offer <= 0 ? null : `${formatNumber((amount / offer) * 100, 1)}%`;

  const tipTop = activeColumn
    ? activeColumn.kind === "ghost"
      ? y(activeColumn.from) - GHOST_HEIGHT
      : y(activeColumn.to)
    : 0;
  const tipBelow = tipTop < 200;
  const tipX = activeTarget ? Math.min(Math.max(activeTarget.column * slot + slot / 2, 150), width - 150) : 0;
  const activeSegment =
    activeTarget?.segment && activeColumn?.segments
      ? activeColumn.segments.find((segment) => segment.status === activeTarget.segment)
      : null;

  return (
    <div className="wf" ref={wrapRef}>
      <svg width={width} height={HEIGHT} className="wf__svg" role="group" aria-label={t("price.chartAria")}>
        <defs>
          {(["material", "labour"] as ColumnKey[]).map((key) => (
            <pattern
              key={key}
              id={`${uid}-hatch-${key}`}
              patternUnits="userSpaceOnUse"
              width="7"
              height="7"
              patternTransform="rotate(45)"
            >
              <rect width="7" height="7" fill="#ffffff" />
              <rect width="3.2" height="7" fill={COLUMN_COLORS[key]} />
            </pattern>
          ))}
        </defs>

        {/* connectors: each step continues from the level the previous one reached */}
        {columns.slice(0, -1).map((column, index) => {
          const level = column.kind === "ghost" ? column.from : column.to;
          return (
            <line
              key={`c-${column.key}`}
              className="wf__connector"
              style={{ "--i": index } as CSSProperties}
              x1={x(index) + barWidth}
              x2={x(index + 1)}
              y1={y(level)}
              y2={y(level)}
            />
          );
        })}
        <line className="wf__axis" x1={0} x2={width} y1={y(0)} y2={y(0)} />

        {columns.map((column, index) => {
          const color = COLUMN_COLORS[column.key];
          if (column.kind === "ghost") {
            const top = y(column.from) - GHOST_HEIGHT;
            const target = targets.find((entry) => entry.id === column.key)!;
            return (
              <g key={column.key} style={{ "--i": index } as CSSProperties}>
                {hit(target, { x: x(index), y: top, width: barWidth, height: GHOST_HEIGHT }, {
                  fill: "transparent",
                  stroke: color,
                  strokeDasharray: "4 3",
                  strokeWidth: 1.5,
                })}
                <text className="wf__label wf__label--ghost" x={x(index) + barWidth / 2} y={top - 7}>
                  ?
                </text>
              </g>
            );
          }
          if (column.segments) {
            let base = column.from;
            return (
              <g key={column.key} style={{ "--i": index } as CSSProperties}>
                {column.segments.map((segment) => {
                  if (segment.amount <= 0) return null;
                  const from = base;
                  base += segment.amount;
                  const target = targets.find((entry) => entry.id === `${column.key}-${segment.status}`)!;
                  return hit(
                    target,
                    { x: x(index), y: y(base), width: barWidth, height: y(from) - y(base) },
                    segment.status === "verified"
                      ? { fill: color }
                      : { fill: `url(#${uid}-hatch-${column.key})`, stroke: color, strokeWidth: 1 },
                  );
                })}
                <text className="wf__label" x={x(index) + barWidth / 2} y={y(column.to) - 7}>
                  {label(column.amount ?? 0)}
                </text>
              </g>
            );
          }
          const target = targets.find((entry) => entry.id === column.key)!;
          const top = y(column.to);
          const bottom = y(column.kind === "total" ? 0 : column.from);
          return (
            <g key={column.key} style={{ "--i": index } as CSSProperties}>
              {hit(target, { x: x(index), y: top, width: barWidth, height: bottom - top }, { fill: color })}
              <text
                className={`wf__label ${column.kind === "total" ? "wf__label--total" : ""}`}
                x={x(index) + barWidth / 2}
                y={top - 7}
              >
                {label(column.amount ?? 0)}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="wf__names" style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }} aria-hidden>
        {columns.map((column) => (
          <span key={column.key} className={`wf__name ${column.kind === "total" ? "is-total" : ""}`}>
            {name(column)}
          </span>
        ))}
        {/* Material and labour are the priced positions: verified + to check. */}
        <span className="wf__brace" style={{ gridColumn: "1 / 3" }}>
          <span className="wf__brace-label">
            {t("price.mix.priced")} · {t("price.items", { count: counts.verified + counts.check })}
          </span>
        </span>
      </div>

      {activeTarget && activeColumn && (
        <div
          id={`${uid}-tip`}
          role="tooltip"
          className={`wf__tip ${tipBelow ? "is-below" : ""}`}
          style={{ left: tipX, top: tipBelow ? tipTop + 12 : tipTop - 12 }}
        >
          <p className="wf__tip-title">
            <span className="wf__tip-swatch" style={{ background: COLUMN_COLORS[activeColumn.key] }} />
            {name(activeColumn)}
            {activeSegment && <span className="wf__tip-seg">{t(`price.segment.${activeSegment.status}`)}</span>}
          </p>
          <p className="wf__tip-amount">
            {activeSegment
              ? formatChf(activeSegment.amount, true)
              : activeColumn.amount != null
                ? formatChf(activeColumn.amount, true)
                : t("price.unknown")}
            {percentOfOffer(activeSegment ? activeSegment.amount : activeColumn.amount) && (
              <span className="muted">
                {" "}
                · {t("price.ofOffer", { pct: percentOfOffer(activeSegment ? activeSegment.amount : activeColumn.amount) })}
              </span>
            )}
          </p>
          {activeSegment && activeColumn.amount != null && (
            <p className="wf__tip-line muted">{t("price.columnTotal", { value: formatChf(activeColumn.amount, true) })}</p>
          )}
          <p className="wf__tip-base">{describe(activeColumn.key)}</p>
          <p className="wf__tip-line">
            {activeColumn.key === "unpriced"
              ? t("price.unpricedNote", { count: activeColumn.count })
              : activeSegment
                ? t("price.items", { count: activeSegment.count })
                : activeColumn.count > 0
                  ? `${t("price.items", { count: activeColumn.count })}${
                      activeColumn.verifiedShare != null
                        ? ` · ${t("price.verifiedShare", { pct: formatNumber(activeColumn.verifiedShare * 100, 0) })}`
                        : ""
                    }`
                  : null}
          </p>
          {activeColumn.top.length > 0 && (
            <>
              <p className="wf__tip-sub">
                {activeColumn.key === "unpriced" ? t("price.examples") : t("price.topItems")}
              </p>
              <ol className="wf__tip-top">
                {activeColumn.top.map((item) => (
                  <li key={item.lvId}>
                    <span className="wf__tip-name">{item.name}</span>
                    {item.amount != null && <span className="wf__tip-num">{formatChf(item.amount)}</span>}
                  </li>
                ))}
              </ol>
            </>
          )}
          {activeTarget.filter && <p className="wf__tip-hint">{t("price.clickToOpen")}</p>}
        </div>
      )}

      <div className="wf__legend">
        <div className="wf__legend-group">
          <span className="wf__legend-title">{t("price.mix.priced")}</span>
          <span className="wf__legend-item">
            <span className="wf__key wf__key--solid" />
            {t("price.legend.verified")} <span className="muted">· {counts.verified}</span>
          </span>
          <span className="wf__legend-plus" aria-hidden>
            +
          </span>
          <span className="wf__legend-item">
            <span className="wf__key wf__key--hatch" />
            {t("price.legend.check")} <span className="muted">· {counts.check}</span>
          </span>
        </div>
        {counts.open > 0 && (
          <span className="wf__legend-item wf__legend-item--out">
            <span className="wf__key wf__key--ghost" />
            {t("price.legend.unpriced")} <span className="muted">· {counts.open}</span>
          </span>
        )}
      </div>

      {/* A table ignores width: 1px, so the visually hidden box wraps it. */}
      <div className="sr-only">
      <table>
        <caption>{t("price.tableCaption")}</caption>
        <thead>
          <tr>
            <th scope="col">{t("price.tableComponent")}</th>
            <th scope="col">{t("price.tableAmount")}</th>
            <th scope="col">{t("price.tableShare")}</th>
            <th scope="col">{t("price.tableBase")}</th>
          </tr>
        </thead>
        <tbody>
          {columns.map((column) => (
            <tr key={column.key}>
              <th scope="row">{name(column)}</th>
              <td>
                {column.amount != null ? formatChf(column.amount, true) : t("price.unknown")}
                {column.segments &&
                  column.segments.map((segment) => (
                    <span key={segment.status}>
                      {" "}
                      ({t(`price.segment.${segment.status}`)}: {formatChf(segment.amount, true)})
                    </span>
                  ))}
              </td>
              <td>{percentOfOffer(column.amount) ?? "—"}</td>
              <td>{describe(column.key)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </div>
  );
}
