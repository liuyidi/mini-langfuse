"""initial schema

Revision ID: 001_initial
Revises:
Create Date: 2026-07-26

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '001_initial'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Projects table
    op.create_table(
        'projects',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )

    # Traces table
    op.create_table(
        'traces',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('project_id', sa.String(), nullable=False),
        sa.Column('name', sa.String(), nullable=True),
        sa.Column('user_id', sa.String(), nullable=True),
        sa.Column('session_id', sa.String(), nullable=True),
        sa.Column('input', sa.JSON(), nullable=True),
        sa.Column('output', sa.JSON(), nullable=True),
        sa.Column('metadata', sa.JSON(), nullable=True),
        sa.Column('tags', sa.JSON(), nullable=True),
        sa.Column('release', sa.String(), nullable=True),
        sa.Column('version', sa.String(), nullable=True),
        sa.Column('timestamp', sa.DateTime(timezone=True), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_traces_project_id', 'traces', ['project_id'])
    op.create_index('ix_traces_user_id', 'traces', ['user_id'])
    op.create_index('ix_traces_session_id', 'traces', ['session_id'])
    op.create_index('idx_traces_project_time', 'traces', ['project_id', sa.text('timestamp DESC')])

    # Observations table
    op.create_table(
        'observations',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('trace_id', sa.String(), nullable=False),
        sa.Column('parent_observation_id', sa.String(), nullable=True),
        sa.Column('type', sa.String(), nullable=False),
        sa.Column('name', sa.String(), nullable=True),
        sa.Column('start_time', sa.DateTime(timezone=True), nullable=False),
        sa.Column('end_time', sa.DateTime(timezone=True), nullable=True),
        sa.Column('status', sa.String(), nullable=True, server_default='OK'),
        sa.Column('status_message', sa.String(), nullable=True),
        sa.Column('level', sa.String(), nullable=True, server_default='DEFAULT'),
        sa.Column('input', sa.JSON(), nullable=True),
        sa.Column('output', sa.JSON(), nullable=True),
        sa.Column('metadata', sa.JSON(), nullable=True),
        sa.Column('model', sa.String(), nullable=True),
        sa.Column('model_parameters', sa.JSON(), nullable=True),
        sa.Column('prompt_tokens', sa.Integer(), nullable=True),
        sa.Column('completion_tokens', sa.Integer(), nullable=True),
        sa.Column('total_tokens', sa.Integer(), nullable=True),
        sa.Column('input_cost_usd', sa.Float(), nullable=True),
        sa.Column('output_cost_usd', sa.Float(), nullable=True),
        sa.Column('total_cost_usd', sa.Float(), nullable=True),
        sa.Column('prompt_version_id', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['trace_id'], ['traces.id']),
        sa.ForeignKeyConstraint(['parent_observation_id'], ['observations.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_observations_trace_id', 'observations', ['trace_id'])
    op.create_index('ix_observations_parent_observation_id', 'observations', ['parent_observation_id'])
    op.create_index('ix_observations_prompt_version_id', 'observations', ['prompt_version_id'])
    op.create_index('idx_obs_trace_start', 'observations', ['trace_id', 'start_time'])

    # Prompts table
    op.create_table(
        'prompts',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('project_id', sa.String(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('project_id', 'name', name='uq_prompts_project_name'),
    )
    op.create_index('ix_prompts_project_id', 'prompts', ['project_id'])

    # Prompt versions table
    op.create_table(
        'prompt_versions',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('prompt_id', sa.String(), nullable=False),
        sa.Column('version', sa.Integer(), nullable=False),
        sa.Column('type', sa.String(), nullable=False),
        sa.Column('content', sa.JSON(), nullable=False),
        sa.Column('config', sa.JSON(), nullable=True),
        sa.Column('labels', sa.JSON(), nullable=True),
        sa.Column('commit_msg', sa.String(), nullable=True),
        sa.Column('created_by', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['prompt_id'], ['prompts.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('prompt_id', 'version', name='uq_prompt_versions'),
    )
    op.create_index('ix_prompt_versions_prompt_id', 'prompt_versions', ['prompt_id'])

    # Scores table
    op.create_table(
        'scores',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('project_id', sa.String(), nullable=False),
        sa.Column('trace_id', sa.String(), nullable=False),
        sa.Column('observation_id', sa.String(), nullable=True),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('data_type', sa.String(), nullable=False),
        sa.Column('value', sa.Float(), nullable=True),
        sa.Column('string_value', sa.String(), nullable=True),
        sa.Column('source', sa.String(), nullable=False),
        sa.Column('comment', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['trace_id'], ['traces.id']),
        sa.ForeignKeyConstraint(['observation_id'], ['observations.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_scores_project_id', 'scores', ['project_id'])
    op.create_index('ix_scores_trace_id', 'scores', ['trace_id'])
    op.create_index('idx_scores_project', 'scores', ['project_id', sa.text('created_at DESC')])


def downgrade() -> None:
    op.drop_table('scores')
    op.drop_table('prompt_versions')
    op.drop_table('prompts')
    op.drop_table('observations')
    op.drop_table('traces')
    op.drop_table('projects')
