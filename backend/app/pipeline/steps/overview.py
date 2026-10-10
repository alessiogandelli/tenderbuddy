"""Step 2b - Overview: read the whole document, or infer it from the items.

The AI engine (Luna) reads every page and returns the panorama; the deterministic
fallback builds the same shape from what the parser already extracted, so the
overview exists even with the AI switched off.
"""
from __future__ import annotations

from typing import List, Optional

from ...domain.models import Item, Overview


def _ordered(values) -> List[str]:
    out: List[str] = []
    for value in values:
        text = str(value).strip()
        if text and text not in out:
            out.append(text)
    return out


def deterministic_overview(items: List[Item], db) -> Overview:
    systems: List[str] = []
    materials: List[str] = []
    labour: List[str] = []
    for item in items:
        if item.system:
            systems.append(item.system)
        category = item.attributes.get("category")
        if isinstance(category, str) and category:
            materials.append(category)
        if item.match is not None:
            product = db.product(item.match.product_id)
            if product is not None:
                for value in (product.category, product.subcategory):
                    if value:
                        materials.append(value)
            rule = db.rule(item.match.install_code) if item.match.install_code else None
            if rule is not None and rule.work_type:
                labour.append(rule.work_type)

    systems = _ordered(systems)
    materials = _ordered(materials)
    labour = _ordered(labour)
    parts = ["%d posizioni individuate" % len(items)]
    if systems:
        parts.append("%d sistemi" % len(systems))
    if materials:
        parts.append("materiali: " + ", ".join(materials[:8]))
    if labour:
        parts.append("manodopera: " + ", ".join(labour[:8]))
    return Overview(
        summary=". ".join(parts) + ".",
        systems=systems,
        materials_needed=materials,
        labour_needed=labour,
        engine="deterministic",
    )


def build_overview(
    document,
    items: List[Item],
    db,
    *,
    use_ai: bool,
    usage=None,
) -> Overview:
    """Luna's whole-document panorama, falling back to the deterministic one."""
    if use_ai:
        try:
            from ..ai.overview import document_overview

            data = document_overview(document, usage=usage)
            if data and (data.get("summary") or data.get("materials_needed")):
                return Overview(engine="luna", **data)
        except Exception:  # noqa: BLE001 - an overview must never fail the run
            pass
    return deterministic_overview(items, db)
