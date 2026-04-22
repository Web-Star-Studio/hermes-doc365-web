# Doc365 Hermes Portal

A portable, self-hostable web portal that wraps the open-source **[Hermes Agent](https://github.com/NousResearch/hermes-agent)** to help Brazilian healthcare billing users upload files, ask questions in plain Portuguese, detect pendências, validate submissions, and approve external actions (e.g. Orizon) with a strong confirmation and audit trail.

Product scope is defined in `doc365-hermes-portal-mvp-prd.md`. Conventions for this repo are in `CLAUDE.md`.

## Architecture

```
         ┌──────────────┐
         │   Caddy      │   reverse proxy, TLS-optional, SSE-safe
         └───┬────────┬─┘
             │        │
             ▼        ▼
   ┌───────────────┐  ┌────────────────────┐
   │  web (Next.js)│  │ adapter (FastAPI)  │
   │  App Router   │──► AIAgent (Hermes)   │
   │  Auth.js      │  │ in-process, pooled │
   │  Drizzle      │  └────────────────────┘
   └───┬────────┬──┘
       │        │
       ▼        ▼
   ┌─────────┐ ┌──────────┐
   │ Postgres│ │  MinIO   │
   │  (DB)   │ │ (S3 API) │
   └─────────┘ └──────────┘
```

- **web/** owns Postgres data, S3 file storage, auth, UI, and audit.
- **adapter/** is stateless per request; it wraps Hermes and streams responses back as SSE.
- Envelopes between web ↔ adapter are HMAC-signed with `ADAPTER_HMAC_SECRET`.

## Quick start

Requires Docker + Docker Compose.

```bash
cp infra/.env.example .env            # fill in secrets
./scripts/bootstrap.sh                # up the stack + migrate + seed dev user
open http://localhost                 # pt-BR login page
```

Dev user (seeded): `dev@doc365.local` / `doc365dev`.

## Repo layout

| Path | Purpose |
|------|---------|
| `web/` | Next.js 15 app — auth, DB, UI, file storage, audit |
| `adapter/` | FastAPI service — Hermes adapter, stateless, SSE |
| `infra/` | Docker Compose, Caddyfile, `.env.example`, SQL seed |
| `scripts/` | `bootstrap.sh`, `seed-user.ts` |
| `doc365-hermes-portal-mvp-prd.md` | Authoritative product scope |
| `CLAUDE.md` | Contributor conventions |

## License

Internal — Doc365.
