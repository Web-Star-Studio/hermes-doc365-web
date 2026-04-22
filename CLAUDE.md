# CLAUDE.md — Doc365 Hermes Portal

Conventions for working in this repo. Read this before making changes.

## Architecture in one paragraph
Two sibling apps plus infra. `web/` is a **Next.js 15** (App Router, TypeScript strict) app that owns auth, Postgres, S3-compatible storage, UI, and audit. `adapter/` is a **FastAPI** service that wraps the open-source `hermes-agent` Python package and exposes a small HTTP API to `web/`. Infra is Docker Compose (postgres, minio, adapter, web, caddy). Read `doc365-hermes-portal-mvp-prd.md` for product scope.

## Key guardrails (PRD §14, §23)
- **Thin shell discipline.** The portal does NOT duplicate billing logic. Domain reasoning lives in Hermes, not in route handlers.
- **Portable / no vendor lock-in.** Postgres, S3-compatible (MinIO/R2/S3), Docker Compose, Caddy. No Supabase, Vercel-only, Clerk, or similar managed services.
- **Hard approval gates** for external side-effect actions (Orizon submit, resend, override). Audit every sensitive action.
- **pt-BR only** for v1 UI. All user-facing strings live in `web/src/lib/i18n/pt-BR.ts`.

## Repo layout
```
web/       Next.js app (auth, DB, files, UI, audit) — owns app state
adapter/   FastAPI service (Hermes wrapper) — stateless per request
infra/     docker-compose, Caddyfile, .env.example, seed.sql
scripts/   bootstrap.sh, seed-user.ts
```

## Running locally
```bash
cp infra/.env.example .env                  # once; fill secrets
./scripts/bootstrap.sh                      # brings up the stack, runs migrations, seeds a dev user
# → http://localhost (Caddy fronts web/ at :3000 and adapter/ at :8000)
```

## Package scripts (inside `web/`)
- `pnpm dev` — Next.js dev server
- `pnpm build` — production build
- `pnpm lint` / `pnpm typecheck` — static checks (must pass before commit)
- `pnpm db:generate` — regenerate Drizzle migrations after schema edits
- `pnpm db:migrate` — apply pending migrations
- `pnpm test` — unit tests (vitest)
- `pnpm e2e` — Playwright happy-path

## Adapter commands (inside `adapter/`)
- `uv run uvicorn adapter.main:app --reload --port 8000`
- `uv run ruff check .` / `uv run ruff format .`
- `uv run pytest`

## Commits & branches
- Trunk-based, small commits on `main` or short-lived feature branches.
- Commit subjects are imperative and scoped: `web: wire credentials login`, `adapter: stream step events`, `infra: add caddy sse route`.
- Never commit `.env` or any real secret. `.env.example` is the canonical list.

## Hermes integration
`AIAgent` from `run_agent.py` is **sync and not thread-safe across instances**. Always wrap calls in a `ThreadPoolExecutor` (max_workers=4 is plenty for MVP). One instance per request. Mirror the pattern from `acp_adapter/server.py` / `acp_adapter/events.py` in the hermes-agent repo.

## Adapter/web contract (HMAC-signed envelopes)
Next.js → adapter requests carry an `X-Doc365-Signature` HMAC-SHA256 of the request body, keyed on `ADAPTER_HMAC_SECRET`. Adapter verifies before handling. Auth.js session secret is NEVER shared with the adapter.

## Feature flags
- `ORIZON_SUBMIT_ENABLED` — default `false`. When off, the "Enviar para Orizon" button is disabled with a pt-BR tooltip. All other actions work.

## Out of scope (don't accidentally build)
Real Orizon RPA, OCR tuning, reconciliation engine, dashboards, payer-rule admin UI, multi-clinic enterprise org model, mobile apps, WhatsApp/Telegram, token-by-token streaming, mid-stream run cancellation.
