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

    action_role = None
    if case.status == "SUBMITTED":
        action_role = "AB"
    elif case.status == "AT_APPROVAL" and action not in {"dgfc_propose_amount", "dgfap_authorize_amount"}:
        action_role = {2: "AB", 3: "WCS", 4: "DGFC", 5: "DGFAP"}.get(case.current_step)
    elif case.status == "APPROVED":
        action_role = "WCS"

    if case.status in {"SUBMITTED", "AT_APPROVAL", "APPROVED", "REJECTED", "DEFERRED"}:
        notify.send_case_stage_update(
            case=case,
            actor=actor,
            action=action,
            action_role=action_role,
        )
    elif case.status == "CLOSED":
        notify.send_case_closed_update(case=case, actor=actor)



