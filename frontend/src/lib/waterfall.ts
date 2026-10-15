// The cost → offer waterfall, as data. Every amount comes from the backend:
// the summary (material, labour, project costs, direct cost, overhead,
// transport, cost baseline), the chosen bid scenario (the offer, rounded up)
// and the per-position results. The only arithmetic here is the margin of the
// chosen offer (offer − cost baseline) and the shares shown in tooltips.
import type { Bando, Item, PositionResult, Summary } from "../api/types";
import { itemName } from "./items";
import type { ItemState } from "./flags";

export type ColumnKey =
  | "material"
  | "labour"
  | "unpriced"
  | "project"
  | "direct"
  | "overhead"
  | "transport"
  | "baseline"
  | "margin"
  | "offer";

/** Verified (priced, confirmed or by hand) vs still to check. */
export type SegmentStatus = "verified" | "check";

export interface Segment {
  status: SegmentStatus;
  amount: number;
  count: number;
}

export interface TopItem {
  lvId: string;
  name: string;
  amount: number | null;
}

export interface Column {
  key: ColumnKey;
  /** Totals stand on the axis; steps float from `from` to `to`; the ghost has no height. */
  kind: "step" | "total" | "ghost";
  from: number;
  to: number;
  amount: number | null;
  segments?: Segment[];
  /** Items behind the column and the verified share of their amount (0..1). */
  count: number;
  verifiedShare: number | null;
  top: TopItem[];
}

const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);

export function buildWaterfall(
  bando: Bando,
  states: Map<string, ItemState>,
  results: Map<string, PositionResult>,
  offer: number,
): Column[] {
  const summary = bando.summary;
  const priced = bando.items.filter((item) => (states.get(item.lv_id) ?? "open") !== "open");
  const unpriced = bando.items.filter((item) => (states.get(item.lv_id) ?? "open") === "open");
  const isCheck = (item: Item) => states.get(item.lv_id) === "check";

  const part = (item: Item, field: "material_cost_chf" | "labour_cost_chf" | "direct_position_cost_chf") =>
    results.get(item.lv_id)?.[field] ?? 0;

  const top = (field: "material_cost_chf" | "labour_cost_chf" | "direct_position_cost_chf"): TopItem[] =>
    [...priced]
      .filter((item) => part(item, field) > 0)
      .sort((a, b) => part(b, field) - part(a, field))
      .slice(0, 3)
      .map((item) => ({ lvId: item.lv_id, name: itemName(item) ?? item.lv_id, amount: part(item, field) }));

  const segmentsOf = (field: "material_cost_chf" | "labour_cost_chf"): Segment[] => {
    const carrying = priced.filter((item) => part(item, field) > 0);
    const verified = carrying.filter((item) => !isCheck(item));
    const check = carrying.filter(isCheck);
    return [
      { status: "verified", amount: sum(verified.map((item) => part(item, field))), count: verified.length },
      { status: "check", amount: sum(check.map((item) => part(item, field))), count: check.length },
    ];
  };

  const material = segmentsOf("material_cost_chf");
  const labour = segmentsOf("labour_cost_chf");
  const shareOf = (segments: Segment[]) => {
    const total = sum(segments.map((segment) => segment.amount));
    return total > 0 ? segments[0].amount / total : null;
  };
  // Every step after the direct cost is spread over the priced positions, so
  // its verified share is the direct cost's.
  const directShare = shareOf([
    { status: "verified", amount: material[0].amount + labour[0].amount, count: 0 },
    { status: "check", amount: material[1].amount + labour[1].amount, count: 0 },
  ]);
  const topDirect = top("direct_position_cost_chf");

  const columns: Column[] = [];
  let level = 0;
  const step = (key: ColumnKey, amount: number, extra: Partial<Column> = {}) => {
    columns.push({
      key,
      kind: "step",
      from: level,
      to: level + amount,
      amount,
      count: priced.length,
      verifiedShare: directShare,
      top: topDirect,
      ...extra,
    });
    level += amount;
  };
  const total = (key: ColumnKey, amount: number, extra: Partial<Column> = {}) => {
    columns.push({
      key,
      kind: "total",
      from: 0,
      to: amount,
      amount,
      count: priced.length,
      verifiedShare: directShare,
      top: topDirect,
      ...extra,
    });
    level = amount;
  };

  step("material", summary.material_cost_chf, {
    segments: material,
    count: material[0].count + material[1].count,
    verifiedShare: shareOf(material),
    top: top("material_cost_chf"),
  });
  step("labour", summary.labour_cost_chf, {
    segments: labour,
    count: labour[0].count + labour[1].count,
    verifiedShare: shareOf(labour),
    top: top("labour_cost_chf"),
  });
  // No estimate exists for positions without a price: shown, never added.
  columns.push({
    key: "unpriced",
    kind: "ghost",
    from: level,
    to: level,
    amount: null,
    count: unpriced.length,
    verifiedShare: null,
    top: unpriced.slice(0, 3).map((item) => ({ lvId: item.lv_id, name: itemName(item) ?? item.lv_id, amount: null })),
  });
  if (summary.include_project_costs && summary.project_costs_chf > 0) {
    step("project", summary.project_costs_chf, { count: 0, verifiedShare: null, top: [] });
  }
  total("direct", summary.direct_cost_chf);
  step("overhead", summary.overhead_chf ?? 0);
  step("transport", summary.transport_equipment_chf ?? 0);
  total("baseline", summary.cost_baseline_chf);
  step("margin", offer - summary.cost_baseline_chf);
  total("offer", offer);
  return columns;
}

export type PartKey = "material" | "labour" | "project" | "overhead" | "transport" | "margin";

/**
 * The offer split into what it is made of, as the backend's summary gives it;
 * the margin is what the offer adds to the cost baseline. The parts add up to
 * the offer. Project costs appear only when they are in the price.
 */
export function priceParts(summary: Summary, offer: number): { key: PartKey; amount: number }[] {
  const parts: { key: PartKey; amount: number }[] = [
    { key: "material", amount: summary.material_cost_chf },
    { key: "labour", amount: summary.labour_cost_chf },
  ];
  if (summary.include_project_costs && summary.project_costs_chf > 0) {
    parts.push({ key: "project", amount: summary.project_costs_chf });
  }
  parts.push(
    { key: "overhead", amount: summary.overhead_chf ?? 0 },
    { key: "transport", amount: summary.transport_equipment_chf ?? 0 },
    { key: "margin", amount: offer - summary.cost_baseline_chf },
  );
  return parts;
}

/**
 * One colour per part of the price. Material and labour also have a lighter
 * shade of their own colour for the share still to check, so both halves read
 * as one class.
 */
export const COLUMN_COLORS: Record<ColumnKey, string> = {
  material: "#1b7350",
  labour: "#1a6b9f",
  unpriced: "#af2a20",
  project: "#e89a2c",
  direct: "#4f6875",
  overhead: "#6f8794",
  transport: "#a9bcc4",
  baseline: "#4f6875",
  margin: "#002439",
  offer: "#002439",
};
export const CHECK_COLORS: Record<"material" | "labour", string> = {
  material: "#86c0a3",
  labour: "#8dbcde",
};

/** Where clicking a part of a price chart leads in the item list. */
export interface ItemsFilter {
  status: "priced" | "check" | "open" | null;
  component: "material" | "labour" | null;
}
