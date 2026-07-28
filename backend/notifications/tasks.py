"""Celery tasks for sending email notifications.

All email sending is funnelled through a single generic task so we get
consistent retry logic, logging, and template rendering in one place.
"""
from __future__ import annotations

import logging
from typing import Any

from celery import shared_task
from django.conf import settings
from django.core.mail import send_mail
from django.template.loader import render_to_string
from django.utils import translation

logger = logging.getLogger(__name__)

MAX_RETRIES = 3
RETRY_BACKOFF = 30  # seconds


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
    """Render the bilingual email template and send via Django's email backend.

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
    ctx = template_context or {}

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

    send_mail(
        subject=subject,
        message=body,
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[recipient_email],
        fail_silently=False,
    )

    logger.info("Email sent: type=%s to=%s lang=%s", notification_type, recipient_email, language)
    return {"sent": True, "type": notification_type, "to": recipient_email}
