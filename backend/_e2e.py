"""End-to-end smoke test for the case lifecycle.

Tests:
  CB creates -> CB submits -> CB verifies -> AB advances ->
  WCS advances -> DGFC advances ->
  DGFAP sets amount -> DGFAP advances -> Minister approves ->
  Admin closes

Uses Django ORM directly (the same code path that views/services use)
so any model/state-machine regression is caught.
"""
import os, sys, django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "hec_fund.settings.dev")
django.setup()

from decimal import Decimal
from accounts.models import User
from cases.models import Case, Event, FundSettings
from cases.state_machine import transition


def step(label):
    print(f"\n--- {label} ---")


def run():
    cb = User.objects.get(email="cb.libreville@hec.local")
    ab = User.objects.get(email="ab@hec.local")
    wcs = User.objects.get(email="wcs@hec.local")
    dgfc = User.objects.get(email="dgfc@hec.local")
    dgfap = User.objects.get(email="dgfap@hec.local")
    minister = User.objects.get(email="minister@hec.local")
    admin = User.objects.get(email="admin@hec.local")

    step("1. CB creates draft")
    case = Case.objects.create(
        case_type=Case.Type.MEDICAL,
        claimant_name="E2E Tester",
        claimant_phone="+24177000100",
        incident_at=__import__("django").utils.timezone.now(),
        created_by=cb,
    )
    print(f"   case {case.uid} status={case.status} step={case.current_step}")
    assert case.status == Case.Status.DRAFT

    step("2. CB submits")
    transition(case, "submit", cb, notes="Submitting for review")
    case.refresh_from_db()
    print(f"   status={case.status} step={case.current_step}")
    assert case.status == Case.Status.SUBMITTED

    step("3. CB verifies")
    transition(case, "verify", cb, notes="Looks good")
    case.refresh_from_db()
    print(f"   status={case.status} step={case.current_step}")
    assert case.status == Case.Status.AT_APPROVAL and case.current_step == 2

    step("4. AB advances")
    # Seed required file slots so the advance slot-check passes.
    from forms.models import FormDefinition, FormSubmission, FormAttachment
    from cases.uploads import save_attachment_bytes

    fd, _ = FormDefinition.objects.get_or_create(
        slug="cb-incident-report",
        version=1,
        defaults={
            "title": "CB Incident Report",
            "schema": {"fields": []},
            "role_scope": "CB,DP",
            "status": FormDefinition.Status.PUBLISHED,
        },
    )
    sub = FormSubmission.objects.create(
        case=case,
        form_definition=fd,
        submitted_by=cb,
        role_at_submission=cb.role,
        payload={},
        version=fd.version,
    )
    for slot in ("medical_report", "claimant_id", "receipt"):
        key = f"cases/{case.uid}/case_files/e2e-{slot}.bin"
        save_attachment_bytes(key=key, data=f"fake {slot} content".encode())
        FormAttachment.objects.create(
            submission=sub,
            s3_key=key,
            filename=f"{slot}.pdf",
            mime="application/pdf",
            size_bytes=64,
            sha256="deadbeef" * 8,
            uploaded_by=cb,
            file_type=slot,
        )
    print("   seeded required case files")
    transition(case, "advance_ab", ab, notes="AB approves")
    case.refresh_from_db()
    print(f"   status={case.status} step={case.current_step}")
    assert case.status == Case.Status.AT_APPROVAL and case.current_step == 3

    step("5. WCS advances")
    transition(case, "advance_wcs", wcs, notes="WCS approves")
    case.refresh_from_db()
    print(f"   status={case.status} step={case.current_step}")
    assert case.status == Case.Status.AT_APPROVAL and case.current_step == 4

    step("7. DGFC advances")
    transition(case, "advance_dgfc", dgfc, notes="DGFC approves")
    case.refresh_from_db()
    print(f"   status={case.status} step={case.current_step}")
    assert case.status == Case.Status.AT_APPROVAL and case.current_step == 5

    step("8. DGFAP sets amount")
    case.amount_authorized = Decimal("1500000")
    case.save(update_fields=["amount_authorized"])
    print(f"   amount={case.amount_authorized}")

    step("9. DGFAP advances (requires amount)")
    transition(case, "advance_dgfap", dgfap, notes="amount set")
    case.refresh_from_db()
    print(f"   status={case.status} step={case.current_step}")
    assert case.status == Case.Status.AT_APPROVAL and case.current_step == 6

    step("10. Minister approves")
    transition(case, "approve_minister", minister, notes="final approval")
    case.refresh_from_db()
    print(f"   status={case.status} step={case.current_step}")
    assert case.status == Case.Status.APPROVED

    step("11. WCS closes")
    transition(case, "close", wcs, notes="payment confirmed")
    case.refresh_from_db()
    print(f"   status={case.status} step={case.current_step}")
    assert case.status == Case.Status.CLOSED

    print(f"\n*** E2E PASS — case {case.uid} is CLOSED with {case.events.count()} events ***")


if __name__ == "__main__":
    run()