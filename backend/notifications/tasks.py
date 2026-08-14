"""Celery tasks for sending email notifications.

All email sending is funnelled through a single generic task so we get
consistent retry logic, logging, and template rendering in one place.
Uses the Resend API for production-quality deliverability.
"""
from __future__ import annotations

import logging
from typing import Any

import resend
from celery import shared_task
from django.conf import settings
from django.template.loader import get_template, render_to_string
from django.utils import translation

logger = logging.getLogger(__name__)

MAX_RETRIES = 3
RETRY_BACKOFF = 30  # seconds


def _configure_resend() -> None:
    """Set the global Resend API key from Django settings."""
    api_key = getattr(settings, "RESEND_API_KEY", "")
    if api_key:
        resend.api_key = api_key


def render_email(*, notification_type: str, language: str = "fr", template_context: dict[str, Any] | None = None) -> dict[str, str]:
    from notifications.service import _template_path

    tpl_path = _template_path(notification_type, language)
    ctx = dict(template_context or {})
    ctx.setdefault("frontend_url", getattr(settings, "FRONTEND_URL", "https://hec.ab-entheos.com"))
    with translation.override(language):
        tpl = get_template(tpl_path)
        raw = tpl.render(ctx)
    lines = raw.strip().splitlines()
    subject = lines[0].replace("Subject:", "", 1).strip() if lines and lines[0].startswith("Subject:") else f"[HEC] {notification_type.replace('_', ' ').title()}"
    body = "\n".join(lines[1:]).strip() if lines and lines[0].startswith("Subject:") else raw
    return {"subject": subject, "body": body}


def do_send_email(
    *,
    notification_type: str,
    recipient_email: str,
    language: str = "fr",
    template_context: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Render and send an email via the Resend API (synchronous).

    This is the core implementation used both by the Celery task and
    by synchronous callers (e.g. account creation welcome email).
    """
    rendered = render_email(notification_type=notification_type, language=language, template_context=template_context)
    subject = rendered["subject"]
    body = rendered["body"]

    from_email = getattr(settings, "DEFAULT_FROM_EMAIL", "hec@ab-entheos.com")
    api_key = getattr(settings, "RESEND_API_KEY", "")

    if api_key:
        _configure_resend()
        params: resend.Emails.SendParams = {
            "from": from_email,
            "to": [recipient_email],
            "subject": subject,
            "text": body,
        }
        result = resend.Emails.send(params)
        logger.info("Resend email sent: type=%s to=%s id=%s", notification_type, recipient_email, result.get("id", "?"))
        return {"sent": True, "type": notification_type, "to": recipient_email, "provider": "resend", "resend_id": result.get("id")}
    else:
        from django.core.mail import send_mail as django_send_mail
        logger.info("RESEND_API_KEY not set — console fallback: type=%s to=%s", notification_type, recipient_email)
        django_send_mail(subject=subject, message=body, from_email=from_email, recipient_list=[recipient_email])
        return {"sent": True, "type": notification_type, "to": recipient_email, "provider": "console"}


@shared_task(
    bind=True,
    max_retries=MAX_RETRIES,
    default_retry_delay=RETRY_BACKOFF,
    autoretry_for=(Exception,),
    retry_backoff=True,
    retry_jitter=True,
)
def send_notification_email(
    self,
    *,
    notification_type: str,
    recipient_email: str,
    language: str = "fr",
    template_context: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Celery wrapper around do_send_email — adds retry logic."""
    return do_send_email(
        notification_type=notification_type,
        recipient_email=recipient_email,
        language=language,
        template_context=template_context,
    )
