"""Wire approval transitions to Celery notifications.

Override the default `transition()` to enqueue a notify task after every
state change. Idempotent: a transition that doesn't change step/status
won't fire.
"""
from __future__ import annotations


def schedule_notifications(case, from_step: int | None, action: str = "", actor=None) -> None:
    """Enqueue the right notification(s) for a state change."""
    from notifications import service as notify
    from accounts.models import User

    recipients = User.objects.filter(is_active=True)
    case_label = str(case.claimant_name)
    event_key = f"case.{action or case.status.lower()}"
    notify_in_app = notify.notify_in_app
    if case.status == "SUBMITTED":
        notify_in_app(recipients=recipients.filter(role="AB"), event_key=event_key,
                      title={"en": "Case submitted", "fr": "Dossier soumis"},
                      message={"en": f"{case_label} is ready for verification.", "fr": f"{case_label} attend sa vérification."},
                      kind="ACTION", case=case, payload={"step": case.current_step})
    elif case.status == "AT_APPROVAL":
        role = {2: "AB", 3: "WCS", 4: "DGFC", 5: "DGFAP"}.get(case.current_step)
        if role:
            notify_in_app(recipients=recipients.filter(role=role), event_key=event_key,
                          title={"en": "Case awaiting review", "fr": "Dossier en attente de revue"},
                          message={"en": f"{case_label} is awaiting your review.", "fr": f"{case_label} attend votre revue."},
                          kind="ACTION", case=case, payload={"step": case.current_step})
    elif case.status in {"REJECTED", "DEFERRED", "APPROVED", "CLOSED"}:
        if case.created_by_id:
            labels = {
                "REJECTED": ("Case rejected", "Dossier rejeté", "This case was rejected.", "Ce dossier a été rejeté.", "WARNING"),
                "DEFERRED": ("Case deferred", "Dossier renvoyé", "This case needs clarification.", "Ce dossier nécessite des précisions.", "ACTION"),
                "APPROVED": ("Case approved", "Dossier approuvé", "This case is approved for payment.", "Ce dossier est approuvé pour paiement.", "SUCCESS"),
                "CLOSED": ("Case closed", "Dossier clôturé", "This case has been closed.", "Ce dossier a été clôturé.", "SUCCESS"),
            }
            en_title, fr_title, en_message, fr_message, kind = labels[case.status]
            notify_in_app(recipients=recipients.filter(pk=case.created_by_id), event_key=event_key,
                          title={"en": en_title, "fr": fr_title},
                          message={"en": en_message, "fr": fr_message},
                          kind=kind, case=case, payload={"step": case.current_step})

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



