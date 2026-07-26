"""M-Eval: evaluator, evaluation_runs, evaluation_results tables

Revision ID: 004_eval_system
Revises: 003_dashboard_indexes
Create Date: 2026-07-26

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '004_eval_system'
down_revision: Union[str, None] = '003_dashboard_indexes'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Evaluators table
    op.create_table(
        'evaluators',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('project_id', sa.String(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('evaluator_type', sa.String(), nullable=False),
        sa.Column('config', sa.JSON(), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.text('1')),
        sa.Column('created_by', sa.String(), nullable=True),
        # No DB-side now(): SQLite rejects DEFAULT (now()). App sets timestamps in Python.
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id']),
    )
    op.create_index('ix_evaluators_project_id', 'evaluators', ['project_id'])

    # Evaluation runs table
    op.create_table(
        'evaluation_runs',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('project_id', sa.String(), nullable=False),
        sa.Column('evaluator_id', sa.String(), nullable=False),
        sa.Column('status', sa.String(), nullable=False, server_default='pending'),
        sa.Column('filters', sa.JSON(), nullable=True),
        sa.Column('total_traces', sa.Integer(), nullable=False, server_default=sa.text('0')),
        sa.Column('completed_traces', sa.Integer(), nullable=False, server_default=sa.text('0')),
        sa.Column('failed_traces', sa.Integer(), nullable=False, server_default=sa.text('0')),
        sa.Column('avg_score', sa.Float(), nullable=True),
        sa.Column('score_distribution', sa.JSON(), nullable=True),
        sa.Column('error_message', sa.String(), nullable=True),
        sa.Column('started_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_by', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id']),
        sa.ForeignKeyConstraint(['evaluator_id'], ['evaluators.id']),
    )
    op.create_index('ix_evaluation_runs_project_id', 'evaluation_runs', ['project_id'])
    op.create_index('ix_evaluation_runs_evaluator_id', 'evaluation_runs', ['evaluator_id'])

    # Evaluation results table
    op.create_table(
        'evaluation_results',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('run_id', sa.String(), nullable=False),
        sa.Column('trace_id', sa.String(), nullable=False),
        sa.Column('evaluator_id', sa.String(), nullable=False),
        sa.Column('score_value', sa.Float(), nullable=True),
        sa.Column('string_value', sa.String(), nullable=True),
        sa.Column('status', sa.String(), nullable=False, server_default='pending'),
        sa.Column('reasoning', sa.String(), nullable=True),
        sa.Column('raw_response', sa.JSON(), nullable=True),
        sa.Column('error_message', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['run_id'], ['evaluation_runs.id']),
        sa.ForeignKeyConstraint(['trace_id'], ['traces.id']),
        sa.ForeignKeyConstraint(['evaluator_id'], ['evaluators.id']),
    )
    op.create_index('ix_evaluation_results_run_id', 'evaluation_results', ['run_id'])
    op.create_index('ix_evaluation_results_trace_id', 'evaluation_results', ['trace_id'])
    op.create_index('ix_evaluation_results_evaluator_id', 'evaluation_results', ['evaluator_id'])


def downgrade() -> None:
    op.drop_table('evaluation_results')
    op.drop_table('evaluation_runs')
    op.drop_table('evaluators')
