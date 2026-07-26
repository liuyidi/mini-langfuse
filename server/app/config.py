"""Configuration."""
from __future__ import annotations

from pathlib import Path
from typing import Union

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_SERVER_ROOT = Path(__file__).resolve().parent.parent
_DEFAULT_DB = _SERVER_ROOT / "mini_langfuse.db"


class Settings(BaseSettings):
    # DB — absolute default so cwd (uvicorn reload) cannot point at another sqlite file
    database_url: str = f"sqlite:///{_DEFAULT_DB}"

    # Demo auth (M1: single hardcoded key pair; real auth in later milestones)
    demo_public_key: str = "pk-lf-demo"
    demo_secret_key: str = "sk-lf-demo"
    demo_project_id: str = "proj_demo"
    demo_project_name: str = "demo"

    # LLM for Playground + Eval (OpenAI-compatible; DeepSeek etc. via base_url)
    # Env: MLF_OPENAI_API_KEY / MLF_OPENAI_BASE_URL (also falls back to OPENAI_* in llm_proxy)
    openai_api_key: str = ""
    openai_base_url: str = "https://api.openai.com/v1"
    anthropic_api_key: str = ""

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

    model_config = SettingsConfigDict(
        env_prefix="MLF_",
        env_file=str(_SERVER_ROOT / ".env"),
        extra="ignore",
    )


settings = Settings()
