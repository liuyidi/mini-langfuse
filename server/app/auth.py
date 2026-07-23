"""M1 auth: hardcoded demo API key via HTTP Basic (public:secret)."""
from __future__ import annotations

import base64
import secrets
from typing import Optional

from fastapi import Header, HTTPException, status

from .config import settings


def _parse_basic(authorization: Optional[str]) -> Optional[tuple[str, str]]:
    if not authorization:
        return None
    if not authorization.lower().startswith("basic "):
        return None
    try:
        raw = base64.b64decode(authorization.split(None, 1)[1]).decode("utf-8", "ignore")
    except Exception:
        return None
    if ":" not in raw:
        return None
    user, _, pw = raw.partition(":")
    return user, pw


def require_project(authorization: Optional[str] = Header(default=None)) -> str:
    """Dependency: returns project_id if credentials match. Raises 401 otherwise."""
    creds = _parse_basic(authorization)
    if creds is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid Authorization header (expected Basic auth).",
            headers={"WWW-Authenticate": 'Basic realm="mini-langfuse"'},
        )
    pk, sk = creds
    ok_pk = secrets.compare_digest(pk, settings.demo_public_key)
    ok_sk = secrets.compare_digest(sk, settings.demo_secret_key)
    if not (ok_pk and ok_sk):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials.",
        )
    return settings.demo_project_id
