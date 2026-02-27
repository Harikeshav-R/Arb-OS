# ── Stage 1: Dependencies ────────────────────────────────────────────────────
FROM python:3.13-slim AS deps
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

WORKDIR /app

COPY pyproject.toml uv.lock* ./
RUN uv sync --frozen --no-cache --no-dev

# ── Stage 2: Runtime ─────────────────────────────────────────────────────────
FROM python:3.13-slim AS runtime
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

RUN groupadd --gid 1000 brain && \
    useradd --uid 1000 --gid brain --shell /bin/sh --create-home brain

WORKDIR /app

# Copy pre-built virtualenv from deps stage
COPY --from=deps /app/.venv /app/.venv
COPY --from=deps /app/pyproject.toml /app/uv.lock* /app/

# Copy source
COPY --chown=brain:brain . .

USER brain

EXPOSE 8000

HEALTHCHECK --interval=10s --timeout=5s --start-period=15s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')"

CMD ["uv", "run", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
