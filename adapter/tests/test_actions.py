"""Unit tests for action prompt rendering and risk classification."""

from __future__ import annotations

from adapter.actions import (
    ACTION_TEMPLATES,
    SIDE_EFFECT_ACTIONS,
    render_action_prompt,
)


def test_chat_passthrough():
    assert render_action_prompt("chat", "olá") == "olá"


def test_action_overrides_empty_user_text():
    out = render_action_prompt("analyze_files", "")
    assert out.startswith("Analise os arquivos")


def test_action_appends_user_context():
    out = render_action_prompt("validate_submission", "foco no SP/SADT")
    assert "Valide" in out or "Revise" in out
    assert "foco no SP/SADT" in out


def test_submit_orizon_is_side_effect():
    assert "submit_orizon" in SIDE_EFFECT_ACTIONS
    assert "analyze_files" not in SIDE_EFFECT_ACTIONS
    assert "validate_submission" not in SIDE_EFFECT_ACTIONS


def test_every_action_has_template():
    # `chat` is intentionally empty; every other action has content.
    for name, tmpl in ACTION_TEMPLATES.items():
        if name == "chat":
            assert tmpl == ""
        else:
            assert tmpl, f"missing template for {name}"
