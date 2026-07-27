"""User self-service endpoints (PATCH /users/me, etc.)."""
from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from .models import User
from .permissions import IsSuperAdmin


class _UserSerializer(serializers.Serializer):
    id = serializers.IntegerField(read_only=True)
    email = serializers.EmailField(read_only=True)
    username = serializers.CharField(read_only=True)
    role = serializers.CharField(read_only=True)
    first_name = serializers.CharField(required=False, allow_blank=True)
    last_name = serializers.CharField(required=False, allow_blank=True)
    phone = serializers.CharField(required=False, allow_blank=True)
    preferred_language = serializers.ChoiceField(choices=User.Language.choices, required=False)
    telegram_chat_id = serializers.CharField(required=False, allow_blank=True)
    is_2fa_enabled = serializers.BooleanField(read_only=True)
    requires_2fa = serializers.BooleanField(read_only=True)
    village = serializers.IntegerField(read_only=True, allow_null=True)


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
                "first_name": user.first_name,
                "last_name": user.last_name,
                "phone": user.phone,
                "preferred_language": user.preferred_language,
                "is_2fa_enabled": user.is_2fa_enabled,
                "requires_2fa": user.requires_2fa(),
                "village": user.village_id,
                "telegram_chat_id": user.telegram_chat_id,
            }
        )

    # PATCH
    data = request.data
    updated_fields: list[str] = []

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

    class Meta:
        model = User
        fields = ("id", "email", "username", "first_name", "last_name", "full_name",
                  "role", "phone", "preferred_language", "is_2fa_enabled",
                  "requires_2fa", "is_active", "village", "telegram_chat_id")
        read_only_fields = ("id", "username", "is_2fa_enabled", "requires_2fa", "full_name")

    def get_full_name(self, obj):
        return obj.get_full_name() or obj.email

    def get_requires_2fa(self, obj):
        return obj.requires_2fa()


class _AdminUserWriteSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=False, allow_blank=False)

    class Meta:
        model = User
        fields = ("email", "first_name", "last_name", "role", "phone",
                  "preferred_language", "is_active", "village",
                  "telegram_chat_id", "password")

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
        qs = User.objects.all().order_by("role", "email")
        if q:
            qs = qs.filter(email__icontains=q)
        return Response({"results": _AdminUserSerializer(qs, many=True).data, "count": qs.count()})

    s = _AdminUserWriteSerializer(data=request.data)
    s.is_valid(raise_exception=True)
    data = dict(s.validated_data)
    password = data.pop("password", None) or User.objects.make_random_password(length=14)
    u = User(**data)
    u.username = data["email"]
    if password:
        u.set_password(password)
    u.save()
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
        u.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    s = _AdminUserWriteSerializer(u, data=request.data, partial=True)
    s.is_valid(raise_exception=True)
    data = dict(s.validated_data)
    password = data.pop("password", None)
    for k, v in data.items():
        setattr(u, k, v)
    if password:
        u.set_password(password)
    u.save()
    return Response(_AdminUserSerializer(u).data)
