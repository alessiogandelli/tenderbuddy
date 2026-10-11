import { useState, type CSSProperties } from "react";
import {
  CHECK_COLORS,
  COLUMN_COLORS,
  type Column,
  type ColumnKey,
  type ItemsFilter,
} from "../lib/waterfall";
import { formatChf, formatNumber } from "../lib/format";
import { useI18n } from "../i18n";
import { AnimatedChf } from "./AnimatedChf";
import { Donut, type DonutSegment } from "./Donut";

type Split = "material" | "labour";
const SPLITS: Split[] = ["material", "labour"];

const FILTERS: Record<string, ItemsFilter> = {
  material: { status: null, component: "material" },
  "material-verified": { status: "priced", component: "material" },
  "material-check": { status: "check", component: "material" },
  labour: { status: null, component: "labour" },
  "labour-verified": { status: "priced", component: "labour" },
  "labour-check": { status: "check", component: "labour" },
  unpriced: { status: "open", component: null },
};

/**
 * The offer as a ring. Inside, one arc per class: material, labour, project
 * costs, overhead, transport, margin. Outside, only material and labour are
 * split, into verified (the class colour) and still to check (a lighter shade
 * of it), so both halves sit on their class. Positions without a price have no
 * amount: they are listed, never drawn. Hovering an arc or a row marks both;
 * material and labour rows open the item list filtered.
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
  const amount = (key: ColumnKey) => Math.max(column(key)?.amount ?? 0, 0);
  const segment = (key: Split, status: "verified" | "check") =>
    column(key)?.segments?.find((entry) => entry.status === status);
  const share = (value: number) => (offer > 0 ? `${formatNumber((value / offer) * 100, 1)}%` : "—");

  const classes = (["material", "labour", "project", "overhead", "transport", "margin"] as ColumnKey[]).filter(
    (key) => column(key) && amount(key) > 0,
  );
  const names: Record<string, string> = {};
  const values: Record<string, number> = {};
  for (const key of classes) {
    names[key] = t(`price.col.${key}`);
    values[key] = amount(key);
  }
  for (const key of SPLITS) {
    for (const status of ["verified", "check"] as const) {
      names[`${key}-${status}`] = `${t(`price.col.${key}`)} · ${t(`price.segment.${status}`)}`;
      values[`${key}-${status}`] = Math.max(segment(key, status)?.amount ?? 0, 0);
    }
  }
  names.unpriced = t("price.mix.unpriced");

  const arc = (key: string, color: string, extra: Partial<DonutSegment> = {}): DonutSegment => ({
    key,
    value: values[key] ?? 0,
    color,
    label: `${names[key]}: ${formatChf(values[key] ?? 0)}, ${share(values[key] ?? 0)}`,
    link: key in FILTERS,
    ...extra,
  });
  const inner = classes.map((key) => arc(key, COLUMN_COLORS[key]));
  const outer = classes.flatMap((key) =>
    key === "material" || key === "labour"
      ? [arc(`${key}-verified`, COLUMN_COLORS[key]), arc(`${key}-check`, CHECK_COLORS[key])]
      : [arc(key, COLUMN_COLORS[key], { key: `${key}-outer`, hidden: true })],
  );

  // A class lights up with its halves, and a half with its class.
  const classOf = (key: string) => key.split("-")[0];
  const lit = !active
    ? []
    : active.includes("-")
      ? [active, classOf(active)]
      : SPLITS.includes(active as Split)
        ? [active, `${active}-verified`, `${active}-check`]
        : [active];
  const open = (key: string) => {
    if (FILTERS[key]) onOpenItems(FILTERS[key]);
  };
  const base = active ? describe(classOf(active) as ColumnKey) : null;

  const row = (key: string, swatch: CSSProperties | string, count: number | null, extra = "", note?: string) => {
    const filter = FILTERS[key];
    const isLit = lit.includes(key);
    const value = key in values ? values[key] : null;
    const content = (
      <>
        <span
          className={`mix__key ${typeof swatch === "string" ? swatch : ""}`}
          style={typeof swatch === "string" ? undefined : swatch}
          aria-hidden
        />
        <span className="mix__name">
          {key.includes("-") ? t(`price.legend.${key.split("-")[1]}`) : names[key]}
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

  const focusValue = active && active in values ? values[active] : null;

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
          onActive={(key) => setActive(key && key.endsWith("-outer") ? key.slice(0, -6) : key)}
          onSelect={open}
          label={t("price.mix.aria")}
        >
          {active && focusValue != null ? (
            <>
              <span className="donut__sub">{names[active]}</span>
              <span className="donut__pct">{share(focusValue)}</span>
              <span className="donut__amount">{formatChf(focusValue)}</span>
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
        {SPLITS.filter((key) => classes.includes(key)).map((key) => (
          <div
            key={key}
            className={`mix__group ${lit.includes(key) ? "is-lit" : ""}`}
            style={{ "--c": COLUMN_COLORS[key] } as CSSProperties}
          >
            <ul>
              {row(key, { background: COLUMN_COLORS[key] }, column(key)?.count ?? null, "mix__row--head")}
              {row(`${key}-verified`, { background: COLUMN_COLORS[key] }, segment(key, "verified")?.count ?? 0, "mix__row--sub")}
              {row(`${key}-check`, { background: CHECK_COLORS[key] }, segment(key, "check")?.count ?? 0, "mix__row--sub")}
            </ul>
          </div>
        ))}
        <ul className="mix__rest">
          {counts.open > 0 && row("unpriced", "mix__key--ghost", counts.open, "mix__row--ghost", t("price.mix.unpricedNote"))}
          {classes
            .filter((key) => !SPLITS.includes(key as Split))
            .map((key) => row(key, { background: COLUMN_COLORS[key] }, null, "mix__row--head"))}
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
