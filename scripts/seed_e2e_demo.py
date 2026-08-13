"""End-to-end demo data seeder.

Creates a realistic set of cases at various stages of the 6-step pipeline
so the user can click through every screen and see the workflow live.

Run from backend/:
    PYTHONPATH=. .venv/Scripts/python.exe ../scripts/seed_e2e_demo.py
"""
import os
import sys
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "hec_fund.settings.dev")
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
django.setup()

import random
from datetime import timedelta
from django.utils import timezone

from accounts.models import User
from cases.models import Case, Event, FundSettings


def header(s):
    print(f"\n=== {s} ===")


def advance_step(case: Case, *, actor: User, to_step: int, action_label: str, notes: str = ""):
    """Move a case forward through the approval pipeline by emitting events."""
    Event.objects.create(
        case=case, actor=actor, event_type=Event.Type.ADVANCED,
        from_step=case.current_step, to_step=to_step,
        notes=notes or f"{action_label} approved.",
        payload_hash=Event.compute_hash({"step": to_step, "actor": actor.email}),
    )
    case.current_step = to_step
    case.status = "AT_APPROVAL"
    case.save(update_fields=["current_step", "status"])


def set_amount(case: Case, *, actor: User, amount: int, notes: str):
    Event.objects.create(
        case=case, actor=actor, event_type=Event.Type.AMOUNT_SET,
        from_step=case.current_step, to_step=case.current_step,
        notes=notes,
        payload_hash=Event.compute_hash({"amount": amount}),
    )
    case.amount_authorized = f"{amount}.00"
    case.save(update_fields=["amount_authorized"])


def mark_paid(case: Case, *, actor: User, reference: str):
    Event.objects.create(
        case=case, actor=actor, event_type=Event.Type.COMMENT,
        from_step=6, to_step=6,
        notes=f"Paid via {reference}.",
        payload_hash=Event.compute_hash({"reference": reference}),
    )


def mark_closed(case: Case, *, actor: User, notes: str = "Receipt confirmed; closing the case."):
    Event.objects.create(
        case=case, actor=actor, event_type=Event.Type.CLOSED,
        from_step=6, to_step=6,
        notes=notes,
        payload_hash=Event.compute_hash({"closed": True}),
    )
    case.status = "CLOSED"
    case.save(update_fields=["status"])


def reject_case(case: Case, *, actor: User, notes: str):
    Event.objects.create(
        case=case, actor=actor, event_type=Event.Type.REJECTED,
        from_step=case.current_step, to_step=case.current_step,
        notes=notes,
        payload_hash=Event.compute_hash({"reason": notes}),
    )
    case.status = "REJECTED"
    case.save(update_fields=["status"])


def add_comment(case: Case, *, actor: User, notes: str):
    Event.objects.create(
        case=case, actor=actor, event_type=Event.Type.COMMENT,
        from_step=case.current_step, to_step=case.current_step,
        notes=notes,
        payload_hash=Event.compute_hash({"actor": actor.email}),
    )


def approve_terminal(case: Case, *, actor: User, notes: str = "Final approval."):
    Event.objects.create(
        case=case, actor=actor, event_type=Event.Type.APPROVED,
        from_step=6, to_step=6,
        notes=notes,
        payload_hash=Event.compute_hash({"final": True}),
    )
    case.status = "APPROVED"
    case.save(update_fields=["status"])


def release_first_aid(case: Case, *, actor: User, amount: int, notes: str):
    Event.objects.create(
        case=case, actor=actor, event_type=Event.Type.FIRST_AID_RELEASED,
        from_step=case.current_step, to_step=case.current_step,
        notes=notes,
        payload_hash=Event.compute_hash({"pct": 20, "xaf": amount}),
    )
    case.first_aid_released = True
    case.first_aid_amount_xaf = amount
    case.save(update_fields=["first_aid_released", "first_aid_amount_xaf"])


def submit_case(case: Case, *, actor: User, notes: str = "Incident report submitted."):
    Event.objects.create(
        case=case, actor=actor, event_type=Event.Type.SUBMITTED,
        from_step=0, to_step=1, notes=notes,
        payload_hash=Event.compute_hash({"form": "cb-incident-report"}),
    )
    case.status = "SUBMITTED"
    case.save(update_fields=["status"])


def verify_case(case: Case, *, actor: User, notes: str = "Verified in the field."):
    Event.objects.create(
        case=case, actor=actor, event_type=Event.Type.VERIFIED,
        from_step=1, to_step=2, notes=notes,
        payload_hash=Event.compute_hash({"verified": True}),
    )
    case.status = "VERIFIED"
    case.save(update_fields=["status"])


# --- Setup ----------------------------------------------------------------

header("Setup")
fs = FundSettings.get_solo()
print(f"Fund ceilings: medical={fs.medical_ceiling_xaf:,} burial={fs.burial_ceiling_xaf:,} crop={fs.crop_ceiling_xaf:,}")

roles = {
    "CB":       User.objects.get(email="cb.libreville@hec.local"),
    "AB":       User.objects.get(email="ab@hec.local"),
    "WCS":      User.objects.get(email="wcs@hec.local"),
    "DGFC":     User.objects.get(email="dgfc@hec.local"),
    "DGFAP":    User.objects.get(email="dgfap@hec.local"),
    "MINISTER": User.objects.get(email="minister@hec.local"),
    "ADMIN":    User.objects.get(email="admin@hec.local"),
}

claimants = [
    ("Marie-Claire Moukagni", "+24177000001", "MEDICAL",     True),
    ("Jean-Baptiste Nze",     "+24177000002", "MEDICAL",     False),
    ("Sylvie Bengone",        "+24177000003", "BURIAL",      True),
    ("Patrice Engonga",       "+24177000004", "MEDICAL",     True),
    ("Anne-Marie Mba",        "+24177000005", "BURIAL",      False),
    ("Cyrille Obiang",        "+24177000006", "MEDICAL",     False),
    ("Lucie Ndong",           "+24177000007", "MEDICAL",     True),
    ("Bernard Mintsa",        "+24177000008", "BURIAL",      False),
    ("Honorine Obame",        "+24177000009", "CROP_DAMAGE", False),
    ("Thomas Mvou",           "+24177000010", "CROP_DAMAGE", False),
]

# Drop any prior demo cases so the run is idempotent.
demo = Case.objects.filter(claimant_name__in=[c[0] for c in claimants])
n = demo.count()
if n:
    print(f"Removing {n} prior demo cases...")
    demo.delete()

created = []


def make_case(idx, claimant, phone, case_type, urgent):
    name, phone, ctype, urgent = claimant
    cb = roles["CB"]
    case = Case.objects.create(
        case_type=ctype,
        claimant_name=name,
        claimant_phone=phone,
        incident_at=timezone.now() - timedelta(hours=12 + idx * 6),
        reported_at=timezone.now() - timedelta(hours=11 + idx * 6),
        current_step=2,
        status="VERIFIED",
        priority_score=random.randint(3, 10),
        urgent_medical=urgent,
        sla_deadline=timezone.now() + timedelta(days=7),
        created_by=cb,
    )
    submit_case(case, actor=cb, notes="Incident report submitted.")
    verify_case(case, actor=cb, notes="Verified in the field.")
    return case


# --- Case 1: fully approved (ready for payment) ---------------------------

header("Case 1 — APPROVED at Minister (payment pending)")
c1 = make_case(1, claimants[0], *claimants[0][1:])
created.append(c1)
release_first_aid(c1, actor=roles["AB"], amount=400_000, notes="First-aid 20% released for urgent medical case.")
advance_step(c1, actor=roles["AB"],   to_step=3, action_label="AB")
advance_step(c1, actor=roles["WCS"],  to_step=4, action_label="WCS")
advance_step(c1, actor=roles["DGFC"], to_step=5, action_label="DGFC")
set_amount(c1, actor=roles["DGFAP"], amount=1_500_000, notes="Hospital + 2 weeks salary + transport.")
advance_step(c1, actor=roles["DGFAP"], to_step=6, action_label="DGFAP")
approve_terminal(c1, actor=roles["MINISTER"], notes="Final approval.")


# --- Case 2: at Minister (Q6) --------------------------------------------

header("Case 2 — AT_APPROVAL step 6 (Minister)")
c2 = make_case(2, claimants[1], *claimants[1][1:])
created.append(c2)
advance_step(c2, actor=roles["AB"],   to_step=3, action_label="AB")
advance_step(c2, actor=roles["WCS"],  to_step=4, action_label="WCS")
advance_step(c2, actor=roles["DGFC"], to_step=5, action_label="DGFC")
set_amount(c2, actor=roles["DGFAP"], amount=2_000_000, notes="Medical ceiling.")
advance_step(c2, actor=roles["DGFAP"], to_step=6, action_label="DGFAP")


# --- Case 3: at DGFAP (Q5) -------------------------------------------------

header("Case 3 — AT_APPROVAL step 5 (DGFAP)")
c3 = make_case(3, claimants[2], *claimants[2][1:])
created.append(c3)
advance_step(c3, actor=roles["AB"],   to_step=3, action_label="AB")
advance_step(c3, actor=roles["WCS"],  to_step=4, action_label="WCS")
advance_step(c3, actor=roles["DGFC"], to_step=5, action_label="DGFC")


# --- Case 4: at DGFC (Q4) -------------------------------------------------

header("Case 4 — AT_APPROVAL step 4 (DGFC)")
c4 = make_case(4, claimants[3], *claimants[3][1:])
created.append(c4)
advance_step(c4, actor=roles["AB"],   to_step=3, action_label="AB")
advance_step(c4, actor=roles["WCS"],  to_step=4, action_label="WCS")


# --- Case 5: at WCS (Q3) --------------------------------------------------

header("Case 5 — AT_APPROVAL step 3 (WCS)")
c5 = make_case(5, claimants[4], *claimants[4][1:])
created.append(c5)
advance_step(c5, actor=roles["AB"], to_step=3, action_label="AB")


# --- Case 6: at AB (Q2) ---------------------------------------------------

header("Case 6 — AT_APPROVAL step 2 (AB)")
c6 = make_case(6, claimants[5], *claimants[5][1:])
created.append(c6)


# --- Case 7: rejected at WCS ----------------------------------------------

header("Case 7 — REJECTED at WCS")
c7 = make_case(7, claimants[6], *claimants[6][1:])
created.append(c7)
advance_step(c7, actor=roles["AB"], to_step=3, action_label="AB")
reject_case(c7, actor=roles["WCS"], notes="Photo evidence unclear; please resubmit with a clearer wide-shot.")


# --- Case 8: closed (paid + closed by admin) -----------------------------

header("Case 8 — CLOSED (paid)")
c8 = make_case(8, claimants[7], *claimants[7][1:])
created.append(c8)
advance_step(c8, actor=roles["AB"],   to_step=3, action_label="AB")
advance_step(c8, actor=roles["WCS"],  to_step=4, action_label="WCS")
advance_step(c8, actor=roles["DGFC"], to_step=5, action_label="DGFC")
set_amount(c8, actor=roles["DGFAP"], amount=3_000_000, notes="Burial ceiling.")
advance_step(c8, actor=roles["DGFAP"], to_step=6, action_label="DGFAP")
approve_terminal(c8, actor=roles["MINISTER"], notes="Final approval.")
mark_paid(c8, actor=roles["ADMIN"], reference="MM-2026-0015")
mark_closed(c8, actor=roles["ADMIN"], notes="Receipt confirmed by claimant; closing the case.")


# --- Case 9: CROP_DAMAGE at AB (Q2) --------------------------------------

header("Case 9 — CROP_DAMAGE at AB (step 2)")
c9 = make_case(9, claimants[8], *claimants[8][1:])
created.append(c9)
add_comment(c9, actor=roles["CB"], notes="1.2 ha of plantain destroyed overnight by a herd of 5 elephants.")


# --- Case 10: CROP_DAMAGE APPROVED (ready for close + payment) ------------

header("Case 10 — CROP_DAMAGE APPROVED at Minister (ready to close)")
c10 = make_case(10, claimants[9], *claimants[9][1:])
created.append(c10)
advance_step(c10, actor=roles["AB"],   to_step=3, action_label="AB")
advance_step(c10, actor=roles["WCS"],  to_step=4, action_label="WCS")
advance_step(c10, actor=roles["DGFC"], to_step=5, action_label="DGFC")
set_amount(c10, actor=roles["DGFAP"], amount=fs.crop_ceiling_xaf, notes="Crop-damage ceiling (max).")
advance_step(c10, actor=roles["DGFAP"], to_step=6, action_label="DGFAP")
approve_terminal(c10, actor=roles["MINISTER"], notes="Final approval.")


# --- Comments on a couple of cases ---------------------------------------

header("Comments")
for case in [c1, c2, c8]:
    add_comment(case, actor=roles["AB"], notes="All attachments reviewed, looks good.")


print(f"\n[OK] Created {len(created)} e2e demo cases spanning every stage.")
for c in created:
    print(f"  - {c.uid.hex[:8]}... {c.claimant_name}: status={c.status} step={c.current_step} amount={c.amount_authorized or '-'}")

# Re-link ALL existing approved cases to the Minister-approved queue
# (in case older data was sitting in APPROVED for too long, mark them closed).
old_approved = Case.objects.filter(status="APPROVED").exclude(uid__in=[c.uid for c in created])
if old_approved.exists():
    print(f"\nFound {old_approved.count()} pre-existing APPROVED cases; closing them…")
    for c in old_approved:
        mark_paid(c, actor=roles["ADMIN"], reference="MM-LEGACY")
        mark_closed(c, actor=roles["ADMIN"], notes="Closed by legacy cleanup.")
