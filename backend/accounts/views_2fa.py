"""2FA enrollment + verification endpoints."""
import io
import base64
import secrets
import string

import pyotp
import qrcode
from django_otp.oath import TOTP
from django_otp.plugins.otp_totp.models import TOTPDevice
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import serializers, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response


SCRATCH_CODE_ALPHABET = string.digits + string.ascii_uppercase
SCRATCH_CODE_LENGTH = 10
SCRATCH_CODE_COUNT = 8


class _EnrollResponseSerializer(serializers.Serializer):
    secret = serializers.CharField()
    otp_uri = serializers.CharField()
    qr_png_data_url = serializers.CharField()
    scratch_codes = serializers.ListField(child=serializers.CharField())


class _SimpleResponseSerializer(serializers.Serializer):
    detail = serializers.CharField()
    is_2fa_enabled = serializers.BooleanField(required=False)
    two_factor_passed = serializers.BooleanField(required=False)


def _scratch_codes(n: int = SCRATCH_CODE_COUNT) -> list[str]:
    return [
        "".join(secrets.choice(SCRATCH_CODE_ALPHABET) for _ in range(SCRATCH_CODE_LENGTH))
        for _ in range(n)
    ]


def _qr_data_url(otp_uri: str) -> str:
    img = qrcode.make(otp_uri)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode("ascii")


@extend_schema(responses=_EnrollResponseSerializer)
@api_view(["POST"])
@permission_classes([IsAuthenticated])
def enroll_2fa(request):
    """Generate a TOTP secret for the user, return QR + scratch codes.

    The device is NOT confirmed until /verify succeeds. Until then, the user
    stays in the `is_2fa_enabled=False` state so a mis-enrolled device can be
    re-enrolled safely.
    """
    user = request.user
    if user.role == "CB":
        return Response(
            {"detail": "CB role does not require 2FA."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if user.is_2fa_enabled:
        return Response(
            {"detail": "2FA is already enabled. Disable first to re-enroll."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    secret = pyotp.random_base32()
    otp_uri = pyotp.TOTP(secret).provisioning_uri(
        name=user.email,
        issuer_name="HEC Emergency Fund",
    )

    request.session["pending_2fa_secret"] = secret
    request.session.modified = True

    return Response(
        {
            "secret": secret,
            "otp_uri": otp_uri,
            "qr_png_data_url": _qr_data_url(otp_uri),
            "scratch_codes": _scratch_codes(),
        }
    )


@extend_schema(responses=_SimpleResponseSerializer)
@api_view(["POST"])
@permission_classes([IsAuthenticated])
def verify_2fa(request):
    """Verify the first OTP code; on success, persist the TOTPDevice."""
    user = request.user
    otp_code = (request.data.get("otp") or "").strip()
    if not otp_code:
        return Response(
            {"detail": "otp is required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    secret = request.session.get("pending_2fa_secret")
    if not secret:
        return Response(
            {"detail": "No pending 2FA enrollment. Call /2fa/enroll first."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    totp = TOTP(key=secret.encode("ascii"), step=30, digits=6)
    if not totp.verify(otp_code, tolerance=1):
        return Response(
            {"detail": "Invalid OTP code."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    TOTPDevice.objects.filter(user=user).delete()
    TOTPDevice.objects.create(user=user, name="default", confirmed=True)

    user.otp_secret = secret
    user.is_2fa_enabled = True
    user.save(update_fields=["otp_secret", "is_2fa_enabled"])

    request.session.pop("pending_2fa_secret", None)
    request.session.modified = True

    return Response({"detail": "2FA enabled.", "is_2fa_enabled": True})


@extend_schema(responses=_SimpleResponseSerializer)
@api_view(["POST"])
@permission_classes([IsAuthenticated])
def verify_login_otp(request):
    """Verify a login-time OTP for users with 2FA enabled.

    The login flow is two-step:
      1. POST /api/v1/auth/login  →  returns {access, refresh, requires_2fa: true}
      2. POST /api/v1/auth/2fa/verify {otp}  →  same access/refresh, but now
         the access token includes a `2fa_passed=True` claim that
         sensitive endpoints can require.
    """
    user = request.user
    otp_code = (request.data.get("otp") or "").strip()
    if not user.is_2fa_enabled:
        return Response({"detail": "2FA not enabled for this user."}, status=400)
    if not otp_code:
        return Response({"detail": "otp is required."}, status=400)
    device = TOTPDevice.objects.filter(user=user, confirmed=True).first()
    if not device:
        return Response({"detail": "No confirmed 2FA device."}, status=400)
    if not device.verify_is_allowed() and not device.verify(otp_code):
        return Response({"detail": "Invalid OTP."}, status=400)
    if not device.verify(otp_code):
        return Response({"detail": "Invalid OTP."}, status=400)
    return Response({"detail": "2FA verified.", "two_factor_passed": True})
