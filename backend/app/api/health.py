"""Health endpoint: proves the backend is up and pins the contract version."""
from __future__ import annotations

from fastapi import APIRouter

router = APIRouter(prefix="/api", tags=["health"])

CONTRACT_VERSION = "2.0"


@router.get("/health")
def health() -> dict:
    return {"status": "ok", "contract_version": CONTRACT_VERSION}
