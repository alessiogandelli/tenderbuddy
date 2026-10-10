"""Token, cost and latency accounting for AI calls.

Kept small and dependency-free so it can be surfaced both in the eval report and
in the UI ("questa estrazione e' costata X $ in Y s").
"""
from __future__ import annotations

from dataclasses import dataclass, field
from statistics import median
from typing import List

# USD per 1M tokens: (input, output). The Decisions API bills input only.
MODEL_PRICES = {
    "gpt-6-luna": (0.10, 0.50),
    "gpt-6.1-sol": (2.00, 10.00),
    "gpt-6-astra": (10.00, 50.00),
    "text-embedding-3-large": (0.13, 0.0),
    "text-embedding-3-small": (0.02, 0.0),
}
# Unknown models are billed at the priciest known rate, so costs never read low.
_DEFAULT_PRICE = (10.00, 50.00)


@dataclass
class UsageLedger:
    calls: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    call_ms: List[float] = field(default_factory=list)
    errors: int = 0
    retries: int = 0
    escalation_calls: int = 0
    cost_usd: float = 0.0

    def record(
        self,
        model: str,
        input_tokens: int,
        output_tokens: int,
        ms: float,
        *,
        input_only: bool = False,
    ) -> None:
        self.calls += 1
        self.input_tokens += input_tokens or 0
        self.output_tokens += output_tokens or 0
        self.call_ms.append(ms)
        price_in, price_out = MODEL_PRICES.get(model, _DEFAULT_PRICE)
        self.cost_usd += (input_tokens or 0) / 1_000_000 * price_in
        if not input_only:
            self.cost_usd += (output_tokens or 0) / 1_000_000 * price_out

    @property
    def p50_ms(self) -> float:
        return float(median(self.call_ms)) if self.call_ms else 0.0

    @property
    def p95_ms(self) -> float:
        if not self.call_ms:
            return 0.0
        ordered = sorted(self.call_ms)
        return float(ordered[min(len(ordered) - 1, int(round(0.95 * (len(ordered) - 1))))])

    def as_dict(self) -> dict:
        return {
            "calls": self.calls,
            "p50_ms": round(self.p50_ms, 1),
            "p95_ms": round(self.p95_ms, 1),
            "errors": self.errors,
            "retries": self.retries,
            "escalation_calls": self.escalation_calls,
            "input_tokens": self.input_tokens,
            "output_tokens": self.output_tokens,
            "cost_usd": round(self.cost_usd, 4),
        }
