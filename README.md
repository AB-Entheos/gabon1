# HEC Emergency Fund

Digital approval pipeline for human–elephant conflict (HEC) compensation claims in Gabon.

- **Backend**: Django 5 + DRF + SimpleJWT + django-otp + Celery + Redis
- **Frontend**: React 18 + TypeScript + Vite + Redux Toolkit + RTK Query + Tailwind + shadcn/ui
- **Database**: PostgreSQL 16 (prod) / SQLite (dev)
- **Object store**: S3-compatible (MinIO local · Wasabi prod)
- **Locales**: `en`, `fr` (bilingual, default `fr`)
- **Currency**: XAF (FCFA)
- **Style**: WildCover-inspired — dark dense dashboard, olive/orange earth palette, soft chip variant, dashed dividers, frosted header

See `hec-master.md` for the full specification.

## Quick start (Docker)

```bash
cp .env.example .env       # fill in DB_PASSWORD, SECRET_KEY, etc.
docker compose up --build  # backend, db, redis, celery, nginx-front
```

The backend exposes `<http://localhost:8000>` the frontend `<http://localhost:3001>` (nginx).

## Quick start (local dev)

```bash
cd backend
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt
.venv/Scripts/python manage.py migrate
.venv/Scripts/python manage.py seed_demo_data
.venv/Scripts/python manage.py runserver 0.0.0.0:8000

cd ../frontend
npm install
npx vite --port 3001
```

See `docs/process_flow.md` for the Mermaid diagram, `docs/user_and_claims_journey.md` for the API flows, and `docs/production_database.md` for the production setup.

---

## Case types

| Code | Label (en / fr) | Default ceiling (XAF) | SLA | First-aid eligible |
| --- | --- | --- | --- | --- |
| `MEDICAL` | Medical (injury) / Médical (blessure) | 2,000,000 | 48 h | yes (urgent) |
| `BURIAL` | Burial (death) / Funéraire (décès) | 3,000,000 | 72 h | no |
| `CROP_DAMAGE` | Crop damage / Dégâts aux cultures | 400,000 | 7 d | no |

CROP_DAMAGE covers elephant raids on subsistence fields (cassava, plantain, maize,
groundnut, cocoyam). The CB must attach a photo of the damage and report the
estimated area and loss (capped at the 400 000 XAF ceiling).

---

## FormDefinitions — why they exist

`FormDefinition` (`backend/forms/models.py`) is a **versioned, JSON-schema-driven
form blueprint**:

| Column | Purpose |
| --- | --- |
| `slug` + `version` | Unique together. Every published form is a new row; old versions stay queryable. |
| `schema` (JSONB) | Fields, types, validation, **bilingual labels** `{en, fr}`, and conditional logic (`show_when`, `required_when`). |
| `role_scope` | Comma-separated roles allowed to fill it (`CB`, `CB,AB`, …). |
| `status` | `DRAFT \| PUBLISHED \| ARCHIVED`. |

**Why it exists.** The system needs to evolve incident forms (CB), verification
forms (AB), first-aid attestation forms (DGFAP) and proof-of-payment forms
(admin) **without** database migrations. Adding a form = inserting one row. The
same `FormRenderer` component drives every screen, so the bilingual JSONB
validates **server-side** via `jsonschema` and **client-side** in
`FormRenderer.tsx`. Each `FormSubmission` records which `FormDefinition` +
`version` it was filed under — the audit log can replay submissions exactly as
filed, even after the schema evolves. Conditional fields (`show_when` /
`required_when`) let one schema adapt to MEDICAL / BURIAL / CROP_DAMAGE
without forking files.

---

## Quick start

### Backend (dev)

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate          # Windows
# source .venv/bin/activate     # macOS / Linux
pip install -r requirements.txt
cp ../.env.example .env
python manage.py migrate
python manage.py seed_demo_data
python manage.py runserver
```

Health check: <http://localhost:8000/health>

Demo accounts (password `HEC-Dev-2026!`):

| Email | Role | Lang | 2FA |
| --- | --- | --- | --- |
| `cb@hec.local` | CB | fr | no |
| `ab@hec.local` | AB Entheos | fr | yes |
| `wcs@hec.local` | WCS | fr | yes |
| `dgfc@hec.local` | DGFC | fr | yes |
| `dgfap@hec.local` | DGFAP (amount-decider) | fr | yes |
| `minister@hec.local` | Minister (terminal) | fr | yes |
| `admin@hec.local` | Admin | en | yes |

### Frontend (dev)

```bash
cd frontend
bun install
bun run dev
```

App: <http://localhost:5173>

---

## Build phases

| # | Phase | Status |
| --- | --- | --- |
| 0 | Skeleton — Django + Vite + i18n + /health | ✅ done |
| 1 | Auth + 2FA + seed users | ✅ done |
| 2 | Cases + state machine + immutability trigger + HMAC | ✅ done |
| 3 | Forms (JSONB, bilingual, jsonschema) | ✅ done |
| 4 | S3 uploads (presigned PUT, sha256) | ✅ done |
| 5 | React shell (7 dashboards + RTK Query + RoleGate) | ✅ done |
| 6 | FormRenderer + SignaturePad + FileUploader | ✅ done |
| 7 | PWA (offline IndexedDB queue + camera) | ✅ done |
| 8 | Celery (bilingual email + Telegram + DLQ) | ✅ done |
| 9 | Audit + quarterly/annual PDF+XLSX | ✅ done |
| 10 | Harden + deploy (Nginx, systemd, pg_dump, DPIA) | ✅ done |
| 11 | Payments rail (first-aid + CSV + mobile money + confirm) | ✅ done |

---

## Production deploy (Ubuntu 22.04 VPS)

```bash
# 1. One-time setup
sudo apt update && sudo apt install -y python3.13-venv nginx postgresql redis-server
sudo systemctl enable --now postgresql redis-server nginx

# 2. Clone + venv
sudo mkdir -p /opt/hec && sudo chown $USER /opt/hec
git clone <repo> /opt/hec && cd /opt/hec
cd backend && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
cd ../frontend && bun install && bun run build

# 3. Migrate + seed
cd /opt/hec/backend
DJANGO_SETTINGS_MODULE=hec_fund.settings.prod .venv/bin/python manage.py migrate
DJANGO_SETTINGS_MODULE=hec_fund.settings.prod .venv/bin/python manage.py compilemessages
DJANGO_SETTINGS_MODULE=hec_fund.settings.prod .venv/bin/python manage.py collectstatic --noinput
DJANGO_SETTINGS_MODULE=hec_fund.settings.prod .venv/bin/python manage.py seed_demo_data

# 4. systemd + nginx
sudo cp scripts/hec-*.service /etc/systemd/system/
sudo cp ../nginx.conf /etc/nginx/sites-available/hec
sudo ln -s /etc/nginx/sites-available/hec /etc/nginx/sites-enabled/hec
sudo systemctl daemon-reload
sudo systemctl enable --now hec-gunicorn hec-celery-worker hec-celery-beat
sudo systemctl reload nginx

# 5. TLS
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d hec.example.com

# 6. Future updates
cd /opt/hec && ./deploy.sh
```

---

## Verification scripts

```bash
cd backend
PYTHONPATH=. ../scripts/verify_phase1.py    # Auth + 2FA + seed integrity
PYTHONPATH=. ../scripts/verify_phase2.py    # State machine + immutability + HMAC
PYTHONPATH=. ../scripts/verify_phase3_4.py  # Forms + uploads
```

Each script prints `ALL CHECKS PASSED` on success.

---

## Architecture diagram

```text
USERS (CB → AB → WCS → DGFC → DGFAP → Minister, plus Admin)
  │
  ▼ HTTPS + JWT
NGINX → GUNICORN (4 workers)  →  DJANGO 5 + DRF
  │                                   │
  ├─ accounts · cases · forms         ├─ PostgreSQL 16 (JSONB)
  ├─ approvals · audit · reports      ├─ Redis 7 (Celery + cache + throttle)
  └─ payments                         └─ S3 (MinIO dev / Wasabi prod)
                                          │
                                          └─ 7-year retention; pg_dump nightly
```

Frontend: React 18 + Vite + TS + Redux Toolkit + RTK Query + Tailwind + shadcn-style components.
State engine: single `<FormRenderer schema={def.schema} />` reads JSONB form definitions
(role-scoped, bilingual `{en, fr}` labels, validated via JSON Schema).

---

## Files of interest

- `nginx.conf` — production Nginx config (TLS + CSP + locked CORS)
- `deploy.sh` — idempotent production deploy
- `scripts/hec-gunicorn.service`, `hec-celery-worker.service`, `hec-celery-beat.service`
- `compliance/dpia.md` — CNPD DPIA template
- `backend/cases/state_machine.py` — strict 6-level transition table
- `backend/cases/migrations/0002_event_immutable.py` — PG BEFORE UPDATE OR DELETE trigger
- `backend/cases/idempotency.py` — 24h `Idempotency-Key` dedupe
- `backend/forms/jsonschema.py` — runtime validator for form definitions + payloads
- `backend/approvals/tasks.py` — Celery notify chain with retry + DLQ
- `frontend/src/components/FormRenderer.tsx` — bilingual fallback chain
- `frontend/src/offline/queue.ts` — IndexedDB offline queue (idb)
