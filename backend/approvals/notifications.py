"""Wire approval transitions to Celery notifications.

Override the default `transition()` to enqueue a notify task after every
state change. Idempotent: a transition that doesn't change step/status
won't fire.
"""
from __future__ import annotations


def schedule_notifications(case, from_step: int | None, action: str = "", actor=None) -> None:
    """Enqueue the right notification(s) for a state change."""
    from notifications import service as notify

    if case.status == "SUBMITTED":
        notify.send_case_submitted(case=case)
    elif case.status == "AT_APPROVAL":
        if action == "verify":
            notify.send_case_verified(case=case)
        notify.notify_approver(case=case, from_step=from_step)
    elif case.status == "REJECTED":
        notify.send_case_rejected(case=case, actor=actor)
    elif case.status == "DEFERRED":
        notify.send_case_deferred(case=case, actor=actor)
    elif case.status == "APPROVED":
        notify.notify_approver(case=case, from_step=from_step)
        notify.send_case_approved(case=case)
    elif case.status == "CLOSED":
        notify.send_case_closed(case=case, actor=actor)



