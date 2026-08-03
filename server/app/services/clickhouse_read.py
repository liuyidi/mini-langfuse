"""Compatibility wrapper for the new ClickHouse service package."""
from .clickhouse import ClickHouseReader, aggregate_metrics_from_rows, build_tree_from_rows

__all__ = [
    "ClickHouseReader",
    "aggregate_metrics_from_rows",
    "build_tree_from_rows",
]

