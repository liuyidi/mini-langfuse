"""FastAPI entrypoint."""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select

from .api import ingestion as ingestion_api
from .api import traces as traces_api
from .config import settings
from .db import Base, SessionLocal, engine
from .models import Project


def _ensure_demo_project() -> None:
    """Insert the demo project row if missing (M1 single-tenant)."""
    with SessionLocal() as db:
        existing = db.scalar(select(Project).where(Project.id == settings.demo_project_id))
        if existing is None:
            db.add(Project(id=settings.demo_project_id, name=settings.demo_project_name))
            db.commit()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # M1: use create_all instead of Alembic
    Base.metadata.create_all(bind=engine)
    _ensure_demo_project()
    yield


app = FastAPI(title="Mini Langfuse", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(ingestion_api.router)
app.include_router(traces_api.router)
