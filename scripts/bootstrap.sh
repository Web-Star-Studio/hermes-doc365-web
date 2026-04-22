#!/usr/bin/env bash
# Doc365 Hermes Portal — one-shot dev bootstrap.
#
# What it does:
#   1. Ensures `.env` exists at repo root (seeded from infra/.env.example).
#   2. Brings up the compose stack (postgres, minio, adapter, web, caddy).
#   3. Waits for postgres to be healthy.
#   4. Applies Drizzle migrations.
#   5. Seeds a dev user (dev@doc365.local / doc365dev, role=user).
#   6. Prints the URL to open.
#
# Idempotent — safe to re-run.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

step() { printf "\n\033[1;36m[bootstrap]\033[0m %s\n" "$*"; }
warn() { printf "\033[1;33m[bootstrap]\033[0m %s\n" "$*"; }
die()  { printf "\033[1;31m[bootstrap]\033[0m %s\n" "$*" >&2; exit 1; }

# ── 1. .env ────────────────────────────────────────────────────────────
if [ ! -f .env ]; then
  step "Creating .env from infra/.env.example"
  cp infra/.env.example .env
  warn "Generated .env — edit HERMES_API_KEY and the two secrets before going live."
  # Seed random secrets so local dev works without manual editing.
  if command -v openssl >/dev/null 2>&1; then
    AUTH_SECRET=$(openssl rand -base64 32 | tr -d '\n')
    HMAC_SECRET=$(openssl rand -hex 32 | tr -d '\n')
    # BSD sed vs GNU sed portability: use a tempfile.
    sed "s|^AUTH_SECRET=.*|AUTH_SECRET=${AUTH_SECRET}|" .env > .env.tmp && mv .env.tmp .env
    sed "s|^ADAPTER_HMAC_SECRET=.*|ADAPTER_HMAC_SECRET=${HMAC_SECRET}|" .env > .env.tmp && mv .env.tmp .env
    step "Randomised AUTH_SECRET and ADAPTER_HMAC_SECRET in .env"
  fi
else
  step "Reusing existing .env"
fi

# ── 2. Compose up ──────────────────────────────────────────────────────
command -v docker >/dev/null 2>&1 || die "docker not found on PATH"
command -v docker compose >/dev/null 2>&1 || true
step "Starting compose stack (this can take a minute the first time)"
docker compose -f infra/docker-compose.yml --env-file .env up -d --build postgres minio createbuckets

# ── 3. Wait for postgres ───────────────────────────────────────────────
step "Waiting for postgres to be healthy"
# shellcheck disable=SC2046
for i in $(seq 1 60); do
  status=$(docker inspect -f '{{.State.Health.Status}}' "$(docker compose -f infra/docker-compose.yml ps -q postgres)" 2>/dev/null || echo "starting")
  if [ "$status" = "healthy" ]; then
    break
  fi
  sleep 1
  if [ "$i" = "60" ]; then
    die "postgres never became healthy — check 'docker compose logs postgres'"
  fi
done

# ── 4. Migrations ──────────────────────────────────────────────────────
step "Applying migrations"
pushd web >/dev/null
if [ ! -d node_modules ]; then
  step "Installing web/ deps (first time)"
  pnpm install --frozen-lockfile || pnpm install
fi
# Host-mapped port; migrator runs outside the compose network.
DATABASE_URL="postgres://doc365:doc365dev@localhost:5432/doc365" pnpm db:migrate
popd >/dev/null

# ── 5. Seed user ───────────────────────────────────────────────────────
step "Seeding dev user"
DATABASE_URL="postgres://doc365:doc365dev@localhost:5432/doc365" \
  pnpm -C web seed:user

# ── 6. Bring up adapter + web + caddy ──────────────────────────────────
step "Starting adapter + web + caddy"
docker compose -f infra/docker-compose.yml --env-file .env up -d --build adapter web caddy

# ── 7. Outro ───────────────────────────────────────────────────────────
cat <<'EOF'

───────────────────────────────────────────────
  Doc365 Hermes is up.

  Web         http://localhost/         (Caddy)
              http://localhost:3000/    (direct)
  Adapter     http://localhost:8000/healthz
  MinIO UI    http://localhost:9001/    (doc365 / doc365dev)

  Login       dev@doc365.local / doc365dev

  Tail logs   docker compose -f infra/docker-compose.yml logs -f
  Stop        docker compose -f infra/docker-compose.yml down
───────────────────────────────────────────────

EOF
