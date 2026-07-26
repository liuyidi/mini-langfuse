"""FastAPI entrypoint."""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select

from .api import ingestion as ingestion_api
from .api import playground as playground_api
from .api import prompts as prompts_api
from .api import scores as scores_api
from .api import sessions as sessions_api
from .api import traces as traces_api
from .config import settings
from .db import SessionLocal
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
    # M9: Schema is managed by Alembic. Run `alembic upgrade head` before starting.
    # For docker-compose, this is done automatically in the command.
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
app.include_router(sessions_api.router)
app.include_router(scores_api.router)
app.include_router(prompts_api.router)
app.include_router(playground_api.router)
