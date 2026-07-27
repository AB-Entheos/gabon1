from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as DjangoUserAdmin

from .models import User, Village


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


@admin.register(Village)
class VillageAdmin(admin.ModelAdmin):
    list_display = ("name", "region", "contact_user")
    search_fields = ("name", "region")
