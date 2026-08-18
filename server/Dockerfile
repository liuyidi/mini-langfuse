FROM docker.m.daocloud.io/library/python:3.11-slim

WORKDIR /app

# Use Aliyun Debian mirror (deb.debian.org is often unreachable from CN mainland)
RUN set -eux; \
    if [ -f /etc/apt/sources.list.d/debian.sources ]; then \
      sed -i 's/deb.debian.org/mirrors.aliyun.com/g' /etc/apt/sources.list.d/debian.sources; \
      sed -i 's/security.debian.org/mirrors.aliyun.com/g' /etc/apt/sources.list.d/debian.sources; \
    fi; \
    if [ -f /etc/apt/sources.list ]; then \
      sed -i 's/deb.debian.org/mirrors.aliyun.com/g' /etc/apt/sources.list; \
      sed -i 's/security.debian.org/mirrors.aliyun.com/g' /etc/apt/sources.list; \
    fi; \
    apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

# Install deps from pyproject (keeps bcrypt/httpx/etc in sync)
COPY pyproject.toml ./
RUN pip install --no-cache-dir -i https://mirrors.aliyun.com/pypi/simple/ --trusted-host mirrors.aliyun.com \
    "fastapi>=0.111" \
    "uvicorn[standard]>=0.30" \
    "sqlalchemy>=2.0" \
    "pydantic[email]>=2.7" \
    "pydantic-settings>=2.3" \
    "python-ulid>=2.2" \
    "alembic>=1.13" \
    "psycopg[binary]>=3.1" \
    "bcrypt>=4.1" \
    "httpx>=0.27"

COPY app ./app
COPY alembic.ini ./alembic.ini
COPY alembic ./alembic

# Default to SQLite for local dev; override in docker-compose
ENV MLF_DATABASE_URL=sqlite:////data/mini_langfuse.db
VOLUME ["/data"]

EXPOSE 8000

HEALTHCHECK --interval=10s --timeout=3s --retries=5 \
    CMD curl -fsS http://localhost:8000/health || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
