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
    source_bbox: Optional[List[float]] = None  # [x0, y0, x1, y1] in 0..1 page space

    description_raw: Optional[str] = None
    description_normalized: Optional[str] = None
    attributes: Dict[str, object] = Field(default_factory=dict)

    quantity: Optional[float] = None
    unit: Optional[Unit] = None

    match: Optional[Match] = None

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


class Summary(BaseModel):
    material_cost_chf: float = 0.0
    labour_cost_chf: float = 0.0
    direct_cost_chf: float = 0.0
    cost_baseline_chf: float = 0.0
    indicative_selling_price_chf: float = 0.0


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


class PipelineState(BaseModel):
    step: PipelineStep = PipelineStep.READ
    status: PipelineStatus = PipelineStatus.PENDING
    updated_at: Optional[str] = None
    error: Optional[str] = None


class Profile(BaseModel):
    catalog_version: str = "catalog.csv"
    productivity_version: str = "productivity.csv"
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

    items: List[Item] = Field(default_factory=list)
    position_results: List[PositionResult] = Field(default_factory=list)
    summary: Summary = Field(default_factory=Summary)
    recommended_bid_range: Optional[BidRange] = None


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
