FROM node:24-bookworm-slim AS canvas-runtime
WORKDIR /agent-runtime
COPY agent-runtime/package.json agent-runtime/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY agent-runtime/canvas.mjs ./

FROM python:3.12-slim
COPY --from=canvas-runtime /usr/local/bin/node /usr/local/bin/node
COPY --from=ghcr.io/astral-sh/uv:0.11.2 /uv /usr/local/bin/uv
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev
COPY app ./app
COPY --from=canvas-runtime /agent-runtime /app/agent-runtime
COPY alembic.ini ./
COPY migrations ./migrations
RUN useradd --uid 10001 --create-home elren && mkdir -p /app/data/assets && chown -R elren:elren /app/data
USER elren
ENV PATH="/app/.venv/bin:$PATH"
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
