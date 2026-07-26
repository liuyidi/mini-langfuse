"""FastAPI entrypoint."""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select

from .api import api_keys as api_keys_api
from .api import auth as auth_api
from .api import dashboard as dashboard_api
from .api import datasets as datasets_api
from .api import evaluations as evaluations_api
from .api import ingestion as ingestion_api
from .api import playground as playground_api
from .api import prompts as prompts_api
from .api import scores as scores_api
from .api import sessions as sessions_api
from .api import streaming as streaming_api
from .api import traces as traces_api
from .api import users as users_api
from .config import settings
from .db import SessionLocal
from .models import ApiKey, Project
from .services.auth import hash_password


def _ensure_demo_project() -> None:
    """Insert the demo project row and API key if missing (M1/M6 compatibility)."""
    try:
        with SessionLocal() as db:
            # Ensure demo project exists
            existing = db.scalar(select(Project).where(Project.id == settings.demo_project_id))
            if existing is None:
                db.add(Project(id=settings.demo_project_id, name=settings.demo_project_name))
                db.commit()

            # Ensure demo API key exists for backward compatibility
            demo_pk = settings.demo_public_key
            existing_key = db.scalar(select(ApiKey).where(ApiKey.public_key == demo_pk))
            if existing_key is None:
                db.add(ApiKey(
                    id="key_demo",
                    project_id=settings.demo_project_id,
                    public_key=demo_pk,
                    secret_hash=hash_password(settings.demo_secret_key),
                    note="Demo API key (pk-lf-demo / sk-lf-demo)",
                ))
                db.commit()
    except Exception as exc:  # noqa: BLE001 — schema may lag behind models during upgrades
        import logging

        logging.getLogger("mini_langfuse").warning(
            "demo project seed skipped (%s). Run alembic upgrade / create_all.",
            exc,
        )


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


app.include_router(auth_api.router)
app.include_router(api_keys_api.router)
app.include_router(ingestion_api.router)
app.include_router(traces_api.router)
app.include_router(sessions_api.router)
app.include_router(scores_api.router)
app.include_router(prompts_api.router)
app.include_router(playground_api.router)
app.include_router(streaming_api.router)
app.include_router(dashboard_api.router)
app.include_router(evaluations_api.router)
app.include_router(datasets_api.router)
app.include_router(users_api.router)
