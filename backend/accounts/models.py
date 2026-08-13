from django.contrib.auth.models import AbstractUser
from django.db import models
from django.utils import timezone


class User(AbstractUser):
    """System user. Roles drive the approval chain. CB is the field reporter."""

    class Role(models.TextChoices):
        CB = "CB", "Chef de Brigade"
        DP = "DP", "Delegué Provincial"
        AB = "AB", "AB Entheos"
        WCS = "WCS", "WCS"
        DGFC = "DGFC", "DGFC"
        DGFAP = "DGFAP", "DGFAP"
        MINISTER = "MINISTER", "Minister"
        ADMIN = "ADMIN", "Administrator"
        SUPER_ADMIN = "SUPER_ADMIN", "Super Administrator"

    # All active roles can create cases and see only their own.
    # ADMIN / SUPER_ADMIN see everything (checked separately in views).
    FIELD_REPORTER_ROLES = ("CB", "DP", "AB", "WCS", "DGFC", "DGFAP", "MINISTER")

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
    must_change_password = models.BooleanField(
        default=False,
        help_text="If True, user must set a new password on next login.",
    )
    preferred_language = models.CharField(
        max_length=2,
        choices=Language.choices,
        default=Language.FR,
    )
    telegram_chat_id = models.CharField(max_length=64, blank=True)
    password_reset_token = models.CharField(max_length=128, blank=True, null=True)
    password_reset_expires = models.DateTimeField(null=True, blank=True)

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = ["username"]

    def requires_2fa(self) -> bool:
        # CB and DP are field reporters operating in remote areas — they
        # cannot be expected to manage a TOTP device per login.  All other
        # roles are office-bound and must use 2FA.
        return not self.has_any_role(*self.FIELD_REPORTER_ROLES)

    @property
    def active_roles(self) -> set[str]:
        if not self.pk:
            return {self.role}
        assignments = self.role_assignments.filter(revoked_at__isnull=True).filter(
            models.Q(expires_at__isnull=True) | models.Q(expires_at__gt=timezone.now())
        )
        # Keep the user's primary role effective as well as any temporary or
        # additional active assignments.  This also keeps legacy accounts and
        # admin-edited primary roles compatible with role-based permissions.
        return {self.role} | set(assignments.values_list("role", flat=True))

    def has_role(self, role: str) -> bool:
        return role in self.active_roles

    def has_any_role(self, *roles: str) -> bool:
        return bool(self.active_roles.intersection(roles))

    def __str__(self) -> str:
        return f"{self.get_role_display()} — {self.email}"


class RoleAssignment(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="role_assignments")
    role = models.CharField(max_length=16, choices=User.Role.choices)
    assigned_by = models.ForeignKey(
        User, on_delete=models.PROTECT, related_name="role_assignments_created"
    )
    assigned_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    revoked_at = models.DateTimeField(null=True, blank=True)
    reason = models.CharField(max_length=512, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=("user", "role"),
                condition=models.Q(revoked_at__isnull=True),
                name="unique_active_role_assignment",
            )
        ]

    @property
    def is_active(self) -> bool:
        return self.revoked_at is None and (
            self.expires_at is None or self.expires_at > timezone.now()
        )


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
