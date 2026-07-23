"""Simple ID generator (no external deps)."""
from __future__ import annotations

import secrets
import time


def new_id(prefix: str = "") -> str:
    """Time-sortable-ish random id: <prefix><ms hex><random hex>."""
    ms = int(time.time() * 1000)
    rand = secrets.token_hex(6)
    return f"{prefix}{ms:012x}{rand}"
