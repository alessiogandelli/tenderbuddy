import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import {
  CHECK_COLORS,
  COLUMN_COLORS,
  type Column,
  type ColumnKey,
  type ItemsFilter,
  type SegmentStatus,
} from "../lib/waterfall";
import { formatChf, formatCompact, formatNumber } from "../lib/format";
import { useI18n } from "../i18n";

const LABEL_MIN = 112; // px a piece needs for its name and amount
const AMOUNT_MIN = 44; // px a piece needs for a compact amount

/** One stretch of the ribbon: a whole class, or the verified / to-check half of one. */
interface Piece {
  id: string;
  key: ColumnKey;
  status: SegmentStatus | null;
  amount: number;
  count: number;
  color: string;
  filter: ItemsFilter | null;
}

interface Group {
  key: ColumnKey;
  amount: number;
  pieces: Piece[];
}

/**
 * The offer as one horizontal ribbon, left to right: material, labour (each in
 * its own colour, the share still to check a lighter shade of it, the two under
 * one bracket), project costs, overhead, transport and margin. Its length is
 * the offer; brackets underneath close the direct cost, the cost baseline and
 * the offer. Positions without a price have no amount, so they stand apart as
 * a dashed "+n ?" box. Every piece explains itself in a tooltip; material,
 * labour and the unpriced box open the item list filtered.
 */
export function PriceRibbon({
  columns,
  offer,
  counts,
  describe,
  onOpenItems,
}: {
  columns: Column[];
  offer: number;
  counts: { verified: number; check: number; open: number };
  describe: (key: ColumnKey) => string;
  onOpenItems: (filter: ItemsFilter) => void;
}) {
  const { t } = useI18n();
  const uid = useId().replace(/:/g, "");
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(900);
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    const node = trackRef.current;
    if (!node) return;
    const observer = new ResizeObserver(() => setWidth(node.clientWidth));
    observer.observe(node);
    setWidth(node.clientWidth);
    return () => observer.disconnect();
  }, []);

  const column = (key: ColumnKey) => columns.find((entry) => entry.key === key);
  const name = (key: ColumnKey) =>
    key === "unpriced" ? t("price.col.unpriced", { count: counts.open }) : t(`price.col.${key}`);
  const total = Math.max(offer, 1);
  const share = (amount: number) => (amount / total) * 100;

  const groups: Group[] = [];
  for (const key of ["material", "labour", "project", "overhead", "transport", "margin"] as ColumnKey[]) {
    const entry = column(key);
    if (!entry) continue;
    const amount = Math.max(entry.amount ?? 0, 0);
    if (entry.segments && (key === "material" || key === "labour")) {
      groups.push({
        key,
        amount,
        pieces: entry.segments.map((segment) => ({
          id: `${key}-${segment.status}`,
          key,
          status: segment.status,
          amount: Math.max(segment.amount, 0),
          count: segment.count,
          color: segment.status === "verified" ? COLUMN_COLORS[key] : CHECK_COLORS[key],
          filter: { status: segment.status === "verified" ? "priced" : "check", component: key },
        })),
      });
    } else if (amount > 0) {
      groups.push({
        key,
        amount,
        pieces: [{ id: key, key, status: null, amount, count: entry.count, color: COLUMN_COLORS[key], filter: null }],
      });
    }
  }
  const pieces = groups.flatMap((group) => group.pieces);
  const unpriced = column("unpriced");
  const direct = column("direct")?.amount ?? 0;
  const baseline = column("baseline")?.amount ?? 0;

  const activePiece = pieces.find((piece) => piece.id === active) ?? null;
  const activeGroup = active?.startsWith("group:") ? active.slice(6) : activePiece?.key ?? null;
  const isLit = (piece: Piece) => (activePiece ? piece.id === activePiece.id : piece.key === activeGroup);

  const onKey = (event: KeyboardEvent, filter: ItemsFilter | null) => {
    if (event.key === "Escape") setActive(null);
    if ((event.key === "Enter" || event.key === " ") && filter) {
      event.preventDefault();
      onOpenItems(filter);
    }
  };
  const hover = (id: string) => ({
    onMouseEnter: () => setActive(id),
    onMouseLeave: () => setActive((current) => (current === id ? null : current)),
    onFocus: () => setActive(id),
    onBlur: () => setActive((current) => (current === id ? null : current)),
  });

  // Where the tooltip points: the middle of the hovered piece.
  let start = 0;
  let tipX = 0;
  for (const piece of pieces) {
    if (piece.id === active) tipX = ((start + share(piece.amount) / 2) / 100) * width;
    start += share(piece.amount);
  }
  tipX = active === "unpriced" ? width - 70 : Math.min(Math.max(tipX, 150), width - 90);
  const tipColumn = activePiece ? column(activePiece.key) : active === "unpriced" ? unpriced : null;
  const tipSegment =
    activePiece?.status && tipColumn?.segments
      ? tipColumn.segments.find((segment) => segment.status === activePiece.status)
      : null;
  const tipAmount = tipSegment ? tipSegment.amount : tipColumn?.amount ?? null;

  const pieceLabel = (piece: Piece) => {
    const px = (share(piece.amount) / 100) * width;
    const what = piece.status ? t(`price.legend.${piece.status}`) : name(piece.key);
    if (px >= LABEL_MIN) {
      return (
        <>
          <span className="rb__seg-name">{what}</span>
          <span className="rb__seg-num">{formatCompact(piece.amount)}</span>
        </>
      );
    }
    return px >= AMOUNT_MIN ? <span className="rb__seg-num">{formatCompact(piece.amount)}</span> : null;
  };

  let index = 0;
  return (
    <div className={`rb ${active ? "has-active" : ""}`}>
      <div className="rb__row">
        <div className="rb__track" ref={trackRef} role="group" aria-label={t("price.chartAria")}>
          {groups.map((group) => {
            const split = group.pieces.length > 1;
            return (
              <div
                key={group.key}
                className={`rb__group ${split ? "rb__group--split" : ""}`}
                style={{ width: `${share(group.amount)}%` }}
              >
                {split && (
                  // Material and labour: one bracket over both halves names the class.
                  <div className={`rb__head ${activeGroup === group.key ? "is-lit" : ""}`} {...hover(`group:${group.key}`)}>
                    <span className="rb__head-label">
                      <span className="rb__head-key" style={{ background: COLUMN_COLORS[group.key] }} aria-hidden />
                      {name(group.key)} <strong>{formatChf(group.amount)}</strong>
                    </span>
                  </div>
                )}
                <div className="rb__bar">
                  {group.pieces.map((piece) => {
                    const i = index++;
                    const Tag = piece.filter ? "button" : "span";
                    return (
                      <Tag
                        key={piece.id}
                        type={piece.filter ? "button" : undefined}
                        className={`rb__seg ${piece.status === "check" ? "is-check" : ""} ${isLit(piece) ? "is-active" : ""}`}
                        style={{ width: `${group.amount > 0 ? (piece.amount / group.amount) * 100 : 0}%`, background: piece.color, "--i": i } as CSSProperties}
                        tabIndex={0}
                        role={piece.filter ? undefined : "img"}
                        aria-label={[name(piece.key), piece.status ? t(`price.segment.${piece.status}`) : null, formatChf(piece.amount)]
                          .filter(Boolean)
                          .join(", ")}
                        aria-describedby={active === piece.id ? `${uid}-tip` : undefined}
                        {...hover(piece.id)}
                        onKeyDown={(event: KeyboardEvent) => onKey(event, piece.filter)}
                        onClick={() => piece.filter && onOpenItems(piece.filter)}
                      >
                        {pieceLabel(piece)}
                      </Tag>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        {counts.open > 0 && (
          <button
            type="button"
            className={`rb__ghost ${active === "unpriced" ? "is-active" : ""}`}
            aria-label={`${name("unpriced")}: ${t("price.unknown")}`}
            aria-describedby={active === "unpriced" ? `${uid}-tip` : undefined}
            {...hover("unpriced")}
            onKeyDown={(event) => onKey(event, { status: "open", component: null })}
            onClick={() => onOpenItems({ status: "open", component: null })}
          >
            +{counts.open} ?
          </button>
        )}
      </div>

      {/* Brackets from the left edge: what each subtotal closes. */}
      <div className="rb__spans" aria-hidden>
        {[
          { key: "direct" as ColumnKey, amount: direct },
          { key: "baseline" as ColumnKey, amount: baseline },
          { key: "offer" as ColumnKey, amount: offer },
        ].map((span, spanIndex) => (
          <div
            key={span.key}
            className={`rb__span rb__span--${span.key}`}
            style={{ width: `${Math.min(share(span.amount), 100)}%`, "--i": spanIndex } as CSSProperties}
          >
            <span className="rb__span-name">{name(span.key)}</span>
            <span className="rb__span-num">{formatChf(span.amount)}</span>
          </div>
        ))}
      </div>

      {(activePiece || active === "unpriced") && tipColumn && (
        <div id={`${uid}-tip`} role="tooltip" className="wf__tip rb__tip" style={{ left: tipX }}>
          <p className="wf__tip-title">
            <span className="wf__tip-swatch" style={{ background: activePiece?.color ?? COLUMN_COLORS.unpriced }} />
            {name(tipColumn.key)}
            {tipSegment && <span className="wf__tip-seg">{t(`price.segment.${tipSegment.status}`)}</span>}
          </p>
          <p className="wf__tip-amount">
            {tipAmount != null ? formatChf(tipAmount, true) : t("price.unknown")}
            {tipAmount != null && offer > 0 && (
              <span className="muted"> · {t("price.ofOffer", { pct: `${formatNumber(share(tipAmount), 1)}%` })}</span>
            )}
          </p>
          {tipSegment && tipColumn.amount != null && (
            <p className="wf__tip-line muted">{t("price.columnTotal", { value: formatChf(tipColumn.amount, true) })}</p>
          )}
          <p className="wf__tip-base">{describe(tipColumn.key)}</p>
          <p className="wf__tip-line">
            {tipColumn.key === "unpriced"
              ? t("price.unpricedNote", { count: counts.open })
              : tipSegment
                ? t("price.items", { count: tipSegment.count })
                : tipColumn.count > 0
                  ? `${t("price.items", { count: tipColumn.count })}${
                      tipColumn.verifiedShare != null
                        ? ` · ${t("price.verifiedShare", { pct: formatNumber(tipColumn.verifiedShare * 100, 0) })}`
                        : ""
                    }`
                  : null}
          </p>
          {tipColumn.top.length > 0 && (
            <>
              <p className="wf__tip-sub">{tipColumn.key === "unpriced" ? t("price.examples") : t("price.topItems")}</p>
              <ol className="wf__tip-top">
                {tipColumn.top.map((item) => (
                  <li key={item.lvId}>
                    <span className="wf__tip-name">{item.name}</span>
                    {item.amount != null && <span className="wf__tip-num">{formatChf(item.amount)}</span>}
                  </li>
                ))}
              </ol>
            </>
          )}
          {(activePiece?.filter || active === "unpriced") && <p className="wf__tip-hint">{t("price.clickToOpen")}</p>}
        </div>
      )}

      <ul className="rb__legend">
        {groups.map((group, groupIndex) => {
          const split = group.pieces.length > 1;
          return (
            <li
              key={group.key}
              className={`rb__key ${activeGroup === group.key ? "is-lit" : ""} ${activeGroup && activeGroup !== group.key ? "is-dim" : ""}`}
              style={{ "--i": groupIndex } as CSSProperties}
              {...hover(`group:${group.key}`)}
            >
              <span className="rb__key-head">
                <span className="rb__swatch" style={{ background: COLUMN_COLORS[group.key] }} aria-hidden />
                {name(group.key)}
                <span className="rb__key-share">{formatNumber(share(group.amount), 1)}%</span>
              </span>
              <strong className="rb__key-num">{formatChf(group.amount)}</strong>
              {split && (
                <span className="rb__key-parts">
                  {group.pieces.map((piece) => (
                    <button
                      key={piece.id}
                      type="button"
                      className="rb__part"
                      onClick={() => piece.filter && onOpenItems(piece.filter)}
                      title={t("price.clickToOpen")}
                    >
                      <span className="rb__swatch rb__swatch--sm" style={{ background: piece.color }} aria-hidden />
                      {t(`price.legend.${piece.status}`)} {formatCompact(piece.amount)}
                    </button>
                  ))}
                </span>
              )}
            </li>
          );
        })}
        {counts.open > 0 && unpriced && (
          <li className="rb__key rb__key--ghost" {...hover("unpriced")}>
            <span className="rb__key-head">
              <span className="rb__swatch rb__swatch--ghost" aria-hidden />
              {t("price.mix.unpriced")}
            </span>
            <strong className="rb__key-num">{t("price.items", { count: counts.open })}</strong>
            <span className="rb__key-parts">{t("price.mix.unpricedNote")}</span>
          </li>
        )}
      </ul>

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
            {columns.map((entry) => (
              <tr key={entry.key}>
                <th scope="row">{name(entry.key)}</th>
                <td>
                  {entry.amount != null ? formatChf(entry.amount, true) : t("price.unknown")}
                  {entry.segments?.map((segment) => (
                    <span key={segment.status}>
                      {" "}
                      ({t(`price.segment.${segment.status}`)}: {formatChf(segment.amount, true)})
                    </span>
                  ))}
                </td>
                <td>{entry.amount != null && offer > 0 ? `${formatNumber(share(entry.amount), 1)}%` : "—"}</td>
                <td>{describe(entry.key)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
