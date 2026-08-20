FROM python:3.11-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

RUN apt-get update \
    && apt-get install --no-install-recommends -y libgl1 libglib2.0-0 libzbar0 fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml README.md ./
COPY src ./src
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --upgrade pip && pip install .

RUN addgroup --system smartgate && adduser --system --ingroup smartgate smartgate \
    && chown -R smartgate:smartgate /app
USER smartgate

EXPOSE 8000
CMD ["uvicorn", "smart_gate.main:app", "--host", "0.0.0.0", "--port", "8000"]
