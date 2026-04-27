FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        build-essential curl libpq-dev postgresql-client \
        libpango-1.0-0 libpangoft2-1.0-0 libharfbuzz0b \
        libcairo2 libffi-dev \
        libxml2 libxslt1.1 shared-mime-info fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir --upgrade pip setuptools wheel

# ── Layer 1: FastAPI web stack ────────────────────────────────────────────────
RUN pip install --no-cache-dir \
    "fastapi==0.111.0" \
    "uvicorn==0.29.0" \
    "SQLAlchemy==2.0.30" \
    "asyncpg==0.29.0" \
    "alembic==1.13.1" \
    "pyjwt==2.8.0" \
    "passlib[bcrypt]==1.7.4" \
    "bcrypt==4.0.1" \
    "casbin==1.36.0" \
    "pydantic==2.7.4" \
    "pydantic-settings==2.2.1" \
    "python-dotenv==1.0.1"

# ── Layer 2: Storage / queuing / monitoring ───────────────────────────────────
RUN pip install --no-cache-dir \
    "minio==7.2.7" \
    "hvac==2.1.0" \
    "prometheus-fastapi-instrumentator==7.0.0" \
    "elasticsearch==8.13.0" \
    "celery[redis]==5.4.0" \
    "requests==2.32.3" \
    "websockets==12.0"

# ── Layer 3: Data collection / scraping ──────────────────────────────────────
RUN pip install --no-cache-dir \
    "feedparser==6.0.11" \
    "beautifulsoup4==4.12.3" \
    "lxml[html_clean]==5.2.2"

# newspaper4k installed after lxml to avoid sub-resolver conflicts
RUN pip install --no-cache-dir "newspaper4k==0.9.3.1"

# ── Layer 4: PyTorch CPU-only (heavy, isolated for Docker cache efficiency) ───
RUN pip install --no-cache-dir \
    "torch==2.2.2" \
    --index-url https://download.pytorch.org/whl/cpu

# ── Layer 5: Core ML / NLP ────────────────────────────────────────────────────
RUN pip install --no-cache-dir \
    "numpy==1.26.4" \
    "scikit-learn==1.4.2" \
    "spacy==3.7.4"

# transformers installed alone: it pulls huggingface-hub + tokenizers (Rust)
RUN pip install --no-cache-dir "transformers==4.40.1"

# ── Layer 6: LangChain (most complex dep graph — fully isolated) ──────────────
RUN pip install --no-cache-dir "langchain==0.2.6"
RUN pip install --no-cache-dir "langchain-community==0.2.6"

# ── Layer 7: Report generation ────────────────────────────────────────────────
RUN pip install --no-cache-dir "weasyprint==60.2" "pydyf==0.8.0" "jinja2==3.1.4"

# ── Layer 8: Sigma rule engine ────────────────────────────────────────────────
RUN pip install --no-cache-dir \
    "pySigma==0.11.17" \
    "pySigma-backend-elasticsearch==1.1.2"

# ── Layer 9: Test dependencies ────────────────────────────────────────────────
RUN pip install --no-cache-dir \
    "pytest==8.2.2" \
    "pytest-asyncio==0.23.7" \
    "httpx==0.27.0" \
    "pytest-mock==3.14.0"

# ── spaCy model — direct wheel install (avoids malformed URL from `spacy download`) ──
RUN pip install --no-cache-dir \
    "https://github.com/explosion/spacy-models/releases/download/en_core_web_sm-3.7.1/en_core_web_sm-3.7.1-py3-none-any.whl"

COPY backend ./backend
COPY scripts ./scripts
COPY sigma_rules ./sigma_rules

EXPOSE 8000

CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
