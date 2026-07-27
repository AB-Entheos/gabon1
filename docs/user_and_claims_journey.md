# User Journey & Claims Journey

This document describes the user-facing journeys and the backend API interactions for a claim from creation to closure.

## User Journey (roles & main interactions)

- CB (Case Builder / field staff)
  - Creates a `Case` in DRAFT via frontend form UI.
  - Uploads **case files** (mandatory slots, tagged with `file_type`) and **evidence** (free-form) using the uploads flow (`/uploads/presign` → PUT → `/uploads/finish`).
  - Submits the case (`POST /api/v1/cases/{uid}/submit`).
  - If case is REJECTED, edits and re-submits.

- Verifier (often CB or local staff)
  - Reviews submitted payload and attachments.
  - Calls `POST /api/v1/cases/{uid}/verify` to mark VERIFIED and move to approval chain.

- AB (AB Entheos)
  - Reviews cases at step 2; can `advance`, `reject`, or `defer`.
  - Can release `first-aid` (`POST /api/v1/cases/{uid}/first-aid`) to disburse 20% immediately.

- WCS / DGFC / DGFAP / MINISTER
  - Sequential approvers that review and `advance` or `reject`/`defer`.
  - Approvers cannot advance until every required case-file slot is satisfied (per case type).
  - DGFAP (step 5) is required to set `amount_authorized` via `POST /api/v1/cases/{uid}/amount`.
  - Minister provides terminal approval (APPROVED) at step 6.
  - **WCS** is the only role that may release the accelerated benefit via `POST /api/v1/cases/{uid}/accelerated-benefit` (20% of the case-type ceiling). AB no longer releases this.

- Admin
  - Publishes form definitions (`POST /api/v1/forms/publish`).
  - Runs exports (`POST /api/v1/payments/export`) and disbursements (`/payments/mobile-money`).

## Claims Journey (chronological, with APIs)

1. Draft creation (CB):
   - Frontend creates a `Case` (local draft). Client may call `GET /api/v1/forms` to fetch form definition.
   - Case types are limited to **MEDICAL** (injury) and **BURIAL** (death). Crop-damage support has been removed.
   - Mandatory case files are uploaded from the **Required case files** card. Each upload carries a `file_type` matching one of the required slots (medical_report, claimant_id, ambulance_receipt, etc.) and is persisted under `cases/{uid}/case_files/`. The file-type dropdown ends with an **Other** entry so the user can name a non-standard document.
   - Free-form evidence (photos, ad-hoc files) is uploaded without a `file_type` and lands in `cases/{uid}/evidence/`.
   - Every upload (case file or evidence) carries an optional **description / alt text** and **uploaded-by** label so the case file is self-describing in the UI and audit log.
   - Attachments are registered to a `FormSubmission` when finished; the same `FormAttachment.file_type` column is what the backend uses to validate mandatory slots.

2. Submit (CB):
   - `POST /api/v1/cases/{uid}/submit` → Event Type `SUBMITTED`.

3. Verify (Verifier):
   - `POST /api/v1/cases/{uid}/verify` → Event Type `VERIFIED`. SLA deadline computed and saved.

4. Approval chain (AB → WCS → DGFC → DGFAP → MINISTER):
   - Each step: approver inspects payload & attachments, then `POST /api/v1/cases/{uid}/advance` to move forward.
   - Required files are enforced at submit time, not during approval advances.
   - Approver may `reject` with a required note: `POST /api/v1/cases/{uid}/reject` → Event Type `REJECTED`.
   - Approver may `defer` back one step with comment: `POST /api/v1/cases/{uid}/defer` → Event Type `DEFERRED`.
   - From `DEFERRED`, the previous approver (or CB) calls `POST /api/v1/cases/{uid}/resume` to return to `AT_APPROVAL`.

5. DGFAP amount setting (step 5):
   - `POST /api/v1/cases/{uid}/amount` with `{amount_xaf, reason}`.
   - Backend validates ceilings and stores `amount_authorized`. Event Type `AMOUNT_SET` recorded.

6. Accelerated benefit flow (special):
   - WCS can call `POST /api/v1/cases/{uid}/accelerated-benefit` to immediately release 20% of the case-type ceiling. Event Type `ACCELERATED_BENEFIT_RELEASED`. Case remains in the same status.

7. Final approval to APPROVED (MINISTER):
   - `POST /api/v1/cases/{uid}/advance` when at step 6 → status `APPROVED` (only if required case-file slots are complete).

8. Disbursement & proof:
   - Payments dispatched by Admin via `mobile-money` API or institutional export.
   - Proof attachments are uploaded using the same uploads presign/finish flow and associated with a synthetic proof submission.
   - Confirm payment: `POST /api/v1/payments/{uid}/confirm` with `kind` and attachments; backend runs `transition(..., "close")` to set state CLOSED.

9. Closed: Case status is `CLOSED` and the audit log records events and attachments for reconciliation.

---

If you want, I can also:

- Export the Mermaid diagram to `docs/process_flow.png`.
- Add example API request/response snippets for the key endpoints in this file.

## What changed (v2 disbursement flow)

The full chain is now: **CB → AB → WCS → DGFC (propose) → DGFAP (authorize) → Minister → WCS (record disbursements) → WCS (close)**.

Key differences from the older flow:

1. **Accelerated benefit has been removed.** The full authorized amount is set by DGFAP at step 5 and approved by the Minister. There is no longer a 20% early release or a \irst_aid\ / \ccelerated_benefit\ flag.
2. **Amount is a two-step decision.**
   - DGFC at step 4 calls \POST /api/v1/cases/{uid}/amount\ with \{amount_xaf, reason}\. This records an \AMOUNT_PROPOSED\ event; the value is not yet locked.
   - DGFAP at step 5 calls the same endpoint to record an \AMOUNT_AUTHORIZED\ event and lock the value into \Case.amount_authorized\.
3. **Disbursements are recorded per-payment, not in bulk.** WCS records each individual payment against the authorized amount via \POST /api/v1/cases/{uid}/disbursements\:
   - Body: \{amount_xaf, purpose, recipient_kind, recipient_name, payment_date, payment_reference, notes, proof_of_payment_id?}\
   - \
ecipient_kind\ is one of: \CLAIMANT\, \HOSPITAL\, \MORTUARY\, \PHARMACY\, \TRANSPORT\, \GOVERNMENT\, \INSURANCE\, \OTHER\.
   - The running sum of disbursements is enforced to never exceed \mount_authorized\. Over-commit returns HTTP 400.
   - Every disbursement records a \DISBURSEMENT_RECORDED\ event with the recipient and amount in the notes.
4. **Approaching-limit warning.** Both the case detail endpoint and the \/disbursements\ list include \pproaching_limit: true\ when utilization \>= 90%\. The frontend renders a red banner in the case workspace and a dedicated warning card inside the disbursement history.
5. **WCS closes the case.** Once all (or some) disbursements are recorded, WCS calls \POST /api/v1/cases/{uid}/close\. Admin no longer closes.
6. **New event types:** \AMOUNT_PROPOSED\, \AMOUNT_AUTHORIZED\, \DISBURSEMENT_RECORDED\. \AMOUNT_SET\, \ACCELERATED_BENEFIT_RELEASED\, \PAYMENT_PROOF_UPLOADED\, \PAYMENT_CONFIRMED\ are removed.
