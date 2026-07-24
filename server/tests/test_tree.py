"""Tests for the tree-building service."""
from datetime import datetime, timedelta, timezone

from app.services.tree import aggregate_metrics, build_tree


class _FakeObs:
    """A stand-in for the Observation ORM; only the attributes tree.py touches."""
    def __init__(self, id, parent_id, start, end=None, tokens=None, cost=None, obs_type="SPAN"):
        self.id = id
        self.trace_id = "t"
        self.parent_observation_id = parent_id
        self.type = obs_type
        self.name = id
        self.start_time = start
        self.end_time = end
        self.status = "OK"
        self.status_message = None
        self.level = "DEFAULT"
        self.input = None
        self.output = None
        self.metadata_ = None
        self.model = None
        self.model_parameters = None
        self.prompt_tokens = None
        self.completion_tokens = None
        self.total_tokens = tokens
        self.input_cost_usd = None
        self.output_cost_usd = None
        self.total_cost_usd = cost
        self.prompt_version_id = None


def _dt(seconds: int) -> datetime:
    return datetime(2026, 1, 1, tzinfo=timezone.utc) + timedelta(seconds=seconds)


def test_build_tree_nests_by_parent_id():
    root = _FakeObs("a", None, _dt(0))
    child = _FakeObs("b", "a", _dt(1))
    grand = _FakeObs("c", "b", _dt(2))
    other = _FakeObs("d", None, _dt(3))

    tree = build_tree([root, child, grand, other])
    assert [n["id"] for n in tree] == ["a", "d"]
    assert tree[0]["children"][0]["id"] == "b"
    assert tree[0]["children"][0]["children"][0]["id"] == "c"


def test_build_tree_sorts_children_by_start_time():
    root = _FakeObs("root", None, _dt(0))
    late = _FakeObs("late", "root", _dt(10))
    early = _FakeObs("early", "root", _dt(1))
    tree = build_tree([late, root, early])
    kids = [c["id"] for c in tree[0]["children"]]
    assert kids == ["early", "late"]


def test_aggregate_metrics_sums_tokens_and_cost():
    o1 = _FakeObs("a", None, _dt(0), end=_dt(1), tokens=100, cost=0.01)
    o2 = _FakeObs("b", None, _dt(2), end=_dt(4), tokens=200, cost=0.02)
    agg = aggregate_metrics(None, [o1, o2])
    assert agg["observation_count"] == 2
    assert agg["total_tokens"] == 300
    assert abs(agg["total_cost_usd"] - 0.03) < 1e-9
    assert agg["duration_ms"] == 4000  # max(end)-min(start) = 4s


def test_aggregate_metrics_empty():
    agg = aggregate_metrics(None, [])
    assert agg == {
        "duration_ms": None,
        "total_tokens": None,
        "total_cost_usd": None,
        "observation_count": 0,
    }
