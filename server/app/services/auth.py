"""Authentication service - password hashing, session management, API key verification (M6)."""
from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import ApiKey, User, WebSession


# =============================================================================
# Password Hashing
# =============================================================================

def hash_password(password: str) -> str:
    """Hash a password using bcrypt."""
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    """Verify a password against its hash."""
    return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))


# =============================================================================
# Session Management (Web UI authentication)
# =============================================================================

SESSION_DURATION_HOURS = 24 * 7  # 1 week


def create_session(db: Session, user_id: str, hours: int = SESSION_DURATION_HOURS) -> WebSession:
    """Create a new web session for a user."""
    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(hours=hours)

    session = WebSession(
        token=token,
        user_id=user_id,
        expires_at=expires_at,
    )
    db.add(session)
    db.commit()
    return session


def validate_session(db: Session, token: str) -> Optional[User]:
    """Validate a session token and return the associated user, or None if invalid/expired."""
    session = db.scalar(
        select(WebSession).where(WebSession.token == token)
    )

    if session is None:
        return None

    # Check expiration
    if session.expires_at < datetime.now(timezone.utc):
        # Clean up expired session
        db.delete(session)
        db.commit()
        return None

    # Return the user
    return db.scalar(select(User).where(User.id == session.user_id))


def delete_session(db: Session, token: str) -> None:
    """Delete a session (logout)."""
    session = db.scalar(select(WebSession).where(WebSession.token == token))
    if session:
        db.delete(session)
        db.commit()


# =============================================================================
# API Key Management (SDK authentication)
# =============================================================================

def generate_api_key_pair() -> tuple[str, str, str]:
    """Generate a new API key pair.

    Returns:
        (public_key, secret, secret_hash) - the secret is only shown once
    """
    public_key = f"pk-lf-{secrets.token_urlsafe(24)}"
    secret = f"sk-lf-{secrets.token_urlsafe(32)}"
    secret_hash = hash_password(secret)  # reuse bcrypt for consistency
    return public_key, secret, secret_hash


def verify_api_key(db: Session, public_key: str, secret: str) -> Optional[ApiKey]:
    """Verify an API key pair and return the ApiKey record, or None if invalid."""
    api_key = db.scalar(
        select(ApiKey).where(ApiKey.public_key == public_key)
    )

    if api_key is None:
        return None

    if not verify_password(secret, api_key.secret_hash):
        return None

    # Update last_used_at
    api_key.last_used_at = datetime.now(timezone.utc)
    db.commit()

    return api_key


# =============================================================================
# User Operations
# =============================================================================

def create_user(
    db: Session,
    email: str,
    password: str,
    name: Optional[str] = None,
    user_id: Optional[str] = None,
) -> User:
    """Create a new user with hashed password."""
    user = User(
        id=user_id or f"usr_{secrets.token_urlsafe(16)}",
        email=email,
        password_hash=hash_password(password),
        name=name,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def get_user_by_email(db: Session, email: str) -> Optional[User]:
    """Get a user by email address."""
    return db.scalar(select(User).where(User.email == email))


def authenticate_user(db: Session, email: str, password: str) -> Optional[User]:
    """Authenticate a user with email and password.

    Returns the user if valid, None otherwise.
    """
    user = get_user_by_email(db, email)

    if user is None:
        return None

    if user.password_hash is None:
        return None  # SSO-only user

    if not verify_password(password, user.password_hash):
        return None

    return user
