from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    """System user. Roles drive the approval chain. CB is the field reporter."""

    class Role(models.TextChoices):
        CB = "CB", "Chef de Brigade"
        AB = "AB", "AB Entheos"
        WCS = "WCS", "WCS"
        DGFC = "DGFC", "DGFC"
        DGFAP = "DGFAP", "DGFAP"
        MINISTER = "MINISTER", "Minister"
        ADMIN = "ADMIN", "Administrator"
        SUPER_ADMIN = "SUPER_ADMIN", "Super Administrator"

    class Status(models.TextChoices):
        ACTIVE = "ACTIVE", "Active"
        SUSPENDED = "SUSPENDED", "Suspended"
        INVITED = "INVITED", "Invited"

    class Language(models.TextChoices):
        EN = "en", "English"
        FR = "fr", "Français"

    email = models.EmailField(unique=True)
    role = models.CharField(max_length=16, choices=Role.choices)
    village = models.ForeignKey(
        "Village",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="users",
    )
    phone = models.CharField(max_length=32, blank=True)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.ACTIVE)
    is_2fa_enabled = models.BooleanField(default=False)
    otp_secret = models.CharField(max_length=64, blank=True)
    preferred_language = models.CharField(
        max_length=2,
        choices=Language.choices,
        default=Language.FR,
    )
    telegram_chat_id = models.CharField(max_length=64, blank=True)

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["username"]

    def requires_2fa(self) -> bool:
        return self.role != self.Role.CB

    def __str__(self) -> str:
        return f"{self.get_role_display()} — {self.email}"


class Village(models.Model):
    name = models.CharField(max_length=128)
    region = models.CharField(max_length=128, blank=True)
    contact_user = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="contact_for_villages",
    )

    class Meta:
        verbose_name = "Village"
        verbose_name_plural = "Villages"

    def __str__(self) -> str:
        return self.name
