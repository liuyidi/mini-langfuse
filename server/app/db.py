"""SQLAlchemy engine + session + base."""
from __future__ import annotations

from collections.abc import Iterator
from typing import Any

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from sqlalchemy.pool import QueuePool

from .config import settings

# check_same_thread only matters for SQLite; harmless for others
_connect_args = {"check_same_thread": False} if settings.database_url.startswith("sqlite") else {}

_engine_kwargs: dict[str, Any] = {
    "connect_args": _connect_args,
    "future": True,
}
# Postgres (demo ECS): keep pool small but observable; pre_ping drops dead conns.
if not settings.database_url.startswith("sqlite"):
    _engine_kwargs.update(
        {
            "pool_pre_ping": True,
            "pool_size": 5,
            "max_overflow": 10,
            "pool_timeout": 30,
        }
    )

engine = create_engine(settings.database_url, **_engine_kwargs)

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


class Base(DeclarativeBase):
    pass


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        # Ensure no "idle in transaction" if a route forgot to commit/rollback.
        db.rollback()
        db.close()


def pool_status() -> dict[str, Any]:
    """Snapshot of SQLAlchemy pool usage for /health monitoring."""
    pool = engine.pool
    if not isinstance(pool, QueuePool):
        return {"type": type(pool).__name__}
    checked_out = pool.checkedout()
    size = pool.size()
    overflow = pool.overflow()
    max_conn = size + int(getattr(pool, "_max_overflow", 0))
    return {
        "type": "QueuePool",
        "size": size,
        "checked_in": pool.checkedin(),
        "checked_out": checked_out,
        "overflow": overflow,
        "max_connections": max_conn,
        "utilization": round(checked_out / max_conn, 3) if max_conn else 0.0,
        "warn": checked_out >= max(1, int(max_conn * 0.8)),
    }
