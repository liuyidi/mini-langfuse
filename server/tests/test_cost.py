"""Tests for cost calculation."""
from app.services.cost import compute_cost, find_price


def test_find_price_prefix_match():
    p = find_price("gpt-4o-2024-11-preview")
    assert p is not None
    assert p.match == "gpt-4o"


def test_find_price_more_specific_first():
    """gpt-4o-mini must match before gpt-4o (order matters)."""
    p = find_price("gpt-4o-mini-2024-07-18")
    assert p is not None
    assert p.match == "gpt-4o-mini"


def test_find_price_unknown_returns_none():
    assert find_price("unknown-model-xyz") is None
    assert find_price(None) is None


def test_compute_cost_gpt4o_mini():
    in_c, out_c, tot = compute_cost("gpt-4o-mini", 1_000_000, 1_000_000)
    assert in_c == 0.15
    assert out_c == 0.60
    assert tot == 0.75


def test_compute_cost_no_model():
    assert compute_cost(None, 100, 100) == (None, None, None)


def test_compute_cost_case_insensitive():
    in_c, _, _ = compute_cost("GPT-4o", 1_000_000, 0)
    assert in_c == 2.50
