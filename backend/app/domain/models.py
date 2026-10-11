"""Pydantic models mirroring the frozen Bando JSON contract.

These types are the enforcement point for the contract: any response the API
serialises is built from them, so the frontend can rely on the shape.
"""
from __future__ import annotations

from typing import Dict, List, Optional

from pydantic import BaseModel, Field

from .enums import (
    Classification,
    ItemFlag,
    ItemStatus,
    PageType,
    PipelineStatus,
    PipelineStep,
    PriceSource,
    Unit,
)


class Match(BaseModel):
    product_id: str
    install_code: Optional[str] = None
    confidence: float = 0.0
    price_source: PriceSource


class Item(BaseModel):
    """One priceable unit extracted from a Bando, or created by hand."""

    lv_id: str = ""
    system: Optional[str] = None
    source_page: Optional[int] = None
    # Deprecated alias of name_bbox; kept so older readers keep working.
    source_bbox: Optional[List[float]] = None  # [x0, y0, x1, y1] in 0..1 page space
    # The two regions of an LV row: the item name cell and the price cell.
    name_bbox: Optional[List[float]] = None  # [x0, y0, x1, y1] in 0..1 page space
    price_bbox: Optional[List[float]] = None  # [x0, y0, x1, y1] in 0..1 page space

    description_raw: Optional[str] = None
    description_normalized: Optional[str] = None
    attributes: Dict[str, object] = Field(default_factory=dict)

    quantity: Optional[float] = None
    unit: Optional[Unit] = None

    match: Optional[Match] = None
    # Additive: an all-in direct unit cost typed by the estimator. When set it
    # prices the Item (as material, no waste, no labour) and wins over the match.
    manual_unit_price_chf: Optional[float] = None
    # Additive: the position's total as it will be printed in the offer (the
    # Betrag cell), typed by the estimator. Wins over every computed price and
    # does not move with the bid scenario.
    offer_price_chf: Optional[float] = None
    # Additive: the estimator confirmed this position's price; a price that
    # would otherwise need a check (uncertain match, supplier quote) counts as
    # final. Reset whenever the price changes.
    price_confirmed: bool = False

    status: ItemStatus = ItemStatus.REVIEW_REQUIRED
    flags: List[ItemFlag] = Field(default_factory=list)


class PositionResult(BaseModel):
    """A priced Item. Mirrors ``position_results[]`` in the golden example."""

    lv_id: str
    source_page: Optional[int] = None
    matched_product_id: Optional[str] = None
    install_code: Optional[str] = None
    quantity: Optional[float] = None
    unit: Optional[Unit] = None
    net_unit_cost_chf: Optional[float] = None
    material_cost_chf: Optional[float] = None
    adjusted_install_hours: Optional[float] = None
    labour_cost_chf: Optional[float] = None
    direct_position_cost_chf: Optional[float] = None
    price_source: Optional[PriceSource] = None
    match_confidence: Optional[float] = None
    review_required: bool = False
    status: ItemStatus
    # Additive: the terms of the labour calculation, so the quote explains itself.
    base_hours_per_unit: Optional[float] = None
    hourly_rate_chf: Optional[float] = None
    factor_product: Optional[float] = None
    # Additive: the selling price printed in the offer for this position, per
    # bid scenario (direct cost × overhead × transport / (1 − scenario margin)),
    # or the hand-typed offer price for every scenario. Empty when unpriced.
    offer_prices_chf: Dict[str, float] = Field(default_factory=dict)


class Summary(BaseModel):
    material_cost_chf: float = 0.0
    labour_cost_chf: float = 0.0
    direct_cost_chf: float = 0.0
    cost_baseline_chf: float = 0.0
    indicative_selling_price_chf: float = 0.0
    # Additive: project-level costs (engineering, commissioning, ...) and whether
    # they are folded into ``direct_cost_chf``. Off by default (golden subset).
    project_costs_chf: float = 0.0
    include_project_costs: bool = False
    # Additive: the steps from direct cost to price, so the UI can show them
    # without doing any math (baseline = direct + overhead + transport).
    overhead_chf: float = 0.0
    transport_equipment_chf: float = 0.0
    margin_chf: float = 0.0


class Overview(BaseModel):
    """Document-level reading of the whole tender, by Luna or a fallback.

    Feeds the user (a plain-language panorama) and the matcher (which materials
    and which labour the project actually needs).
    """

    summary: str = ""
    systems: List[str] = Field(default_factory=list)
    materials_needed: List[str] = Field(default_factory=list)
    labour_needed: List[str] = Field(default_factory=list)
    engine: str = "deterministic"


class BidScenario(BaseModel):
    scenario: str
    bid_price_chf: float
    margin_pct: float
    estimated_win_probability: float
    expected_contribution_chf: float


class BidRange(BaseModel):
    scenarios: List[BidScenario]
    selection_logic: str


class Coverage(BaseModel):
    calculated: int = 0
    supplier_quote_required: int = 0
    assumption_applied: int = 0
    review_required: int = 0
    insufficient_information: int = 0
    out_of_scope: int = 0
    non_priceable: int = 0


class PageClassification(BaseModel):
    """One page's detected type, decided before extraction (classify_pages)."""

    page: int
    type: PageType = PageType.OTHER
    confidence: float = 0.0
    reason: Optional[str] = None


class Detection(BaseModel):
    """One row the vision engine saw, kept or not.

    ``kept`` is false when the row carried nothing in the measure/price cells (so
    it is not an item). Discarded rows are still recorded so the UI can show
    every box the engine drew and the detection quality can be judged.
    """

    page: int
    description: Optional[str] = None
    quantity: Optional[float] = None
    unit: Optional[Unit] = None
    name_bbox: Optional[List[float]] = None
    price_bbox: Optional[List[float]] = None
    kept: bool = False
    reason: Optional[str] = None
    lv_id: Optional[str] = None  # set when kept, links to the Item


class FormField(BaseModel):
    """One fillable blank of the offer form (a dotted leader in the PDF)."""

    id: str  # "<section>.<row>.<column>", e.g. "conditions.rabatt.pct"
    page: int
    bbox: List[float]  # [x0, y0, x1, y1] in 0..1 page space: the leader
    baseline: float  # the leader's baseline, 0..1 of the page height
    section: str  # "summary" | "conditions"
    row: str  # chapter, ohne_npk, total | brutto, rabatt, zt1, skonto, ...
    column: str  # brutto, netto | eingabe, revidiert | pct
    kind: str  # "amount" | "percent"
    label: str = ""
    # Typed by the estimator; wins over the computed value.
    override: Optional[float] = None


class OfferForm(BaseModel):
    """The first page classified modulo_offerta and its fillable fields."""

    page: Optional[int] = None
    fields: List[FormField] = Field(default_factory=list)
    # Rates the client printed on the form (allg. Bauabzüge, MWST), in %.
    printed_rates: Dict[str, float] = Field(default_factory=dict)


class CoverField(BaseModel):
    """One fillable blank of the cover page (a dotted leader in the PDF).

    The cover carries text, not numbers: the bidder's identity and the offer
    total. Values are computed, never typed, so there is no override.
    """

    id: str  # "cover.<row>", e.g. "cover.name", "cover.eingabesumme"
    page: int
    bbox: List[float]  # [x0, y0, x1, y1] in 0..1 page space: the leader
    baseline: float  # the leader's baseline, 0..1 of the page height
    # name, strasse, plz_ort, telefon, fax, sachbearbeiter, ort_datum,
    # eingabesumme, unterschrift
    row: str
    label: str = ""


class OfferCover(BaseModel):
    """The cover page and its fillable fields (the bidder identification)."""

    page: Optional[int] = None
    fields: List[CoverField] = Field(default_factory=list)


class PipelineState(BaseModel):
    step: PipelineStep = PipelineStep.READ
    status: PipelineStatus = PipelineStatus.PENDING
    updated_at: Optional[str] = None
    error: Optional[str] = None
    # Additive: live progress for the UI's processing screen.
    item_count: int = 0
    message: Optional[str] = None
    # Additive: page-level progress. ``pages_read`` counts pages read and
    # classified; ``lv_pages_done`` counts LV-table pages whose rows were extracted.
    pages_total: int = 0
    pages_read: int = 0
    lv_pages_total: int = 0
    lv_pages_done: int = 0


class Profile(BaseModel):
    catalog_version: str = "catalog_extended.csv"
    productivity_version: str = "productivity_extended.csv"
    parameters_version: str = "project_parameters.json"


class BandoTotals(BaseModel):
    direct_cost_chf: float = 0.0
    indicative_price_chf: float = 0.0


class Bando(BaseModel):
    schema_version: str = "2.0"
    id: str
    title: Optional[str] = None
    description: Optional[str] = None
    classification: Classification = Classification.OTHER
    source_file: Optional[str] = None
    page_count: int = 0
    created_at: str
    updated_at: str

    pipeline: PipelineState = Field(default_factory=PipelineState)
    profile: Profile = Field(default_factory=Profile)
    coverage: Coverage = Field(default_factory=Coverage)
    # Additive: what type each page was classified as, before extraction.
    page_types: List[PageClassification] = Field(default_factory=list)
    # Additive: every row the vision engine saw (kept and discarded), for audit.
    detections: List[Detection] = Field(default_factory=list)

    items: List[Item] = Field(default_factory=list)
    position_results: List[PositionResult] = Field(default_factory=list)
    summary: Summary = Field(default_factory=Summary)
    recommended_bid_range: Optional[BidRange] = None
    # Additive: whole-document panorama from Luna (or the deterministic fallback).
    overview: Optional[Overview] = None
    # Additive: the pricing Parameters this Bando is priced with (a copy of
    # project_parameters.json, editable by the estimator).
    parameters: Optional[Dict[str, object]] = None
    # Additive: AI usage/cost/latency for this run (None when deterministic).
    usage: Optional[Dict[str, object]] = None
    # Additive: the fillable fields of the first offer-form page (None = not
    # looked for yet; an empty field list = no form found).
    offer_form: Optional[OfferForm] = None
    # Additive: the fillable fields of the cover page (None = not looked for
    # yet; an empty field list = no cover found).
    offer_cover: Optional[OfferCover] = None


class BandoSummary(BaseModel):
    """Compact Bando used by the archive listing."""

    schema_version: str = "2.0"
    id: str
    title: Optional[str] = None
    description: Optional[str] = None
    classification: Classification = Classification.OTHER
    source_file: Optional[str] = None
    page_count: int = 0
    created_at: str
    updated_at: str
    pipeline: PipelineState
    coverage: Coverage
    totals: BandoTotals


class Product(BaseModel):
    product_id: str
    category: Optional[str] = None
    subcategory: Optional[str] = None
    manufacturer: Optional[str] = None
    model: Optional[str] = None
    description: Optional[str] = None
    unit: Optional[str] = None
    list_price_chf: Optional[float] = None
    discount_pct: Optional[float] = None
    net_cost_chf: Optional[float] = None
    install_code: Optional[str] = None
    source_type: Optional[str] = None
    supplier_quote_required: bool = False


class ProductivityRule(BaseModel):
    install_code: str
    work_type: Optional[str] = None
    unit: Optional[str] = None
    base_hours_per_unit: float = 0.0
    labour_role: Optional[str] = None
    default_hourly_rate_chf: Optional[float] = None
    factor_keys: List[str] = Field(default_factory=list)
