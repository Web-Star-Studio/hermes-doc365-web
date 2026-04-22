"""Unit tests for the SSE event builders.

The adapter's SSE contract is the stable interface the web app relies on, so
these tests pin the shape of every event kind. If one of these fails you've
changed the wire format — update web/src/app/api/conversations/[id]/messages/stream/route.ts too.
"""

from __future__ import annotations

import json

from adapter import events as ev


def _parse(env: dict[str, str]) -> tuple[str, dict]:
    assert set(env.keys()) == {"event", "data"}, env
    return env["event"], json.loads(env["data"])


def test_step_shape() -> None:
    name, body = _parse(ev.step("Analisando arquivos", step_index=3))
    assert name == "step"
    assert body["description"] == "Analisando arquivos"
    assert body["step_index"] == 3
    assert isinstance(body["ts"], (int, float))


def test_tool_progress_minimal() -> None:
    name, body = _parse(ev.tool_progress("read_xml"))
    assert name == "tool_progress"
    assert body == {"tool": "read_xml", "status": "running", "ts": body["ts"]}


def test_tool_progress_with_text_and_meta() -> None:
    _, body = _parse(
        ev.tool_progress(
            "validate", status="done", text="3 avisos", metadata={"errors": 0}
        )
    )
    assert body["text"] == "3 avisos"
    assert body["metadata"] == {"errors": 0}
    assert body["status"] == "done"


def test_message_chunk_final_flag() -> None:
    _, body = _parse(ev.message_chunk("oi", final=True))
    assert body["final"] is True
    assert body["content"] == "oi"


def test_action_executed_shape() -> None:
    name, body = _parse(
        ev.action_executed(
            action_type="submit_orizon",
            action_request_id="ar-1",
            summary="enviado",
            success=True,
        )
    )
    assert name == "action_executed"
    assert body["action_type"] == "submit_orizon"
    assert body["action_request_id"] == "ar-1"
    assert body["success"] is True


def test_error_default_code() -> None:
    _, body = _parse(ev.error("coisa deu ruim"))
    assert body["code"] == "adapter_error"
    assert body["message"] == "coisa deu ruim"


def test_done_with_usage() -> None:
    _, body = _parse(ev.done(usage={"input_tokens": 42}))
    assert body["usage"] == {"input_tokens": 42}
