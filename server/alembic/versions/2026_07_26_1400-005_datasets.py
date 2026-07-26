"""M19: datasets, dataset_items, dataset_runs, dataset_run_items tables

Revision ID: 005_datasets
Revises: 004_eval_system
Create Date: 2026-07-26

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '005_datasets'
down_revision: Union[str, None] = '004_eval_system'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Datasets table
    op.create_table(
        'datasets',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('project_id', sa.String(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('description', sa.String(), nullable=True),
        sa.Column('created_by', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id']),
    )
    op.create_index('ix_datasets_project_id', 'datasets', ['project_id'])

    # Dataset items table
    op.create_table(
        'dataset_items',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('dataset_id', sa.String(), nullable=False),
        sa.Column('input', sa.JSON(), nullable=True),
        sa.Column('expected_output', sa.JSON(), nullable=True),
        sa.Column('metadata', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['dataset_id'], ['datasets.id'], ondelete='CASCADE'),
    )
    op.create_index('ix_dataset_items_dataset_id', 'dataset_items', ['dataset_id'])

    # Dataset runs table
    op.create_table(
        'dataset_runs',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('project_id', sa.String(), nullable=False),
        sa.Column('dataset_id', sa.String(), nullable=False),
        sa.Column('name', sa.String(), nullable=True),
        sa.Column('description', sa.String(), nullable=True),
        sa.Column('evaluator_id', sa.String(), nullable=True),
        sa.Column('prompt_version_id', sa.String(), nullable=True),
        sa.Column('config', sa.JSON(), nullable=True),
        sa.Column('status', sa.String(), nullable=False, server_default='pending'),
        sa.Column('total_items', sa.Integer(), nullable=False, server_default=sa.text('0')),
        sa.Column('completed_items', sa.Integer(), nullable=False, server_default=sa.text('0')),
        sa.Column('failed_items', sa.Integer(), nullable=False, server_default=sa.text('0')),
        sa.Column('avg_score', sa.Float(), nullable=True),
        sa.Column('error_message', sa.String(), nullable=True),
        sa.Column('created_by', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id']),
        sa.ForeignKeyConstraint(['dataset_id'], ['datasets.id'], ondelete='CASCADE'),
    )
    op.create_index('ix_dataset_runs_project_id', 'dataset_runs', ['project_id'])
    op.create_index('ix_dataset_runs_dataset_id', 'dataset_runs', ['dataset_id'])

    # Dataset run items table
    op.create_table(
        'dataset_run_items',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('run_id', sa.String(), nullable=False),
        sa.Column('item_id', sa.String(), nullable=False),
        sa.Column('output', sa.JSON(), nullable=True),
        sa.Column('score_value', sa.Float(), nullable=True),
        sa.Column('score_reasoning', sa.String(), nullable=True),
        sa.Column('trace_id', sa.String(), nullable=True),
        sa.Column('status', sa.String(), nullable=False, server_default='pending'),
        sa.Column('error_message', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['run_id'], ['dataset_runs.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['item_id'], ['dataset_items.id'], ondelete='CASCADE'),
    )
    op.create_index('ix_dataset_run_items_run_id', 'dataset_run_items', ['run_id'])
    op.create_index('ix_dataset_run_items_item_id', 'dataset_run_items', ['item_id'])


def downgrade() -> None:
    op.drop_table('dataset_run_items')
    op.drop_table('dataset_runs')
    op.drop_table('dataset_items')
    op.drop_table('datasets')
