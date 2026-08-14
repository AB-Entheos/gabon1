"""User self-service endpoints (PATCH /users/me, etc.)."""
import secrets
import string

from drf_spectacular.utils import extend_schema
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import RoleAssignment, User
from .permissions import IsAdmin, IsSuperAdmin


class _UserSerializer(serializers.Serializer):
    id = serializers.IntegerField(read_only=True)
    email = serializers.EmailField()
    username = serializers.CharField(read_only=True)
    role = serializers.CharField(read_only=True)
    roles = serializers.SerializerMethodField()
    first_name = serializers.CharField(required=False, allow_blank=True)
    last_name = serializers.CharField(required=False, allow_blank=True)
    phone = serializers.CharField(required=False, allow_blank=True)
    preferred_language = serializers.ChoiceField(choices=User.Language.choices, required=False)
    telegram_chat_id = serializers.CharField(required=False, allow_blank=True)
    is_2fa_enabled = serializers.BooleanField(read_only=True)
    requires_2fa = serializers.BooleanField(read_only=True)
    must_change_password = serializers.BooleanField(read_only=True)
    village = serializers.IntegerField(read_only=True, allow_null=True)

    def get_roles(self, obj):
        return sorted(obj.active_roles)


@extend_schema(responses=_UserSerializer)
@api_view(["GET", "PATCH"])
@permission_classes([IsAuthenticated])
def me(request):  # noqa: F811  - see decorator above
    user: User = request.user
    if request.method == "GET":
        return Response(
            {
                "id": user.id,
                "email": user.email,
                "username": user.username,
                "role": user.role,
                "roles": sorted(user.active_roles),
                "first_name": user.first_name,
                "last_name": user.last_name,
                "phone": user.phone,
                "preferred_language": user.preferred_language,
                "is_2fa_enabled": user.is_2fa_enabled,
                "requires_2fa": user.requires_2fa(),
                "must_change_password": user.must_change_password,
                "village": user.village_id,
                "telegram_chat_id": user.telegram_chat_id,
            }
        )

    # PATCH
    data = request.data
    updated_fields: list[str] = []

    if "email" in data:
        new_email = str(data["email"]).strip().lower()
        if new_email != user.email:
            if User.objects.filter(email=new_email).exclude(pk=user.pk).exists():
                return Response(
                    {"email": "A user with this email already exists."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            user.email = new_email
            user.username = new_email
            updated_fields.extend(["email", "username"])

    if "preferred_language" in data:
        lang = data["preferred_language"]
        if lang not in dict(User.Language.choices):
            return Response(
                {"preferred_language": f"Must be one of {[c for c, _ in User.Language.choices]}"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        user.preferred_language = lang
        updated_fields.append("preferred_language")

    if "phone" in data:
        user.phone = str(data["phone"])[:32]
        updated_fields.append("phone")

    if "telegram_chat_id" in data:
        user.telegram_chat_id = str(data["telegram_chat_id"])[:64]
        updated_fields.append("telegram_chat_id")

    if "first_name" in data:
        user.first_name = str(data["first_name"])[:150]
        updated_fields.append("first_name")

    if "last_name" in data:
        user.last_name = str(data["last_name"])[:150]
        updated_fields.append("last_name")

    if updated_fields:
        user.save(update_fields=updated_fields)

    return Response(
        {
            "id": user.id,
            "email": user.email,
            "preferred_language": user.preferred_language,
            "phone": user.phone,
            "telegram_chat_id": user.telegram_chat_id,
        }
    )


class _AdminUserSerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField()
    requires_2fa = serializers.SerializerMethodField()
    roles = serializers.SerializerMethodField()
    role_assignments = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ("id", "email", "username", "first_name", "last_name", "full_name",
                  "role", "roles", "role_assignments", "phone", "preferred_language", "is_2fa_enabled",
                  "requires_2fa", "is_active", "village", "telegram_chat_id")
        read_only_fields = ("id", "username", "is_2fa_enabled", "requires_2fa", "full_name")

    def get_full_name(self, obj):
        return obj.get_full_name() or obj.email

    def get_requires_2fa(self, obj):
        return obj.requires_2fa()

    def get_roles(self, obj):
        return sorted(obj.active_roles)

    def get_role_assignments(self, obj):
        return [
            {
                "id": assignment.id,
                "role": assignment.role,
                "assigned_at": assignment.assigned_at,
                "expires_at": assignment.expires_at,
                "revoked_at": assignment.revoked_at,
                "reason": assignment.reason,
                "active": assignment.is_active,
            }
            for assignment in obj.role_assignments.all().order_by("role")
        ]


class _AdminUserWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ("email", "first_name", "last_name", "role", "phone",
                  "preferred_language", "is_active", "village",
                  "telegram_chat_id")

    def validate_role(self, value):
        if value not in dict(User.Role.choices):
            raise serializers.ValidationError("Unknown role.")
        return value


@extend_schema(responses=_AdminUserSerializer(many=True))
@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated, IsSuperAdmin])
def list_users(request):
    """List / create users (super-admin only)."""
    if request.method == "GET":
        q = (request.query_params.get("q") or "").strip().lower()
        include_inactive = request.query_params.get("include_inactive") == "true"
        qs = User.objects.all() if include_inactive else User.objects.filter(is_active=True)
        qs = qs.order_by("role", "email")
        if q:
            qs = qs.filter(email__icontains=q)
        return Response({"results": _AdminUserSerializer(qs, many=True).data, "count": qs.count()})

    s = _AdminUserWriteSerializer(data=request.data)
    s.is_valid(raise_exception=True)
    data = dict(s.validated_data)
    alphabet = string.ascii_letters + string.digits + "!@#$%^&*"
    temp_password = "".join(secrets.choice(alphabet) for _ in range(14))
    u = User(**data)
    u.username = data["email"]
    u.set_password(temp_password)
    u.must_change_password = True
    u.save()
    RoleAssignment.objects.create(
        user=u,
        role=u.role,
        assigned_by=request.user,
        reason="Initial role assignment",
    )

    # Send welcome email with one-time credentials.
    try:
        from notifications.service import send_account_created
        send_account_created(user=u, temp_password=temp_password)
        import logging as _log
        _log.getLogger(__name__).info("Welcome email dispatched for %s", u.email)
    except Exception as exc:
        import logging as _log
        _log.getLogger(__name__).warning("Failed to send welcome email for %s: %s", u.email, exc, exc_info=True)

    return Response(_AdminUserSerializer(u).data, status=status.HTTP_201_CREATED)


@extend_schema(responses=_AdminUserSerializer)
@api_view(["GET", "PATCH", "DELETE"])
@permission_classes([IsAuthenticated, IsSuperAdmin])
def user_detail(request, pk):
    """GET / PATCH / DELETE a single user (super-admin only)."""
    try:
        u = User.objects.get(pk=pk)
    except User.DoesNotExist:
        return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

    if request.method == "GET":
        return Response(_AdminUserSerializer(u).data)

    if request.method == "DELETE":
        if u.id == request.user.id:
            return Response({"detail": "Cannot delete yourself."}, status=400)
        # Soft-delete: deactivate the account instead of hard-deleting.
        # Users may be referenced by protected FKs (Case.created_by,
        # Event.actor, FormSubmission.submitted_by, FormAttachment.uploaded_by)
        # and the audit trail (cases_event) is append-only, so a hard delete
        # would raise ProtectedError. Deactivating preserves the audit trail
        # while removing the user from active use.
        u.is_active = False
        u.status = User.Status.SUSPENDED
        u.role_assignments.filter(revoked_at__isnull=True).update(
            revoked_at=timezone.now(),
            reason="Account deactivated by super admin",
        )
        u.save(update_fields=["is_active", "status"])
        return Response(status=status.HTTP_204_NO_CONTENT)

    s = _AdminUserWriteSerializer(u, data=request.data, partial=True)
    s.is_valid(raise_exception=True)
    data = dict(s.validated_data)
    for k, v in data.items():
        setattr(u, k, v)
    u.save()
    return Response(_AdminUserSerializer(u).data)


class _RoleAssignmentSerializer(serializers.Serializer):
    role = serializers.ChoiceField(choices=User.Role.choices)
    expires_at = serializers.DateTimeField(required=False, allow_null=True)
    reason = serializers.CharField(required=False, allow_blank=True, max_length=512)


@extend_schema(responses=_AdminUserSerializer)
@api_view(["POST", "DELETE"])
@permission_classes([IsAuthenticated, IsAdmin])
def user_roles(request, pk):
    """Add or revoke a temporary role assignment for a user.

    Only ADMIN and SUPER_ADMIN accounts may grant or revoke roles. In
    particular, WCS assignments cannot be created by operational roles.
    """
    try:
        user = User.objects.get(pk=pk)
    except User.DoesNotExist:
        return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

    if request.method == "POST":
        serializer = _RoleAssignmentSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        values = serializer.validated_data
        assignment, created = RoleAssignment.objects.get_or_create(
            user=user,
            role=values["role"],
            revoked_at__isnull=True,
            defaults={
                "assigned_by": request.user,
                "expires_at": values.get("expires_at"),
                "reason": values.get("reason", ""),
            },
        )
        if not created:
            assignment.expires_at = values.get("expires_at")
            assignment.reason = values.get("reason", assignment.reason)
            assignment.save(update_fields=["expires_at", "reason"])
    else:
        role = request.data.get("role")
        if role not in dict(User.Role.choices):
            return Response({"role": "Unknown role."}, status=status.HTTP_400_BAD_REQUEST)
        assignment = RoleAssignment.objects.filter(
            user=user, role=role, revoked_at__isnull=True
        ).first()
        if not assignment:
            return Response({"detail": "Active role assignment not found."}, status=status.HTTP_404_NOT_FOUND)
        assignment.revoked_at = timezone.now()
        assignment.save(update_fields=["revoked_at"])

    return Response(_AdminUserSerializer(user).data)


# ---- Password reset (admin-initiated) ----------------------------------------


class _PasswordResetSerializer(serializers.Serializer):
    email = serializers.EmailField()


@extend_schema(request=_PasswordResetSerializer, responses={200: dict})
@api_view(["POST"])
@permission_classes([IsAuthenticated, IsSuperAdmin])
def admin_password_reset(request):
    """Admin initiates a password reset for a user.

    Generates a random password, sets it, and emails the user their
    new credentials. In a real deployment you'd issue a reset-token
    link instead; this is the MVP approach.
    """
    email = request.data.get("email", "").strip().lower()
    if not email:
        return Response({"detail": "email is required."}, status=400)

    try:
        user = User.objects.get(email=email)
    except User.DoesNotExist:
        return Response({"detail": "No user with that email."}, status=404)

    alphabet = string.ascii_letters + string.digits + "!@#$%^&*"
    new_password = "".join(secrets.choice(alphabet) for _ in range(14))
    user.set_password(new_password)
    user.save(update_fields=["password"])

    try:
        from notifications.service import send_password_reset
        frontend_url = getattr(request, "build_absolute_uri", lambda: "http://localhost:5173")("/")
        send_password_reset(
            user=user,
            reset_url=frontend_url,
        )
    except Exception:
        pass  # Notifications must never block the reset.

    return Response({"detail": f"Password reset email sent to {user.email}."})


# ---- Force change password (first login) -------------------------------------


class _ForceChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField()
    new_password = serializers.CharField(min_length=12)


@extend_schema(request=_ForceChangePasswordSerializer, responses={200: dict})
@api_view(["POST"])
@permission_classes([IsAuthenticated])
def force_change_password(request):
    """User changes their password (required on first login).

    Validates the current (temporary) password, sets the new one, and
    clears the ``must_change_password`` flag.
    """
    serializer = _ForceChangePasswordSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    user: User = request.user
    current_password = serializer.validated_data["current_password"]
    new_password = serializer.validated_data["new_password"]

    if not user.check_password(current_password):
        return Response(
            {"detail": "Current password is incorrect."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    user.set_password(new_password)
    user.must_change_password = False
    user.save(update_fields=["password", "must_change_password"])

    return Response({"detail": "Password changed successfully.", "must_change_password": False})


# ---- Self-service password reset (token-based) --------------------------------


class _PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()


class _PasswordResetConfirmSerializer(serializers.Serializer):
    token = serializers.CharField()
    new_password = serializers.CharField(min_length=12)


@api_view(["POST"])
@permission_classes([])  # anonymous
def password_reset_request(request):
    """Send a password-reset email with a time-limited token link."""
    from datetime import timedelta
    import secrets

    serializer = _PasswordResetRequestSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    email = serializer.validated_data["email"].strip().lower()

    # Always return 200 to avoid email enumeration
    try:
        user = User.objects.get(email=email)
    except User.DoesNotExist:
        return Response({"detail": "If an account with that email exists, a reset link has been sent."})

    token = secrets.token_urlsafe(32)
    from django.utils import timezone
    user.password_reset_token = token
    user.password_reset_expires = timezone.now() + timedelta(hours=2)
    user.save(update_fields=["password_reset_token", "password_reset_expires"])

    try:
        frontend_base = request.META.get("HTTP_ORIGIN", "http://localhost:3001")
        reset_url = f"{frontend_base}/reset-password?token={token}"
        from notifications.service import send_password_reset
        send_password_reset(user=user, reset_url=reset_url)
    except Exception:
        pass  # Notifications must never block the request.

    return Response({"detail": "If an account with that email exists, a reset link has been sent."})


@api_view(["POST"])
@permission_classes([])  # anonymous
def password_reset_confirm(request):
    """Validate the reset token and set a new password."""
    from django.utils import timezone

    serializer = _PasswordResetConfirmSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)

    token = serializer.validated_data["token"]
    new_password = serializer.validated_data["new_password"]

    try:
        user = User.objects.get(password_reset_token=token)
    except User.DoesNotExist:
        return Response({"detail": "Invalid or expired reset link."}, status=status.HTTP_400_BAD_REQUEST)

    if not user.password_reset_expires or user.password_reset_expires < timezone.now():
        return Response({"detail": "Invalid or expired reset link."}, status=status.HTTP_400_BAD_REQUEST)

    user.set_password(new_password)
    user.password_reset_token = None
    user.password_reset_expires = None
    user.must_change_password = False
    user.save(update_fields=["password", "password_reset_token", "password_reset_expires", "must_change_password"])

    return Response({"detail": "Password reset successful. You can now sign in."})
