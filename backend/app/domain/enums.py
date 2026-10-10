"""Enumerations from the frozen contract (contract README section 5)."""
from __future__ import annotations

from enum import Enum


class StrEnum(str, Enum):
    """Python 3.8 friendly string enum."""

    def __str__(self) -> str:  # pragma: no cover - trivial
        return self.value


class Unit(StrEnum):
    PC = "pc"
    M = "m"
    M2 = "m2"
    H = "h"
    LS = "LS"
    SYSTEM = "system"


class ItemStatus(StrEnum):
    CALCULATED = "calculated"
    SUPPLIER_QUOTE_REQUIRED = "supplier_quote_required"
    ASSUMPTION_APPLIED = "assumption_applied"
    REVIEW_REQUIRED = "review_required"
    INSUFFICIENT_INFORMATION = "insufficient_information"
    OUT_OF_SCOPE = "out_of_scope"
    NON_PRICEABLE = "non_priceable"


class ItemFlag(StrEnum):
    MISSING_QUANTITY = "missing_quantity"
    MISSING_UNIT = "missing_unit"
    UNCLEAR_UNIT = "unclear_unit"
    NO_MATCH = "no_match"
    LOW_CONFIDENCE_MATCH = "low_confidence_match"
    MULTI_VARIANT_AMBIGUOUS = "multi_variant_ambiguous"
    MULTI_VARIANT_EXPANDED = "multi_variant_expanded"
    MISSING_DESCRIPTION = "missing_description"
    UNPARSED_ROW = "unparsed_row"
    OUT_OF_SCOPE = "out_of_scope"
    LANGUAGE_UNCERTAIN = "language_uncertain"


class PriceSource(StrEnum):
    CATALOG = "catalog"
    SUPPLIER_PACKAGE = "supplier_package"
    # A unit price typed by the estimator; it overrides the catalogue match.
    MANUAL = "manual"


class PipelineStep(StrEnum):
    READ = "read"
    CLASSIFY_PAGES = "classify_pages"
    PARSE = "parse"
    OVERVIEW = "overview"
    CLASSIFY = "classify"
    CANONICALIZE = "canonicalize"
    MATCH = "match"
    PRICE = "price"
    AGGREGATE = "aggregate"


class PipelineStatus(StrEnum):
    PENDING = "pending"
    RUNNING = "running"
    DONE = "done"
    FAILED = "failed"


class Classification(StrEnum):
    VENTILATION = "ventilation"
    HVAC = "hvac"
    PLUMBING = "plumbing"
    ELECTRICAL = "electrical"
    BUILDING = "building"
    OTHER = "other"


class PageType(StrEnum):
    """What kind of page a tender page is, decided before extraction.

    The categories mirror the ``docs/tenders`` analyses ("Document parts"), so
    classification stays useful beyond the LV. We only process ``lv_table`` — the
    six-column German form Pos. | Gegenstand | Mass-Gattg. | Mass-betrag |
    Einheits-Preis | Betrag Fr. ``lv_other`` is an LV-like page in another layout
    (NOVA schedules, CPN modulo offerta, supplementary rates). ``other`` is the
    catch-all when nothing else fits.
    """

    COVER = "cover"
    INDEX = "index"
    CAPTIONS = "captions"
    LEGAL = "legal"
    SPECIFICATIONS = "specifications"
    MODULO_OFFERTA = "modulo_offerta"
    PREZIARIO = "preziario"
    LV_TABLE = "lv_table"
    LV_OTHER = "lv_other"
    OTHER = "other"


# Ordered pipeline steps, used by the runner and the UI.
PIPELINE_ORDER = [
    PipelineStep.READ,
    PipelineStep.CLASSIFY_PAGES,
    PipelineStep.PARSE,
    PipelineStep.OVERVIEW,
    PipelineStep.CLASSIFY,
    PipelineStep.CANONICALIZE,
    PipelineStep.MATCH,
    PipelineStep.PRICE,
    PipelineStep.AGGREGATE,
]

# Unit strings found in the German source documents mapped to the contract unit.
UNIT_ALIASES = {
    "stk": Unit.PC,
    "st": Unit.PC,
    "stück": Unit.PC,
    "stueck": Unit.PC,
    "stk.": Unit.PC,
    "pc": Unit.PC,
    "pce": Unit.PC,
    "pcs": Unit.PC,
    "pz": Unit.PC,
    "m": Unit.M,
    "lfdm": Unit.M,
    "lfm": Unit.M,
    "ml": Unit.M,
    "m2": Unit.M2,
    "m²": Unit.M2,
    "mq": Unit.M2,
    "qm": Unit.M2,
    "h": Unit.H,
    "ore": Unit.H,
    "std": Unit.H,
    "ls": Unit.LS,
    "ac": Unit.LS,
    "a corpo": Unit.LS,
    "una tantum": Unit.LS,
    "forfait": Unit.LS,
    "pauschale": Unit.LS,
    "system": Unit.SYSTEM,
    "up": Unit.SYSTEM,
    "anlage": Unit.SYSTEM,
}


def normalize_unit(raw: str) -> Unit | None:
    if raw is None:
        return None
    return UNIT_ALIASES.get(raw.strip().lower())
