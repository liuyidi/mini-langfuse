"""Database type definitions for cross-database compatibility."""
from sqlalchemy import JSON
from sqlalchemy.dialects.postgresql import JSONB

# Use JSONB for PostgreSQL (binary storage + GIN index support)
# Fall back to JSON for SQLite and other databases
JSONType = JSON().with_variant(JSONB(), "postgresql")
