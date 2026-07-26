"""Authentication - HTTP Basic auth for SDK, cookie auth for UI (M6 multi-tenant)."""
from __future__ import annotations

import base64
from typing import Optional

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from .db import get_db
from .services.auth import verify_api_key


def _parse_basic(authorization: Optional[str]) -> Optional[tuple[str, str]]:
    """Parse HTTP Basic auth header."""
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


def require_project(
    authorization: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
) -> str:
    """Dependency: returns project_id if API key credentials are valid. Raises 401 otherwise.

    M6: Looks up the API key in the database and verifies the secret.
    """
    creds = _parse_basic(authorization)
    if creds is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid Authorization header (expected Basic auth).",
            headers={"WWW-Authenticate": 'Basic realm="mini-langfuse"'},
        )

    pk, sk = creds
    api_key = verify_api_key(db, pk, sk)

    if api_key is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials.",
        )

    return api_key.project_id
