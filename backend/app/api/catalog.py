"""Catalogo, Regole di produttività and Parametri di progetto endpoints."""
from __future__ import annotations

from fastapi import APIRouter

from ..pipeline.pricing_db import get_pricing_db

router = APIRouter(prefix="/api", tags=["dataset"])


@router.get("/catalog")
def catalog() -> list:
    db = get_pricing_db()
    return [p.model_dump(mode="json") for p in db.product_list]


@router.get("/productivity")
def productivity() -> list:
    db = get_pricing_db()
    return [r.model_dump(mode="json") for r in db.rules.values()]


@router.get("/parameters")
def parameters() -> dict:
    return get_pricing_db().parameters
