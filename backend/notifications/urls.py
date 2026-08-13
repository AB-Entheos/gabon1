from django.urls import path

from .views import (
    list_notifications,
    mark_all_notifications_read,
    mark_notification_read,
)
from .views import desktop_notifications_enabled, desktop_notifications_disabled

urlpatterns = [
    path("notifications", list_notifications, name="notifications-list"),
    path("notifications/read-all", mark_all_notifications_read, name="notifications-read-all"),
    path("notifications/<int:notification_id>/read", mark_notification_read, name="notifications-read"),
    path("notifications/desktop-enabled", desktop_notifications_enabled, name="notifications-desktop-enabled"),
    path("notifications/desktop-disabled", desktop_notifications_disabled, name="notifications-desktop-disabled"),
]
