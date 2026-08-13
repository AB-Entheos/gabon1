"""Centralized email notification service for the HEC Emergency Fund.

Every public function here is a thin wrapper that:
  1. Builds the bilingual subject / body from Django templates.
  2. Dispatches a Celery task (synchronous in dev when CELERY_TASK_ALWAYS_EAGER).

Call these from views, state_machine side-effects, or management commands.
"""
from __future__ import annotations

import logging
from typing import Any

from django.db import models

logger = logging.getLogger(__name__)


def create_in_app_notification(*, recipient, event_key, title, message, kind="INFO", case=None, payload=None):
    from .models import InAppNotification

    return InAppNotification.objects.create(
        recipient=recipient,
        case=case,
        kind=kind,
        event_key=event_key,
        title=title,
        message=message,
        payload=payload or {},
    )


def notify_in_app(*, recipients, event_key, title, message, kind="INFO", case=None, payload=None):
    for recipient in recipients:
        create_in_app_notification(
            recipient=recipient,
            event_key=event_key,
            title=title,
            message=message,
            kind=kind,
            case=case,
            payload=payload,
        )


def _serialize(obj: Any) -> Any:
    """Convert a Django model instance to a plain dict for Celery serialization."""
    if isinstance(obj, models.Model):
        return {
            "pk": obj.pk,
            "first_name": getattr(obj, "first_name", ""),
            "email": getattr(obj, "email", ""),
            "get_role_display": getattr(obj, "get_role_display", lambda: "")(),
            "get_preferred_language_display": getattr(obj, "get_preferred_language_display", lambda: "")(),
            "uid": getattr(obj, "uid", ""),
            "claimant_name": getattr(obj, "claimant_name", ""),
            "amount_proposed": getattr(obj, "amount_proposed", None),
            "amount_authorized": getattr(obj, "amount_authorized", None),
            "current_step": getattr(obj, "current_step", ""),
            "status": getattr(obj, "status", ""),
            # Case-specific fields used by email templates
            "case_type": getattr(obj, "case_type", ""),
            "get_case_type_display": getattr(obj, "get_case_type_display", lambda: "")(),
            "incident_at": getattr(obj, "incident_at", None),
            "reported_at": getattr(obj, "reported_at", None),
            "village": getattr(getattr(obj, "village", None), "name", "")
            or getattr(obj, "village_name_text", ""),
        }
    return obj

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
    "desktop_notifications_enabled": "desktop_notifications_enabled",
    "desktop_notifications_disabled": "desktop_notifications_disabled",
    "disbursement_recorded": "disbursement_recorded",
}


def _template_path(notification_type: str, language: str) -> str:
    """Return e.g. ``emails/en/account_created.txt``."""
    slug = _TEMPLATE_DIR_MAP.get(notification_type, notification_type)
    return f"emails/{language}/{slug}.txt"


# ---------------------------------------------------------------------------
# Public API — each function enqueues the right Celery task
# ---------------------------------------------------------------------------


def send_account_created(*, user, temp_password: str = "") -> None:
    """Notify the newly created user with their welcome email and one-time credentials.

    Sends synchronously via Resend API — the welcome email is critical
    and must never be silently dropped by a broken Celery broker.
    """
    from .tasks import do_send_email

    lang = getattr(user, "preferred_language", "fr") or "fr"
    do_send_email(
        notification_type="account_created",
        recipient_email=user.email,
        language=lang,
        template_context={"user": _serialize(user), "temp_password": temp_password},
    )


def send_desktop_notifications_enabled(*, user) -> None:
    """Confirm that desktop and email notification delivery is enabled."""
    from .tasks import send_notification_email

    lang = getattr(user, "preferred_language", "fr") or "fr"
    send_notification_email.delay(
        notification_type="desktop_notifications_enabled",
        recipient_email=user.email,
        language=lang,
        template_context={"user": _serialize(user)},
    )


def send_desktop_notifications_disabled(*, user) -> None:
    from .tasks import send_notification_email

    send_notification_email.delay(
        notification_type="desktop_notifications_disabled",
        recipient_email=user.email,
        language=getattr(user, "preferred_language", "fr") or "fr",
        template_context={"user": _serialize(user)},
    )


def send_disbursement_recorded(*, case, disbursement, recipients) -> None:
    """Notify operational, finance, and administration users of a WCS payment."""
    from .tasks import send_notification_email

    context = {
        "case": _serialize(case),
        "disbursement": {
            "amount_xaf": disbursement.amount_xaf,
            "recipient_name": disbursement.recipient_name,
            "recipient_kind": disbursement.get_recipient_kind_display(),
            "purpose": disbursement.purpose,
            "payment_date": disbursement.payment_date,
            "payment_reference": disbursement.payment_reference,
            "paid_by": disbursement.paid_by.email,
            "disbursed_total_xaf": getattr(disbursement, "disbursed_total_xaf", ""),
            "remaining_xaf": getattr(disbursement, "remaining_xaf", ""),
            "authorized_xaf": getattr(disbursement, "authorized_xaf", ""),
        },
    }
    for recipient in recipients:
        send_notification_email.delay(
            notification_type="disbursement_recorded",
            recipient_email=recipient.email,
            language=getattr(recipient, "preferred_language", "fr") or "fr",
            template_context={**context, "recipient": _serialize(recipient)},
        )


def send_password_reset(*, user, reset_url: str) -> None:
    """Notify the user that their password has been reset (or a reset link was issued)."""
    from .tasks import send_notification_email

    lang = getattr(user, "preferred_language", "fr") or "fr"
    send_notification_email.delay(
        notification_type="password_reset",
        recipient_email=user.email,
        language=lang,
        template_context={"user": _serialize(user), "reset_url": reset_url},
    )


def send_new_claim(*, case, recipients=None) -> None:
    """Notify all active users when a new case is created.

    Every user receives an email; the case creator is excluded.
    An explicit *recipients* queryset overrides this.

    Sends synchronously via Resend — critical notification must not be
    silently dropped by a broken Celery broker.
    """
    from accounts.models import User
    from .tasks import do_send_email

    if recipients is None:
        recipients = User.objects.filter(is_active=True)

    for r in recipients:
        lang = getattr(r, "preferred_language", "fr") or "fr"
        try:
            do_send_email(
                notification_type="new_claim",
                recipient_email=r.email,
                language=lang,
                template_context={"case": _serialize(case), "recipient": _serialize(r)},
            )
        except Exception:
            # Individual email failures must never block case creation.
            pass


def send_case_submitted(*, case) -> None:
    """Notify the AB Entheos that a case has been submitted and is awaiting verification."""
    from accounts.models import User
    from .tasks import do_send_email

    recipients = User.objects.filter(role="AB", is_active=True)
    for r in recipients:
        lang = getattr(r, "preferred_language", "fr") or "fr"
        try:
            do_send_email(
                notification_type="case_submitted",
                recipient_email=r.email,
                language=lang,
                template_context={"case": _serialize(case), "recipient": _serialize(r)},
            )
        except Exception:
            pass


def send_case_verified(*, case) -> None:
    """Notify the next approver that a case has been verified."""
    from cases.state_machine import approver_role_for_step, StateError
    from .tasks import do_send_email

    try:
        next_role = approver_role_for_step(case.current_step)
    except StateError:
        return

    from accounts.models import User

    recipients = User.objects.filter(role=next_role, is_active=True)
    for r in recipients:
        lang = getattr(r, "preferred_language", "fr") or "fr"
        try:
            do_send_email(
                notification_type="case_verified",
                recipient_email=r.email,
                language=lang,
                template_context={"case": _serialize(case), "recipient": _serialize(r), "step": case.current_step},
            )
        except Exception:
            pass


def send_case_approved(*, case) -> None:
    """Notify the CB that a case has been fully approved."""
    from .tasks import do_send_email

    if case.created_by:
        lang = getattr(case.created_by, "preferred_language", "fr") or "fr"
        try:
            do_send_email(
                notification_type="case_approved",
                recipient_email=case.created_by.email,
                language=lang,
                template_context={"case": _serialize(case), "step": case.current_step},
            )
        except Exception:
            pass


def send_case_rejected(*, case, actor=None) -> None:
    """Notify the CB that a case was rejected."""
    from .tasks import do_send_email

    if case.created_by:
        lang = getattr(case.created_by, "preferred_language", "fr") or "fr"
        try:
            do_send_email(
                notification_type="case_rejected",
                recipient_email=case.created_by.email,
                language=lang,
                template_context={"case": _serialize(case), "actor": _serialize(actor)},
            )
        except Exception:
            pass


def send_case_deferred(*, case, actor=None) -> None:
    """Notify the CB that a case was deferred (sent back for clarification)."""
    from .tasks import do_send_email

    if case.created_by:
        lang = getattr(case.created_by, "preferred_language", "fr") or "fr"
        try:
            do_send_email(
                notification_type="case_deferred",
                recipient_email=case.created_by.email,
                language=lang,
                template_context={"case": _serialize(case), "actor": _serialize(actor), "step": case.current_step},
            )
        except Exception:
            pass


def send_case_closed(*, case, actor=None) -> None:
    """Notify relevant parties that a case has been closed after payment."""
    from accounts.models import User
    from .tasks import do_send_email

    # Notify CB + DGFC + DGFAP
    recipients = set()
    if case.created_by:
        recipients.add(case.created_by)
    recipients.update(User.objects.filter(role__in=["DGFC", "DGFAP"], is_active=True))

    for r in recipients:
        lang = getattr(r, "preferred_language", "fr") or "fr"
        try:
            do_send_email(
                notification_type="case_closed",
                recipient_email=r.email,
                language=lang,
                template_context={"case": _serialize(case), "actor": _serialize(actor), "recipient": _serialize(r)},
            )
        except Exception:
            pass


def send_amount_proposed(*, case, actor=None) -> None:
    """Notify the DGFAP that an amount has been proposed by DGFC."""
    from accounts.models import User
    from .tasks import do_send_email

    recipients = User.objects.filter(role="DGFAP", is_active=True)
    for r in recipients:
        lang = getattr(r, "preferred_language", "fr") or "fr"
        try:
            do_send_email(
                notification_type="amount_proposed",
                recipient_email=r.email,
                language=lang,
                template_context={
                    "case": _serialize(case),
                    "amount_xaf": case.amount_proposed,
                    "actor": _serialize(actor),
                },
            )
        except Exception:
            pass


def send_amount_authorized(*, case, actor=None) -> None:
    """Notify WCS that DGFAP has authorized the payment amount."""
    from accounts.models import User
    from .tasks import do_send_email

    recipients = User.objects.filter(role="WCS", is_active=True)
    for r in recipients:
        lang = getattr(r, "preferred_language", "fr") or "fr"
        try:
            do_send_email(
                notification_type="amount_authorized",
                recipient_email=r.email,
                language=lang,
                template_context={
                    "case": _serialize(case),
                    "amount_xaf": case.amount_authorized,
                    "actor": _serialize(actor),
                },
            )
        except Exception:
            pass


# ---------------------------------------------------------------------------
# Batch helper for the approval dispatcher
# ---------------------------------------------------------------------------


def notify_approver(case, from_step: int | None = None) -> None:
    """Compatibility shim used by approvals.notifications — sends approver email."""
    from cases.state_machine import approver_role_for_step, StateError
    from .tasks import do_send_email

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
        try:
            do_send_email(
                notification_type="case_verified",
                recipient_email=recipient.email,
                language=lang,
                template_context={"case": _serialize(case), "step": case.current_step, "role": role},
            )
        except Exception:
            pass
