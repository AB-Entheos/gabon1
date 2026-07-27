from django.conf import settings
from django.db import models
from django.utils.translation import gettext_lazy as _


class FormDefinition(models.Model):
    """Config-driven form. Adding a form = inserting one row. No migration."""

    class Status(models.TextChoices):
        DRAFT = "DRAFT", _("Draft")
        PUBLISHED = "PUBLISHED", _("Published")
        ARCHIVED = "ARCHIVED", _("Archived")

    slug = models.SlugField(max_length=64)
    title = models.CharField(max_length=200)
    version = models.PositiveSmallIntegerField(default=1)
    schema = models.JSONField(
        help_text=_("Bilingual JSONB. See master doc §6 — field labels as {en, fr}."),
    )
    role_scope = models.CharField(
        max_length=64,
        help_text=_("Comma-separated role codes allowed to fill this form."),
    )
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.DRAFT)
    published_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-published_at", "slug"]
        unique_together = [("slug", "version")]

    def __str__(self) -> str:
        return f"{self.slug} v{self.version} [{self.status}]"


class FormSubmission(models.Model):
    case = models.ForeignKey(
        "cases.Case", on_delete=models.CASCADE, related_name="submissions"
    )
    form_definition = models.ForeignKey(
        FormDefinition, on_delete=models.PROTECT, related_name="submissions"
    )
    submitted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="submissions",
    )
    submitted_at = models.DateTimeField(auto_now_add=True)
    role_at_submission = models.CharField(max_length=16)
    payload = models.JSONField()
    version = models.PositiveSmallIntegerField()

    class Meta:
        ordering = ["-submitted_at"]
        indexes = [
            models.Index(fields=["case"]),
            models.Index(fields=["form_definition"]),
        ]

    def __str__(self) -> str:
        return f"{self.form_definition.slug} on {self.case.uid.hex[:8]}"


class FormAttachment(models.Model):
    class ScanStatus(models.TextChoices):
        PENDING = "PENDING", _("Pending")
        CLEAN = "CLEAN", _("Clean")
        INFECTED = "INFECTED", _("Infected")

    submission = models.ForeignKey(
        FormSubmission, on_delete=models.CASCADE, related_name="attachments"
    )
    s3_key = models.CharField(max_length=512)
    filename = models.CharField(max_length=256)
    mime = models.CharField(max_length=128)
    size_bytes = models.PositiveBigIntegerField()
    sha256 = models.CharField(max_length=64)
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="attachments",
    )
    uploaded_at = models.DateTimeField(auto_now_add=True)
    scan_status = models.CharField(
        max_length=16, choices=ScanStatus.choices, default=ScanStatus.PENDING
    )
    file_type = models.CharField(max_length=128, blank=True, null=True)
    description = models.CharField(max_length=512, blank=True, default="")
    uploaded_by_name = models.CharField(max_length=200, blank=True, default="")
    deleted_at = models.DateTimeField(null=True, blank=True, db_index=True)
    deleted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="deleted_attachments",
    )

    class Meta:
        ordering = ["-uploaded_at"]

    def __str__(self) -> str:
        return f"{self.filename} ({self.size_bytes} bytes)"
