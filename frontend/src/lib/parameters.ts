// How the Parameters page presents the pricing parameters: groups, units and
// steps. Values always come from the tender (`bando.parameters`); labels live in
// the i18n bundles under `params.fields.<id>` and `params.groups.<key>`.

export type ParamUnit = "factor" | "pct" | "chf" | "h" | "chfh" | "prob" | "pp";

export interface ParamField {
  id: string;
  path: string;
  unit: ParamUnit;
  step: number;
}

export interface ParamGroup {
  key: string;
  fields: ParamField[];
}

const f = (id: string, path: string, unit: ParamUnit, step: number): ParamField => ({
  id,
  path,
  unit,
  step,
});

// Only the parameters the price model actually uses are listed.
export const GROUPS: ParamGroup[] = [
  {
    key: "productivity",
    fields: [
      f("site_efficiency", "productivity_factors.site_efficiency", "factor", 0.01),
      f("mounting_height_school", "productivity_factors.mounting_height_school", "factor", 0.01),
      f("school_logistics", "productivity_factors.school_logistics", "factor", 0.01),
      f("timber_interface", "productivity_factors.timber_interface", "factor", 0.01),
    ],
  },
  {
    key: "allowances",
    fields: [
      f("material_waste", "allowances.material_waste_pct", "pct", 0.5),
      f("transport_equipment", "allowances.transport_equipment_pct", "pct", 0.5),
    ],
  },
  {
    key: "projectCosts",
    fields: [
      f("engineering_hours", "project_costs.engineering_hours", "h", 10),
      f("engineering_rate", "project_costs.engineering_rate_chf_per_h", "chfh", 5),
      f("commissioning_hours", "project_costs.commissioning_hours", "h", 10),
      f("commissioning_rate", "project_costs.commissioning_rate_chf_per_h", "chfh", 5),
      f("hygiene_inspection", "project_costs.hygiene_inspection_chf", "chf", 500),
      f("documentation", "project_costs.documentation_chf", "chf", 500),
    ],
  },
  {
    key: "commercial",
    fields: [
      f("overhead", "commercial.overhead_pct", "pct", 0.5),
      f("target_margin", "commercial.target_margin_pct", "pct", 0.5),
      f("round_to", "commercial.round_to_chf", "chf", 100),
    ],
  },
  {
    key: "bid",
    fields: [
      f("margin_aggressive", "stretch_bid_optimization.scenario_margins_pct.Aggressive", "pct", 0.5),
      f("margin_target", "stretch_bid_optimization.scenario_margins_pct.Target", "pct", 0.5),
      f(
        "margin_conservative",
        "stretch_bid_optimization.scenario_margins_pct.Conservative",
        "pct",
        0.5,
      ),
      f("reference_win", "stretch_bid_optimization.reference_win_probability", "prob", 0.01),
      f(
        "price_sensitivity",
        "stretch_bid_optimization.price_sensitivity_probability_points_per_1pct_price",
        "pp",
        0.01,
      ),
      f("appetite", "stretch_bid_optimization.strategic_appetite_adjustment", "pp", 0.01),
      f("competition", "stretch_bid_optimization.competition_adjustment", "pp", 0.01),
    ],
  },
];

export const ALL_FIELDS = GROUPS.flatMap((group) => group.fields);

export const INCLUDE_PROJECT_COSTS = "include_project_costs";

export function getPath(source: unknown, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>(
      (node, key) =>
        node && typeof node === "object" ? (node as Record<string, unknown>)[key] : undefined,
      source,
    );
}

export function getNumber(source: unknown, path: string): number | undefined {
  const value = getPath(source, path);
  return typeof value === "number" ? value : undefined;
}

/** `{a: {b: value}}` from `"a.b"`, the shape the PATCH endpoint deep-merges. */
export function patchFor(path: string, value: unknown): Record<string, unknown> {
  return path
    .split(".")
    .reverse()
    .reduce<unknown>((inner, key) => ({ [key]: inner }), value) as Record<string, unknown>;
}

/** Fields whose value differs from the dataset default. */
export function changedFields(params: unknown, defaults: unknown): string[] {
  if (!params || !defaults) return [];
  const changed = ALL_FIELDS.filter(
    (field) =>
      getNumber(params, field.path) !== undefined &&
      getNumber(params, field.path) !== getNumber(defaults, field.path),
  ).map((field) => field.path);
  if (Boolean(getPath(params, INCLUDE_PROJECT_COSTS)) !== Boolean(getPath(defaults, INCLUDE_PROJECT_COSTS))) {
    changed.push(INCLUDE_PROJECT_COSTS);
  }
  return changed;
}

export const UNIT_SUFFIX: Record<ParamUnit, string> = {
  factor: "×",
  pct: "%",
  chf: "CHF",
  h: "h",
  chfh: "CHF/h",
  prob: "",
  pp: "",
};

export function bounds(field: ParamField): { min: number; max: number } {
  switch (field.unit) {
    case "factor":
      return { min: 0.1, max: 5 };
    case "pct":
      return { min: 0, max: 99 };
    case "prob":
      return { min: 0, max: 1 };
    case "pp":
      return { min: -1, max: 1 };
    default:
      return { min: field.id === "round_to" ? 1 : 0, max: Number.MAX_SAFE_INTEGER };
  }
}

export function clamp(field: ParamField, value: number): number {
  const { min, max } = bounds(field);
  return Math.min(max, Math.max(min, value));
}

/** value ± step without floating-point noise, kept inside the bounds. */
export function stepValue(field: ParamField, value: number, direction: 1 | -1): number {
  const decimals = (String(field.step).split(".")[1] ?? "").length;
  return clamp(field, Number((value + direction * field.step).toFixed(Math.max(decimals, 2))));
}
