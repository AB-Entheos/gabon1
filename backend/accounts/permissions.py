from rest_framework.permissions import BasePermission


class IsRole(BasePermission):
    """Permission factory: only the listed roles may access."""
    allowed_roles: tuple = ()

    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.has_any_role(*self.allowed_roles)
        )


class IsCB(IsRole):
    allowed_roles = ("CB",)


class IsDP(IsRole):
    """Delegué Provincial — same field-reporter duties as CB."""

    allowed_roles = ("DP",)


class IsFieldReporter(IsRole):
    """Either Chef de Brigade or Delegué Provincial — both can create cases."""

    allowed_roles = ("CB", "DP")


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
            and request.user.has_role("SUPER_ADMIN")
        )


class IsApprover(IsRole):
    """Any of the four approval roles (② through ⑤)."""
    allowed_roles = ("AB", "WCS", "DGFC", "DGFAP")


class CanSetAmount(BasePermission):
    """Only DGFAP can set amount_authorized."""
    def has_permission(self, request, view):
        return bool(
            request.user
            and request.user.is_authenticated
            and request.user.has_role("DGFAP")
        )
