import { useState, type CSSProperties } from "react";
import type { Column, ColumnKey } from "../lib/waterfall";
import { formatChf, formatNumber } from "../lib/format";
import { useI18n } from "../i18n";
import { AnimatedChf } from "./AnimatedChf";
import { Donut, type DonutSegment } from "./Donut";
import { COLUMN_COLORS, type ItemsFilter } from "./Waterfall";

/** Parent arcs (inner ring) are a lighter tint of their parts (outer ring). */
const PARENT_COLORS = { priced: "#b3dcc6", project: "#f3cd94", surcharges: "#d3dedb", margin: "#a6c7dd" };

type Key = "priced" | "verified" | "check" | "unpriced" | "surcharges" | ColumnKey;

const FILTERS: Partial<Record<Key, ItemsFilter>> = {
  verified: { status: "priced", component: null },
  check: { status: "check", component: null },
  unpriced: { status: "open", component: null },
};

/**
 * The offer as a ring: inside, what it is made of (priced positions, project
 * costs, surcharges, margin); outside, the parts of each. Verified and to-check
 * prices are the two halves of the priced positions' arc, the way the legend
 * groups them. Positions without a price have no amount, so they are listed,
 * never drawn. Hovering an arc or a row marks both; the priced rows open the
 * item list filtered.
 */
export function CostMix({
  columns,
  offer,
  scenarioLabel,
  counts,
  describe,
  onOpenItems,
}: {
  columns: Column[];
  offer: number;
  scenarioLabel: string;
  counts: { verified: number; check: number; open: number };
  describe: (key: ColumnKey) => string;
  onOpenItems: (filter: ItemsFilter) => void;
}) {
  const { t } = useI18n();
  const [active, setActive] = useState<string | null>(null);
  const column = (key: ColumnKey) => columns.find((entry) => entry.key === key);
  const amount = (key: ColumnKey) => column(key)?.amount ?? 0;
  const segment = (key: ColumnKey, status: "verified" | "check") =>
    column(key)?.segments?.find((entry) => entry.status === status)?.amount ?? 0;

  const verified = { material: segment("material", "verified"), labour: segment("labour", "verified") };
  const check = { material: segment("material", "check"), labour: segment("labour", "check") };
  const verifiedTotal = verified.material + verified.labour;
  const checkTotal = check.material + check.labour;
  const priced = verifiedTotal + checkTotal;
  const project = column("project") ? amount("project") : 0;
  const overhead = amount("overhead");
  const transport = amount("transport");
  const surcharges = overhead + transport;
  const margin = amount("margin");
  const share = (value: number) => (offer > 0 ? `${formatNumber((value / offer) * 100, 1)}%` : "—");

  const names: Record<string, string> = {
    priced: t("price.mix.priced"),
    verified: t("price.legend.verified"),
    check: t("price.legend.check"),
    unpriced: t("price.mix.unpriced"),
    project: t("price.col.project"),
    surcharges: t("price.mix.surcharges"),
    overhead: t("price.col.overhead"),
    transport: t("price.col.transport"),
    margin: t("price.col.margin"),
  };
  const values: Record<string, number> = {
    priced,
    verified: verifiedTotal,
    check: checkTotal,
    project,
    surcharges,
    overhead,
    transport,
    margin,
  };
  const arc = (key: string, value: number, color: string, extra: Partial<DonutSegment> = {}): DonutSegment => ({
    key,
    value,
    color,
    label: `${names[key]}: ${formatChf(value)}, ${share(value)}`,
    link: Boolean(FILTERS[key as Key]),
    ...extra,
  });

  const inner: DonutSegment[] = [
    arc("priced", priced, PARENT_COLORS.priced),
    arc("project", project, PARENT_COLORS.project),
    arc("surcharges", surcharges, PARENT_COLORS.surcharges),
    arc("margin-parent", margin, PARENT_COLORS.margin, { label: `${names.margin}: ${formatChf(margin)}` }),
  ];
  const outer: DonutSegment[] = [
    arc("verified", verifiedTotal, COLUMN_COLORS.material),
    arc("check", checkTotal, COLUMN_COLORS.material, { hatched: true }),
    arc("project", project, COLUMN_COLORS.project),
    arc("overhead", overhead, COLUMN_COLORS.overhead),
    arc("transport", transport, COLUMN_COLORS.transport),
    arc("margin", margin, COLUMN_COLORS.margin),
  ];
  // A parent lights up with its parts, and the parts with their parent.
  const family: Record<string, string[]> = {
    priced: ["priced", "verified", "check"],
    verified: ["verified", "priced"],
    check: ["check", "priced"],
    surcharges: ["surcharges", "overhead", "transport"],
    overhead: ["overhead", "surcharges"],
    transport: ["transport", "surcharges"],
    margin: ["margin", "margin-parent"],
    "margin-parent": ["margin", "margin-parent"],
    project: ["project"],
  };
  const lit = active ? family[active] ?? [active] : [];
  const focus = active === "margin-parent" ? "margin" : active;
  const open = (key: string) => {
    const filter = FILTERS[key as Key];
    if (filter) onOpenItems(filter);
  };
  const baseOf = (key: string | null): string | null => {
    switch (key) {
      case "verified":
      case "check":
      case "priced":
        return t("price.mix.pricedBase");
      case "surcharges":
        return `${describe("overhead")} ${describe("transport")}`;
      case "unpriced":
        return describe("unpriced");
      case "project":
      case "overhead":
      case "transport":
      case "margin":
        return describe(key);
      default:
        return null;
    }
  };

  const row = (
    key: string,
    swatch: CSSProperties | string,
    count: number | null,
    value: number | null,
    extra = "",
    note?: string,
  ) => {
    const filter = FILTERS[key as Key];
    const isLit = lit.includes(key);
    const content = (
      <>
        <span className={`mix__key ${typeof swatch === "string" ? swatch : ""}`} style={typeof swatch === "string" ? undefined : swatch} aria-hidden />
        <span className="mix__name">
          {names[key]}
          {note && <span className="mix__note">{note}</span>}
        </span>
        <span className="mix__count">{count != null ? t("price.items", { count }) : ""}</span>
        <span className="mix__num">{value != null ? formatChf(value) : t("price.mix.noEstimate")}</span>
        <span className="mix__share">{value != null ? share(value) : ""}</span>
      </>
    );
    const props = {
      className: `mix__row ${extra} ${isLit ? "is-lit" : ""} ${active && !isLit ? "is-dim" : ""}`,
      onMouseEnter: () => setActive(key),
      onMouseLeave: () => setActive(null),
      onFocus: () => setActive(key),
      onBlur: () => setActive(null),
    };
    return (
      <li key={key}>
        {filter ? (
          <button type="button" {...props} onClick={() => open(key)} title={t("price.clickToOpen")}>
            {content}
          </button>
        ) : (
          <div {...props}>{content}</div>
        )}
      </li>
    );
  };

  const centreValue = focus && focus in values ? values[focus] : null;
  const base = baseOf(focus);
  const split = (parts: { material: number; labour: number }) =>
    t("price.mix.split", { material: formatChf(parts.material), labour: formatChf(parts.labour) });

  return (
    <div className="mix">
      <div className="mix__chart">
        <Donut
          size={300}
          total={offer}
          rings={[
            { radius: 96, width: 30, segments: inner },
            { radius: 130, width: 22, segments: outer },
          ]}
          active={null}
          marked={lit}
          onActive={setActive}
          onSelect={open}
          label={t("price.mix.aria")}
        >
          {focus && centreValue != null ? (
            <>
              <span className="donut__sub">{names[focus]}</span>
              <span className="donut__pct">{share(centreValue)}</span>
              <span className="donut__amount">{formatChf(centreValue)}</span>
            </>
          ) : (
            <>
              <span className="donut__sub">
                {t("price.col.offer")} · {scenarioLabel}
              </span>
              <span className="donut__big">
                <AnimatedChf value={offer} />
              </span>
            </>
          )}
        </Donut>
        <p className={`mix__base ${base ? "is-on" : ""}`}>{base ?? t("price.mix.hint")}</p>
      </div>

      <div className="mix__legend">
        <div className={`mix__group ${lit.includes("priced") ? "is-lit" : ""}`}>
          <ul>
            {row("priced", { background: PARENT_COLORS.priced }, counts.verified + counts.check, priced, "mix__row--head")}
            {row("verified", "mix__key--solid", counts.verified, verifiedTotal, "mix__row--sub", split(verified))}
            {row("check", "mix__key--hatch", counts.check, checkTotal, "mix__row--sub", split(check))}
          </ul>
        </div>
        <ul className="mix__rest">
          {counts.open > 0 && row("unpriced", "mix__key--ghost", counts.open, null, "mix__row--ghost", t("price.mix.unpricedNote"))}
          {project > 0 && row("project", { background: COLUMN_COLORS.project }, null, project)}
          {row("surcharges", { background: PARENT_COLORS.surcharges }, null, surcharges, "mix__row--head")}
          {row("overhead", { background: COLUMN_COLORS.overhead }, null, overhead, "mix__row--sub")}
          {row("transport", { background: COLUMN_COLORS.transport }, null, transport, "mix__row--sub")}
          {row("margin", { background: COLUMN_COLORS.margin }, null, margin, "mix__row--head")}
        </ul>
        <p className="mix__total">
          <span>{t("price.col.offer")}</span>
          <strong>
            <AnimatedChf value={offer} />
          </strong>
        </p>
      </div>
    </div>
  );
}
