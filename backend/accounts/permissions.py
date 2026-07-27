from rest_framework.permissions import BasePermission


class IsRole(BasePermission):
    """Permission factory: only the listed roles may access."""
    allowed_roles: tuple = ()

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and getattr(request.user, "role", None) in self.allowed_roles
        )


class IsCB(IsRole):
    allowed_roles = ("CB",)


class IsAB(IsRole):
    allowed_roles = ("AB",)


class IsWCS(IsRole):
    allowed_roles = ("WCS",)


class IsDGFC(IsRole):
    allowed_roles = ("DGFC",)


class IsDGFAP(IsRole):
    allowed_roles = ("DGFAP",)


class IsMinister(IsRole):
    allowed_roles = ("MINISTER",)


class IsAdmin(IsRole):
    """Administrator (form publisher, audit viewer, payment triggerer)."""
    allowed_roles = ("ADMIN", "SUPER_ADMIN")


class IsSuperAdmin(BasePermission):
    """Super Administrator only.

    Full god-mode: user CRUD, role assignment, FundSettings changes,
    audit queue management, impersonation for debugging.
    """
    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and getattr(request.user, "role", None) == "SUPER_ADMIN"
        )


class IsApprover(IsRole):
    """Any of the five approval roles (② through ⑥)."""
    allowed_roles = ("AB", "WCS", "DGFC", "DGFAP", "MINISTER")


class CanSetAmount(BasePermission):
    """Only DGFAP can set amount_authorized."""
    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and getattr(request.user, "role", None) == "DGFAP"
        )
