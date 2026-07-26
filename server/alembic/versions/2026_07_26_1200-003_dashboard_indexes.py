"""M11: dashboard indexes for aggregation performance

Revision ID: 003_dashboard_indexes
Revises: 002_m6_auth
Create Date: 2026-07-26

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = '003_dashboard_indexes'
down_revision: Union[str, None] = '002_m6_auth'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Composite index for dashboard aggregation queries
    # Used by: get_summary, get_timeseries, get_model_stats, get_latency_distribution, get_top_traces
    op.create_index(
        'idx_observations_type_model_start',
        'observations',
        ['type', 'model', 'start_time'],
    )

    # Index for trace-level aggregation by time range
    # Note: idx_traces_project_time already exists from M1, but we add a dedicated one
    # for the dashboard queries that group by trace
    op.create_index(
        'idx_traces_project_ts_id',
        'traces',
        ['project_id', 'timestamp', 'id'],
    )


def downgrade() -> None:
    op.drop_index('idx_traces_project_ts_id', table_name='traces')
    op.drop_index('idx_observations_type_model_start', table_name='observations')
