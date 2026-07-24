"""Configuration."""
from __future__ import annotations

from typing import Union

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # DB
    database_url: str = "sqlite:///./mini_langfuse.db"

    # Demo auth (M1: single hardcoded key pair; real auth in later milestones)
    demo_public_key: str = "pk-lf-demo"
    demo_secret_key: str = "sk-lf-demo"
    demo_project_id: str = "proj_demo"
    demo_project_name: str = "demo"

    # CORS - list or comma-separated string (env var: MLF_CORS_ORIGINS)
    cors_origins: Union[list[str], str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:8080",
    ]

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_cors(cls, v):
        if isinstance(v, str):
            return [x.strip() for x in v.split(",") if x.strip()]
        return v

    model_config = SettingsConfigDict(env_prefix="MLF_", env_file=".env", extra="ignore")


settings = Settings()
