# System Process Flow

This document shows the main case approval lifecycle, the supporting activities (forms, uploads, payments), and a dictated step-by-step flow.

## Activities (API-backed)

- Form definitions: Admin publishes forms via `POST /api/v1/forms/publish`.
- Form listing & retrieval: `GET /api/v1/forms` and `GET /api/v1/forms/{slug}`.
- Form submission: `POST /api/v1/forms/{slug}/{version}` creates a `FormSubmission` linked to a `Case`.
- File uploads (attachments):
  - `POST /api/v1/uploads/presign` → returns presigned PUT URL. Body now also accepts `file_type` so the backend can route the upload into the correct case folder.
  - `PUT /api/v1/uploads/dev-put` (dev-only) → upload bytes.
  - `POST /api/v1/uploads/finish` → register uploaded file as `FormAttachment`, persisting the optional `file_type` metadata.
- Storage layout (per case UID):
  - `cases/{case_uid}/case_files/<uuid>-<filename>` — uploads with a `file_type` (mandatory slot data).
  - `cases/{case_uid}/evidence/<uuid>-<filename>` — uploads without a `file_type` (photo / ad-hoc evidence).
  - Dev local path: `backend/media/uploads/cases/...`; Prod: S3-compatible bucket.
- Case CRUD and state transitions: `POST /api/v1/cases/{uid}/submit`, `/verify`, `/advance`, `/reject`, `/defer`, `/resume`, `/amount`, `/first-aid`, `/close`.
- Payments:
  - `POST /api/v1/payments/first-aid` (AB releases 20% — wired via cases views).
  - `POST /api/v1/payments/mobile-money` (disbursement API).
  - `POST /api/v1/payments/{uid}/confirm` (attach proof, transition to CLOSED).
- Exports & reconciliation: `POST /api/v1/payments/export` → CSV/SEPA export stored or returned.

### Dictated flow (step-by-step)

1. A case is created by a CB (Case Builder) in DRAFT; the CB fills the incident form (client side) and may attach files.
2. The CB submits the case: `POST /api/v1/cases/{uid}/submit` → status SUBMITTED.
3. The verifier (typically CB or field staff) calls `POST /api/v1/cases/{uid}/verify` after checking details and attached evidence; SLA deadline is set based on case type.
4. The approval chain advances sequentially through roles: AB → WCS → DGFC → DGFAP → MINISTER using `POST /api/v1/cases/{uid}/advance`.
   - **Required case files**: the backend now refuses an `advance` until every mandatory slot (per case type — see §5 below) is satisfied. Uploads without a `file_type` go to `evidence/` and never satisfy a slot.
   - At any approver step an approver can `reject` (bounce to REJECTED) or `defer` (send back one step with required comment).
   - From REJECTED a CB may re-submit the case (start again at SUBMITTED).
5. At DGFAP (step 5) the authorized amount must be set via `POST /api/v1/cases/{uid}/amount` before DGFAP can advance the case.
6. Accelerated benefit: WCS may release an immediate 20% payment via `POST /api/v1/cases/{uid}/accelerated-benefit` (no chain required). This is logged as an event; case status does not change.
7. Minister (step 6) gives terminal approval with `POST /api/v1/cases/{uid}/advance` → status APPROVED.
8. Payments are dispatched (mobile money / CSV export) while case is APPROVED or CLOSED. After disbursement, proof (treatment/burial/crop_loss) is uploaded via the uploads flow and a payment confirmation is sent: `POST /api/v1/payments/{uid}/confirm`.
9. On payment confirmation the system executes `transition(case, "close")` which sets the case to CLOSED and logs an Event.

### Required case file slots (per case type)

The backend enforces the following mandatory slots via `state_machine.REQUIRED_FILE_SLOTS` and `case_has_required_files(case)`. The check runs at **submit** time only — approval advances are not blocked by missing files.

| Case type      | Required `file_type` values                              |
|----------------|----------------------------------------------------------|
| MEDICAL        | `medical_report`, `claimant_id`, `ambulance_receipt`     |
| BURIAL         | `death_certificate`, `claimant_id`, `funeral_receipt`    |

Uploads with any other `file_type` value (or none) land in the `evidence/` folder and do **not** satisfy a slot. In the UI the file type selector ends with an **Other** entry that lets the user label an out-of-scheme document; the typed label is used as the slot id.

### Diagram

```mermaid
flowchart LR
  DRAFT[DRAFT / Step 1 (CB)]
  SUB[SUBMITTED (step 1)]
  VER[VERIFIED → AT_APPROVAL (step 2)]
  AT2[AT_APPROVAL — Step 2 (AB)]
  AT3[AT_APPROVAL — Step 3 (WCS)]
  AT4[AT_APPROVAL — Step 4 (DGFC)]
  AT5[AT_APPROVAL — Step 5 (DGFAP)]
  AMTCHK{amount_authorized set?}
  SETAMT[Set amount (/cases/{uid}/amount) — DGFAP]
  AT6[AT_APPROVAL — Step 6 (MINISTER)]
  APPROVED[APPROVED]
  CLOSED[CLOSED (system closes after payment confirmation)]
  REJ[REJECTED]
  DEFER[DEFERRED → previous step (requires comment)]
  AB[Accelerated benefit released (WCS) — 20%, no status change]
  REQCHK{All required file slots completed?}

  DRAFT -->|submit (CB)| SUB
  SUB -->|verify (CB / verifier)| VER
  VER --> AT2

  AT2 --> REQCHK
  AT3 --> REQCHK
  AT4 --> REQCHK
  AT5 --> REQCHK
  AT6 --> REQCHK
  REQCHK -->|yes| AT3
  REQCHK -->|no, upload case files first| AT2

  AT5 --> AMTCHK
  AMTCHK -->|no| SETAMT
  SETAMT --> AMTCHK
  AMTCHK -->|yes| AT6

  AT6 -->|approve (MINISTER)| APPROVED
  APPROVED -->|payment confirmed → close| CLOSED
  AT6 -->|close (system)| CLOSED

  %% Rejections
  AT2 -->|reject| REJ
  AT3 -->|reject| REJ
  AT4 -->|reject| REJ
  AT5 -->|reject| REJ
  AT6 -->|reject| REJ
  REJ -->|resubmit (CB)| SUB

  %% Deferrals (step N → step N-1)
  AT3 -->|defer (comment required)| DEFER
  AT4 -->|defer (comment required)| DEFER
  AT5 -->|defer (comment required)| DEFER
  AT6 -->|defer (comment required)| DEFER
  DEFER -->|previous approver resumes (resume)| VER

  %% Accelerated benefit (special) — WCS only
  AT3 -->|accelerated-benefit (WCS) 20%| AB
  AB --> AT3
```

To render this diagram, use a Markdown viewer that supports Mermaid (VS Code with the Mermaid preview extension or GitHub Pages with Mermaid enabled).
