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
    # Project known free-text form fields onto the Case row so the data is
    # queryable and surfaces in the Case API without requiring a join to
    # the latest FormSubmission row.
    _project_form_payload_onto_case(case, payload)
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
                    "uploaded_at": a.uploaded_at,
                    "deleted_at": a.deleted_at,
                    "superseded_by_id": a.superseded_by_id,
                    # Convenience flag: True when this attachment is the
                    # current live one for its file_type slot.
                    "is_current": (
                        a.deleted_at is None and a.superseded_by_id is None
                    ),
                }
                for a in s.attachments.all()
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
        if case.status != "DRAFT" and user.role in user.FIELD_REPORTER_ROLES and case.created_by_id != user.id:
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


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def replace_attachment(request, submission_id: int, attachment_id: int):
    """Replace a case-file attachment with a new one, preserving history.

    Body (after the new file has already been uploaded via /uploads/finish):
      {
        "new_attachment_id": <int>   # the FormAttachment row just created
                                    # via the normal presign → dev-put → finish flow
      }

    Behavior:
      - The new attachment stays as the live one (deleted_at is null).
      - The old attachment is soft-marked as superseded: superseded_by → new.id,
        and deleted_at is left NULL so it still appears in the per-slot history.
      - A FILE_SUPERSEDED audit event is recorded with both IDs.
      - The file blob of the old attachment is intentionally retained so an
        auditor can still download it (fraud-free audit trail).
    """
    new_attachment_id = request.data.get("new_attachment_id")
    if not new_attachment_id:
        return Response(
            {"new_attachment_id": "Required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    old = get_object_or_404(
        FormAttachment.objects.select_related("submission__case", "submission__case__created_by"),
        id=attachment_id,
        submission_id=submission_id,
        deleted_at__isnull=True,
    )
    new = get_object_or_404(
        FormAttachment.objects.select_related("submission__case"),
        id=int(new_attachment_id),
    )

    case = old.submission.case
    user = request.user

    # Authorization mirrors delete_attachment rules:
    #   ADMIN/SUPER_ADMIN: always
    #   CB on own DRAFT case
    #   Any non-CB approver on a non-DRAFT case
    if user.role in {"ADMIN", "SUPER_ADMIN"}:
        pass
    elif case.status == "DRAFT" and case.created_by_id == user.id:
        pass
    elif case.status in {"SUBMITTED", "AT_VERIFICATION", "AT_APPROVAL"} and user.role not in user.FIELD_REPORTER_ROLES:
        pass
    else:
        return Response(
            {"detail": "You cannot replace this attachment."},
            status=status.HTTP_403_FORBIDDEN,
        )

    # The new attachment must belong to the same case, and must not itself
    # already be deleted or superseded.  We also require it to be live (no
    # superseded_by chain) so we don't end up creating fork histories.
    if new.submission.case_id != case.id:
        return Response(
            {"detail": "The replacement attachment belongs to a different case."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if new.deleted_at is not None:
        return Response(
            {"detail": "The replacement attachment has been deleted."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if new.superseded_by_id is not None:
        return Response(
            {"detail": "The replacement attachment is itself superseded."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Carry the slot (file_type) forward to the new attachment so it counts
    # for required-slot coverage in case_has_required_files().
    if not new.file_type and old.file_type:
        new.file_type = old.file_type
        new.save(update_fields=["file_type"])

    # Mark the OLD attachment as superseded.  We deliberately do NOT set
    # deleted_at — superseded rows stay visible in the per-slot history.
    old.superseded_by = new
    old.save(update_fields=["superseded_by"])

    # Record an immutable audit event.
    from cases.models import Event

    Event.objects.create(
        case=case,
        actor=user,
        event_type=Event.Type.FILE_SUPERSEDED,
        notes=(
            f"Replaced attachment #{old.id} ({old.filename}) with #{new.id} "
            f"({new.filename}); old file retained in slot '{old.file_type or ''}'."
        ).strip(),
        ip_address=getattr(request, "_audit_ip", None),
        user_agent=getattr(request, "_audit_ua", ""),
    )

    payload = {
        "old_attachment": {
            "id": old.id,
            "filename": old.filename,
            "file_type": old.file_type,
            "superseded_by_id": old.superseded_by_id,
        },
        "new_attachment": {
            "id": new.id,
            "filename": new.filename,
            "file_type": new.file_type,
        },
        "case_uid": str(case.uid),
    }
    return Response(payload, status=status.HTTP_200_OK)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def list_slot_history(request, case_uid: str, file_type: str):
    """Return all (live + superseded) attachments for a given case + slot,
    ordered oldest → newest, so the UI can render a history timeline of
    every file that has ever been in the slot (including replaced ones).

    Response:
      {
        "case_uid": "...",
        "file_type": "medical_report",
        "results": [
          {
            "id": 42,
            "filename": "old.pdf",
            "uploaded_at": "...",
            "uploaded_by": "...",
            "uploaded_by_name": "...",
            "is_current": false,
            "superseded_by_id": 99,
            "scan_status": "CLEAN",
            "size_bytes": 12345,
            "mime": "application/pdf"
          },
          ...
          { "id": 99, "is_current": true, "superseded_by_id": null, ... }
        ],
        "count": <int>
      }
    """
    case = get_object_or_404(Case, uid=case_uid)
    qs = (
        FormAttachment.objects.filter(
            submission__case=case,
            file_type__iexact=file_type,
        )
        .select_related("uploaded_by")
        .order_by("uploaded_at")
    )
    rows = []
    for a in qs:
        rows.append(
            {
                "id": a.id,
                "filename": a.filename,
                "uploaded_at": a.uploaded_at,
                "uploaded_by": a.uploaded_by.email if a.uploaded_by_id else "",
                "uploaded_by_name": a.uploaded_by_name,
                "is_current": a.deleted_at is None and a.superseded_by_id is None,
                "deleted_at": a.deleted_at,
                "superseded_by_id": a.superseded_by_id,
                "scan_status": a.scan_status,
                "size_bytes": a.size_bytes,
                "mime": a.mime,
                "submission_id": a.submission_id,
                "description": a.description,
            }
        )
    return Response(
        {
            "case_uid": str(case.uid),
            "file_type": file_type,
            "results": rows,
            "count": len(rows),
        }
    )


@api_view(["DELETE"])
@permission_classes([IsAuthenticated])
def delete_attachment(request, submission_id: int, attachment_id: int):
    """Soft-delete a FormAttachment — the file blob is intentionally retained.

    Fraud-free audit trail: deleting an attachment hides it from the UI but
    the underlying file is never purged from storage.  This allows compliance
    reviewers to recover any document that a user attempted to remove.

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
    elif case.status in {"SUBMITTED", "AT_VERIFICATION", "AT_APPROVAL"} and user.role not in user.FIELD_REPORTER_ROLES:
        pass
    else:
        return Response(
            {"detail": "You cannot delete this attachment."},
            status=status.HTTP_403_FORBIDDEN,
        )

    # ── Fraud-free audit trail ──────────────────────────────────────────
    # We intentionally DO NOT delete the underlying blob from storage.
    # The file remains preserved so that no user can permanently purge
    # evidence.  The soft-delete flags hide it from the main UI while
    # keeping the row and bytes intact for audit and compliance review.
    # ─────────────────────────────────────────────────────────────────────

    # Soft-delete: keep the DB row and blob for the audit trail.
    att.deleted_at = timezone.now()
    att.deleted_by = user
    att.save(update_fields=["deleted_at", "deleted_by"])

    # Record an immutable audit event.
    from cases.models import Event

    Event.objects.create(
        case=case,
        actor=user,
        event_type=Event.Type.FILE_SOFT_DELETED,
        notes=f"Soft-deleted attachment #{att.id} — {att.filename} (file retained for audit)",
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

# ---- Form-payload → Case projection helpers ---------------------------------

# Map of form payload keys → Case model attribute.  When a field reporter
# submits a form (cb-incident-report, etc.), we copy these named values onto
# the Case row so they show up in the Case API without requiring callers to
# fetch the latest FormSubmission payload.
_FORM_FIELD_TO_CASE_FIELD = {
    "village_name_text": "village_name_text",
    "chef_de_village": "chef_de_village",
    # Add more mappings here as the cb-incident-report schema grows.
}


def _project_form_payload_onto_case(case: Case, payload: dict) -> None:
    """Copy named form fields onto the Case row.  Saves only changed fields."""
    updates: list[str] = []
    for form_key, case_attr in _FORM_FIELD_TO_CASE_FIELD.items():
        value = payload.get(form_key)
        if not isinstance(value, str):
            continue
        value = value.strip()
        if not value:
            continue
        if getattr(case, case_attr, "") != value:
            setattr(case, case_attr, value[:128])
            updates.append(case_attr)
    if updates:
        case.save(update_fields=updates)
