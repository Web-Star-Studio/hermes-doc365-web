"""SSE event builders for the adapter → web stream.

The web app proxies these events through its own SSE endpoint to the browser.
The shape mirrors `hermes_agent.acp_adapter.events` where it makes sense, but
we keep it a small stable surface we control rather than re-exporting Hermes
internals — if upstream renames something, only this file changes.

Event types emitted:

    event: step           # a new reasoning step started
    event: tool_progress  # a tool is running; may carry a partial text chunk
    event: message        # final assistant message (possibly delivered in chunks)
    event: action_executed  # a side-effect action finished; `audit_events` row is created on receipt
    event: error          # terminal error; client should surface retry UX
    event: done           # stream is closed; no more events after this
"""

from __future__ import annotations

import json
import time
from typing import Any

# ── SSE wire format ──────────────────────────────────────────────────────


def sse(event: str, data: dict[str, Any] | str) -> dict[str, str]:
    """Build an event dict consumable by `sse_starlette.EventSourceResponse`.

    `sse_starlette` expects `{"event": str, "data": str}` where `data` is the
    already-serialised body. We JSON-encode dicts here so callers don't have to.
    """
    payload = data if isinstance(data, str) else json.dumps(data, ensure_ascii=False)
    return {"event": event, "data": payload}


# ── Builders — each returns a `sse()` envelope ──────────────────────────


def step(description: str, *, step_index: int | None = None) -> dict[str, str]:
    return sse(
        "step",
        {
            "description": description,
            "step_index": step_index,
            "ts": time.time(),
        },
    )


def tool_progress(
    tool_name: str,
    *,
    status: str = "running",
    text: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> dict[str, str]:
    body: dict[str, Any] = {
        "tool": tool_name,
        "status": status,
        "ts": time.time(),
    }
    if text is not None:
        body["text"] = text
    if metadata is not None:
        body["metadata"] = metadata
    return sse("tool_progress", body)


def message_chunk(content: str, *, final: bool = False) -> dict[str, str]:
    return sse(
        "message",
        {"content": content, "final": final, "ts": time.time()},
    )


def action_executed(
    *,
    action_type: str,
    action_request_id: str | None,
    summary: str | None,
    success: bool,
    metadata: dict[str, Any] | None = None,
) -> dict[str, str]:
    """Terminal event for a side-effect action.

    The web side listens for this and persists an `audit_events` row tied back
    to `action_request_id` + `conversation_id` (the web handler already has
    both in closure).
    """
    body: dict[str, Any] = {
        "action_type": action_type,
        "action_request_id": action_request_id,
        "summary": summary,
        "success": success,
        "ts": time.time(),
    }
    if metadata is not None:
        body["metadata"] = metadata
    return sse("action_executed", body)


def error(message: str, *, code: str = "adapter_error") -> dict[str, str]:
    return sse("error", {"code": code, "message": message, "ts": time.time()})


def done(*, usage: dict[str, int] | None = None) -> dict[str, str]:
    body: dict[str, Any] = {"ts": time.time()}
    if usage is not None:
        body["usage"] = usage
    return sse("done", body)
