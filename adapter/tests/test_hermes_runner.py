"""Unit tests for the pure helpers in `hermes_runner`.

These intentionally avoid constructing a real `AIAgent` (would require the
`hermes-agent` package at test time) — the builder itself is covered by the
smoke test + end-to-end verification described in the integration guide.
"""

from __future__ import annotations

from adapter.envelope import ChatRequest, HistoryMessage, UserContext
from adapter.files import MaterializedFile
from adapter.hermes_runner import (
    _build_system_prompt,
    _history_to_hermes,
    _normalize_reply,
)


def _make_req(**overrides) -> ChatRequest:
    base = {
        "conversation_id": "conv-1",
        "user": UserContext(user_id="u-1", organization_id="org-1", role="user"),
        "user_message": "oi",
        "history": [],
        "files": [],
    }
    base.update(overrides)
    return ChatRequest(**base)


def test_normalize_reply_handles_run_conversation_shape() -> None:
    # `AIAgent.run_conversation()` returns this shape — verified against
    # run_agent.py:8180 in the installed hermes-agent package.
    reply = {
        "final_response": "olá, tudo bem?",
        "messages": [{"role": "assistant", "content": "olá, tudo bem?"}],
        "api_calls": 1,
        "completed": True,
    }
    assert _normalize_reply(reply) == "olá, tudo bem?"


def test_normalize_reply_handles_dict_content() -> None:
    assert _normalize_reply({"content": "olá"}) == "olá"


def test_normalize_reply_handles_dict_message_fallback() -> None:
    assert _normalize_reply({"message": "oi"}) == "oi"


def test_normalize_reply_surfaces_error_when_no_final_response() -> None:
    reply = {
        "final_response": None,
        "messages": [],
        "api_calls": 0,
        "completed": False,
        "failed": True,
        "error": "Context length exceeded",
    }
    out = _normalize_reply(reply)
    assert "Context length exceeded" in out


def test_normalize_reply_handles_plain_string() -> None:
    assert _normalize_reply("hello") == "hello"


def test_normalize_reply_handles_empty_unknown_dict() -> None:
    assert _normalize_reply({"foo": "bar"}) == ""


def test_normalize_reply_handles_none() -> None:
    assert _normalize_reply(None) == ""


def test_build_system_prompt_includes_approval_granted_line() -> None:
    req = _make_req(action_origin="submit_orizon", approval_state="granted")
    prompt = _build_system_prompt(req, [])
    assert "submit_orizon" in prompt
    assert "aprovação humana foi concedida" in prompt.lower()


def test_build_system_prompt_lists_files() -> None:
    req = _make_req()
    files = [
        MaterializedFile(
            attachment_id="a1",
            original_name="guia.xml",
            mime_type="application/xml",
            local_path="/tmp/foo/guia.xml",
            size_bytes=1234,
        )
    ]
    prompt = _build_system_prompt(req, files)
    assert "guia.xml" in prompt
    assert "/tmp/foo/guia.xml" in prompt
    assert "1234" in prompt


def test_build_system_prompt_pending_approval_blocks_execution() -> None:
    req = _make_req(action_origin="submit_orizon", approval_state="pending")
    prompt = _build_system_prompt(req, [])
    assert "NÃO execute" in prompt


def test_history_to_hermes_maps_roles() -> None:
    req = _make_req(
        history=[
            HistoryMessage(sender="user", content="oi"),
            HistoryMessage(sender="assistant", content="olá"),
            HistoryMessage(sender="system", content="nota"),
        ]
    )
    out = _history_to_hermes(req.history)
    assert out == [
        {"role": "user", "content": "oi"},
        {"role": "assistant", "content": "olá"},
        {"role": "system", "content": "nota"},
    ]
