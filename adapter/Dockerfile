# Doc365 Hermes adapter — Python 3.11 + FastAPI + hermes-agent + Playwright
FROM python:3.11-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Hermes + Playwright runtime deps.
RUN apt-get update && apt-get install -y --no-install-recommends \
      curl \
      git \
      build-essential \
      libffi-dev \
      libssl-dev \
      ca-certificates \
      # Playwright Chromium dependencies
      libnss3 \
      libatk1.0-0 \
      libatk-bridge2.0-0 \
      libcups2 \
      libdrm2 \
      libxkbcommon0 \
      libxcomposite1 \
      libxdamage1 \
      libxrandr2 \
      libgbm1 \
      libpango-1.0-0 \
      libcairo2 \
      libasound2 \
      libxshmfence1 \
 && rm -rf /var/lib/apt/lists/*

# Install Node.js 20 LTS + playwright-cli
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
 && apt-get install -y --no-install-recommends nodejs \
 && rm -rf /var/lib/apt/lists/* \
 && npm install -g playwright-cli \
 && npx playwright install chromium \
 && npx playwright install-deps chromium 2>/dev/null || true

WORKDIR /app

# Install uv (fast Python package manager).
RUN pip install --no-cache-dir "uv>=0.5.0"

# Copy metadata first so the layer cache survives source edits.
# README.md is referenced by pyproject.toml's `readme = "README.md"` and is
# required by hatchling during metadata validation, so it must be present.
COPY pyproject.toml README.md ./
COPY src ./src

# Install project + deps into system python (no venv in container).
RUN uv pip install --system --no-cache .

# Hermes home lives on a mounted volume (see docker-compose.yml).
RUN mkdir -p /hermes-data
ENV HERMES_HOME=/hermes-data

EXPOSE 8000

# --proxy-headers lets Caddy/load-balancer headers reach the app correctly.
CMD ["uvicorn", "adapter.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers"]
