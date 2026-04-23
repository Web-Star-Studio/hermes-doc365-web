#!/usr/bin/env bash
# Doc365 Hermes Portal — in-place update.
#
# Use this when you changed code or migrations and want the VPS to pick up
# the new version WITHOUT resetting Postgres/MinIO data or re-seeding the
# dev user.
#
# What it does:
#   1. git pull (only if working tree is clean; skip with --skip-pull)
#   2. Sources .env so `docker compose` interpolates cleanly, no warnings
#   3. Applies any new Drizzle migrations (idempotent; skip with SKIP_MIGRATE=1)
#   4. Rebuilds + recreates only web + adapter containers
#   5. Waits for both to come back healthy
#
# What it does NOT do: touch volumes, reseed the dev user, reset passwords,
# run the smoke test, restart postgres/minio/caddy.
#
# Usage:
#   ./scripts/update.sh
#   ./scripts/update.sh --skip-pull        # apply only local edits, no git
#   SKIP_MIGRATE=1 ./scripts/update.sh     # skip migrations

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

step() { printf "\n\033[1;36m[update]\033[0m %s\n" "$*"; }
warn() { printf "\033[1;33m[update]\033[0m %s\n" "$*"; }
die()  { printf "\033[1;31m[update]\033[0m %s\n" "$*" >&2; exit 1; }

SKIP_PULL=false
[ "${1:-}" = "--skip-pull" ] && SKIP_PULL=true

# ── 1. .env sanity + source ────────────────────────────────────────────
[ -f .env ] || die ".env not found at repo root — run scripts/bootstrap.sh first"
set -a
# shellcheck disable=SC1091
. ./.env
set +a

command -v docker >/dev/null 2>&1 || die "docker not found on PATH"
command -v pnpm   >/dev/null 2>&1 || die "pnpm not found on PATH"

# ── 2. Git pull (optional, refuses on dirty tree) ──────────────────────
if [ "$SKIP_PULL" = "true" ]; then
  step "Skipping git pull (--skip-pull)"
elif ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  warn "Not a git checkout — skipping pull"
elif [ -n "$(git status --porcelain)" ]; then
  warn "Working tree is dirty — skipping pull. Commit/stash first or rerun with --skip-pull."
else
  step "git pull --ff-only"
  git pull --ff-only || warn "git pull failed — continuing with current checkout"
fi

# ── 3. Migrations (Drizzle skips already-applied files) ────────────────
if [ "${SKIP_MIGRATE:-0}" = "1" ]; then
  step "Skipping migrations (SKIP_MIGRATE=1)"
else
  step "Applying migrations (idempotent)"
  if [ ! -d web/node_modules ]; then
    step "web/node_modules missing — running pnpm install --prod=false"
    pnpm -C web install --prod=false --frozen-lockfile || pnpm -C web install --prod=false
  fi
  HOST_DATABASE_URL="postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:5432/${POSTGRES_DB}"
  DATABASE_URL="$HOST_DATABASE_URL" pnpm -C web db:migrate
fi

# ── 4. Rebuild web + adapter, preserve everything else ─────────────────
step "Rebuilding web + adapter images and recreating containers"
docker compose -f infra/docker-compose.yml --env-file .env up -d --build web adapter

# ── 5. Wait for health ─────────────────────────────────────────────────
step "Waiting for health checks"
ok_web=false
ok_adapter=false
for _ in $(seq 1 30); do
  curl -sf http://localhost:8000/healthz    >/dev/null 2>&1 && ok_adapter=true
  curl -sf http://localhost:3000/api/health >/dev/null 2>&1 && ok_web=true
  [ "$ok_web" = "true" ] && [ "$ok_adapter" = "true" ] && break
  sleep 1
done

if [ "$ok_web" = "true" ] && [ "$ok_adapter" = "true" ]; then
  step "Update complete — web + adapter are healthy ✓"
else
  warn "Health check timed out. Status:"
  [ "$ok_web" = "true" ]     || warn "  web:     NOT responding on :3000"
  [ "$ok_adapter" = "true" ] || warn "  adapter: NOT responding on :8000"
  warn "Inspect logs: docker compose -f infra/docker-compose.yml logs -f --tail=50 web adapter"
  exit 1
fi
