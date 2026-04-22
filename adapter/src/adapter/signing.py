"""HMAC envelope signing / verification.

Next.js computes HMAC-SHA256 over the raw JSON body using ADAPTER_HMAC_SECRET
and sends it in `X-Doc365-Signature`. The adapter verifies before processing.
Constant-time comparison avoids timing leaks.
"""

from __future__ import annotations

import hashlib
import hmac
import time
from typing import Final

from fastapi import HTTPException, Request, status

SIGNATURE_HEADER: Final = "x-doc365-signature"
TIMESTAMP_HEADER: Final = "x-doc365-timestamp"
# Reject requests older than this (seconds). Mitigates replay attacks without
# requiring a nonce store for MVP.
MAX_SKEW_SECONDS: Final = 300


def compute_signature(secret: str, timestamp: str, body: bytes) -> str:
    """Return `sha256=<hex>` over `<timestamp>.<body>`."""
    msg = timestamp.encode("utf-8") + b"." + body
    digest = hmac.new(secret.encode("utf-8"), msg, hashlib.sha256).hexdigest()
    return f"sha256={digest}"


async def verify_request(request: Request, secret: str) -> bytes:
    """Verify an incoming request. Returns the raw body if valid.

    Raises HTTPException(401) on any signature / timestamp failure.
    """
    signature = request.headers.get(SIGNATURE_HEADER)
    timestamp = request.headers.get(TIMESTAMP_HEADER)
    if not signature or not timestamp:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="missing signature headers",
        )

    try:
        ts = int(timestamp)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="bad timestamp",
        ) from e

    now = int(time.time())
    if abs(now - ts) > MAX_SKEW_SECONDS:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="timestamp out of window",
        )

    body = await request.body()
    expected = compute_signature(secret, timestamp, body)
    if not hmac.compare_digest(expected, signature):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="signature mismatch",
        )
    return body
