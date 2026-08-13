# HEC Emergency System — Data Inventory

> Complete catalog of all codifiable data variables, uploadable items, and system enumerations.

---

## Table of Contents

1. [Backend Models & Fields](#1-backend-models--fields)
2. [Uploadable Items](#2-uploadable-items)
3. [Dynamic Form System](#3-dynamic-form-system)
4. [User Roles](#4-user-roles)
5. [Approval Pipeline](#5-approval-pipeline)
6. [Notifications](#6-notifications)
7. [Database Constraints & Indexes](#7-database-constraints--indexes)
8. [Summary Statistics](#8-summary-statistics)

---

## 1. Backend Models & Fields

### 1.1 User (`accounts/models.py`)

| Field | Type | Details |
|---|---|---|
| `email` | EmailField | unique, PK via USERNAME_FIELD |
| `username` | CharField | auto-set from email |
| `first_name` | CharField | inherited from AbstractUser |
| `last_name` | CharField | inherited from AbstractUser |
| `role` | CharField(16) | `CB`, `DP`, `AB`, `WCS`, `DGFC`, `DGFAP`, `MINISTER`, `ADMIN`, `SUPER_ADMIN` |
| `village` | FK → Village | nullable, SET_NULL |
| `phone` | CharField(32) | blank |
| `status` | CharField(16) | `ACTIVE`, `SUSPENDED`, `INVITED` |
| `is_2fa_enabled` | BooleanField | default=False |
| `otp_secret` | CharField(64) | blank |
| `must_change_password` | BooleanField | default=False |
| `preferred_language` | CharField(2) | `en`, `fr` (default: `fr`) |
| `telegram_chat_id` | CharField(64) | blank |
| `password_reset_token` | CharField(128) | nullable |
| `password_reset_expires` | DateTimeField | nullable |

### 1.2 Village (`accounts/models.py`)

| Field | Type | Details |
|---|---|---|
| `name` | CharField(128) | |
| `region` | CharField(128) | blank |
| `contact_user` | FK → User | nullable, SET_NULL |

### 1.3 FundSettings (singleton — `cases/models.py`)

| Field | Type | Details |
|---|---|---|
| `medical_ceiling_xaf` | PositiveIntegerField | default=2,000,000 |
| `burial_ceiling_xaf` | PositiveIntegerField | default=3,000,000 |
| `updated_at` | DateTimeField | auto_now |

### 1.4 Case (`cases/models.py`) — 24 fields

| Field | Type | Details |
|---|---|---|
| `uid` | UUIDField | default=uuid4, unique |
| `case_type` | CharField(16) | `MEDICAL`, `BURIAL`; default=`MEDICAL` |
| `claimant_name` | CharField(200) | |
| `claimant_phone` | CharField(32) | blank |
| `claimant_id_number` | CharField(64) | National ID or passport number |
| `claimant_id_type` | CharField(16) | `NATIONAL_ID`, `PASSPORT`, `DRIVER_LICENSE`, `OTHER`; default=`NATIONAL_ID` |
| `claimant_date_of_birth` | DateField | nullable |
| `claimant_gender` | CharField(8) | `M`, `F`, `OTHER` |
| `claimant_address` | CharField(300) | blank |
| `incident_location` | CharField(300) | blank |
| `relationship_to_claimant` | CharField(32) | `SELF`, `SPOUSE`, `PARENT`, `CHILD`, `SIBLING`, `OTHER`; default=`SELF` |
| `village` | FK → Village | nullable, SET_NULL |
| `village_name_text` | CharField(128) | blank, free-text (default: `""`) |
| `chef_de_village` | CharField(128) | blank, free-text (default: `""`) |
| `incident_at` | DateTimeField | |
| `reported_at` | DateTimeField | auto_now_add |
| `current_step` | PositiveSmallIntegerField | default=1 (range 1–6) |
| `status` | CharField(16) | `DRAFT`, `SUBMITTED`, `VERIFIED`, `AT_APPROVAL`, `APPROVED`, `REJECTED`, `DEFERRED`, `CLOSED`, `DELETED`; default=`DRAFT` |
| `amount_authorized` | DecimalField(14,0) | nullable |
| `amount_proposed` | DecimalField(14,0) | nullable |
| `sla_deadline` | DateTimeField | nullable |
| `created_by` | FK → User | PROTECT |
| `deleted_at` | DateTimeField | nullable (soft delete) |
| `deleted_by` | FK → User | nullable, SET_NULL (soft delete) |

### 1.5 Event (immutable audit — `cases/models.py`)

| Field | Type | Details |
|---|---|---|
| `id` | AutoField | |
| `case` | FK → Case | CASCADE |
| `actor` | FK → User | PROTECT |
| `occurred_at` | DateTimeField | auto_now_add |
| `event_type` | CharField(32) | See event types below |
| `from_step` | PositiveSmallIntegerField | nullable |
| `to_step` | PositiveSmallIntegerField | nullable |
| `payload_hash` | CharField(64) | SHA-256, blank |
| `notes` | TextField | blank |
| `ip_address` | GenericIPAddressField | nullable |
| `user_agent` | CharField(512) | blank |
| `idempotency_key` | CharField(128) | blank |
| `amount_xaf` | DecimalField(14,0) | nullable |

**Event Types:**

| Event Type | Description |
|---|---|
| `CREATED` | Case created |
| `SUBMITTED` | Case submitted by CB |
| `VERIFIED` | Case verified by CB |
| `ADVANCED` | Case advanced to next step |
| `DEFERRED` | Case deferred |
| `REJECTED` | Case rejected |
| `AMOUNT_PROPOSED` | DGFC proposes amount |
| `AMOUNT_AUTHORIZED` | DGFAP authorizes amount |
| `APPROVED` | Minister approves |
| `DISBURSEMENT_RECORDED` | Disbursement added |
| `DISBURSEMENT_UPDATED` | Disbursement modified |
| `DISBURSEMENT_DELETED` | Disbursement removed |
| `PROOF_UPLOADED` | File uploaded |
| `FILE_DELETED` | File permanently deleted |
| `FILE_SOFT_DELETED` | File soft-deleted |
| `FILE_SUPERSEDED` | File replaced |
| `CLOSED` | Case closed |
| `CASE_DELETED` | Case soft-deleted |
| `COMMENT` | Comment added |

### 1.6 Disbursement (`cases/models.py`)

| Field | Type | Details |
|---|---|---|
| `id` | AutoField | |
| `case` | FK → Case | CASCADE |
| `amount_xaf` | PositiveIntegerField | |
| `purpose` | CharField(200) | |
| `recipient_kind` | CharField(16) | `CLAIMANT`, `HOSPITAL`, `MORTUARY`, `PHARMACY`, `TRANSPORT`, `GOVERNMENT`, `INSURANCE`, `OTHER`; default=`CLAIMANT` |
| `recipient_kind_other` | CharField(200) | blank, free-text when OTHER; default=`""` |
| `recipient_name` | CharField(200) | |
| `payment_date` | DateField | |
| `payment_reference` | CharField(128) | |
| `proof_of_payment` | FK → FormAttachment | nullable, SET_NULL |
| `paid_by` | FK → User | PROTECT |
| `created_at` | DateTimeField | auto_now_add |
| `notes` | TextField | blank |
| `deleted_at` | DateTimeField | nullable (soft delete) |
| `deleted_by` | FK → User | nullable, SET_NULL |

### 1.7 FormDefinition (`forms/models.py`)

| Field | Type | Details |
|---|---|---|
| `id` | AutoField | |
| `slug` | SlugField(64) | |
| `title` | CharField(200) | |
| `version` | PositiveSmallIntegerField | default=1 |
| `schema` | JSONField | Bilingual `{en, fr}` labels and field definitions |
| `role_scope` | CharField(64) | Comma-separated role codes |
| `status` | CharField(16) | `DRAFT`, `PUBLISHED`, `ARCHIVED` |
| `published_at` | DateTimeField | nullable |
| `created_at` | DateTimeField | auto_now_add |

### 1.8 FormSubmission (`forms/models.py`)

| Field | Type | Details |
|---|---|---|
| `id` | AutoField | |
| `case` | FK → Case | CASCADE |
| `form_definition` | FK → FormDefinition | PROTECT |
| `submitted_by` | FK → User | PROTECT |
| `submitted_at` | DateTimeField | auto_now_add |
| `role_at_submission` | CharField(16) | Role of the submitter |
| `payload` | JSONField | Dynamic form values |
| `version` | PositiveSmallIntegerField | |

### 1.9 FormAttachment (`forms/models.py`)

| Field | Type | Details |
|---|---|---|
| `id` | AutoField | |
| `submission` | FK → FormSubmission | CASCADE |
| `s3_key` | CharField(512) | Storage path |
| `filename` | CharField(256) | Original filename |
| `mime` | CharField(128) | MIME type |
| `size_bytes` | PositiveBigIntegerField | |
| `sha256` | CharField(64) | Content hash |
| `uploaded_by` | FK → User | PROTECT |
| `uploaded_at` | DateTimeField | auto_now_add |
| `scan_status` | CharField(16) | `PENDING`, `CLEAN`, `INFECTED` |
| `file_type` | CharField(128) | Slot identifier, nullable |
| `description` | CharField(512) | blank |
| `uploaded_by_name` | CharField(200) | blank |
| `deleted_at` | DateTimeField | nullable |
| `deleted_by` | FK → User | nullable, SET_NULL |
| `superseded_by` | FK → self | nullable, points to replacement |

---

## 2. Uploadable Items

### 2.1 Accepted File Types

> **Note:** MIME type validation is **frontend-only**. The server only enforces file size (25 MB). The table below reflects the frontend `FileUploader` component accept filter.

| Category | MIME Types |
|---|---|
| Images | `image/*` (jpg, png, gif, webp, etc.) |
| PDF | `application/pdf` |
| Word | `.doc`, `.docx`, `application/msword`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document` |
| Spreadsheet | `text/csv`, `.csv`, `application/vnd.ms-excel` |
| Text | `text/plain`, `.txt` |

### 2.2 Required File Slots by Case Type

| Slot | MEDICAL | BURIAL |
|---|---|---|
| `medical_report` | ✅ Required | ❌ |
| `death_certificate` | ❌ | ✅ Required |
| `claimant_id` | ✅ Required | ✅ Required |
| `receipt` | ✅ Required | ❌ |
| `funeral_receipt` | ❌ | ✅ Required |
| `supporting_document` | Optional | Optional |
| `case_photos` | Optional | Optional |
| `other` | Optional | Optional |

> **Note:** Only the ✅ Required slots are enforced in backend code (`REQUIRED_FILE_SLOTS` in `state_machine.py`). The Optional slots (`supporting_document`, `case_photos`, `other`) are frontend-only UI concepts and not enforced server-side.

### 2.3 Upload Limits

| Parameter | Value |
|---|---|
| Max file size | **25 MB** |
| Presigned URL expiry | 15 minutes |
| Idempotency TTL | 24 hours |

### 2.4 Storage Paths

| Path | Purpose |
|---|---|
| `{case_uid}/evidence/{uuid}-{filename}` | Evidence files |
| `{case_uid}/case-files/{uuid}-{filename}` | Required case file slots |
| `payments/exports/{uuid}.{csv\|xml}` | Payment exports |

### 2.5 Upload Metadata Fields

| Field | Type | Details |
|---|---|---|
| `file_type` | string | Slot identifier (e.g., `medical_report`) |
| `description` | string | Max 512 chars, alt text / description |
| `uploaded_by_name` | string | Max 200 chars, display name of uploader |

### 2.6 Payment Export Format

CSV and SEPA XML exports include the following fields:

| Field | Description |
|---|---|
| `uid` | Case UUID |
| `claimant_name` | Name of the claimant |
| `claimant_phone` | Phone number |
| `village` | Village name |
| `case_type` | `MEDICAL` or `BURIAL` |
| `amount_xaf` | Authorized amount in XAF |
| `currency` | Always `XAF` |
| `approved_at` | Timestamp of minister approval |

### 2.7 Mobile Money Providers

| Provider | Code | Description |
|---|---|---|
| Moov Money | `moov` | Moov mobile money |
| Airtel Money | `airtel` | Airtel mobile money |

---

## 3. Dynamic Form System

### 3.1 Supported Field Types (16)

| Type | JSON Schema |
|---|---|
| `text` | string |
| `textarea` | string |
| `number` | number (with optional `min`/`max`) |
| `date` | string (format: date) |
| `time` | string (format: time) |
| `datetime` | string (format: date-time) |
| `select` | string (with `options` array) |
| `multiselect` | array of strings |
| `radio` | string (with `options` array) |
| `checkbox` | boolean |
| `tel` | string |
| `email` | string |
| `file` | string or object (triggers FileUploader) |
| `signature` | string or object (triggers SignaturePad) |
| `section` | header/separator |
| `static` | read-only text |

### 3.2 Form Field Properties

| Property | Type | Details |
|---|---|---|
| `id` | string | Unique field identifier |
| `type` | string | One of the 16 types above |
| `label` | `{en, fr}` or string | Bilingual label |
| `help` | `{en, fr}` or string | Help text |
| `placeholder` | `{en, fr}` or string | Placeholder text |
| `options` | array | For select/radio/multiselect: `[{value, label}]` |
| `required` | boolean | |
| `min` | number | For number type |
| `max` | number | For number type |
| `default` | any | Default value |
| `show_when` | `{field, equals}` | Conditional visibility |
| `required_when` | `{field, equals}` | Conditional requirement |

### 3.3 Built-in Form Slugs

| Slug | Purpose |
|---|---|
| `case_files_bag` | Synthetic submission holding case file attachments before the incident form is filled |

### 3.4 Form Payload → Case Projection

When a form is submitted, certain field values are projected from the dynamic form payload onto the parent `Case` row:

| Form Payload Key | Case Field | Description |
|---|---|---|
| `village_name_text` | `Case.village_name_text` | Free-text village name |
| `chef_de_village` | `Case.chef_de_village` | Village chief name |

This projection is defined in `_FORM_FIELD_TO_CASE_FIELD` in the form submission handler.

---

## 4. User Roles

| Code | Role | Access Level |
|---|---|---|
| `CB` | Chef de Brigade | Creates and verifies cases |
| `DP` | Délégué Permanent | Regional oversight |
| `AB` | AB Entheos | Step 2 approver |
| `WCS` | WCS | Step 3 approver |
| `DGFC` | DGFC | Step 4 — proposes amounts |
| `DGFAP` | DGFAP | Step 5 — authorizes amounts |
| `MINISTER` | Ministre | Step 6 — final approval |
| `ADMIN` | Administrateur | System administration |
| `SUPER_ADMIN` | Super Administrateur | Full system access |

---

## 5. Approval Pipeline

### 5.1 Workflow Steps

| Step | Role | Action |
|---|---|---|
| 1 | CB (Chef de Brigade) | Submit / Verify |
| 2 | AB (AB Entheos) | Advance to step 3 |
| 3 | WCS | Advance to step 4 |
| 4 | DGFC | Advance to step 5; propose amount |
| 5 | DGFAP | Advance to step 6; authorize amount |
| 6 | MINISTER | Terminal approve |

### 5.2 State Transitions

| Transition | Event Type | From → To | Status Change |
|---|---|---|---|
| `submit` | SUBMITTED | 1 → 1 | DRAFT → SUBMITTED |
| `verify` | VERIFIED | 1 → 2 | SUBMITTED → AT_APPROVAL |
| `advance_ab` | ADVANCED | 2 → 3 | AT_APPROVAL |
| `advance_wcs` | ADVANCED | 3 → 4 | AT_APPROVAL |
| `advance_dgfc` | ADVANCED | 4 → 5 | AT_APPROVAL |
| `advance_dgfap` | ADVANCED | 5 → 6 | AT_APPROVAL |
| `approve_minister` | APPROVED | 6 → 6 | AT_APPROVAL → APPROVED |
| `dgfc_propose_amount` | AMOUNT_PROPOSED | 4 → 4 | (no status change) |
| `dgfap_authorize_amount` | AMOUNT_AUTHORIZED | 5 → 5 | (no status change) |
| `reject` | REJECTED | any AT_APPROVAL → | REJECTED |
| `defer` / `defer_from_N` | DEFERRED | N → N-1 | DEFERRED |
| `resume` | ADVANCED | N → N | DEFERRED → AT_APPROVAL |
| `close` | CLOSED | 6 → 6 | APPROVED → CLOSED |

### 5.3 SLA Deadlines

| Case Type | SLA |
|---|---|
| MEDICAL | 48 hours (from verify) |
| BURIAL | 72 hours (from verify) |

---

## 6. Notifications

### 6.1 Email Notification Types (11)

| Type | Trigger | Recipients |
|---|---|---|
| `account_created` | User creation | New user |
| `password_reset` | Password reset request | User |
| `new_claim` | Case created | All active users (except creator) |
| `case_submitted` | Case submitted | AB Entheos |
| `case_verified` | Case verified | Next approver for step |
| `case_approved` | Minister approves | Case creator (CB) |
| `case_rejected` | Case rejected | Case creator (CB) |
| `case_deferred` | Case deferred | Case creator (CB) |
| `case_closed` | Case closed | Case creator (CB) + active DGFC + DGFAP |
| `amount_proposed` | DGFC proposes amount | Next approver |
| `amount_authorized` | DGFAP authorizes amount | Next approver |

### 6.2 Template Path Format

```
emails/{language}/{notification_type}.txt
```

---

## 7. Database Constraints & Indexes

| Model | Constraint / Index |
|---|---|
| `FormDefinition` | `unique_together = [("slug", "version")]` |
| `Case` | Indexes on `status`, `current_step`, `village` |
| `Event` | Indexes on `(case, occurred_at)`, `actor`, `event_type` |
| `Disbursement` | Index on `(case, -payment_date)`, `deleted_at` (db_index) |
| `FormSubmission` | Indexes on `case`, `form_definition` |
| `FormAttachment` | `deleted_at` has `db_index=True` |

---

## 8. Summary Statistics

| Category | Count |
|---|---|
| Backend models | 9 |
| Case model fields | 24 |
| Event model fields | 13 |
| Disbursement model fields | 15 |
| User model fields | 15 |
| FormAttachment model fields | 16 |
| Required file upload slots | 6 enforced + 3 optional (UI-only) |
| Accepted upload MIME types | ~11 (frontend-only, not server-validated) |
| Max upload size | 25 MB |
| Dynamic form field types | 16 |
| Approval steps | 6 |
| User roles | 9 |
| Email notification types | 11 |
| Audit event types | 19 |
| Case statuses | 9 |
| Recipient kinds (disbursement) | 8 |
| Mobile money providers | 2 (`moov`, `airtel`) |
| State transitions | 13 (including `resume`) |
