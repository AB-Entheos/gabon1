"""Audit explorer endpoint. Filterable by case, actor, event type, step, date range."""
from __future__ import annotations

from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from cases.models import Event
from accounts.permissions import IsAdmin


class AuditEventSerializer(serializers.ModelSerializer):
    actor_email = serializers.CharField(source="actor.email", read_only=True)
    actor_role = serializers.CharField(source="actor.role", read_only=True)
    case_uid = serializers.CharField(source="case.uid", read_only=True)

    class Meta:
        model = Event
        fields = (
            "id",
            "case_uid",
            "actor_email",
            "actor_role",
            "occurred_at",
            "event_type",
            "from_step",
            "to_step",
            "notes",
            "payload_hash",
        )


class _AuditListResponseSerializer(serializers.Serializer):
    results = AuditEventSerializer(many=True)
    count = serializers.IntegerField()


@extend_schema(responses=_AuditListResponseSerializer)
@api_view(["GET"])
@permission_classes([IsAuthenticated, IsAdmin])
def list_audit(request):
    """List all events. Filters: case_uid, actor_email, event_type, since, until."""
    qs = Event.objects.select_related("actor", "case").order_by("-occurred_at")

    case_uid = request.query_params.get("case_uid")
    if case_uid:
        qs = qs.filter(case__uid=case_uid)

    actor_email = request.query_params.get("actor_email")
    if actor_email:
        qs = qs.filter(actor__email__iexact=actor_email)

    event_type = request.query_params.get("event_type")
    if event_type:
        qs = qs.filter(event_type=event_type)

    since = request.query_params.get("since")
    if since:
        qs = qs.filter(occurred_at__gte=since)

    until = request.query_params.get("until")
    if until:
        qs = qs.filter(occurred_at__lte=until)

    qs = qs[:1000]
    return Response(
        {
            "results": AuditEventSerializer(qs, many=True).data,
            "count": len(qs),
        }
    )
