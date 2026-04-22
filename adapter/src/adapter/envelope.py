"""Request/response models for the adapter ↔ web contract.

The envelope is defined in PRD §17.1: authenticated user identity, org context,
conversation id, prior messages, file refs, action origin, approval state.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

# ── Primitives ───────────────────────────────────────────────────────

SenderType = Literal["user", "assistant", "system"]
ApprovalState = Literal["none", "pending", "granted", "denied"]
ActionType = Literal[
    "chat",  # plain user message
    "analyze_files",
    "check_pending",
    "validate_submission",
    "draft_recurso",
    "prepare_orizon",
    "submit_orizon",
]


class HistoryMessage(BaseModel):
    sender: SenderType
    content: str


class FileRef(BaseModel):
    """A reference the adapter uses to fetch file bytes from S3."""

    attachment_id: str
    storage_key: str
    original_name: str
    mime_type: str
    size_bytes: int


class UserContext(BaseModel):
    user_id: str
    organization_id: str
    role: Literal["user", "operator"] = "user"


# ── Request ──────────────────────────────────────────────────────────


class ChatRequest(BaseModel):
    """Envelope sent from web/ → adapter for a single Hermes turn."""

    conversation_id: str
    user: UserContext
    user_message: str = Field(
        default="",
        description="Free-text content from the composer. Empty when action_origin is set.",
    )
    history: list[HistoryMessage] = Field(
        default_factory=list,
        description="Prior messages, oldest first, capped to ADAPTER_HISTORY_TURNS.",
    )
    files: list[FileRef] = Field(default_factory=list)
    action_origin: ActionType = "chat"
    approval_state: ApprovalState = "none"
    action_request_id: str | None = Field(
        default=None,
        description="Set when action_origin is a side-effect action; ties audit events back.",
    )
    idempotency_key: str | None = None


# ── Response ─────────────────────────────────────────────────────────


class ChatResponse(BaseModel):
    """Non-streaming response shape used in Phase 1. Phase 2 switches to SSE."""

    assistant_message: str
    usage: dict[str, int] | None = None
    action_executed: bool = False
    action_result_summary: str | None = None
