"""Runs Hermes' `AIAgent` safely from async FastAPI handlers.

Design notes (from plan / `acp_adapter/server.py` reference):
- `AIAgent` is synchronous and NOT thread-safe across instances.
- One fresh instance per request. Wrap the sync call in a bounded ThreadPool
  (max_workers=4 is plenty for MVP; bump later if load justifies it).
- No in-memory session caching. `conversation_history` always arrives in the
  envelope from Postgres.
- Import `AIAgent` lazily so that unit tests and `--help` invocations do not
  require Hermes to be installed.

Phase 2 addition: a streaming variant emits progress dicts through an asyncio
queue so `main.py` can fan them out over SSE while the sync Hermes call keeps
running inside the threadpool.
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import AsyncIterator
from concurrent.futures import ThreadPoolExecutor
from contextlib import suppress
from dataclasses import dataclass, field
from typing import Any

from .config import Settings
from .envelope import ChatRequest
from .files import MaterializedFile

logger = logging.getLogger(__name__)

# Shared executor; capped to avoid runaway LLM fan-out under load.
_EXECUTOR = ThreadPoolExecutor(max_workers=4, thread_name_prefix="hermes")

# Sentinel used to signal "done" across the sync/async boundary.
_DONE = object()


@dataclass
class RunResult:
    assistant_message: str
    usage: dict[str, int] | None = None
    action_executed: bool = False
    action_result_summary: str | None = None


@dataclass
class ProgressEvent:
    """A progress tick to relay to the caller. `kind` selects the SSE event."""

    kind: str  # "step" | "tool_progress" | "message" | "error"
    data: dict[str, Any] = field(default_factory=dict)


# ── Prompt helpers ──────────────────────────────────────────────────────


def _build_system_prompt(req: ChatRequest, files: list[MaterializedFile]) -> str:
    """Portuguese system wrap per PRD §17.2 — non-technical user, billing domain,
    uncertainty labelling, file-aware, approval-aware.
    """
    lines = [
        "Você é o Hermes, assistente operacional do Doc365 para faturamento médico no Brasil.",
        "O usuário é um médico ou colaborador de clínica, normalmente não-técnico.",
        "Responda em português claro e objetivo, sem jargão técnico desnecessário.",
        "Quando houver arquivos anexados, examine-os antes de responder.",
        "Separe claramente: (a) fatos verificados nos arquivos, (b) interpretações prováveis, (c) pontos incertos que precisam de revisão humana.",
        "Se identificar pendências ou riscos de glosa, liste-os de forma prática.",
        "Ações com efeito externo (envio a portais como Orizon) só podem ser executadas após aprovação explícita registrada na requisição.",
    ]
    if req.action_origin != "chat":
        lines.append(f"A interação foi iniciada pelo botão de ação: {req.action_origin}.")
    if req.approval_state == "granted":
        lines.append(
            "A aprovação humana foi concedida para esta ação de efeito externo. Prossiga com a execução e resuma o resultado objetivamente."
        )
    elif req.approval_state == "pending":
        lines.append(
            "Aprovação ainda pendente: NÃO execute ações de efeito externo; apenas prepare e explique o que será feito."
        )
    if files:
        lines.append(
            "Arquivos disponíveis para análise (caminhos locais — use as ferramentas apropriadas para ler):"
        )
        for f in files:
            lines.append(
                f"- {f.original_name} ({f.mime_type}, {f.size_bytes} bytes) → {f.local_path}"
            )
    return "\n".join(lines)


def _history_to_hermes(history: list[Any]) -> list[dict[str, str]]:
    """Convert our `HistoryMessage` list to Hermes' expected shape
    (Chat Completions style with `role` / `content`).
    """
    role_map = {"user": "user", "assistant": "assistant", "system": "system"}
    return [
        {"role": role_map.get(h.sender, "user"), "content": h.content} for h in history
    ]


# ── Non-streaming path (Phase 1 retained for tests / diagnostics) ───────


def _run_chat_sync(
    req: ChatRequest, settings: Settings, files: list[MaterializedFile]
) -> RunResult:
    """Blocking path that instantiates `AIAgent` and returns its reply."""
    try:
        from run_agent import AIAgent  # type: ignore[import-not-found]
    except Exception as e:  # pragma: no cover — depends on env
        logger.error("hermes-agent not importable: %s", e)
        return RunResult(
            assistant_message=(
                "O Hermes não está configurado neste ambiente (módulo "
                "`hermes-agent` ausente). Instale `hermes-agent[web]` e "
                "configure HERMES_API_KEY para habilitar respostas reais."
            )
        )

    agent = AIAgent()

    with suppress(Exception):
        agent.conversation_history = _history_to_hermes(req.history)  # type: ignore[attr-defined]
    with suppress(Exception):
        agent.ephemeral_system_prompt = _build_system_prompt(req, files)  # type: ignore[attr-defined]

    user_text = req.user_message or ""
    reply: Any
    try:
        reply = agent.chat(user_text)  # type: ignore[attr-defined]
    except AttributeError:
        reply = agent.run_conversation(  # type: ignore[attr-defined]
            user_message=user_text,
            conversation_history=_history_to_hermes(req.history),
            system_message=_build_system_prompt(req, files),
        )

    if isinstance(reply, dict):
        reply = reply.get("content") or reply.get("message") or str(reply)

    return RunResult(assistant_message=str(reply))


async def run_chat(
    req: ChatRequest,
    settings: Settings,
    files: list[MaterializedFile],
) -> RunResult:
    """Async wrapper — schedules the sync call in the shared executor."""
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(
        _EXECUTOR, _run_chat_sync, req, settings, files
    )


# ── Streaming path ──────────────────────────────────────────────────────


def _run_chat_streaming_sync(
    req: ChatRequest,
    settings: Settings,
    files: list[MaterializedFile],
    loop: asyncio.AbstractEventLoop,
    queue: asyncio.Queue,
) -> RunResult:
    """Sync body that pushes progress onto an asyncio.Queue.

    Must use `loop.call_soon_threadsafe(queue.put_nowait, ...)` because this
    runs in a worker thread and the queue belongs to the event loop.
    """

    def emit(kind: str, data: dict[str, Any]) -> None:
        loop.call_soon_threadsafe(queue.put_nowait, ProgressEvent(kind=kind, data=data))

    emit("step", {"description": "Preparando contexto da conversa."})

    try:
        from run_agent import AIAgent  # type: ignore[import-not-found]
    except Exception as e:  # pragma: no cover — depends on env
        logger.error("hermes-agent not importable: %s", e)
        fallback = (
            "O Hermes não está configurado neste ambiente (módulo "
            "`hermes-agent` ausente). Instale `hermes-agent[web]` e "
            "configure HERMES_API_KEY para habilitar respostas reais."
        )
        emit("message", {"content": fallback, "final": True})
        return RunResult(assistant_message=fallback)

    # ── Progress callbacks mirror `acp_adapter/events.py` shape ─────────
    step_counter = {"n": 0}

    def step_cb(description: str) -> None:
        step_counter["n"] += 1
        emit(
            "step",
            {"description": str(description), "step_index": step_counter["n"]},
        )

    def tool_progress_cb(
        tool_name: str,
        *,
        status: str = "running",
        text: str | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> None:
        data: dict[str, Any] = {"tool": str(tool_name), "status": status}
        if text is not None:
            data["text"] = str(text)
        if metadata is not None:
            data["metadata"] = metadata
        emit("tool_progress", data)

    agent = AIAgent()
    with suppress(Exception):
        agent.conversation_history = _history_to_hermes(req.history)  # type: ignore[attr-defined]
    with suppress(Exception):
        agent.ephemeral_system_prompt = _build_system_prompt(req, files)  # type: ignore[attr-defined]

    # Best-effort wiring of progress hooks — different AIAgent versions expose
    # slightly different names. We try a few and silently move on if none match;
    # in that case the client still gets the opening/closing step events we emit.
    for attr in ("step_callback", "on_step", "progress_callback"):
        with suppress(Exception):
            setattr(agent, attr, step_cb)
    for attr in ("tool_progress_callback", "on_tool_progress"):
        with suppress(Exception):
            setattr(agent, attr, tool_progress_cb)

    user_text = req.user_message or ""
    emit("step", {"description": "Consultando o modelo Hermes."})

    reply: Any
    try:
        # Prefer run_conversation so progress callbacks get exercised.
        reply = agent.run_conversation(  # type: ignore[attr-defined]
            user_message=user_text,
            conversation_history=_history_to_hermes(req.history),
            system_message=_build_system_prompt(req, files),
        )
    except AttributeError:
        reply = agent.chat(user_text)  # type: ignore[attr-defined]
    except Exception as e:
        logger.exception("Hermes run failed")
        emit("error", {"code": "hermes_error", "message": str(e)})
        raise

    if isinstance(reply, dict):
        reply = reply.get("content") or reply.get("message") or str(reply)
    assistant_message = str(reply)

    emit("message", {"content": assistant_message, "final": True})

    return RunResult(assistant_message=assistant_message)


async def stream_chat(
    req: ChatRequest,
    settings: Settings,
    files: list[MaterializedFile],
) -> AsyncIterator[ProgressEvent | RunResult]:
    """Async generator: yields `ProgressEvent`s in real time, then a final `RunResult`.

    `main.py` consumes these and converts them to SSE events.
    """
    loop = asyncio.get_running_loop()
    queue: asyncio.Queue = asyncio.Queue(maxsize=256)

    future = loop.run_in_executor(
        _EXECUTOR,
        _run_chat_streaming_sync,
        req,
        settings,
        files,
        loop,
        queue,
    )

    # Relay queue → caller until the future resolves AND the queue is drained.
    while True:
        # Opportunistic drain before awaiting more: keeps latency low when
        # Hermes emits a burst of callbacks while we're blocked on queue.get().
        drained = 0
        while not queue.empty() and drained < 16:
            yield queue.get_nowait()
            drained += 1

        if future.done():
            # Drain remaining events then exit loop.
            while not queue.empty():
                yield queue.get_nowait()
            break

        try:
            ev = await asyncio.wait_for(queue.get(), timeout=0.25)
            yield ev
        except TimeoutError:
            continue

    # Surface any exception the sync body raised.
    result = await future
    yield result
