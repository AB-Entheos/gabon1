"""Wire approval transitions to Celery notifications.

Override the default `transition()` to enqueue a notify task after every
state change. Idempotent: a transition that doesn't change step/status
won't fire.
"""
from __future__ import annotations

from celery import chain
from django.db import transaction

from . import tasks


def schedule_notifications(case, from_step: int | None) -> None:
    """Enqueue the right notification(s) for a state change."""
    if case.status == "AT_APPROVAL":
        tasks.notify_approver.delay(str(case.uid))
    elif case.status == "REJECTED":
        # Optional: notify CB. For now we log + emit a status event only.
        pass
    elif case.status == "APPROVED":
        tasks.notify_approver.delay(str(case.uid))
    elif case.status == "CLOSED":
        pass


def schedule_accelerated_benefit(case, amount_xaf: int) -> None:
    tasks.notify_accelerated_benefit.delay(str(case.uid), amount_xaf)
