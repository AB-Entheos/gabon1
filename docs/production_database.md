# Production PostgreSQL Database Setup

This project uses PostgreSQL for production on the VPS. The backend production settings already point to PostgreSQL in `backend/hec_fund/settings/prod.py`.

## Database configuration

The production `DATABASES` settings are configured by environment variables:

- `DB_NAME` — database name (default `hec`)
- `DB_USER` — database user (default `hec`)
- `DB_PASSWORD` — database password
- `DB_HOST` — database host, typically `localhost` on the VPS
- `DB_PORT` — database port, typically `5432`

Example in `.env`:

```env
DJANGO_SETTINGS_MODULE=hec_fund.settings.prod
ALLOWED_HOSTS=yourdomain.com
DB_NAME=hec
DB_USER=hec
DB_PASSWORD=strong_password_here
DB_HOST=localhost
DB_PORT=5432
```

## Object storage (attachments)

Attachments are NOT stored in the database. They live in an S3-compatible bucket (Wasabi in prod, MinIO in local-dev) using `django-storages`. The bucket is configured via the standard `AWS_*` environment variables consumed by `backend/hec_fund/settings/prod.py`:

```env
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_STORAGE_BUCKET_NAME=hec-attachments
AWS_S3_ENDPOINT_URL=https://s3.wasabisys.com
AWS_S3_REGION_NAME=eu-central-1
```

### Per-case layout

Every case upload is keyed by the case UUID plus a slot category. The backend decides the category from the `file_type` field on the upload:

```text
cases/{case_uid}/case_files/<uuid>-<filename>   ← uploads with a file_type (mandatory slots)
cases/{case_uid}/evidence/<uuid>-<filename>     ← uploads without a file_type (free-form evidence)
```

Uploads from the **Required case files** UI always carry a `file_type` (e.g. `medical_report`, `claimant_id`, `ambulance_receipt`, `death_certificate`, `funeral_receipt`, `damage_photos`, `farm_ownership`, `loss_estimate`). Photos taken from the camera widget in the case sidebar have no `file_type` and therefore go to `evidence/`.

This separation guarantees that:

1. Mandatory case files are isolated for audits and legal hold.
2. `state_machine.case_has_required_files(case)` can determine completion strictly from the database column `forms_formattachment.file_type` — no filesystem lookups.
3. Eviction / lifecycle policies (e.g. moving cold evidence to Glacier) can be applied per prefix.

## PostgreSQL installation on VPS

Install PostgreSQL using the distro package manager, then create the database and user:

```bash
sudo apt update
sudo apt install -y postgresql postgresql-contrib
sudo -u postgres createuser --interactive
```

Or create the production role and DB directly:

```bash
sudo -u postgres psql <<'SQL'
CREATE ROLE hec WITH LOGIN PASSWORD 'strong_password_here';
CREATE DATABASE hec OWNER hec;
ALTER ROLE hec SET client_encoding = 'utf8';
ALTER ROLE hec SET default_transaction_isolation = 'read committed';
ALTER ROLE hec SET timezone = 'UTC';
SQL
```

## Django migration commands

After setting the environment variables, run Django migrations:

```bash
cd backend
source .venv/bin/activate
python manage.py migrate --settings=hec_fund.settings.prod
python manage.py collectstatic --noinput --settings=hec_fund.settings.prod
```

Migration `0005_drop_crop_damage_rename_first_aid` performs the major reshape of the data model:

- drops the `FundSettings.crop_ceiling_xaf` field and the `CROP_DAMAGE` case-type choice,
- renames `first_aid_pct` → `accelerated_benefit_pct`, `first_aid_released` → `accelerated_benefit_released`, `first_aid_amount_xaf` → `accelerated_benefit_amount_xaf`,
- replaces the `FIRST_AID_RELEASED` audit event with `ACCELERATED_BENEFIT_RELEASED`,
- adds `FormAttachment.description` (alt text) and `FormAttachment.uploaded_by_name` so every upload is self-describing.

The `0004_add_file_type_to_formattachment` migration that introduced `file_type` is still required for the per-case folder routing and the mandatory-slot validation.

## Backup strategy

Use regular backups of the PostgreSQL database. The attachments bucket must be backed up independently (S3 lifecycle + cross-region replication).

```bash
pg_dump -U hec -h localhost -Fc hec > /var/backups/hec-$(date +"%F").dump
```

Store backups off the VPS and retain at least 7 days of history.

## Connection details for production

The production Django config in `backend/hec_fund/settings/prod.py` uses:

```python
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": config("DB_NAME", default="hec"),
        "USER": config("DB_USER", default="hec"),
        "PASSWORD": config("DB_PASSWORD", default=""),
        "HOST": config("DB_HOST", default="localhost"),
        "PORT": config("DB_PORT", default="5432"),
        "CONN_MAX_AGE": 60,
    }
}
```

## Recommended PostgreSQL version

Use PostgreSQL 15 or newer for security and performance.

## Optional tuning notes

For a VPS, tune:

- `shared_buffers` to ~25% of RAM
- `work_mem` to a modest size like `16MB`
- `maintenance_work_mem` to `128MB`
- `effective_cache_size` based on available RAM
- `max_connections` to the expected load plus a margin

The app uses connection pooling implicitly through Django's `CONN_MAX_AGE` setting.
