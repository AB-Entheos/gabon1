"""Approval-chain state machine.

Single source of truth for legal transitions on a Case. Imported by
views and by tests; nothing else should mutate Case.status / current_step
without going through `transition()`.

The chain is strictly sequential:

  ① CB → ② AB Entheos → ③ WCS → ④ DGFC → ⑤ DGFAP → ⑥ Minister

DGFAP (step 5) is the amount-decider. DGFAP's advance is only valid if
`amount_authorized` has been set on the case (separately, via
`/cases/{uid}/amount`). The Minister step is the terminal approval.

Reject-bounce-back: any current approver may transition the case back to
REJECTED with a note. From REJECTED the case can be re-submitted by CB.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

from django.db import transaction
from django.utils.translation import gettext as _

from accounts.models import User
from forms.models import FormAttachment
from .models import Case, Event


class StateError(Exception):
    """Raised when a transition is not legal from the current state."""


@dataclass(frozen=True)
class Transition:
    name: str
    event_type: str
    required_role: str | None
    from_step: int | None
    to_step: int | None
    to_status: str
    requires_amount_set: bool = False
    description: str = ""


# (action_name → Transition)
TRANSITIONS: dict[str, Transition] = {
    "submit": Transition(
        name="submit",
        event_type=Event.Type.SUBMITTED,
        required_role="CB",
        from_step=1,
        to_step=1,
        to_status=Case.Status.SUBMITTED,
        description="CB submits the incident form. case DRAFT → SUBMITTED.",
    ),
    "verify": Transition(
        name="verify",
        event_type=Event.Type.VERIFIED,
        required_role=None,  # CB or any verifier (typically CB)
        from_step=1,
        to_step=2,
        to_status=Case.Status.AT_APPROVAL,
        description="Field staff verifies incident details. case SUBMITTED → VERIFIED → AT_APPROVAL(2).",
    ),
    "advance_ab": Transition(
        name="advance_ab",
        event_type=Event.Type.ADVANCED,
        required_role="AB",
        from_step=2,
        to_step=3,
        to_status=Case.Status.AT_APPROVAL,
    ),
    "advance_wcs": Transition(
        name="advance_wcs",
        event_type=Event.Type.ADVANCED,
        required_role="WCS",
        from_step=3,
        to_step=4,
        to_status=Case.Status.AT_APPROVAL,
    ),
    "advance_dgfc": Transition(
        name="advance_dgfc",
        event_type=Event.Type.ADVANCED,
        required_role="DGFC",
        from_step=4,
        to_step=5,
        to_status=Case.Status.AT_APPROVAL,
    ),
    "advance_dgfap": Transition(
        name="advance_dgfap",
        event_type=Event.Type.ADVANCED,
        required_role="DGFAP",
        from_step=5,
        to_step=6,
        to_status=Case.Status.AT_APPROVAL,
    ),
    "approve_minister": Transition(
        name="approve_minister",
        event_type=Event.Type.APPROVED,
        required_role="MINISTER",
        from_step=6,
        to_step=6,
        to_status=Case.Status.APPROVED,
        description="Minister terminal approval. case AT_APPROVAL(6) → APPROVED.",
    ),
    "dgfc_propose_amount": Transition(
        name="dgfc_propose_amount",
        event_type=Event.Type.AMOUNT_PROPOSED,
        required_role="DGFC",
        from_step=4,
        to_step=4,
        to_status=None,
        description="DGFC proposes an amount at step 4 (this is a draft; DGFAP authorizes it).",
    ),
    "dgfap_authorize_amount": Transition(
        name="dgfap_authorize_amount",
        event_type=Event.Type.AMOUNT_AUTHORIZED,
        required_role="DGFAP",
        from_step=5,
        to_step=5,
        to_status=None,
        description="DGFAP authorizes the amount at step 5 (locks amount_authorized).",
    ),

    "reject": Transition(
        name="reject",
        event_type=Event.Type.REJECTED,
        required_role=None,  # any current approver (verified at runtime)
        from_step=None,
        to_step=None,
        to_status=Case.Status.REJECTED,
        description="Bounce back with a note. From any AT_APPROVAL step → REJECTED.",
    ),
    "defer": Transition(
        name="defer",
        event_type=Event.Type.DEFERRED,
        required_role=None,
        from_step=None,
        to_step=None,
        to_status=Case.Status.DEFERRED,
        description="Send back one step (e.g. step 3 → step 2) for clarification. The case stays in DEFERRED until the previous approver re-submits it. A comment is required.",
    ),
    "close": Transition(
        name="close",
        event_type=Event.Type.CLOSED,
        required_role="WCS",  # WCS or ADMIN can close (ADMIN exception in transition())
        from_step=6,
        to_step=6,
        to_status=Case.Status.CLOSED,
        description="WCS or Admin closes the case after payment confirmation.",
    ),
    # Per-step defer transitions (step N → step N-1) are registered
    # at the very bottom of this module (after defer_for_step is defined).
}


# Map (current_step, role) → required transition name when "advance" is hit.
APPROVER_FOR_STEP = {
    2: "AB",
    3: "WCS",
    4: "DGFC",
    5: "DGFAP",
    6: "MINISTER",
}

ADVANCE_FOR_STEP = {
    2: "advance_ab",
    3: "advance_wcs",
    4: "advance_dgfc",
    5: "advance_dgfap",
    6: "approve_minister",
}

# Map step → role that owns it (used by the defer UI to say "back to AB Entheos").
ROLE_FOR_STEP = {
    1: "CB",
    2: "AB",
    3: "WCS",
    4: "DGFC",
    5: "DGFAP",
    6: "MINISTER",
}

REQUIRED_FILE_SLOTS: dict[str, list[str]] = {
    Case.Type.MEDICAL: ["medical_report", "claimant_id", "ambulance_receipt"],
    Case.Type.BURIAL: ["death_certificate", "claimant_id", "funeral_receipt"],
}


def approver_role_for_step(step: int) -> str | None:
    return ROLE_FOR_STEP.get(step)


def required_file_slots_for_case(case: Case) -> list[str]:
    return REQUIRED_FILE_SLOTS.get(case.case_type, ["supporting_document", "claimant_id", "case_photos"])


def case_has_required_files(case: Case) -> bool:
    from forms.models import FormAttachment

    required = {slot.lower() for slot in required_file_slots_for_case(case)}
    if not required:
        return True

    attachments = FormAttachment.objects.filter(
        submission__case=case,
        file_type__isnull=False,
        deleted_at__isnull=True,
    ).values_list("file_type", flat=True)
    found = {str(file_type).strip().lower() for file_type in attachments if file_type}
    return required.issubset(found)


def defer_for_step(step: int) -> Transition:
    """The current step's approver defers back to step - 1 (min 2)."""
    if step < 3:
        raise StateError(_("Cannot defer below step 2 (the CB can always re-submit, no defer needed)."))
    base = TRANSITIONS["defer"]
    # Build a per-step variant with from_step / to_step baked in.
    return Transition(
        name=f"defer_from_{step}",
        event_type=base.event_type,
        required_role=ROLE_FOR_STEP.get(step),
        from_step=step,
        to_step=step - 1,
        to_status=Case.Status.DEFERRED,
        description=f"Step {step} ({ROLE_FOR_STEP.get(step)}) defers back to step {step - 1}.",
    )


def advance_transition_for_step(step: int) -> Transition:
    name = ADVANCE_FOR_STEP.get(step)
    if name is None:
        raise StateError(_(f"No advance transition defined for step {step}."))
    return TRANSITIONS[name]


def approver_role_for_step(step: int) -> str:
    role = APPROVER_FOR_STEP.get(step)
    if role is None:
        raise StateError(_(f"No approver role for step {step}."))
    return role


@transaction.atomic
def transition(
    case: Case,
    action: str,
    actor: User,
    *,
    notes: str = "",
    idempotency_key: str = "",
    extra: dict | None = None,
    side_effect: Callable[[Case, Event], None] | None = None,
    amount_xaf: int | None = None,
) -> Event:
    """Apply a transition, write the immutable Event, run optional side effect.

    Atomic. Raises StateError on illegal transition; permission checks
    belong in the view, not here.
    """
    t = TRANSITIONS.get(action)
    if t is None:
        raise StateError(_(f"Unknown action: {action}"))

    if case.status == Case.Status.CLOSED:
        raise StateError(_("Case is closed; no further transitions are allowed."))

    if t.required_role is not None and actor.role != t.required_role:
        # Special case: 'close' allows both WCS and ADMIN roles
        if t.name == "close" and actor.role in ("WCS", "ADMIN"):
            pass  # allowed
        else:
            raise StateError(
                _(f"Action '{action}' requires role {t.required_role}, not {actor.role}.")
            )

    if t.name in {"advance_ab", "advance_wcs", "advance_dgfc", "advance_dgfap", "approve_minister"}:
        if case.status != Case.Status.AT_APPROVAL:
            raise StateError(_("Case is not at approval."))
        if case.current_step != t.from_step:
            raise StateError(
                _(f"Case is at step {case.current_step}, expected step {t.from_step}.")
            )

    if t.requires_amount_set and case.amount_authorized is None:
        raise StateError(
            _("Cannot advance: amount_authorized must be set first (DGFAP at step 5).")
        )

    # Minister's terminal approval requires the amount to be authorized.
    if t.name == "approve_minister" and case.amount_authorized is None:
        raise StateError(
            _("Minister cannot approve until DGFAP has authorized an amount at step 5.")
        )

    # Files are optional at the CB stage — the CB can submit and verify
    # even when not all file slots are filled.  Approvers downstream may
    # request additional evidence via defer/defer-to-CB.
    #
    # Previously this blocked submit; it was moved to verify and then
    # removed entirely per product requirement (files not mandatory for CB).

    if t.name == "reject" and case.status != Case.Status.AT_APPROVAL:
        raise StateError(_("Only AT_APPROVAL cases can be rejected."))

    from_status = case.status
    from_step = case.current_step
    from_amount = case.amount_authorized

    if t.to_status is not None:
        case.status = t.to_status
    if t.to_step is not None:
        case.current_step = t.to_step

    case.save(update_fields=["status", "current_step", "amount_authorized"] if "amount_authorized" in case.get_deferred_fields() else ["status", "current_step"])

    event = Event.objects.create(
        case=case,
        actor=actor,
        event_type=t.event_type,
        from_step=from_step,
        to_step=case.current_step,
        notes=notes,
        idempotency_key=idempotency_key,
        payload_hash=Event.compute_hash(extra or {}),
        amount_xaf=amount_xaf,
    )

    if side_effect is not None:
        side_effect(case, event)

    # Schedule Celery notifications (if configured). In dev / CELERY_TASK_ALWAYS_EAGER=True
    # this fires synchronously inside the same request.
    try:
        from approvals.notifications import schedule_notifications
        schedule_notifications(case, from_step=from_step, action=action, actor=actor)
    except Exception:
        # Notifications must NEVER block a state transition. Swallow errors.
        pass

    return event


# ---------------------------------------------------------------------------
# Register per-step defer transitions now that defer_for_step is defined.
# ---------------------------------------------------------------------------
for _n in (3, 4, 5, 6):
    TRANSITIONS[f"defer_from_{_n}"] = defer_for_step(_n)
