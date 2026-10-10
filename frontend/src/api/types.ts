// TypeScript mirror of the frozen Bando contract (docs/contract/README.md).
// The backend is the source of truth; these types are this side of the seam.

export type Unit = "pc" | "m" | "m2" | "h" | "LS" | "system";

export type ItemStatus =
  | "calculated"
  | "supplier_quote_required"
  | "assumption_applied"
  | "review_required"
  | "insufficient_information"
  | "out_of_scope"
  | "non_priceable";

export type ItemFlag =
  | "missing_quantity"
  | "missing_unit"
  | "unclear_unit"
  | "no_match"
  | "low_confidence_match"
  | "multi_variant_ambiguous"
  | "multi_variant_expanded"
  | "missing_description"
  | "unparsed_row"
  | "out_of_scope"
  | "language_uncertain";

export type PriceSource = "catalog" | "supplier_package" | "manual";

export type PipelineStep =
  | "read"
  | "classify_pages"
  | "parse"
  | "overview"
  | "classify"
  | "canonicalize"
  | "match"
  | "price"
  | "aggregate";

export type PageType =
  | "cover"
  | "index"
  | "captions"
  | "legal"
  | "specifications"
  | "modulo_offerta"
  | "preziario"
  | "lv_table"
  | "lv_other"
  | "other";

export interface PageClassification {
  page: number;
  type: PageType;
  confidence: number;
  reason: string | null;
}

export interface Detection {
  page: number;
  description: string | null;
  quantity: number | null;
  unit: Unit | null;
  name_bbox: number[] | null;
  price_bbox: number[] | null;
  kept: boolean;
  reason: string | null;
  lv_id: string | null;
}

export type PipelineStatus = "pending" | "running" | "done" | "failed";

export type Classification =
  | "ventilation"
  | "hvac"
  | "plumbing"
  | "electrical"
  | "building"
  | "other";

export interface Match {
  product_id: string;
  install_code: string | null;
  confidence: number;
  price_source: PriceSource;
}

export interface Item {
  lv_id: string;
  system: string | null;
  source_page: number | null;
  source_bbox: number[] | null;
  name_bbox: number[] | null;
  price_bbox: number[] | null;
  description_raw: string | null;
  description_normalized: string | null;
  attributes: Record<string, unknown>;
  quantity: number | null;
  unit: Unit | null;
  match: Match | null;
  manual_unit_price_chf?: number | null;
  status: ItemStatus;
  flags: ItemFlag[];
}

export interface PositionResult {
  lv_id: string;
  source_page: number | null;
  matched_product_id: string | null;
  install_code: string | null;
  quantity: number | null;
  unit: Unit | null;
  net_unit_cost_chf: number | null;
  material_cost_chf: number | null;
  adjusted_install_hours: number | null;
  labour_cost_chf: number | null;
  direct_position_cost_chf: number | null;
  price_source: PriceSource | null;
  match_confidence: number | null;
  review_required: boolean;
  status: ItemStatus;
  base_hours_per_unit: number | null;
  hourly_rate_chf: number | null;
  factor_product: number | null;
}

export interface Summary {
  material_cost_chf: number;
  labour_cost_chf: number;
  direct_cost_chf: number;
  cost_baseline_chf: number;
  indicative_selling_price_chf: number;
  project_costs_chf: number;
  include_project_costs: boolean;
  overhead_chf?: number;
  transport_equipment_chf?: number;
  margin_chf?: number;
}

export interface BidScenario {
  scenario: string;
  bid_price_chf: number;
  margin_pct: number;
  estimated_win_probability: number;
  expected_contribution_chf: number;
}

export interface BidRange {
  scenarios: BidScenario[];
  selection_logic: string;
}

export interface Coverage {
  calculated: number;
  supplier_quote_required: number;
  assumption_applied: number;
  review_required: number;
  insufficient_information: number;
  out_of_scope: number;
  non_priceable: number;
}

export interface PipelineState {
  step: PipelineStep;
  status: PipelineStatus;
  updated_at: string | null;
  error: string | null;
  item_count: number;
  message: string | null;
  pages_total?: number;
  pages_read?: number;
  lv_pages_total?: number;
  lv_pages_done?: number;
}

export interface Usage {
  calls: number;
  p50_ms: number;
  p95_ms: number;
  errors: number;
  retries: number;
  escalation_calls: number;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
}

export interface Profile {
  catalog_version: string;
  productivity_version: string;
  parameters_version: string;
}

export interface Overview {
  summary: string;
  systems: string[];
  materials_needed: string[];
  labour_needed: string[];
  engine: "luna" | "deterministic" | string;
}

export interface ProjectParameters {
  project?: Record<string, unknown>;
  productivity_factors: Record<string, number>;
  allowances: Record<string, number>;
  project_costs: Record<string, number>;
  commercial: { overhead_pct: number; target_margin_pct: number; round_to_chf: number };
  stretch_bid_optimization: {
    scenario_margins_pct: Record<string, number>;
    [key: string]: unknown;
  };
  include_project_costs?: boolean;
}

export interface BandoTotals {
  direct_cost_chf: number;
  indicative_price_chf: number;
}

export interface Bando {
  schema_version: string;
  id: string;
  title: string | null;
  description: string | null;
  classification: Classification;
  source_file: string | null;
  page_count: number;
  created_at: string;
  updated_at: string;
  pipeline: PipelineState;
  profile: Profile;
  coverage: Coverage;
  page_types: PageClassification[];
  detections: Detection[];
  items: Item[];
  position_results: PositionResult[];
  summary: Summary;
  recommended_bid_range: BidRange | null;
  overview: Overview | null;
  parameters: ProjectParameters | null;
  usage: Usage | null;
}

export interface BandoSummary {
  schema_version: string;
  id: string;
  title: string | null;
  description: string | null;
  classification: Classification;
  source_file: string | null;
  page_count: number;
  created_at: string;
  updated_at: string;
  pipeline: PipelineState;
  coverage: Coverage;
  totals: BandoTotals;
}

export interface Product {
  product_id: string;
  category: string | null;
  subcategory: string | null;
  manufacturer: string | null;
  model: string | null;
  description: string | null;
  unit: string | null;
  list_price_chf: number | null;
  discount_pct: number | null;
  net_cost_chf: number | null;
  install_code: string | null;
  source_type: string | null;
  supplier_quote_required: boolean;
}

export interface ProductivityRule {
  install_code: string;
  work_type: string | null;
  unit: string | null;
  base_hours_per_unit: number;
  labour_role: string | null;
  default_hourly_rate_chf: number | null;
  factor_keys: string[];
}
