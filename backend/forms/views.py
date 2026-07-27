"""Form definition + submission endpoints."""
from __future__ import annotations

from django.core.exceptions import ValidationError as DjangoValidationError
from django.http import HttpResponse, HttpResponseRedirect
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import User
from accounts.permissions import IsAdmin
from cases.models import Case
from cases.uploads import presign_get, read_attachment_bytes

from .jsonschema import (
    normalize_legacy_bilingual,
    validate_payload,
    validate_schema,
)
from .models import FormAttachment, FormDefinition, FormSubmission


class FormDefinitionSerializer(serializers.ModelSerializer):
    uid = serializers.SerializerMethodField()

    class Meta:
        model = FormDefinition
        fields = (
            "uid",
            "slug",
            "title",
            "version",
            "schema",
            "role_scope",
            "status",
            "published_at",
        )
        read_only_fields = ("uid", "published_at")

    def get_uid(self, obj: FormDefinition) -> str:
        return f"{obj.slug}@{obj.version}"


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def list_forms(request):
    """List published form definitions accessible to the current user's role."""
    user: User = request.user
    qs = list(FormDefinition.objects.filter(status=FormDefinition.Status.PUBLISHED))
    if user.role != "ADMIN":
        # role_scope is a comma-separated list of role codes. Use a regex
        # match so 'AB,DGFC' matches 'AB' but not 'ABC'.
        import re
        pattern = rf"(^|,){re.escape(user.role)}($|,)"
        qs = [fd for fd in qs if re.search(pattern, fd.role_scope or "")]

    data = FormDefinitionSerializer(qs, many=True).data
    return Response({"results": data, "count": len(data)})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def get_form(request, slug: str, version: int | None = None):
    """Return a single form definition. If version omitted, returns latest PUBLISHED."""
    qs = FormDefinition.objects.filter(slug=slug)
    if version is not None:
        qs = qs.filter(version=version)
    else:
        qs = qs.filter(status=FormDefinition.Status.PUBLISHED).order_by("-version")
    fd = qs.first()
    if fd is None:
        return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)
    return Response(FormDefinitionSerializer(fd).data)


class SubmitSerializer(serializers.Serializer):
    payload = serializers.JSONField()


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def submit_form(request, slug: str, version: int):
    """Submit a form payload for a case.

    Body:
      {
        "case_uid": "uuid",
        "payload": { ... }
      }
    """
    case_uid = request.data.get("case_uid")
    if not case_uid:
        return Response({"case_uid": "Required."}, status=status.HTTP_400_BAD_REQUEST)
    try:
        case = Case.objects.get(uid=case_uid)
    except Case.DoesNotExist:
        return Response({"case_uid": "Not found."}, status=status.HTTP_404_NOT_FOUND)

    fd = get_object_or_404(FormDefinition, slug=slug, version=version)

    # Role-scope enforcement
    if not isinstance(request.user, User):
        return Response({"detail": "Authentication required."}, status=401)
    if request.user.role != "ADMIN":
        allowed = [r.strip() for r in (fd.role_scope or "").split(",") if r.strip()]
        if request.user.role not in allowed:
            return Response(
                {"detail": "Your role cannot submit this form."},
                status=status.HTTP_403_FORBIDDEN,
            )

    payload = request.data.get("payload") or {}
    try:
        validate_payload(fd.schema, payload)
    except DjangoValidationError as e:
        return Response(
            {"payload": e.messages if hasattr(e, "messages") else str(e)},
            status=status.HTTP_400_BAD_REQUEST,
        )

    sub = FormSubmission.objects.create(
        case=case,
        form_definition=fd,
        submitted_by=request.user,
        role_at_submission=request.user.role,
        payload=payload,
        version=fd.version,
    )
    return Response(
        {
            "id": sub.id,
            "case_uid": str(case.uid),
            "form": f"{fd.slug}@{fd.version}",
            "submitted_at": sub.submitted_at,
        },
        status=status.HTTP_201_CREATED,
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def list_submissions(request, uid: str):
    """List submissions for a given case UID.

    Synthetic "case_files_bag" submissions — created by /uploads/finish as a
    bag holder for case-evidence files — are hidden by default. They are the
    backing store for the Required Case Files checklist and should not pollute
    the Evidence Gallery timeline. Pass ``?include_bag=1`` to opt in.
    """
    case = get_object_or_404(Case, uid=uid)
    qs = case.submissions.select_related("form_definition", "submitted_by").all()
    include_bag = request.query_params.get("include_bag") in {"1", "true", "yes"}
    if not include_bag:
        qs = qs.exclude(form_definition__slug="case_files_bag")

    data = [
        {
            "id": s.id,
            "form": f"{s.form_definition.slug}@{s.form_definition.version}",
            "submitted_at": s.submitted_at,
            "submitted_by": s.submitted_by.email,
            "role_at_submission": s.role_at_submission,
            "payload": s.payload,
            "attachments": [
                {
                    "id": a.id,
                    "filename": a.filename,
                    "mime": a.mime,
                    "size_bytes": a.size_bytes,
                    "scan_status": a.scan_status,
                    "file_type": a.file_type,
                    "description": a.description,
                    "uploaded_by": a.uploaded_by.email if a.uploaded_by_id else "",
                    "uploaded_by_name": a.uploaded_by_name,
                }
                for a in s.attachments.filter(deleted_at__isnull=True)
            ],
        }
        for s in qs
    ]
    return Response({"results": data, "count": len(data)})


class AdminFormPublishSerializer(serializers.Serializer):
    slug = serializers.SlugField()
    title = serializers.CharField()
    schema = serializers.JSONField()
    role_scope = serializers.CharField()
    version = serializers.IntegerField(default=1, min_value=1)


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsAdmin])
def publish_form(request):
    """Admin publishes a new form (or new version of an existing one).

    Bumps version automatically if (slug, version) already exists.
    """
    s = AdminFormPublishSerializer(data=request.data)
    s.is_valid(raise_exception=True)
    data = s.validated_data

    schema = normalize_legacy_bilingual(data["schema"])
    try:
        validate_schema(schema)
    except DjangoValidationError as e:
        return Response(
            {"schema": e.messages if hasattr(e, "messages") else str(e)},
            status=status.HTTP_400_BAD_REQUEST,
        )

    version = data["version"]
    while FormDefinition.objects.filter(slug=data["slug"], version=version).exists():
        version += 1

    fd = FormDefinition.objects.create(
        slug=data["slug"],
        title=data["title"],
        schema=schema,
        role_scope=data["role_scope"],
        version=version,
        status=FormDefinition.Status.PUBLISHED,
        published_at=timezone.now(),
    )
    return Response(FormDefinitionSerializer(fd).data, status=status.HTTP_201_CREATED)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def download_attachment(request, submission_id: int, attachment_id: int):
    """Stream the bytes of a FormAttachment.

    On S3 prod, redirect to a presigned GET URL. On dev (local fs) the
    bytes are served inline so the browser can render image previews.
    """
    att = get_object_or_404(
        FormAttachment.objects.select_related("submission__case", "submission__case__created_by"),
        id=attachment_id,
        submission_id=submission_id,
        deleted_at__isnull=True,
    )
    case = att.submission.case

    user = request.user
    if user.role not in {"ADMIN", "SUPER_ADMIN"}:
        if case.status == "DRAFT" and case.created_by_id != user.id:
            return Response({"detail": "Forbidden."}, status=403)
        if case.status != "DRAFT" and user.role == "CB" and case.created_by_id != user.id:
            return Response({"detail": "Forbidden."}, status=403)

    signed = presign_get(key=att.s3_key)
    if signed:
        return HttpResponseRedirect(signed)

    data = read_attachment_bytes(key=att.s3_key)
    if data is None:
        return Response({"detail": "File not found on storage."}, status=404)

    response = HttpResponse(data, content_type=att.mime or "application/octet-stream")
    response["Content-Length"] = str(len(data))
    response["Content-Disposition"] = f'inline; filename="{att.filename}"'
    response["X-Content-SHA256"] = att.sha256
    return response


@api_view(["DELETE"])
@permission_classes([IsAuthenticated])
def delete_attachment(request, submission_id: int, attachment_id: int):
    """Delete a FormAttachment (and its underlying file on storage).

    Authorization:
      - Admin: always allowed.
      - CB who created the case: allowed while case is DRAFT.
      - Any non-CB approver on a non-DRAFT case: allowed until the case
        reaches APPROVED status (we let DGFC/DGFAP clean up before close).

    Once the case is APPROVED or CLOSED, only ADMIN can delete, to preserve
    the immutable audit trail.
    """
    att = get_object_or_404(
        FormAttachment.objects.select_related("submission__case", "submission__case__created_by"),
        id=attachment_id,
        submission_id=submission_id,
        deleted_at__isnull=True,
    )
    case = att.submission.case
    user = request.user

    if user.role in {"ADMIN", "SUPER_ADMIN"}:
        pass
    elif case.status == "DRAFT" and case.created_by_id == user.id:
        pass
    elif case.status in {"SUBMITTED", "AT_VERIFICATION", "AT_APPROVAL"} and user.role != "CB":
        pass
    else:
        return Response(
            {"detail": "You cannot delete this attachment."},
            status=status.HTTP_403_FORBIDDEN,
        )

    # Best-effort: remove the underlying blob. We don't fail the request
    # if the blob is already gone (e.g. dev cleanup); we still want the
    # DB row removed so the UI reflects the change.
    from cases.uploads import delete_attachment_bytes

    delete_attachment_bytes(key=att.s3_key)

    # Soft-delete: keep the DB row for the audit trail.
    att.deleted_at = timezone.now()
    att.deleted_by = user
    att.save(update_fields=["deleted_at", "deleted_by"])

    # Record an immutable audit event.
    from cases.models import Event

    Event.objects.create(
        case=case,
        actor=user,
        event_type=Event.Type.FILE_DELETED,
        notes=f"Deleted attachment #{att.id} — {att.filename}",
        ip_address=getattr(request, "_audit_ip", None),
        user_agent=getattr(request, "_audit_ua", ""),
    )

    payload = {
        "id": att.id,
        "submission_id": att.submission_id,
        "case_uid": str(case.uid),
        "filename": att.filename,
        "deleted_by": user.email,
    }
    return Response(payload, status=status.HTTP_200_OK)
