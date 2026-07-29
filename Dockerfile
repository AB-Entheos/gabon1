# syntax=docker/dockerfile:1.7
# HEC Fund backend image. Runs Django under gunicorn. Designed for use with
# docker-compose (which also provisions PostgreSQL and an object store).
ARG PYTHON_VERSION=3.13

FROM python:${PYTHON_VERSION}-slim-bookworm AS builder

ENV PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Build deps for psycopg + Pillow + celery + WeasyPrint
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
        build-essential \
        libpq-dev \
        libjpeg-dev \
        zlib1g-dev \
        libpango-1.0-0 \
        libpangocairo-1.0-0 \
        libgdk-pixbuf2.0-dev \
        libglib2.0-dev \
        libcairo2-dev \
        libffi-dev \
        curl \
 && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt ./requirements.txt
RUN pip install --upgrade pip \
 && pip install -r requirements.txt


FROM python:${PYTHON_VERSION}-slim-bookworm AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DJANGO_SETTINGS_MODULE=hec_fund.settings.prod \
    PORT=8000

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
        libpq5 \
        libjpeg62-turbo \
        zlib1g \
        libpango-1.0-0 \
        libpangocairo-1.0-0 \
        libgdk-pixbuf2.0-0 \
        libglib2.0-0 \
        libcairo2 \
        fontconfig \
        curl \
        netcat-openbsd \
        gosu \
 && rm -rf /var/lib/apt/lists/* \
 && gosu nobody true \
 && groupadd --system -g 1000 hec && useradd --system -u 1000 --gid hec --home /app hec

WORKDIR /app

COPY --from=builder /usr/local/lib/python3.13/site-packages /usr/local/lib/python3.13/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

# Project source
COPY backend/ /app/
COPY scripts/ /app/scripts/

# Static & media will be mounted from a volume in compose
RUN mkdir -p /app/staticfiles /app/media /app/files
RUN chown -R hec:hec /app

COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Do NOT set USER hec here — the entrypoint runs as root to fix
# bind-mount permissions, then drops to hec via gosu.

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=5 \
    CMD curl -fsS "http://127.0.0.1:${PORT}/api/v1/health" || exit 1

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["sh", "-c", "python manage.py migrate --noinput && python manage.py collectstatic --noinput && gunicorn hec_fund.wsgi:application --bind 0.0.0.0:${PORT} --workers ${GUNICORN_WORKERS:-3} --access-logfile - --timeout 120"]