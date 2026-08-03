FROM python:3.11-slim

WORKDIR /app

COPY pyproject.toml README.md ./
COPY mini_langfuse_worker ./mini_langfuse_worker

RUN pip install --no-cache-dir .

CMD ["python", "-m", "mini_langfuse_worker"]

