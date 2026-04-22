"""Unit tests for HMAC signing helpers."""

from __future__ import annotations

import time

import pytest
from fastapi import FastAPI, HTTPException, Request

from adapter.signing import (
    MAX_SKEW_SECONDS,
    SIGNATURE_HEADER,
    TIMESTAMP_HEADER,
    compute_signature,
    verify_request,
)

SECRET = "s" * 32


def _fake_request(headers: dict[str, str], body: bytes) -> Request:
    # Build a minimal ASGI scope/request carrying the given headers/body.
    encoded = [(k.lower().encode(), v.encode()) for k, v in headers.items()]
    scope = {
        "type": "http",
        "method": "POST",
        "path": "/chat",
        "headers": encoded,
        "raw_path": b"/chat",
        "query_string": b"",
        "root_path": "",
        "scheme": "http",
        "server": ("testserver", 80),
    }
    sent = {"consumed": False}

    async def receive():
        if sent["consumed"]:
            return {"type": "http.disconnect"}
        sent["consumed"] = True
        return {"type": "http.request", "body": body, "more_body": False}

    return Request(scope, receive)


@pytest.mark.asyncio
async def test_verify_happy_path():
    ts = str(int(time.time()))
    body = b'{"hello":"world"}'
    sig = compute_signature(SECRET, ts, body)
    req = _fake_request(
        {SIGNATURE_HEADER: sig, TIMESTAMP_HEADER: ts},
        body,
    )
    out = await verify_request(req, SECRET)
    assert out == body


@pytest.mark.asyncio
async def test_verify_rejects_missing_headers():
    req = _fake_request({}, b"{}")
    with pytest.raises(HTTPException) as exc:
        await verify_request(req, SECRET)
    assert exc.value.status_code == 401


@pytest.mark.asyncio
async def test_verify_rejects_bad_signature():
    ts = str(int(time.time()))
    req = _fake_request(
        {SIGNATURE_HEADER: "sha256=deadbeef", TIMESTAMP_HEADER: ts},
        b"{}",
    )
    with pytest.raises(HTTPException) as exc:
        await verify_request(req, SECRET)
    assert exc.value.status_code == 401


@pytest.mark.asyncio
async def test_verify_rejects_stale_timestamp():
    ts = str(int(time.time()) - MAX_SKEW_SECONDS - 10)
    body = b"{}"
    sig = compute_signature(SECRET, ts, body)
    req = _fake_request(
        {SIGNATURE_HEADER: sig, TIMESTAMP_HEADER: ts},
        body,
    )
    with pytest.raises(HTTPException) as exc:
        await verify_request(req, SECRET)
    assert exc.value.status_code == 401


# Make FastAPI app-scope import-side-effects explicit.
_ = FastAPI
