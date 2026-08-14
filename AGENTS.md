# AWS Guidance

- Prefer the AWS MCP Server for AWS interactions — it provides sandboxed
  execution, observability, and audit logging. If unavailable, use the
  AWS CLI directly.
- Before starting a task, check whether a relevant AWS skill is available.
  Load the skill with `retrieve_skill` and prefer its guidance over
  general knowledge.
- When uncertain about specific AWS details (API parameters, permissions,
  limits, error codes), verify against documentation rather than guessing.
  State uncertainty explicitly if you cannot confirm.
- When creating infrastructure, prefer infrastructure-as-code (AWS CDK or
  CloudFormation) over direct CLI commands.
- When working with infrastructure, follow AWS Well-Architected Framework
  principles.
- Do not use em dashes in AWS resource names or descriptions. Use
  hyphens instead.

## Secret Safety

- MUST load the `aws-secrets-manager` skill first for any secret,
  credential, API key, token, or password task. MUST NOT call
  `secretsmanager get-secret-value` or `batch-get-secret-value`, and MUST
  NOT hit the Secrets Manager Agent daemon directly. MUST use
  `{{resolve:secretsmanager:secret-id:SecretString:json-key}}` with
  `asm-exec` so the secret resolves at runtime without entering context.

## Project Overview

- Project: HEC Emergency Fund for human-elephant conflict compensation claims in Gabon.
- Backend: Django 5, Django REST Framework, Celery, Redis, PostgreSQL in production.
- Frontend: React, TypeScript, Vite, Redux Toolkit, Tailwind, Bun/npm build tooling.
- Production domain: `https://hec.ab-entheos.com`.
- Production host: EC2 instance `i-088ca8e946a03d3a9`, deployed under `/opt/hec`.
- Production services run with Docker Compose: PostgreSQL, Django backend, Celery worker, Celery beat, Redis, and Nginx frontend.
- Production attachments are separate from PostgreSQL and must be preserved independently in the configured S3-compatible object store.

## Repository Conventions

- Run backend commands from `backend/` using `.venv/Scripts/python.exe` on Windows.
- Use Bun for frontend installation and builds when available.
- Keep migrations data-preserving and migration-safe; historical migrations must use `apps.get_model()` and local helper functions.
- Do not edit generated build output, local SQLite data, uploaded files, or environment files for release changes.
- Do not add debug scripts, temporary test output, production notes, or personal data to commits.
- Keep user-facing text bilingual where the surrounding feature supports English and French.
- Use the existing centralized notification service instead of sending email directly from views.

## Deployment Rules

- GitHub Actions is the production deployment mechanism. Push only to `main` after local validation; do not deploy manually by SSH unless explicitly requested as an emergency fallback.
- `.github/workflows/deploy.yml` builds the frontend and backend, creates a PostgreSQL dump before migrations, runs migrations, collects static files, and restarts Docker Compose services.
- Never run `docker compose down -v`, delete `db-data`, reset the database, run demo seeding, or replace the production `.env` during a deployment.
- Existing production users, villages, forms, cases, audit events, disbursements, and attachments must remain intact.
- Before changing deployment or migration behavior, verify that the backup is non-empty and that migration failure stops before service restart.
- Prefer backward-compatible migrations. Test migrations against a restored production backup when they modify workflow state.
- After a push, monitor the GitHub Actions run and verify `https://hec.ab-entheos.com/api/v1/health` returns HTTP 200. Temporary 500 responses can occur while Docker images build and services restart.
- Do not expose, copy, print, or commit `.env`, API keys, passwords, SSH keys, JWTs, or Resend credentials.

## Data Protection

- PostgreSQL is the source of truth for users, villages, forms, cases, events, approvals, and disbursements.
- Attachments are separate from PostgreSQL. Never assume a database dump protects object-store files.
- Preserve soft-deleted records and immutable audit events.
- Before a migration, require a non-empty PostgreSQL backup. Prefer an off-host copy and a tested restore for high-risk changes.
- Never use `seed_demo_data` or destructive cleanup commands against production.
- If a migration fails, stop and inspect the database migration state before retrying. Do not mark migrations applied manually.

## Current Approval Workflow

- Current chain: CB/DP -> AB -> WCS -> DGFC -> DGFAP final approval.
- Minister is no longer a mandatory approval step for new cases.
- Migration `backend/cases/migrations/0018_dgfap_final_approval.py` converts old pending Minister step-6 cases to pending DGFAP step 5.
- The migration must not automatically approve those cases, delete records, or alter attachments. It records an audit event and preserves the case as `AT_APPROVAL`.
- Historical migrations must not call methods from the current model class. Use local migration-safe helper functions instead.

## Current Release Notes

- Approval email templates show authorized, disbursed, and remaining amounts.
- Disbursed totals include active disbursements only; soft-deleted disbursements are excluded.
- Desktop notification prompting is implemented in `frontend/src/components/NotificationCenter.tsx`.
- Temporary HTTP 500 responses may appear while Docker images build and services restart; verify the health endpoint after deployment.

## Email Notifications

- Production email is sent through Resend using `RESEND_API_KEY`; do not assume SMTP or console delivery in production.
- Email templates are under `backend/templates/emails/en/` and `backend/templates/emails/fr/`.
- The centralized implementation is `backend/notifications/tasks.py`; public wrappers are in `backend/notifications/service.py`.
- `manage.py test_emails --to <address> --lang both` validates templates and Resend delivery, but sends real email when a Resend key is configured. Use only an explicitly approved test address.
- Approval emails include authorized, disbursed, and remaining amounts. Active disbursements are summed; soft-deleted disbursements are excluded.
- Desktop notifications require browser permission and are surfaced by `frontend/src/components/NotificationCenter.tsx`.

## Validation Checklist

Run before pushing:

```text
cd backend
.venv/Scripts/python.exe manage.py check --settings=hec_fund.settings.dev
.venv/Scripts/python.exe manage.py makemigrations --check --dry-run --settings=hec_fund.settings.dev
cd ../frontend
bun run build
```

- `manage.py test` currently reports no Django tests in the repository; do not treat that as comprehensive coverage.
- Review `git diff --check` and exclude local debug scripts, `.env`, generated files, and test artifacts from release commits unless explicitly needed.
- Never claim a production deployment succeeded until the GitHub Actions run is successful and the health endpoint has been checked.

## Safe Change Workflow

1. Read this file and relevant skills before changing infrastructure, deployment, authentication, storage, or email.
2. Inspect current code, migrations, and Git status before editing.
3. Make the smallest backward-compatible change.
4. Run the validation checklist and review `git diff --check`.
5. Review staged files to ensure secrets, data, debug files, and generated artifacts are excluded.
6. Push to `main` only when explicitly requested.
7. Monitor GitHub Actions and verify the production health endpoint after deployment.
