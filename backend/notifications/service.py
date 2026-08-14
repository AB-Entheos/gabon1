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
            "last_name": getattr(obj, "last_name", ""),
            "full_name": getattr(obj, "get_full_name", lambda: "")() or getattr(obj, "email", ""),
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
    "case_stage_changed": "case_stage_changed",
    "case_action_required": "case_action_required",
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
                template_context={
                    "case": {
                        **_serialize(case),
                        "created_by_role": getattr(case.created_by, "get_role_display", lambda: "")(),
                        "created_by_name": getattr(case.created_by, "get_full_name", lambda: "")()
                        or getattr(case.created_by, "email", ""),
                    },
                    "recipient": _serialize(r),
                },
            )
        except Exception:
            # Individual email failures must never block case creation.
            pass


def _active_recipients(*, role=None):
    from accounts.models import User

    recipients = User.objects.filter(is_active=True).exclude(email="")
    return recipients.filter(role=role) if role else recipients


def _stage_name(case) -> str:
    return {
        "DRAFT": "Draft",
        "SUBMITTED": "Submitted",
        "AT_APPROVAL": {
            2: "AB review",
            3: "WCS review",
            4: "DGFC review",
            5: "DGFAP review",
        }.get(case.current_step, "Approval review"),
        "APPROVED": "Approved for payment",
        "REJECTED": "Rejected",
        "DEFERRED": "Deferred for clarification",
        "CLOSED": "Closed",
    }.get(case.status, case.status)


def _actor_context(actor) -> dict[str, str]:
    actor_data = _serialize(actor) or {}
    role = getattr(actor, "get_role_display", lambda: getattr(actor, "role", ""))()
    name = getattr(actor, "get_full_name", lambda: "")() or getattr(actor, "email", "")
    actor_data.update({"actor_role": role, "actor_name": name, "actor_email": getattr(actor, "email", "")})
    return actor_data


def _historical_stage_actor(case, stage: str, fallback):
    from cases.models import Event

    event_type = {
        "created": Event.Type.CREATED,
        "submitted": Event.Type.SUBMITTED,
        "verified": Event.Type.VERIFIED,
        "amount_proposed": Event.Type.AMOUNT_PROPOSED,
        "amount_authorized": Event.Type.AMOUNT_AUTHORIZED,
        "approved": Event.Type.APPROVED,
        "rejected": Event.Type.REJECTED,
        "deferred": Event.Type.DEFERRED,
        "closed": Event.Type.CLOSED,
    }.get(stage)
    events = case.events.select_related("actor")
    if event_type:
        event = events.filter(event_type=event_type).order_by("-occurred_at").first()
        if event:
            return event.actor
    if stage in {"advance_ab", "advance_wcs", "advance_dgfc"}:
        target_step = {"advance_ab": 3, "advance_wcs": 4, "advance_dgfc": 5}[stage]
        event = events.filter(event_type=Event.Type.ADVANCED, to_step=target_step).order_by("-occurred_at").first()
        if event:
            return event.actor
    return fallback


def current_case_email_stage(case) -> str:
    if case.status == "DRAFT":
        return "created"
    if case.status == "SUBMITTED":
        return "submitted"
    if case.status == "REJECTED":
        return "rejected"
    if case.status == "DEFERRED":
        return "deferred"
    if case.status == "CLOSED":
        return "closed"
    if case.status == "APPROVED":
        return "approved"
    if case.status == "AT_APPROVAL":
        if case.current_step == 2:
            return "verified"
        if case.current_step == 3:
            return "advance_ab"
        if case.current_step == 4:
            return "amount_proposed" if case.amount_proposed else "advance_wcs"
        if case.current_step == 5:
            return "amount_authorized" if case.amount_authorized else "advance_dgfc"
    raise ValueError("No email stage is available for this case state")


def _manual_stage_context(*, case, stage: str, actor) -> tuple[str, dict[str, Any], str | None]:
    stage_config = {
        "created": {"action": "created the case", "current_stage": "Case created", "role": None},
        "submitted": {"action": "initiated the approval workflow", "current_stage": "Approval workflow initiated - AB verification", "role": "AB"},
        "verified": {"action": "verified the case", "current_stage": "AB review", "role": "AB"},
        "advance_ab": {"action": "forwarded the case", "current_stage": "WCS review", "role": "WCS"},
        "advance_wcs": {"action": "forwarded the case", "current_stage": "DGFC review", "role": "DGFC"},
        "amount_proposed": {"action": "proposed an amount for the case", "current_stage": "DGFAP review", "role": "DGFAP"},
        "advance_dgfc": {"action": "forwarded the case", "current_stage": "DGFAP review", "role": "DGFAP"},
        "amount_authorized": {"action": "authorized the payment amount", "current_stage": "Payment preparation", "role": "WCS"},
        "approved": {"action": "approved the case", "current_stage": "Approved for payment", "role": "WCS"},
        "rejected": {"action": "rejected the case", "current_stage": "Rejected", "role": None},
        "deferred": {"action": "deferred the case", "current_stage": "Deferred for clarification", "role": None},
        "closed": {"action": "closed the case", "current_stage": "Closed", "role": None},
    }
    config = stage_config.get(stage)
    if config is None:
        raise ValueError(f"Unsupported case email stage: {stage}")
    historical_actor = _historical_stage_actor(case, stage, actor)
    context = {
        "case": _serialize(case),
        "actor": _actor_context(historical_actor),
        "claim_id": str(case.uid)[:8],
        "action_taken": config["action"],
        "current_stage": config["current_stage"],
        "action_code": stage,
        "authorized_amount_xaf": case.amount_authorized or 0,
    }
    if stage == "amount_proposed":
        context["amount_xaf"] = case.amount_proposed
    elif stage == "amount_authorized":
        context["amount_xaf"] = case.amount_authorized
    notification_type = "new_claim" if stage == "created" else "case_stage_changed"
    if stage in {"amount_proposed", "amount_authorized"}:
        notification_type = stage
    return notification_type, context, config["role"]


def preview_manual_case_stage_email(*, case, stage: str, actor, language: str) -> dict[str, str]:
    from .tasks import render_email

    notification_type, context, role = _manual_stage_context(case=case, stage=stage, actor=actor)
    return {"stage": stage, "role": role or "ALL", "language": language, **render_email(
        notification_type=notification_type,
        language=language,
        template_context=context,
    )}


def send_manual_case_stage_email(*, case, stage: str, actor) -> dict[str, int]:
    """Resend a selected case-stage notification at the request of a superadmin."""
    from .tasks import do_send_email

    notification_type, context, role = _manual_stage_context(case=case, stage=stage, actor=actor)
    recipients = list(_active_recipients())
    action_recipients = list(_active_recipients(role=role)) if role else []
    sent = 0
    failed = 0

    for recipient in recipients:
        try:
            do_send_email(
                notification_type=notification_type,
                recipient_email=recipient.email,
                language=getattr(recipient, "preferred_language", "fr") or "fr",
                template_context={**context, "recipient": _serialize(recipient)},
            )
            sent += 1
        except Exception:
            failed += 1
            logger.exception("Manual case email failed for case %s to %s", case.uid, recipient.email)

    for recipient in action_recipients:
        try:
            do_send_email(
                notification_type="case_action_required",
                recipient_email=recipient.email,
                language=getattr(recipient, "preferred_language", "fr") or "fr",
                template_context={**context, "recipient": _serialize(recipient)},
            )
            sent += 1
        except Exception:
            failed += 1
            logger.exception("Manual action email failed for case %s to %s", case.uid, recipient.email)

    return {"sent": sent, "failed": failed}


def send_case_stage_update(*, case, actor, action: str, action_role: str | None = None) -> None:
    """Send one stage update to everyone and one action email to the assignees."""
    from .tasks import do_send_email

    case_data = _serialize(case)
    actor_data = _actor_context(actor)
    action_text = {
        "submit": "initiated the approval workflow",
        "verify": "verified the case",
        "advance_ab": "forwarded the case",
        "advance_wcs": "forwarded the case",
        "advance_dgfc": "forwarded the case",
        "advance_dgfap": "approved the case",
        "reject": "rejected the case",
        "defer_from_3": "deferred the case",
        "defer_from_4": "deferred the case",
        "defer_from_5": "deferred the case",
    }.get(action, action.replace("_", " ").lower())
    stage = "Approval workflow initiated - AB verification" if action == "submit" else _stage_name(case)
    context = {
        "case": case_data,
        "actor": actor_data,
        "claim_id": str(case.uid)[:8],
        "action_taken": action_text,
        "current_stage": stage,
        "action_role": action_role or "",
    }
    recipients = set(_active_recipients(role=action_role)) if action_role else set()
    if case.created_by and case.created_by.is_active and case.created_by.email:
        recipients.add(case.created_by)
    for recipient in recipients:
        try:
            do_send_email(
                notification_type="case_stage_changed",
                recipient_email=recipient.email,
                language=getattr(recipient, "preferred_language", "fr") or "fr",
                template_context={**context, "recipient": _serialize(recipient)},
            )
        except Exception:
            logger.exception("Stage email failed for case %s to %s", case.uid, recipient.email)

    if action_role:
        for recipient in _active_recipients(role=action_role):
            try:
                do_send_email(
                    notification_type="case_action_required",
                    recipient_email=recipient.email,
                    language=getattr(recipient, "preferred_language", "fr") or "fr",
                    template_context={**context, "recipient": _serialize(recipient)},
                )
            except Exception:
                logger.exception("Action email failed for case %s to %s", case.uid, recipient.email)


def send_case_disbursement(*, case, disbursement, actor) -> None:
    from django.db.models import Sum
    from .tasks import do_send_email

    total = case.disbursements.filter(deleted_at__isnull=True).aggregate(total=Sum("amount_xaf"))["total"] or 0
    authorized = case.amount_authorized or 0
    context = {
        "case": _serialize(case),
        "actor": _actor_context(actor),
        "claim_id": str(case.uid)[:8],
        "amount_xaf": disbursement.amount_xaf,
        "disbursement_note": disbursement.notes or disbursement.purpose,
        "authorized_amount_xaf": authorized,
        "total_disbursed_xaf": total,
        "balance_xaf": max(authorized - total, 0),
    }
    recipients = set(_active_recipients(role="WCS")) | set(_active_recipients(role="DGFC")) | set(_active_recipients(role="DGFAP"))
    if case.created_by and case.created_by.is_active and case.created_by.email:
        recipients.add(case.created_by)
    for recipient in recipients:
        try:
            do_send_email(
                notification_type="disbursement_recorded",
                recipient_email=recipient.email,
                language=getattr(recipient, "preferred_language", "fr") or "fr",
                template_context={**context, "recipient": _serialize(recipient)},
            )
        except Exception:
            logger.exception("Disbursement email failed for case %s to %s", case.uid, recipient.email)


def send_case_closed_update(*, case, actor) -> None:
    from django.db.models import Sum
    from .tasks import do_send_email

    total = case.disbursements.filter(deleted_at__isnull=True).aggregate(total=Sum("amount_xaf"))["total"] or 0
    context = {"case": _serialize(case), "actor": _actor_context(actor), "claim_id": str(case.uid)[:8], "total_disbursed_xaf": total}
    for recipient in _active_recipients(role="DGFAP"):
        try:
            do_send_email(
                notification_type="case_closed",
                recipient_email=recipient.email,
                language=getattr(recipient, "preferred_language", "fr") or "fr",
                template_context={**context, "recipient": _serialize(recipient)},
            )
        except Exception:
            logger.exception("Closure email failed for case %s to %s", case.uid, recipient.email)


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
    from django.db.models import Sum

    disbursed_amount = case.disbursements.filter(deleted_at__isnull=True).aggregate(
        total=Sum("amount_xaf")
    )["total"] or 0
    authorized_amount = case.amount_authorized or 0

    if case.created_by:
        lang = getattr(case.created_by, "preferred_language", "fr") or "fr"
        try:
            do_send_email(
                notification_type="case_approved",
                recipient_email=case.created_by.email,
                language=lang,
                template_context={
                    "case": _serialize(case),
                    "step": case.current_step,
                    "authorized_amount_xaf": authorized_amount,
                    "disbursed_amount_xaf": disbursed_amount,
                    "remaining_amount_xaf": max(authorized_amount - disbursed_amount, 0),
                },
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

    recipients = User.objects.filter(role="DGFAP", is_active=True).exclude(email="")
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
                    "actor": _actor_context(actor),
                },
            )
        except Exception:
            pass


def send_amount_authorized(*, case, actor=None) -> None:
    """Notify WCS that DGFAP has authorized the payment amount."""
    from accounts.models import User
    from .tasks import do_send_email

    recipients = User.objects.filter(role="WCS", is_active=True).exclude(email="")
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
                    "actor": _actor_context(actor),
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
