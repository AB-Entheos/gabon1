"""S3 presigned upload endpoints.

POST /api/v1/uploads/presign      → returns presigned PUT URL
PUT  /api/v1/uploads/dev-put      → dev-only local fs sink (HMAC-validated)
POST /api/v1/uploads/finish       → register uploaded file as attachment
"""
from __future__ import annotations

import hashlib
import hmac
import time
from urllib.parse import urlencode

from django.conf import settings
from django.http import HttpResponse, HttpResponseBadRequest, JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.models import User
from cases.models import Case
from cases.uploads import is_s3_backend, new_attachment_key, presign_put, save_attachment_bytes
from forms.models import FormAttachment, FormSubmission


class _PresignResponseSerializer(serializers.Serializer):
    url = serializers.CharField()
    key = serializers.CharField()
    expires_at = serializers.CharField()
    expires_in = serializers.IntegerField()
    case_uid = serializers.CharField()
    submission_id = serializers.IntegerField(required=False, allow_null=True)
    file_type = serializers.CharField(required=False, allow_null=True)


class _FinishResponseSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    key = serializers.CharField()
    filename = serializers.CharField()
    size = serializers.IntegerField()
    sha256 = serializers.CharField()
    scan_status = serializers.CharField()
    file_type = serializers.CharField(required=False, allow_null=True)


@extend_schema(responses=_PresignResponseSerializer)
@api_view(["POST"])
@permission_classes([IsAuthenticated])
def presign(request):
    """Issue a presigned URL for the client to PUT the file to.

    Body: {filename, mime, size, case_uid, submission_id?}
    Returns: {url, key, expires_at, expires_in}
    """
    filename = (request.data.get("filename") or "").strip()
    mime = (request.data.get("mime") or "application/octet-stream").strip()
    size = int(request.data.get("size") or 0)
    case_uid = request.data.get("case_uid")
    submission_id = request.data.get("submission_id")
    file_type = request.data.get("file_type")
    if file_type is not None:
        file_type = str(file_type).strip()[:128] or None

    if not filename or size <= 0 or not case_uid:
        return Response(
            {"detail": "filename, size, case_uid are required."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if size > 25 * 1024 * 1024:
        return Response({"detail": "File too large (max 25MB)."}, status=400)

    try:
        case = Case.objects.get(uid=case_uid)
    except Case.DoesNotExist:
        return Response({"detail": "case_uid not found."}, status=404)

    key = new_attachment_key(case_uid=str(case.uid), filename=filename, file_type=file_type)
    url, expires_at, expires_in = presign_put(key=key, mime=mime, size=size)
    if not is_s3_backend() and url.startswith("/api/v1/uploads/dev-put"):
        from urllib.parse import urlencode
        extra = {}
        if (request.data.get("description") or "").strip():
            extra["description"] = str(request.data["description"]).strip()[:512]
        if (request.data.get("uploaded_by_name") or "").strip():
            extra["uploaded_by_name"] = str(request.data["uploaded_by_name"]).strip()[:200]
        if extra:
            url = f"{url}&{urlencode(extra)}"

    return Response(
        {
            "url": url,
            "key": key,
            "expires_at": expires_at,
            "expires_in": expires_in,
            "case_uid": str(case.uid),
            "submission_id": submission_id,
            "file_type": file_type,
        }
    )


@csrf_exempt
@require_http_methods(["PUT"])
def dev_put(request):
    """Dev-only local PUT sink that mimics an S3 presigned PUT.

    Validates HMAC query params: key, mime, size, exp, sig.
    Real S3 presign is used in prod via storages.backends.s3.
    """
    if is_s3_backend():
        return HttpResponseBadRequest("Dev PUT disabled in prod.")

    qp = request.GET
    key = qp.get("key", "")
    mime = qp.get("mime", "")
    description = (qp.get("description") or "").strip()[:512]
    uploaded_by_name = (qp.get("uploaded_by_name") or "").strip()[:200]
    try:
        size = int(qp.get("size", "0"))
        exp = int(qp.get("exp", "0"))
    except ValueError:
        return HttpResponseBadRequest("Bad size or exp")
    sig = qp.get("sig", "")

    if not key:
        return HttpResponseBadRequest("Missing key")
    if exp < int(time.time()):
        return HttpResponseBadRequest("Expired")

    # HMAC validation — if sig is provided, validate it
    if sig:
        params = {"key": key, "mime": mime, "size": str(size), "exp": str(exp)}
        payload = urlencode(sorted(params.items())).encode("utf-8")
        expected = hmac.new(
            settings.SECRET_KEY.encode("utf-8"),
            payload,
            hashlib.sha256,
        ).hexdigest()
        if not hmac.compare_digest(expected, sig):
            # Try without MIME (Cloudflare sometimes strips/encodes it)
            params_nomime = {"key": key, "size": str(size), "exp": str(exp)}
            payload_nomime = urlencode(sorted(params_nomime.items())).encode("utf-8")
            expected_nomime = hmac.new(
                settings.SECRET_KEY.encode("utf-8"),
                payload_nomime,
                hashlib.sha256,
            ).hexdigest()
            if not hmac.compare_digest(expected_nomime, sig):
                import logging
                logging.warning(
                    "dev-put: HMAC mismatch key=%s expected=%s.. got=%s..",
                    key, expected[:12], sig[:12],
                )
                return HttpResponseBadRequest("Bad signature")

    data = request.body
    if len(data) != size:
        return HttpResponseBadRequest(f"Body size {len(data)} != declared {size}")

    try:
        sha = save_attachment_bytes(key=key, data=data)
    except Exception as exc:
        import logging
        logging.exception("dev-put: save failed key=%s", key)
        return HttpResponseBadRequest(f"Storage error: {exc}")

    # Stash metadata for the next /uploads/finish call to consume.
    try:
        request.session["pending_attachment_meta"] = {
            "key": key,
            "description": description,
            "uploaded_by_name": uploaded_by_name,
        }
        request.session.modified = True
    except Exception:
        pass

    return JsonResponse({"key": key, "sha256": sha, "size": len(data)})


@extend_schema(responses=_FinishResponseSerializer)
@api_view(["POST"])
@permission_classes([IsAuthenticated])
def finish(request):
    """Register an uploaded file as a FormAttachment.

    Body: {key, filename, mime, size, sha256, submission_id?, case_uid?, file_type?}

    If `submission_id` is provided the attachment is bound to that submission.
    Otherwise we look up the case via `case_uid` and create a synthetic
    "case files" FormSubmission so the user can drop evidence onto a case
    before filling the incident form.
    """
    required = ["key", "filename", "mime", "size", "sha256"]
    for f in required:
        if f not in request.data:
            return Response({f: "Required."}, status=400)

    submission_id = request.data.get("submission_id")
    case_uid = request.data.get("case_uid")
    sub = None
    if submission_id:
        try:
            sub = FormSubmission.objects.get(id=int(submission_id))
        except (FormSubmission.DoesNotExist, ValueError, TypeError):
            return Response({"submission_id": "Not found."}, status=404)
        if not isinstance(request.user, User) or (request.user.role != "ADMIN" and sub.submitted_by_id != request.user.id):
            return Response(
                {"detail": "You may only attach to your own submissions."},
                status=403,
            )
    else:
        if not case_uid:
            return Response(
                {"detail": "Either submission_id or case_uid is required."},
                status=400,
            )
        try:
            case = Case.objects.get(uid=case_uid)
        except Case.DoesNotExist:
            return Response({"case_uid": "Not found."}, status=404)
        sub = _get_or_create_synthetic_submission(case, request.user)

    file_type = request.data.get("file_type")
    if file_type is not None:
        file_type = str(file_type).strip()[:128] or None

    description = (request.data.get("description") or "").strip()[:512]
    uploaded_by_name = (request.data.get("uploaded_by_name") or "").strip()[:200]

    # If the dev PUT sink stashed metadata, prefer that for local dev.
    pending = request.session.pop("pending_attachment_meta", None) if hasattr(request, "session") else None
    if pending and pending.get("key") == request.data["key"]:
        description = description or pending.get("description", "")
        uploaded_by_name = uploaded_by_name or pending.get("uploaded_by_name", "")

    att = FormAttachment.objects.create(
        submission=sub,
        s3_key=request.data["key"],
        filename=request.data["filename"][:256],
        mime=request.data["mime"][:128],
        size_bytes=int(request.data["size"]),
        sha256=request.data["sha256"],
        uploaded_by=request.user,
        scan_status=FormAttachment.ScanStatus.PENDING,
        file_type=file_type,
        description=description,
        uploaded_by_name=uploaded_by_name,
    )
    return Response(
        {
            "id": att.id,
            "key": att.s3_key,
            "filename": att.filename,
            "size": att.size_bytes,
            "sha256": att.sha256,
            "scan_status": att.scan_status,
            "file_type": att.file_type,
            "description": att.description,
            "uploaded_by_name": att.uploaded_by_name,
            "submission_id": sub.id,
        },
        status=status.HTTP_201_CREATED,
    )


def _get_or_create_synthetic_submission(case, user):
    """Return a per-case synthetic FormSubmission used as a bag for case files
    uploaded before the incident form has been filled in.

    Cached on the case via a stable slug so we only ever create one of these
    per case (and never collide with the real incident form).
    """
    from forms.models import FormDefinition, FormSubmission

    form, _ = FormDefinition.objects.get_or_create(
        slug="case_files_bag",
        version=1,
        defaults={
            "title": "Case files bag",
            "schema": {"fields": []},
            "role_scope": "CB,AB,WCS,DGFC,DGFAP,MINISTER,ADMIN,SUPER_ADMIN",
            "status": FormDefinition.Status.PUBLISHED,
        },
    )
    sub = (
        FormSubmission.objects.filter(case=case, form_definition=form)
        .order_by("-submitted_at")
        .first()
    )
    if sub is not None:
        return sub
    return FormSubmission.objects.create(
        case=case,
        form_definition=form,
        submitted_by=user,
        role_at_submission=user.role,
        payload={"synthetic": True, "kind": "case_files"},
        version=form.version,
    )
    return Response(
        {
            "id": att.id,
            "key": att.s3_key,
            "filename": att.filename,
            "size": att.size_bytes,
            "sha256": att.sha256,
            "scan_status": att.scan_status,
            "file_type": att.file_type,
            "description": att.description,
            "uploaded_by_name": att.uploaded_by_name,
        },
        status=status.HTTP_201_CREATED,
    )
