"""M6: users, organizations, memberships, api_keys, sessions_web

Revision ID: 002_m6_auth
Revises: 001_initial
Create Date: 2026-07-26

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '002_m6_auth'
down_revision: Union[str, None] = '001_initial'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Users table
    op.create_table(
        'users',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('email', sa.String(), nullable=False),
        sa.Column('password_hash', sa.String(), nullable=True),  # nullable for SSO
        sa.Column('name', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('email'),
    )
    op.create_index('ix_users_email', 'users', ['email'])

    # Organizations table
    op.create_table(
        'organizations',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )

    # Memberships table (user-org relationship)
    op.create_table(
        'memberships',
        sa.Column('user_id', sa.String(), nullable=False),
        sa.Column('org_id', sa.String(), nullable=False),
        sa.Column('role', sa.String(), nullable=False),  # OWNER, ADMIN, MEMBER, VIEWER
        sa.PrimaryKeyConstraint('user_id', 'org_id'),
    )

    # API Keys table
    op.create_table(
        'api_keys',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('project_id', sa.String(), nullable=False),
        sa.Column('public_key', sa.String(), nullable=False),
        sa.Column('secret_hash', sa.String(), nullable=False),
        sa.Column('note', sa.String(), nullable=True),
        sa.Column('last_used_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_by', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id']),
        sa.UniqueConstraint('public_key'),
    )
    op.create_index('ix_api_keys_project_id', 'api_keys', ['project_id'])
    op.create_index('ix_api_keys_public_key', 'api_keys', ['public_key'])

    # Web sessions table (browser cookies)
    op.create_table(
        'sessions_web',
        sa.Column('token', sa.String(), nullable=False),
        sa.Column('user_id', sa.String(), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('token'),
    )
    op.create_index('ix_sessions_web_user_id', 'sessions_web', ['user_id'])

    # Add org_id to projects table (SQLite needs batch mode for FK constraints)
    with op.batch_alter_table('projects') as batch_op:
        batch_op.add_column(sa.Column('org_id', sa.String(), nullable=True))
        batch_op.create_index('ix_projects_org_id', ['org_id'])
        batch_op.create_foreign_key('fk_projects_org_id', 'organizations', ['org_id'], ['id'])


def downgrade() -> None:
    # Remove org_id from projects
    op.drop_constraint('fk_projects_org_id', 'projects', type_='foreignkey')
    op.drop_index('ix_projects_org_id', table_name='projects')
    op.drop_column('projects', 'org_id')

    # Drop tables
    op.drop_table('sessions_web')
    op.drop_table('api_keys')
    op.drop_table('memberships')
    op.drop_table('organizations')
    op.drop_table('users')
