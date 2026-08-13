from django.conf import settings
from django.db import models


class InAppNotification(models.Model):
    class Kind(models.TextChoices):
        INFO = "INFO", "Information"
        ACTION = "ACTION", "Action required"
        SUCCESS = "SUCCESS", "Success"
        WARNING = "WARNING", "Warning"

    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="in_app_notifications",
    )
    case = models.ForeignKey(
        "cases.Case",
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="in_app_notifications",
    )
    kind = models.CharField(max_length=16, choices=Kind.choices, default=Kind.INFO)
    event_key = models.CharField(max_length=64)
    title = models.JSONField(default=dict)
    message = models.JSONField(default=dict)
    payload = models.JSONField(default=dict, blank=True)
    read_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["recipient", "read_at"]),
            models.Index(fields=["recipient", "created_at"]),
        ]

    def __str__(self):
        return f"{self.recipient_id} · {self.event_key} · {self.created_at}"
