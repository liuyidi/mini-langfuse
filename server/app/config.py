"""Configuration."""
from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # DB
    database_url: str = "sqlite:///./mini_langfuse.db"

    # Demo auth (M1: single hardcoded key pair; real auth in later milestones)
    demo_public_key: str = "pk-lf-demo"
    demo_secret_key: str = "sk-lf-demo"
    demo_project_id: str = "proj_demo"
    demo_project_name: str = "demo"

    # CORS
    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]

    model_config = SettingsConfigDict(env_prefix="MLF_", env_file=".env", extra="ignore")


settings = Settings()
