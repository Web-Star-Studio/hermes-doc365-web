# adapter/ — Doc365 Hermes Adapter

FastAPI service that wraps the open-source [Hermes Agent](https://github.com/NousResearch/hermes-agent) Python library and exposes a small HTTP contract for the `web/` Next.js app.

## Responsibilities

- Verify HMAC-signed envelopes from `web/`
- Package the Hermes context (conversation history + files + action origin)
- Run `AIAgent` inside a `ThreadPoolExecutor` (AIAgent is sync + not thread-safe)
- Stream step/tool/message events back as SSE
- Stateless per request — no session memory; `web/` is source of truth

## Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `GET`  | `/healthz` | Liveness probe |
| `POST` | `/chat` | Run one Hermes turn (Phase 1: single JSON response; Phase 2: SSE) |

## Local run

```bash
cd adapter
uv sync --extra dev
uv run uvicorn adapter.main:app --reload --port 8000
```

## Env vars

See `../infra/.env.example` under the "Adapter contract" and "Hermes" sections.
