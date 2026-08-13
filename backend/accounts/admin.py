import logging
import secrets
import string

from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin

from .models import User, Village

logger = logging.getLogger(__name__)


def _generate_temp_password(length: int = 14) -> str:
    alphabet = string.ascii_letters + string.digits + "!@#$%^&*"
    return "".join(secrets.choice(alphabet) for _ in range(length))


@admin.register(User)
class UserAdmin(DjangoUserAdmin):
    ordering = ("email",)
    list_display = ("email", "role", "village", "preferred_language", "is_2fa_enabled", "status")
    list_filter = ("role", "preferred_language", "is_2fa_enabled", "status", "is_staff")
    search_fields = ("email", "first_name", "last_name", "phone")
    fieldsets = (
        (None, {"fields": ("email", "username", "password")}),
        ("Personal", {"fields": ("first_name", "last_name", "phone")}),
        ("Role & locale", {"fields": ("role", "village", "preferred_language", "telegram_chat_id")}),
        ("2FA", {"fields": ("is_2fa_enabled", "otp_secret")}),
        ("Status", {"fields": ("status",)}),
        ("Permissions", {"fields": ("is_active", "is_staff", "is_superuser", "groups", "user_permissions")}),
        ("Important dates", {"fields": ("last_login", "date_joined")}),
    )
    add_fieldsets = (
        (None, {
            "classes": ("wide",),
            "fields": ("email", "username", "role", "password1", "password2"),
        }),
    )

    def save_model(self, request, obj, form, change):
        is_new = not obj.pk
        if is_new:
            temp_password = _generate_temp_password()
            obj.set_password(temp_password)
            obj.must_change_password = True
            obj.username = obj.email
            super().save_model(request, obj, form, change)
            try:
                from notifications.service import send_account_created
                send_account_created(user=obj, temp_password=temp_password)
                logger.info("Welcome email dispatched for %s (admin)", obj.email)
            except Exception as exc:
                logger.warning("Failed to send welcome email for %s: %s", obj.email, exc, exc_info=True)
        else:
            super().save_model(request, obj, form, change)


@admin.register(Village)
class VillageAdmin(admin.ModelAdmin):
    list_display = ("name", "region", "contact_user")
    search_fields = ("name", "region")
