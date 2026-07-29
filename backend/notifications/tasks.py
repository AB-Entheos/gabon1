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
from django.template.loader import render_to_string
from django.utils import translation

logger = logging.getLogger(__name__)

MAX_RETRIES = 3
RETRY_BACKOFF = 30  # seconds


def _configure_resend() -> None:
    """Set the global Resend API key from Django settings."""
    api_key = getattr(settings, "RESEND_API_KEY", "")
    if api_key:
        resend.api_key = api_key


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
    """Render the bilingual email template and send via the Resend API.

    Falls back to Django's console backend when RESEND_API_KEY is unset
    (useful in local dev without a Resend account).

    Parameters
    ----------
    notification_type :
        Template slug, e.g. ``account_created``, ``case_rejected``.
    recipient_email :
        The recipient's email address.
    language :
        ``"en"`` or ``"fr"`` — selects the template sub-directory.
    template_context :
        Extra context passed to the Django template.
    """
    from notifications.service import _template_path

    tpl_path = _template_path(notification_type, language)
    ctx = dict(template_context or {})
    # Inject the frontend base URL so templates don't hardcode localhost.
    ctx.setdefault("frontend_url", getattr(settings, "FRONTEND_URL", "https://hec.ab-entheos.com"))

    with translation.override(language):
        # Extract the Subject: header from the first line of the template.
        raw = render_to_string(tpl_path, ctx)
        lines = raw.strip().splitlines()
        if lines and lines[0].startswith("Subject:"):
            subject = lines[0].replace("Subject:", "", 1).strip()
            body = "\n".join(lines[1:]).strip()
        else:
            subject = f"[HEC] {notification_type.replace('_', ' ').title()}"
            body = raw

    from_email = getattr(settings, "DEFAULT_FROM_EMAIL", "hec@ab-entheos.com")
    api_key = getattr(settings, "RESEND_API_KEY", "")

    if api_key:
        # --- Resend API path ---
        _configure_resend()
        params: resend.Emails.SendParams = {
            "from": from_email,
            "to": [recipient_email],
            "subject": subject,
            "text": body,
        }
        result = resend.Emails.send(params)
        logger.info(
            "Resend email sent: type=%s to=%s id=%s",
            notification_type,
            recipient_email,
            result.get("id", "?"),
        )
        return {
            "sent": True,
            "type": notification_type,
            "to": recipient_email,
            "provider": "resend",
            "resend_id": result.get("id"),
        }
    else:
        # --- Console fallback (local dev) ---
        from django.core.mail import send_mail as django_send_mail

        logger.info(
            "RESEND_API_KEY not set — falling back to Django console email: type=%s to=%s",
            notification_type,
            recipient_email,
        )
        django_send_mail(
            subject=subject,
            message=body,
            from_email=from_email,
            recipient_list=[recipient_email],
            fail_silently=False,
        )
        return {
            "sent": True,
            "type": notification_type,
            "to": recipient_email,
            "provider": "console",
        }
