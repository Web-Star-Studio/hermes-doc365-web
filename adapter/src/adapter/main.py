"""FastAPI entry point for the Doc365 Hermes adapter.

Two endpoints do the real work:

    POST /chat         — JSON in, JSON out. Kept for Phase 1 clients and tests.
    POST /chat/stream  — JSON in, `text/event-stream` out. The web app consumes
                         this and re-streams events to the browser.

Both paths share the same signing, approval-gate, and file-materialisation
logic; they only differ in how they surface results.
"""

from __future__ import annotations

import json
import logging
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException, Request, status
from fastapi.responses import JSONResponse
from sse_starlette.sse import EventSourceResponse

from . import events as ev
from .actions import ACTION_TEMPLATES, SIDE_EFFECT_ACTIONS, render_action_prompt
from .config import Settings, get_settings
from .envelope import ChatRequest, ChatResponse
from .files import (
    FileFetchError,
    FileTooLargeError,
    RequestTooLargeError,
    materialize_files,
)
from .hermes_runner import ProgressEvent, RunResult, run_chat, stream_chat
from .signing import verify_request

# ── Logging ──────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s :: %(message)s",
)
logger = logging.getLogger("adapter")

# ── App ──────────────────────────────────────────────────────────────
app = FastAPI(
    title="Doc365 Hermes Adapter",
    version="0.1.0",
    docs_url="/docs",  # dev-only in prod behind auth
    redoc_url=None,
)


# ── Liveness ─────────────────────────────────────────────────────────
@app.get("/healthz")
async def healthz() -> dict[str, object]:
    return {"ok": True, "service": "adapter"}


# ── Shared envelope parsing ──────────────────────────────────────────


async def _parse_envelope(request: Request, settings: Settings) -> ChatRequest:
    """Verify HMAC, parse body, enforce approval + feature-flag gates.

    Returns a ready-to-run `ChatRequest` or raises `HTTPException`.
    """
    body = await verify_request(request, settings.hmac_secret)

    try:
        payload = json.loads(body.decode("utf-8"))
        req = ChatRequest.model_validate(payload)
    except Exception as e:
        logger.warning("invalid envelope: %s", e)
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="invalid envelope",
        ) from e

    if req.action_origin in SIDE_EFFECT_ACTIONS and req.approval_state != "granted":
        logger.info(
            "blocked side-effect action %s without approval (conv=%s)",
            req.action_origin,
            req.conversation_id,
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="action requires explicit approval",
        )

    if req.action_origin == "submit_orizon" and not settings.orizon_submit_enabled:
        logger.info("blocked submit_orizon: ORIZON_SUBMIT_ENABLED=false")
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="orizon_submit_disabled",
        )

    req.user_message = render_action_prompt(req.action_origin, req.user_message)

    if len(req.history) > settings.history_turns:
        req.history = req.history[-settings.history_turns :]

    return req


# ── Non-streaming chat ───────────────────────────────────────────────
@app.post("/chat", response_model=ChatResponse)
async def chat(
    request: Request,
    settings: Annotated[Settings, Depends(get_settings)],
) -> JSONResponse:
    req = await _parse_envelope(request, settings)

    logger.info(
        "chat conv=%s user=%s action=%s files=%d history=%d",
        req.conversation_id,
        req.user.user_id,
        req.action_origin,
        len(req.files),
        len(req.history),
    )

    try:
        with materialize_files(req.files, settings) as mats:
            result = await run_chat(req, settings, mats)
    except FileTooLargeError as e:
        logger.info("file too large: %s", e)
        raise HTTPException(status_code=413, detail="file_too_large") from e
    except RequestTooLargeError as e:
        logger.info("request too large: %s", e)
        raise HTTPException(status_code=413, detail="request_too_large") from e
    except FileFetchError as e:
        logger.warning("file fetch failed: %s", e)
        raise HTTPException(status_code=502, detail="file_fetch_failed") from e

    # Flag action_executed when Hermes completed a granted side-effect turn.
    action_executed = (
        req.approval_state == "granted" and req.action_origin in SIDE_EFFECT_ACTIONS
    )
    resp = ChatResponse(
        assistant_message=result.assistant_message,
        usage=result.usage,
        action_executed=action_executed,
        action_result_summary=result.assistant_message[:400]
        if action_executed
        else None,
    )
    return JSONResponse(resp.model_dump())


# ── Streaming chat ───────────────────────────────────────────────────
@app.post("/chat/stream")
async def chat_stream(
    request: Request,
    settings: Annotated[Settings, Depends(get_settings)],
) -> EventSourceResponse:
    req = await _parse_envelope(request, settings)

    logger.info(
        "chat/stream conv=%s user=%s action=%s files=%d history=%d",
        req.conversation_id,
        req.user.user_id,
        req.action_origin,
        len(req.files),
        len(req.history),
    )

    async def generator():
        try:
            with materialize_files(req.files, settings) as mats:
                yield ev.step(
                    f"Contexto pronto ({len(mats)} arquivo(s)).",
                    step_index=0,
                )

                final_result: RunResult | None = None
                async for item in stream_chat(req, settings, mats):
                    if isinstance(item, ProgressEvent):
                        if item.kind == "step":
                            yield ev.step(
                                item.data.get("description", ""),
                                step_index=item.data.get("step_index"),
                            )
                        elif item.kind == "tool_progress":
                            yield ev.tool_progress(
                                item.data.get("tool", "unknown"),
                                status=item.data.get("status", "running"),
                                text=item.data.get("text"),
                                metadata=item.data.get("metadata"),
                            )
                        elif item.kind == "message":
                            yield ev.message_chunk(
                                item.data.get("content", ""),
                                final=bool(item.data.get("final")),
                            )
                        elif item.kind == "error":
                            yield ev.error(
                                item.data.get("message", "erro desconhecido"),
                                code=item.data.get("code", "hermes_error"),
                            )
                    elif isinstance(item, RunResult):
                        final_result = item

                if req.approval_state == "granted" and req.action_origin in SIDE_EFFECT_ACTIONS:
                    yield ev.action_executed(
                        action_type=req.action_origin,
                        action_request_id=req.action_request_id,
                        summary=(final_result.assistant_message[:400]
                                 if final_result else None),
                        success=True,
                    )

                yield ev.done(usage=(final_result.usage if final_result else None))
        except FileTooLargeError as e:
            logger.info("file too large: %s", e)
            yield ev.error("Arquivo acima do limite de 50 MB.", code="file_too_large")
            yield ev.done()
        except RequestTooLargeError as e:
            logger.info("request too large: %s", e)
            yield ev.error(
                "Conjunto de arquivos acima do limite de 200 MB por requisição.",
                code="request_too_large",
            )
            yield ev.done()
        except FileFetchError as e:
            logger.warning("file fetch failed: %s", e)
            yield ev.error(
                "Falha ao obter arquivos do armazenamento. Tente novamente.",
                code="file_fetch_failed",
            )
            yield ev.done()
        except Exception as e:  # pragma: no cover — defensive
            logger.exception("stream failed")
            yield ev.error(f"Erro interno: {e}", code="adapter_error")
            yield ev.done()

    return EventSourceResponse(
        generator(),
        # Long-running LLM turns; prevent any middle-box idle kill.
        ping=15,
    )


# Expose supported action names for debug / sanity.
@app.get("/meta/actions")
async def meta_actions() -> dict[str, object]:
    return {
        "actions": list(ACTION_TEMPLATES.keys()),
        "side_effect": sorted(SIDE_EFFECT_ACTIONS),
    }
