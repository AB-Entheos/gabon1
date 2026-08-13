from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import InAppNotification


class NotificationSerializer(serializers.ModelSerializer):
    case_uid = serializers.UUIDField(source="case.uid", read_only=True, allow_null=True)

    class Meta:
        model = InAppNotification
        fields = (
            "id",
            "case_uid",
            "kind",
            "event_key",
            "title",
            "message",
            "payload",
            "read_at",
            "created_at",
        )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def list_notifications(request):
    limit = min(max(int(request.query_params.get("limit", 30)), 1), 100)
    qs = InAppNotification.objects.filter(recipient=request.user).select_related("case")
    unread_only = request.query_params.get("unread") == "true"
    if unread_only:
        qs = qs.filter(read_at__isnull=True)
    rows = list(qs[:limit])
    return Response({
        "results": NotificationSerializer(rows, many=True).data,
        "unread_count": InAppNotification.objects.filter(
            recipient=request.user, read_at__isnull=True
        ).count(),
    })


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def mark_notification_read(request, notification_id: int):
    notification = InAppNotification.objects.filter(
        id=notification_id, recipient=request.user
    ).first()
    if notification is None:
        return Response({"detail": "Notification not found."}, status=status.HTTP_404_NOT_FOUND)
    if notification.read_at is None:
        notification.read_at = timezone.now()
        notification.save(update_fields=["read_at"])
    return Response(NotificationSerializer(notification).data)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def mark_all_notifications_read(request):
    qs = InAppNotification.objects.filter(recipient=request.user, read_at__isnull=True)
    updated = qs.update(read_at=timezone.now())
    return Response({"updated": updated})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def desktop_notifications_enabled(request):
    """Send one confirmation email when the user grants browser permission."""
    from .service import send_desktop_notifications_enabled

    send_desktop_notifications_enabled(user=request.user)
    return Response({"sent": True})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def desktop_notifications_disabled(request):
    from .service import send_desktop_notifications_disabled

    send_desktop_notifications_disabled(user=request.user)
    return Response({"sent": True})
