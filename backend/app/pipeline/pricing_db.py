"""Loads the curated pricing dataset: Catalogo, Regole di produttività, Parametri."""
from __future__ import annotations

import json
from functools import lru_cache
from typing import Dict, List

import pandas as pd

from ..config import DATA_DIR
from ..domain.models import Product, ProductivityRule

CATALOG_FILE = "catalog_extended.csv"
PRODUCTIVITY_FILE = "productivity.csv"
PARAMETERS_FILE = "project_parameters.json"


def _to_bool(value: object) -> bool:
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in {"true", "1", "yes"}


class PricingDB:
    """In-memory view over the pricing dataset, loaded once."""

    def __init__(self, data_dir=DATA_DIR):
        self.data_dir = data_dir
        self.products: Dict[str, Product] = {}
        self.product_list: List[Product] = []
        self.rules: Dict[str, ProductivityRule] = {}
        self.parameters: dict = {}
        self._load()

    def _load(self) -> None:
        catalog = pd.read_csv(self.data_dir / CATALOG_FILE)
        for row in catalog.to_dict(orient="records"):
            product = Product(
                product_id=str(row["product_id"]),
                category=row.get("category"),
                subcategory=row.get("subcategory"),
                manufacturer=row.get("manufacturer"),
                model=row.get("model"),
                description=row.get("description"),
                unit=row.get("unit"),
                list_price_chf=_opt_float(row.get("list_price_chf")),
                discount_pct=_opt_float(row.get("discount_pct")),
                net_cost_chf=_opt_float(row.get("net_cost_chf")),
                install_code=row.get("install_code"),
                source_type=row.get("source_type"),
                supplier_quote_required=_to_bool(row.get("supplier_quote_required")),
            )
            self.products[product.product_id] = product
            self.product_list.append(product)

        productivity = pd.read_csv(self.data_dir / PRODUCTIVITY_FILE)
        for row in productivity.to_dict(orient="records"):
            keys = [
                k.strip()
                for k in str(row.get("factor_keys") or "").split("|")
                if k.strip()
            ]
            rule = ProductivityRule(
                install_code=str(row["install_code"]),
                work_type=row.get("work_type"),
                unit=row.get("unit"),
                base_hours_per_unit=float(row.get("base_hours_per_unit") or 0.0),
                labour_role=row.get("labour_role"),
                default_hourly_rate_chf=_opt_float(row.get("default_hourly_rate_chf")),
                factor_keys=keys,
            )
            self.rules[rule.install_code] = rule

        with open(self.data_dir / PARAMETERS_FILE, encoding="utf-8") as fh:
            self.parameters = json.load(fh)

    # --- convenience accessors -------------------------------------------
    def product(self, product_id: str) -> Product | None:
        return self.products.get(product_id)

    def rule(self, install_code: str) -> ProductivityRule | None:
        return self.rules.get(install_code)

    def with_parameters(self, parameters: dict) -> "PricingDB":
        """A view of this dataset priced with a Bando's own Parameters."""
        clone = PricingDB.__new__(PricingDB)
        clone.data_dir = self.data_dir
        clone.products = self.products
        clone.product_list = self.product_list
        clone.rules = self.rules
        clone.parameters = parameters
        return clone

    @property
    def waste_pct(self) -> float:
        return float(self.parameters["allowances"]["material_waste_pct"])

    @property
    def overhead_pct(self) -> float:
        return float(self.parameters["commercial"]["overhead_pct"])

    @property
    def transport_pct(self) -> float:
        return float(self.parameters["allowances"]["transport_equipment_pct"])

    @property
    def target_margin_pct(self) -> float:
        return float(self.parameters["commercial"]["target_margin_pct"])

    @property
    def round_to_chf(self) -> int:
        return int(self.parameters["commercial"]["round_to_chf"])

    @property
    def include_project_costs(self) -> bool:
        return bool(self.parameters.get("include_project_costs", False))

    @property
    def factors(self) -> dict:
        return self.parameters["productivity_factors"]

    def project_costs_chf(self) -> float:
        """Engineering + commissioning (hours x rate) + inspection + documentation."""
        costs = self.parameters.get("project_costs", {})
        engineering = float(costs.get("engineering_hours", 0)) * float(
            costs.get("engineering_rate_chf_per_h", 0)
        )
        commissioning = float(costs.get("commissioning_hours", 0)) * float(
            costs.get("commissioning_rate_chf_per_h", 0)
        )
        return (
            engineering
            + commissioning
            + float(costs.get("hygiene_inspection_chf", 0))
            + float(costs.get("documentation_chf", 0))
        )


def _opt_float(value):
    if value is None:
        return None
    try:
        if value != value:  # NaN
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


@lru_cache(maxsize=1)
def get_pricing_db() -> PricingDB:
    return PricingDB()
