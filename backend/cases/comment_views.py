"""Comment endpoint — any role that can SEE a case can post a comment.

Per user requirement: comments + uploads are allowed at any visible stage;
the Approve button is only enabled for the current approver role. Comments
are append-only audit events of type COMMENT.
"""
from __future__ import annotations

from rest_framework import serializers, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.models import User
from cases.models import Case, Event


class CommentSerializer(serializers.Serializer):
    notes = serializers.CharField(min_length=1, max_length=2000)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def post_comment(request, uid: str):
    """Post a comment on a case. Allowed for any role that can see the case."""
    if not isinstance(request.user, User):
        return Response({"detail": "Authentication required."}, status=401)
    case = _safe_get(uid)
    if case is None:
        return Response({"detail": "case not found"}, status=404)
    s = CommentSerializer(data=request.data)
    s.is_valid(raise_exception=True)
    notes = s.validated_data["notes"]
    event = Event.objects.create(
        case=case,
        actor=request.user,
        event_type=Event.Type.COMMENT,
        from_step=case.current_step,
        to_step=case.current_step,
        notes=notes,
        payload_hash=Event.compute_hash({"notes": notes, "actor": request.user.email}),
    )
    return Response(
        {
            "event_id": event.id,
            "case_uid": str(case.uid),
            "actor_email": request.user.email,
            "actor_role": request.user.role,
            "notes": notes,
            "occurred_at": event.occurred_at,
        },
        status=status.HTTP_201_CREATED,
    )


def _safe_get(uid: str):
    try:
        return Case.objects.get(uid=uid)
    except (Case.DoesNotExist, ValueError):
        return None
