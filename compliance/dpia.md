# CNPD DPIA — Data Protection Impact Assessment (template)

> Commission Nationale de Protection des Données à Caractère Personnel (CNPD)
> Gabon — HEC Emergency Fund

This template documents the data-protection posture of the HEC Emergency Fund
system per CNPD requirements. It is a living document, updated whenever the
data model, scope, or processing activities change.

---

## 1. Project identification

| Field | Value |
|---|---|
| Project name | HEC Emergency Fund |
| Operator (data controller) | [Ministry / DGFC] |
| Technical operator | [Vendor / in-house team] |
| DPO / point of contact | [name, email, phone] |
| Go-live date | [target] |
| Hosting | Ubuntu 22.04 VPS (Hetzner/OVH/DigitalOcean); single tenant; on-prem-friendly |

## 2. Description of processing

### 2.1 Purpose

Digitise the approval chain for compensation claims arising from
human–elephant conflict (HEC) injuries and deaths in Gabon.

### 2.2 Categories of data subjects

- **Claimants** — individuals (or their families) who have been injured or
  killed in an HEC incident and seek compensation.
- **Witnesses** — individuals named in incident reports.
- **System users** — Ministry / partner staff who operate the approval chain.

### 2.3 Categories of personal data

| Category | Field examples | Sensitivity |
|---|---|---|
| Identity | claimant_name, claimant_phone | Low |
| Contact | phone, telegram_chat_id | Low |
| Incident details | incident_at, narrative, witness_names | Low–medium |
| Health (incident-related) | case_type (medical/burial), narrative | **Medium** |
| Authentication | email, otp_secret, password hash | Medium |
| Audit | IP, user-agent, signed HMAC | Low |
| Documents | photos, witness statements, payment proofs | **Medium** |

### 2.4 Categories of recipients

- The 6 approval roles (CB → AB → WCS → DGFC → DGFAP → Minister) and the
  Admin role.
- Donor / partner reporting (aggregated, anonymised).
- CNPD on request.

### 2.5 Retention

- Active cases: retained for the duration of the approval chain + payment.
- Closed cases: **7 years** per Gabonese public-sector accounting rules.
- Audit log (cases_event): **immutable, retained for 7 years** — DB-level
  BEFORE UPDATE OR DELETE trigger prevents tampering.
- Backups: nightly `pg_dump` to S3, **30-day rolling retention**.

### 2.6 Transfers outside Gabon

Data is hosted on a VPS whose physical location is chosen at deploy time.
If hosted outside Gabon, an adequacy decision or BCR is required.

## 3. Necessity and proportionality

| Risk | Mitigation |
|---|---|
| Unauthorised access to claimant data | RBAC (DRF permission classes) + server-side enforcement |
| Tampering with audit log | DB-level `BEFORE UPDATE OR DELETE` trigger (PostgreSQL) raises exception |
| Credential theft | 2FA-TOTP for every role except CB; refresh-token rotation; 30-min access-token idle |
| Replay of approval actions | `Idempotency-Key` header (24h Redis dedupe) |
| Forged evidence | Signed-approval artifact = HMAC of `{typed_name, case_uid, step, timestamp, ip, user_agent}` |
| Cross-tenant leakage | UUIDv4 case IDs (unguessable); CSP-locked Nginx |
| Brute-force login | DRF throttle: 60/min anon, 600/min per user |
| Excess surface | Nginx CSP + locked CORS to production domain |

## 4. Data subject rights

| Right | Implementation |
|---|---|
| Access | Admin can export a claimant's record (XLSX) on written request |
| Rectification | Admin edits case metadata; **audit events are immutable** |
| Erasure | Closed cases are retained per §2.5; personal data minimisation at intake |
| Portability | JSONB payload is portable; admin export to XLSX |
| Object / restrict | DPO contact + case-level comments |
| Lodge complaint with CNPD | Documented DPO contact |

## 5. Security measures

- **Authentication**: SimpleJWT + django-otp (TOTP for 6 of 7 roles)
- **Transport**: TLS 1.2+; HSTS preload; CSP headers
- **Storage**: PostgreSQL 16 with JSONB for form schemas; S3-compatible
  object store for attachments
- **Logging**: All state transitions write immutable `cases_event` rows with
  HMAC signatures
- **Backup**: Nightly pg_dump → S3 (30-day rolling)
- **Operational**: systemd + Gunicorn (4 sync workers) + Celery worker + beat
  + Nginx reverse proxy

## 6. Sign-off

| Role | Name | Date | Signature |
|---|---|---|---|
| DPO | | | |
| DGFC representative | | | |
| IT security lead | | | |
| Project manager | | | |

---

> Generated as part of the HEC Emergency Fund build. Fill in operator-specific
> details before submission to CNPD. This template does NOT constitute legal
> advice; final review by Gabonese counsel is recommended.
