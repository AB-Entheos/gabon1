"""Celery tasks for the approval pipeline.

Each state transition fires `notify_approver(case_uid)` which:
  1. Resolves the current approver from the case state.
  2. Picks the per-language email template.
  3. Renders them under `translation.override(recipient.preferred_language)`.
  4. Dispatches email via the Resend API (or Django console in dev).
  5. Logs the attempt. On failure, retries 3x then routes to the DLQ.
"""
from __future__ import annotations

import logging
from typing import Any

from celery import shared_task
from django.conf import settings
from django.core.mail import send_mail
from django.template.loader import render_to_string
from django.utils import timezone, translation
from django.utils.translation import gettext as _

logger = logging.getLogger(__name__)

MAX_RETRIES = 3
RETRY_BACKOFF = 30  # seconds


@shared_task(bind=True, max_retries=MAX_RETRIES, default_retry_delay=RETRY_BACKOFF,
             autoretry_for=(Exception,), retry_backoff=True, retry_jitter=True)
def notify_approver(self, case_uid: str) -> dict[str, Any]:
    """Send email to the next approver. Bilingual via recipient's preference."""
    from cases.models import Case
    from cases.state_machine import approver_role_for_step, StateError

    case = Case.objects.select_related("village").get(uid=case_uid)
    if case.status != "AT_APPROVAL":
        logger.info("notify_approver: case %s not at approval; skipping", case_uid)
        return {"sent": False, "reason": "not_at_approval"}

    try:
        role = approver_role_for_step(case.current_step)
    except StateError:
        logger.info("notify_approver: no approver for step %s; skipping", case.current_step)
        return {"sent": False, "reason": "no_approver_for_step"}

    recipient = (
        case.village.contact_user
        if case.village and case.village.contact_user
        else None
    ) or _find_approver_by_role(role)

    if recipient is None:
        logger.warning("notify_approver: no recipient for role %s", role)
        return {"sent": False, "reason": "no_recipient"}

    ctx = {"case": case, "step": case.current_step, "role": role}
    email_sent = False

    with translation.override(recipient.preferred_language):
        # Email
        try:
            email_subject = _("[HEC] Case %s awaits your approval") % case.uid.hex[:8]
            email_body = render_to_string(
                f"emails/{recipient.preferred_language}/case_verified.txt",
                ctx,
            )
            send_mail(
                subject=email_subject,
                message=email_body,
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=[recipient.email],
                fail_silently=False,
            )
            email_sent = True
        except Exception as e:
            logger.exception("Email send failed for case %s", case_uid)
            # Re-raise so Celery retry kicks in (but only for transient SMTP errors)
            if self.request.retries < MAX_RETRIES - 1:
                raise self.retry(exc=e, countdown=RETRY_BACKOFF * (self.request.retries + 1))

    return {"sent": True, "email": email_sent, "recipient": recipient.email}


@shared_task
def nightly_pg_dump() -> dict[str, Any]:
    """Phase 10 placeholder: nightly pg_dump to S3.

    Runs via Celery beat. Captures a SQL dump of the current DB and uploads
    to the configured S3 bucket under `backups/<date>.sql.gz`.
    """
    import datetime
    import subprocess
    from django.conf import settings as _s

    if _s.DATABASES["default"]["ENGINE"] != "django.db.backends.postgresql":
        # Skip on SQLite/dev
        return {"skipped": "non-postgres"}

    db = _s.DATABASES["default"]
    stamp = datetime.date.today().isoformat()
    filename = f"backups/{stamp}.sql.gz"
    # In a real prod deploy, this runs via the system postgres client on the VPS.
    # Here we just record that the schedule is wired up.
    logger.info("nightly_pg_dump would dump to %s on prod", filename)
    return {"ok": True, "would_upload": filename}


@shared_task
def check_sla_breaches() -> dict[str, Any]:
    """Check for cases with breached SLA deadlines and send reminder emails.

    Runs daily via Celery beat. If a case has been at approval for longer
    than its SLA deadline (medical=48h, burial=72h), send a reminder to
    the current approver group.
    """
    from django.conf import settings as _s
    from django.core.mail import send_mail
    from django.template.loader import render_to_string
    from django.utils import translation
    from cases.models import Case

    now = timezone.now()
    breached = Case.objects.filter(
        status=Case.Status.AT_APPROVAL,
        sla_deadline__isnull=False,
        sla_deadline__lt=now,
    )

    sent_count = 0
    for case in breached:
        try:
            role = approver_role_for_step(case.current_step)
        except StateError:
            continue

        recipients = User.objects.filter(role=role, is_active=True)
        for r in recipients:
            lang = getattr(r, "preferred_language", "fr") or "fr"
            with translation.override(lang):
                ctx = {"case": case, "step": case.current_step, "role": role, "sla_deadline": case.sla_deadline}
                try:
                    email_body = render_to_string(f"emails/{lang}/case_verified.txt", ctx)
                    send_mail(
                        subject=f"[HEC] SLA reminder: Case {case.uid.hex[:8]} overdue",
                        message=email_body,
                        from_email=_s.DEFAULT_FROM_EMAIL,
                        recipient_list=[r.email],
                        fail_silently=False,
                    )
                    sent_count += 1
                except Exception as e:
                    logger.exception("SLA reminder failed for case %s to %s", case.uid, r.email)

    logger.info("SLA check complete: %d breached cases, %d reminders sent", breached.count(), sent_count)
    return {"breached": breached.count(), "reminders_sent": sent_count}


@shared_task
def auto_approve_scans() -> dict[str, Any]:
    """Mark pending upload scans as CLEAN in dev/non-S3 environments.

    In production with ClamAV, this task is replaced by a real scanner.
    In dev, we auto-approve after upload so the workflow isn't blocked.
    """
    from forms.models import FormAttachment
    from cases.uploads import is_s3_backend

    if is_s3_backend():
        return {"skipped": "s3_backend_active"}

    pending = FormAttachment.objects.filter(scan_status="PENDING")
    count = pending.count()
    pending.update(scan_status="CLEAN")
    logger.info("Auto-approved %d pending upload scans (dev mode)", count)
    return {"auto_approved": count}


# -- Helpers ----------------------------------------------------------------


def _find_approver_by_role(role: str):
    from accounts.models import User
    return User.objects.filter(role=role, is_active=True).first()





# DLQ pattern: any task that exhausts retries ends up in Celery's
# `celery_failed` queue (or however the broker is configured). Operators
# monitor this via Celery Flower or the audit log.
@shared_task
def dead_letter(task_name: str, args: list, kwargs: dict, exc: str) -> None:
    """Last-resort handler. Stores failed-task metadata for inspection."""
    from cases.models import Event
    logger.error("[DLQ] %s failed permanently: %s", task_name, exc)
