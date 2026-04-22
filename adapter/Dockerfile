# Doc365 Hermes adapter — Python 3.11 + FastAPI + hermes-agent
FROM python:3.11-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Hermes runtime deps that its toolset often expects at runtime. Kept minimal.
RUN apt-get update && apt-get install -y --no-install-recommends \
      curl \
      git \
      build-essential \
      libffi-dev \
      libssl-dev \
      ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install uv (fast Python package manager).
RUN pip install --no-cache-dir "uv>=0.5.0"

# Copy metadata first so the layer cache survives source edits.
COPY pyproject.toml ./
COPY src ./src

# Install project + deps into system python (no venv in container).
RUN uv pip install --system --no-cache .

# Hermes home lives on a mounted volume (see docker-compose.yml).
RUN mkdir -p /hermes-data
ENV HERMES_HOME=/hermes-data

EXPOSE 8000

# --proxy-headers lets Caddy/load-balancer headers reach the app correctly.
CMD ["uvicorn", "adapter.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers"]
