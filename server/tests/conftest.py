"""Shared pytest fixtures."""
from __future__ import annotations

import os
import tempfile
import pytest

# Use an isolated SQLite file per test session
@pytest.fixture(scope="session", autouse=True)
def _test_db_env():
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    os.environ["MLF_DATABASE_URL"] = f"sqlite:///{path}"
    yield
    try:
        os.remove(path)
    except OSError:
        pass


@pytest.fixture()
def client():
    """FastAPI TestClient with the app started up (creates tables + demo project)."""
    from fastapi.testclient import TestClient
    from app.main import app

    with TestClient(app) as c:
        yield c


@pytest.fixture()
def auth():
    return ("pk-lf-demo", "sk-lf-demo")
