"""Runs Hermes' `AIAgent` safely from async FastAPI handlers.

Design notes (see `hermes-portal-integration-guide.md` §7):
- `AIAgent` is synchronous and NOT thread-safe across instances.
- One fresh instance per request. Wrap the sync call in a bounded ThreadPool
  (max_workers=4 is plenty for MVP; bump later if load justifies it).
- The portal DB (Postgres) is the authoritative source of truth for
  conversations, files, and approvals. Hermes runs stateless per turn:
  `persist_session=False`, `session_id=conversation_id` (used only for logging),
  and history is re-sent in each envelope.
- Construct `AIAgent` with explicit kwargs — no reliance on implicit defaults.
- Import `AIAgent` lazily so that unit tests and `--help` invocations do not
  require Hermes to be installed.
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import AsyncIterator, Callable
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from typing import Any

from .config import Settings
from .envelope import ChatRequest
from .files import MaterializedFile

logger = logging.getLogger(__name__)

_EXECUTOR = ThreadPoolExecutor(max_workers=4, thread_name_prefix="hermes")

_HERMES_MISSING_MESSAGE = (
    "O Hermes não está configurado neste ambiente (módulo "
    "`hermes-agent` ausente). Instale `hermes-agent` e configure "
    "HERMES_API_KEY para habilitar respostas reais."
)


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


# ── Prompt / history helpers ────────────────────────────────────────────


def _build_system_prompt(req: ChatRequest, files: list[MaterializedFile], settings: Settings | None = None) -> str:
    """Build the full persona-enriched system prompt.

    Uses the persona module to inject domain knowledge, memory, Orizon automation
    patterns, and Playwright/browserbase context — making this adapter's Hermes
    a true clone of the operator's primary agent.

    Falls back to minimal prompt if settings.hermes_persona_enabled is False.
    """
    # Build files context block
    files_block = ""
    if files:
        lines = [
            "Arquivos disponíveis para análise (caminhos locais — use as ferramentas apropriadas para ler):"
        ]
        for f in files:
            lines.append(
                f"- {f.original_name} ({f.mime_type}, {f.size_bytes} bytes) → {f.local_path}"
            )
        files_block = "\n".join(lines)

    # Check if persona is enabled (default True if settings not provided)
    if settings is not None and not settings.hermes_persona_enabled:
        # Minimal prompt (original behavior)
        return _build_minimal_prompt(req, files_block)

    from .persona import build_persona_system_prompt

    return build_persona_system_prompt(
        files_context=files_block,
        action_origin=req.action_origin,
        approval_state=req.approval_state,
    )


def _build_minimal_prompt(req: ChatRequest, files_block: str) -> str:
    """Minimal system prompt (original behavior, no domain knowledge injection)."""
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
    if files_block:
        lines.append(files_block)
    return "\n".join(lines)


def _history_to_hermes(history: list[Any]) -> list[dict[str, str]]:
    """Convert our `HistoryMessage` list to Hermes' expected shape
    (Chat Completions style with `role` / `content`).
    """
    role_map = {"user": "user", "assistant": "assistant", "system": "system"}
    return [{"role": role_map.get(h.sender, "user"), "content": h.content} for h in history]


def _normalize_reply(reply: Any) -> str:
    """Flatten whatever `AIAgent.run_conversation`/`chat` returns into a string.

    `run_conversation` returns a dict like:
        {"final_response": str | None, "messages": [...], "api_calls": int,
         "completed": bool, "failed"?: bool, "error"?: str,
         "interrupted"?: bool, "partial"?: bool}
    `chat` returns the `final_response` string directly.

    If the run failed or was interrupted and `final_response` is empty, surface
    the `error` field so the caller sees something actionable instead of "".
    """
    if isinstance(reply, dict):
        final = reply.get("final_response")
        if final:
            return str(final)
        # Back-compat with older/alt shapes.
        alt = reply.get("content") or reply.get("message")
        if alt:
            return str(alt)
        err = reply.get("error")
        if err:
            return f"Falha ao executar o Hermes: {err}"
        return ""
    return str(reply) if reply is not None else ""


# ── Agent construction ──────────────────────────────────────────────────


def _build_agent(
    req: ChatRequest,
    settings: Settings,
    files: list[MaterializedFile],
    *,
    step_cb: Callable | None = None,
    tool_progress_cb: Callable | None = None,
):
    """Instantiate `AIAgent` with explicit, deterministic configuration.

    Raises ImportError with a pt-BR message if the `hermes-agent` package is
    not installed — the caller converts this into a friendly chat reply.
    """
    try:
        from run_agent import AIAgent  # type: ignore[import-not-found]
    except Exception as e:  # pragma: no cover — depends on env
        logger.error("hermes-agent not importable: %s", e)
        raise ImportError(_HERMES_MISSING_MESSAGE) from e

    return AIAgent(
        provider=settings.hermes_model_provider or None,
        api_key=settings.hermes_api_key or None,
        model=settings.hermes_model,
        base_url=settings.hermes_base_url or None,
        api_mode=settings.hermes_api_mode or None,
        max_iterations=settings.hermes_max_iterations,
        enabled_toolsets=settings.hermes_enabled_toolsets,
        disabled_toolsets=settings.hermes_disabled_toolsets,
        quiet_mode=True,
        verbose_logging=False,
        save_trajectories=False,
        ephemeral_system_prompt=_build_system_prompt(req, files, settings),
        session_id=req.conversation_id,
        platform="api_server",
        persist_session=False,
        # skip_context_files + skip_memory = True: the embedded/FastAPI pattern
        # per Hermes' python-library guide. The portal is multi-clinic; we never
        # want SOUL.md / AGENTS.md / Hermes' global memory leaking across
        # tenants. The portal DB is the sole source of conversation context.
        skip_context_files=True,
        skip_memory=True,
        step_callback=step_cb,
        tool_progress_callback=tool_progress_cb,
    )


def _invoke_agent(
    agent: Any,
    user_text: str,
    history: list[dict[str, str]],
    system_prompt: str,
) -> Any:
    """Run one turn. Prefer `run_conversation` (exercises progress callbacks);
    fall back to `chat` for older AIAgent surfaces.
    """
    run_conv = getattr(agent, "run_conversation", None)
    if callable(run_conv):
        return run_conv(
            user_message=user_text,
            conversation_history=history,
            system_message=system_prompt,
        )
    return agent.chat(user_text)


# ── Non-streaming path (Phase 1 retained for tests / diagnostics) ───────


def _run_chat_sync(
    req: ChatRequest, settings: Settings, files: list[MaterializedFile]
) -> RunResult:
    """Blocking path that instantiates `AIAgent` and returns its reply."""
    try:
        agent = _build_agent(req, settings, files)
    except ImportError as e:
        return RunResult(assistant_message=str(e))

    system_prompt = _build_system_prompt(req, files, settings)
    history = _history_to_hermes(req.history)
    reply = _invoke_agent(agent, req.user_message or "", history, system_prompt)
    return RunResult(assistant_message=_normalize_reply(reply))


async def run_chat(
    req: ChatRequest,
    settings: Settings,
    files: list[MaterializedFile],
) -> RunResult:
    """Async wrapper — schedules the sync call in the shared executor."""
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(_EXECUTOR, _run_chat_sync, req, settings, files)


# ── Streaming path ──────────────────────────────────────────────────────


def _make_tool_progress_cb(emit: Callable[[str, dict[str, Any]], None]) -> Callable:
    """Build a `tool_progress_callback` that tolerates both call shapes.

    Hermes invokes this positionally inside `run_agent.py` with
    `(event_type, tool_name, args_preview, args, **kwargs)` (see ~line 7452).
    The adapter's earlier draft declared keyword-only parameters, which would
    raise TypeError on real calls. We accept *args/**kwargs and normalize into
    the `{tool, status, text, metadata}` dict that main.py/SSE expects.
    """

    def cb(*args: Any, **kwargs: Any) -> None:
        # kwargs-shape (our own tests, or future Hermes versions):
        #   cb(tool_name, status=..., text=..., metadata=...)
        if args and kwargs and "status" in kwargs:
            tool_name = args[0]
            data: dict[str, Any] = {
                "tool": str(tool_name),
                "status": str(kwargs.get("status", "running")),
            }
            if kwargs.get("text") is not None:
                data["text"] = str(kwargs["text"])
            if kwargs.get("metadata") is not None:
                data["metadata"] = kwargs["metadata"]
            emit("tool_progress", data)
            return

        # Positional-shape (current Hermes internal call):
        #   cb(event_type, tool_name, args_preview, args, duration=..., is_error=...)
        if not args:
            return
        event_type = str(args[0]) if len(args) > 0 else ""
        tool_name = str(args[1]) if len(args) > 1 else ""
        preview = args[2] if len(args) > 2 else None
        tool_args = args[3] if len(args) > 3 else None

        status = "running"
        if event_type.endswith(".completed") or kwargs.get("is_error") is False:
            status = "completed"
        elif event_type.endswith(".error") or kwargs.get("is_error") is True:
            status = "error"
        elif event_type.endswith(".started"):
            status = "running"

        data = {"tool": tool_name, "status": status}
        if preview is not None:
            data["text"] = str(preview)
        metadata: dict[str, Any] = {}
        if tool_args is not None:
            metadata["args"] = tool_args
        if "duration" in kwargs:
            metadata["duration"] = kwargs["duration"]
        if event_type:
            metadata["event"] = event_type
        if metadata:
            data["metadata"] = metadata
        emit("tool_progress", data)

    return cb


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

    step_counter = {"n": 0}

    def step_cb(*args: Any, **kwargs: Any) -> None:
        step_counter["n"] += 1
        # Hermes calls step_callback(api_call_count, prev_tools). We just relay
        # a monotonic step index + a short human description.
        description = (
            f"API call {args[0]}" if args and isinstance(args[0], int) else "Executando Hermes"
        )
        emit("step", {"description": description, "step_index": step_counter["n"]})

    tool_progress_cb = _make_tool_progress_cb(emit)

    try:
        agent = _build_agent(
            req,
            settings,
            files,
            step_cb=step_cb,
            tool_progress_cb=tool_progress_cb,
        )
    except ImportError as e:
        fallback = str(e)
        emit("message", {"content": fallback, "final": True})
        return RunResult(assistant_message=fallback)

    emit("step", {"description": "Consultando o modelo Hermes."})

    system_prompt = _build_system_prompt(req, files, settings)
    history = _history_to_hermes(req.history)

    try:
        reply = _invoke_agent(agent, req.user_message or "", history, system_prompt)
    except Exception as e:
        logger.exception("Hermes run failed")
        emit("error", {"code": "hermes_error", "message": str(e)})
        raise

    assistant_message = _normalize_reply(reply)
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

    while True:
        drained = 0
        while not queue.empty() and drained < 16:
            yield queue.get_nowait()
            drained += 1

        if future.done():
            while not queue.empty():
                yield queue.get_nowait()
            break

        try:
            ev = await asyncio.wait_for(queue.get(), timeout=0.25)
            yield ev
        except TimeoutError:
            continue

    result = await future
    yield result
