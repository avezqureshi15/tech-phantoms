FROM python:3.12-slim AS build
COPY --from=ghcr.io/astral-sh/uv:0.12.3 /uv /usr/local/bin/uv
WORKDIR /build
COPY pyproject.toml uv.lock README.md ./
RUN UV_PROJECT_ENVIRONMENT=/opt/venv uv sync --locked --no-dev --no-install-project

FROM python:3.12-slim AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PYTHONPATH=/app/src VIRTUAL_ENV=/opt/venv PATH=/opt/venv/bin:$PATH
WORKDIR /app
COPY --from=build /opt/venv /opt/venv
COPY --chown=10001:10001 src ./src
COPY --chown=10001:10001 migrations ./migrations
COPY --chown=10001:10001 alembic.ini ./alembic.ini
USER 10001:10001
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD python -c "from urllib.request import urlopen; urlopen('http://127.0.0.1:8000/health/live', timeout=3)"
CMD ["uvicorn", "festiveos.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2", "--no-access-log"]
