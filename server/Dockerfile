FROM python:3.11-slim

WORKDIR /app

# System deps (curl for healthcheck, gcc only if a wheel isn't available)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml ./
RUN pip install --no-cache-dir \
    "fastapi>=0.111" \
    "uvicorn[standard]>=0.30" \
    "sqlalchemy>=2.0" \
    "pydantic>=2.7" \
    "pydantic-settings>=2.3" \
    "python-ulid>=2.2"

COPY app ./app

# SQLite DB will live here; volume it in compose for persistence
ENV MLF_DATABASE_URL=sqlite:////data/mini_langfuse.db
VOLUME ["/data"]

EXPOSE 8000

HEALTHCHECK --interval=10s --timeout=3s --retries=5 \
    CMD curl -fsS http://localhost:8000/health || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
