"""Centralized email notification service for the HEC Emergency Fund.

Every public function here is a thin wrapper that:
  1. Builds the bilingual subject / body from Django templates.
  2. Dispatches a Celery task (synchronous in dev when CELERY_TASK_ALWAYS_EAGER).

Call these from views, state_machine side-effects, or management commands.
"""
from __future__ import annotations

import logging
from typing import Any

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Template helpers
# ---------------------------------------------------------------------------

_TEMPLATE_DIR_MAP = {
    "account_created": "account_created",
    "password_reset": "password_reset",
    "new_claim": "new_claim",
    "case_approved": "case_approved",
    "case_rejected": "case_rejected",
    "case_deferred": "case_deferred",
    "case_closed": "case_closed",
    "case_submitted": "case_submitted",
    "case_verified": "case_verified",
    "amount_proposed": "amount_proposed",
    "amount_authorized": "amount_authorized",
}


def _template_path(notification_type: str, language: str) -> str:
    """Return e.g. ``emails/en/account_created.txt``."""
    slug = _TEMPLATE_DIR_MAP.get(notification_type, notification_type)
    return f"emails/{language}/{slug}.txt"


# ---------------------------------------------------------------------------
# Public API — each function enqueues the right Celery task
# ---------------------------------------------------------------------------


def send_account_created(*, user, temp_password: str = "") -> None:
    """Notify the newly created user with their welcome email and one-time credentials."""
    from .tasks import send_notification_email

    lang = getattr(user, "preferred_language", "fr") or "fr"
    send_notification_email.delay(
        notification_type="account_created",
        recipient_email=user.email,
        language=lang,
        template_context={"user": user, "temp_password": temp_password},
    )


def send_password_reset(*, user, reset_url: str) -> None:
    """Notify the user that their password has been reset (or a reset link was issued)."""
    from .tasks import send_notification_email

    lang = getattr(user, "preferred_language", "fr") or "fr"
    send_notification_email.delay(
        notification_type="password_reset",
        recipient_email=user.email,
        language=lang,
        template_context={"user": user, "reset_url": reset_url},
    )


def send_new_claim(*, case, recipients=None) -> None:
    """Notify relevant parties when a new case is submitted.

    By default all DGFC+DGFAP+ADMIN+SUPER_ADMIN users are notified.
    An explicit *recipients* queryset overrides this.
    """
    from accounts.models import User
    from .tasks import send_notification_email

    if recipients is None:
        recipients = User.objects.filter(
            role__in=["DGFC", "DGFAP", "ADMIN", "SUPER_ADMIN"],
            is_active=True,
        )

    for r in recipients:
        lang = getattr(r, "preferred_language", "fr") or "fr"
        send_notification_email.delay(
            notification_type="new_claim",
            recipient_email=r.email,
            language=lang,
            template_context={"case": case, "recipient": r},
        )


def send_case_submitted(*, case) -> None:
    """Notify the AB Entheos that a case has been submitted and is awaiting verification."""
    from accounts.models import User
    from .tasks import send_notification_email

    recipients = User.objects.filter(role="AB", is_active=True)
    for r in recipients:
        lang = getattr(r, "preferred_language", "fr") or "fr"
        send_notification_email.delay(
            notification_type="case_submitted",
            recipient_email=r.email,
            language=lang,
            template_context={"case": case, "recipient": r},
        )


def send_case_verified(*, case) -> None:
    """Notify the next approver that a case has been verified."""
    from cases.state_machine import approver_role_for_step, StateError
    from .tasks import send_notification_email

    try:
        next_role = approver_role_for_step(case.current_step)
    except StateError:
        return

    from accounts.models import User

    recipients = User.objects.filter(role=next_role, is_active=True)
    for r in recipients:
        lang = getattr(r, "preferred_language", "fr") or "fr"
        send_notification_email.delay(
            notification_type="case_verified",
            recipient_email=r.email,
            language=lang,
            template_context={"case": case, "recipient": r, "step": case.current_step},
        )


def send_case_approved(*, case) -> None:
    """Notify the CB that a case has been fully approved."""
    from .tasks import send_notification_email

    if case.created_by:
        lang = getattr(case.created_by, "preferred_language", "fr") or "fr"
        send_notification_email.delay(
            notification_type="case_approved",
            recipient_email=case.created_by.email,
            language=lang,
            template_context={"case": case, "step": case.current_step},
        )


def send_case_rejected(*, case, actor=None) -> None:
    """Notify the CB that a case was rejected."""
    from .tasks import send_notification_email

    if case.created_by:
        lang = getattr(case.created_by, "preferred_language", "fr") or "fr"
        send_notification_email.delay(
            notification_type="case_rejected",
            recipient_email=case.created_by.email,
            language=lang,
            template_context={"case": case, "actor": actor},
        )


def send_case_deferred(*, case, actor=None) -> None:
    """Notify the CB that a case was deferred (sent back for clarification)."""
    from .tasks import send_notification_email

    if case.created_by:
        lang = getattr(case.created_by, "preferred_language", "fr") or "fr"
        send_notification_email.delay(
            notification_type="case_deferred",
            recipient_email=case.created_by.email,
            language=lang,
            template_context={"case": case, "actor": actor, "step": case.current_step},
        )


def send_case_closed(*, case, actor=None) -> None:
    """Notify relevant parties that a case has been closed after payment."""
    from accounts.models import User
    from .tasks import send_notification_email

    # Notify CB + DGFC + DGFAP
    recipients = set()
    if case.created_by:
        recipients.add(case.created_by)
    recipients.update(User.objects.filter(role__in=["DGFC", "DGFAP"], is_active=True))

    for r in recipients:
        lang = getattr(r, "preferred_language", "fr") or "fr"
        send_notification_email.delay(
            notification_type="case_closed",
            recipient_email=r.email,
            language=lang,
            template_context={"case": case, "actor": actor, "recipient": r},
        )


def send_amount_proposed(*, case, actor=None) -> None:
    """Notify the DGFAP that an amount has been proposed by DGFC."""
    from accounts.models import User
    from .tasks import send_notification_email

    recipients = User.objects.filter(role="DGFAP", is_active=True)
    for r in recipients:
        lang = getattr(r, "preferred_language", "fr") or "fr"
        send_notification_email.delay(
            notification_type="amount_proposed",
            recipient_email=r.email,
            language=lang,
            template_context={
                "case": case,
                "amount_xaf": case.amount_proposed,
                "actor": actor,
            },
        )


def send_amount_authorized(*, case, actor=None) -> None:
    """Notify the Minister that an amount has been authorized by DGFAP."""
    from accounts.models import User
    from .tasks import send_notification_email

    recipients = User.objects.filter(role="MINISTER", is_active=True)
    for r in recipients:
        lang = getattr(r, "preferred_language", "fr") or "fr"
        send_notification_email.delay(
            notification_type="amount_authorized",
            recipient_email=r.email,
            language=lang,
            template_context={
                "case": case,
                "amount_xaf": case.amount_authorized,
                "actor": actor,
            },
        )


# ---------------------------------------------------------------------------
# Batch helper for the approval dispatcher
# ---------------------------------------------------------------------------


def notify_approver(case, from_step: int | None = None) -> None:
    """Compatibility shim used by approvals.notifications — sends approver email."""
    from cases.state_machine import approver_role_for_step, StateError
    from .tasks import send_notification_email

    if case.status == "AT_APPROVAL":
        try:
            role = approver_role_for_step(case.current_step)
        except StateError:
            return

        from accounts.models import User

        recipient = (
            case.village.contact_user if case.village and case.village.contact_user else None
        ) or User.objects.filter(role=role, is_active=True).first()

        if not recipient:
            return

        lang = getattr(recipient, "preferred_language", "fr") or "fr"
        send_notification_email.delay(
            notification_type="case_approved",
            recipient_email=recipient.email,
            language=lang,
            template_context={"case": case, "step": case.current_step, "role": role},
        )
