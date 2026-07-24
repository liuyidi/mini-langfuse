"""Model pricing table (USD per 1M tokens).

Kept as Python for zero-dep loading. Update prices as they change.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ModelPrice:
    match: str  # matched as prefix (e.g. "gpt-4o" matches "gpt-4o-2024-11")
    input_per_1m: float
    output_per_1m: float


# Order matters: more specific matches come first (e.g. gpt-4o-mini before gpt-4o).
PRICES: list[ModelPrice] = [
    # OpenAI
    ModelPrice("gpt-4o-mini", 0.15, 0.60),
    ModelPrice("gpt-4o", 2.50, 10.00),
    ModelPrice("gpt-4-turbo", 10.00, 30.00),
    ModelPrice("gpt-4", 30.00, 60.00),
    ModelPrice("gpt-3.5-turbo", 0.50, 1.50),
    ModelPrice("o1-preview", 15.00, 60.00),
    ModelPrice("o1-mini", 3.00, 12.00),
    # Anthropic Claude
    ModelPrice("claude-3-5-sonnet", 3.00, 15.00),
    ModelPrice("claude-3-5-haiku", 0.80, 4.00),
    ModelPrice("claude-3-opus", 15.00, 75.00),
    ModelPrice("claude-3-sonnet", 3.00, 15.00),
    ModelPrice("claude-3-haiku", 0.25, 1.25),
    ModelPrice("claude-opus-4", 15.00, 75.00),
    ModelPrice("claude-sonnet-4", 3.00, 15.00),
    # Google Gemini
    ModelPrice("gemini-1.5-pro", 1.25, 5.00),
    ModelPrice("gemini-1.5-flash", 0.075, 0.30),
    ModelPrice("gemini-2.0-flash", 0.10, 0.40),
]


def find_price(model: str | None) -> ModelPrice | None:
    if not model:
        return None
    m = model.lower()
    for p in PRICES:
        if m.startswith(p.match.lower()):
            return p
    return None


def compute_cost(
    model: str | None,
    prompt_tokens: int | None,
    completion_tokens: int | None,
) -> tuple[float | None, float | None, float | None]:
    """Return (input_cost, output_cost, total_cost) in USD, or (None, None, None)
    if we can't price this model."""
    price = find_price(model)
    if price is None:
        return None, None, None
    pt = prompt_tokens or 0
    ct = completion_tokens or 0
    in_cost = pt * price.input_per_1m / 1_000_000.0
    out_cost = ct * price.output_per_1m / 1_000_000.0
    return in_cost, out_cost, in_cost + out_cost
