from __future__ import annotations

from datetime import timedelta
from typing import TYPE_CHECKING, Any

from django.conf import settings
from django.db import transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from drf_spectacular.utils import extend_schema, OpenApiParameter
from rest_framework import serializers, status
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet

from accounts.permissions import CanSetAmount, IsAB, IsCB, IsDP, IsFieldReporter, IsRole, IsSuperAdmin
from accounts.models import User

from .idempotency import with_idempotency
from .models import Case, Disbursement, Event
from .state_machine import (
    StateError,
    advance_transition_for_step,
    approver_role_for_step,
    case_has_required_files,
    defer_for_step,
    required_file_slots_for_case,
    transition,
)


def _missing_required_file_slots(case: Case) -> list[str]:
    """Return the list of required case-file slots that are NOT yet covered
    by any live (non-deleted, non-superseded) attachment."""
    required = [s for s in required_file_slots_for_case(case)]
    if not required:
        return []
    from forms.models import FormAttachment
    present = set(
        FormAttachment.objects.filter(
            submission__case=case,
            file_type__isnull=False,
            deleted_at__isnull=True,
        ).values_list("file_type", flat=True)
    )
    return [s for s in required if s.lower() not in {p.lower() for p in present}]

if TYPE_CHECKING:
    from accounts.models import User as UserType


# ----- Serializers ----------------------------------------------------------


class EventSerializer(serializers.ModelSerializer):
    actor_email = serializers.CharField(source="actor.email", read_only=True)
    actor_role = serializers.CharField(source="actor.role", read_only=True)
    signature = serializers.SerializerMethodField()

    class Meta:
        model = Event
        fields = (
            "id",
            "actor_email",
            "actor_role",
            "occurred_at",
            "event_type",
            "from_step",
            "to_step",
            "notes",
            "payload_hash",
            "idempotency_key",
            "signature",
            "amount_xaf",
        )
        read_only_fields = fields

    def get_signature(self, obj: Event) -> str:
        secret = getattr(settings, "APPROVAL_HMAC_SECRET", "")
        if not secret:
            return ""
        return obj.sign(secret)


class CaseSerializer(serializers.ModelSerializer):
    uid = serializers.UUIDField(read_only=True)
    village_name = serializers.SerializerMethodField()
    created_by_email = serializers.CharField(source="created_by.email", read_only=True)
    current_approver_role = serializers.SerializerMethodField()
    sla_deadline = serializers.DateTimeField(read_only=True)
    amount_authorized = serializers.DecimalField(
        max_digits=14, decimal_places=0, read_only=True
    )
    amount_proposed = serializers.DecimalField(
        max_digits=14, decimal_places=0, read_only=True
    )
    disbursement_summary = serializers.SerializerMethodField()
    events = EventSerializer(many=True, read_only=True)

    class Meta:
        model = Case
        fields = (
            "uid",
            "case_type",
            "claimant_name",
            "claimant_phone",
            "claimant_id_number",
            "claimant_id_type",
            "claimant_date_of_birth",
            "claimant_gender",
            "claimant_address",
            "incident_location",
            "relationship_to_claimant",
            "village",
            "village_name",
            "village_name_text",
            "chef_de_village",
            "incident_at",
            "reported_at",
            "current_step",
            "status",
            "amount_authorized",
            "amount_proposed",
            "sla_deadline",
            "created_by",
            "created_by_email",
            "current_approver_role",
            "disbursement_summary",
            "events",
            "deleted_at",
            "deleted_by",
            "deleted_from_status",
            "deleted_from_step",
        )
        read_only_fields = (
            "uid",
            "reported_at",
            "current_step",
            "status",
            "amount_authorized",
            "amount_proposed",
            "sla_deadline",
            "created_by",
            "created_by_email",
            "disbursement_summary",
            "village_name",
        )

    def get_village_name(self, obj: "Case"):
        # Prefer the free-text value captured at intake (village_name_text);
        # fall back to the FK-resolved name when no free-text was captured.
        if obj.village_name_text:
            return obj.village_name_text
        if obj.village is not None:
            return obj.village.name
        return ""

    def get_disbursement_summary(self, obj: "Case"):
        from .models import Disbursement
        disbursements = Disbursement.objects.filter(case=obj)
        running = sum(int(d.amount_xaf) for d in disbursements.all())
        authorized = int(obj.amount_authorized) if obj.amount_authorized is not None else 0
        remaining = max(0, authorized - running)
        pct = (running / authorized * 100) if authorized > 0 else 0
        return {
            "authorized_xaf": authorized,
            "disbursed_xaf": running,
            "remaining_xaf": remaining,
            "utilization_pct": round(pct, 1),
            "approaching_limit": pct >= 90,
            "count": disbursements.count(),
        }

    def get_current_approver_role(self, obj: "Case") -> str | None:
        if obj.status == Case.Status.DEFERRED:
            # The case is sitting at the previous step, waiting on that approver
            # to add more context. Show the role expected to act next.
            return approver_role_for_step(obj.current_step)
        if obj.status != Case.Status.AT_APPROVAL:
            return None
        try:
            return approver_role_for_step(obj.current_step)
        except StateError:
            return None


@api_view(["GET"])
@permission_classes([IsAuthenticated, IsSuperAdmin])
def deleted_cases(request):
    qs = Case.objects.select_related("village", "created_by", "deleted_by").filter(
        deleted_at__isnull=False,
        status=Case.Status.DELETED,
    )
    return Response({"results": CaseSerializer(qs, many=True).data, "count": qs.count()})


class CreateCaseSerializer(serializers.ModelSerializer):
    uid = serializers.UUIDField(read_only=True)

    class Meta:
        model = Case
        fields = (
            "uid",
            "case_type",
            "claimant_name",
            "claimant_phone",
            "claimant_id_number",
            "claimant_id_type",
            "claimant_date_of_birth",
            "claimant_gender",
            "claimant_address",
            "incident_location",
            "relationship_to_claimant",
            "village",
            "village_name_text",
            "chef_de_village",
            "incident_at",
        )

    def validate(self, attrs):
        if not attrs.get("claimant_name"):
            raise serializers.ValidationError({"claimant_name": "Required."})
        if not attrs.get("incident_at"):
            raise serializers.ValidationError({"incident_at": "Required."})
        if attrs["incident_at"] > timezone.now() + timedelta(minutes=5):
            raise serializers.ValidationError({"incident_at": "Cannot be in the future."})
        return attrs


class AmountSerializer(serializers.Serializer):
    amount_xaf = serializers.IntegerField(min_value=0)
    reason = serializers.CharField(max_length=512, required=False, allow_blank=True)


class DisbursementSerializer(serializers.Serializer):
    amount_xaf = serializers.IntegerField(min_value=1)
    purpose = serializers.CharField(max_length=200)
    recipient_kind = serializers.ChoiceField(
        choices=[
            "CLAIMANT", "HOSPITAL", "MORTUARY", "PHARMACY",
            "TRANSPORT", "GOVERNMENT", "INSURANCE", "OTHER",
        ],
        default="CLAIMANT",
    )
    recipient_kind_other = serializers.CharField(max_length=200, required=False, allow_blank=True, default="")
    recipient_name = serializers.CharField(max_length=200)
    payment_date = serializers.DateField()
    payment_reference = serializers.CharField(max_length=128)
    notes = serializers.CharField(required=False, allow_blank=True, default="")
    proof_of_payment_id = serializers.IntegerField(required=False, allow_null=True, default=None)


class DisbursementEditSerializer(serializers.Serializer):
    amount_xaf = serializers.IntegerField(min_value=1, required=False)
    purpose = serializers.CharField(max_length=200, required=False)
    recipient_kind = serializers.ChoiceField(
        choices=[
            "CLAIMANT", "HOSPITAL", "MORTUARY", "PHARMACY",
            "TRANSPORT", "GOVERNMENT", "INSURANCE", "OTHER",
        ],
        required=False,
    )
    recipient_kind_other = serializers.CharField(max_length=200, required=False, allow_blank=True)
    recipient_name = serializers.CharField(max_length=200, required=False)
    payment_date = serializers.DateField(required=False)
    payment_reference = serializers.CharField(max_length=128, required=False, allow_blank=True)
    notes = serializers.CharField(required=False, allow_blank=True)
    proof_of_payment_id = serializers.IntegerField(required=False, allow_null=True)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def list_disbursements(request):
    """List all active disbursements with the associated case summary."""
    items = []
    queryset = Disbursement.objects.filter(
        deleted_at__isnull=True,
        case__deleted_at__isnull=True,
    ).select_related("case", "case__village", "paid_by", "proof_of_payment")

    for disbursement in queryset:
        case = disbursement.case
        proof_info = None
        if disbursement.proof_of_payment:
            proof_info = {
                "id": disbursement.proof_of_payment.id,
                "filename": disbursement.proof_of_payment.filename,
                "mime": disbursement.proof_of_payment.mime,
                "size_bytes": disbursement.proof_of_payment.size_bytes,
            }
        items.append(
            {
                "id": disbursement.id,
                "case_uid": str(case.uid),
                "claimant_name": case.claimant_name,
                "case_type": case.case_type,
                "case_status": case.status,
                "village_name": case.village.name if case.village else case.village_name_text,
                "amount_xaf": disbursement.amount_xaf,
                "purpose": disbursement.purpose,
                "recipient_kind": disbursement.recipient_kind,
                "recipient_kind_other": disbursement.recipient_kind_other,
                "recipient_name": disbursement.recipient_name,
                "payment_date": disbursement.payment_date,
                "payment_reference": disbursement.payment_reference,
                "proof_of_payment_id": disbursement.proof_of_payment_id,
                "proof_of_payment": proof_info,
                "paid_by": disbursement.paid_by.email,
                "created_at": disbursement.created_at,
                "notes": disbursement.notes,
            }
        )

    return Response({"results": items, "count": len(items)})


# ----- ViewSet --------------------------------------------------------------


class CaseViewSet(ModelViewSet):
    """List, create, retrieve cases. State-machine actions via @action."""

    permission_classes = [IsAuthenticated]
    lookup_field = "uid"
    lookup_value_regex = "[0-9a-fA-F]{32}|[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}"  # UUIDv4 (dashed or 32-hex)
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_queryset(self):  # type: ignore[override]
        u = self.request.user
        if not isinstance(u, User):
            return Case.objects.none()
        qs = Case.objects.select_related("village", "created_by", "deleted_by")
        include_deleted = self.action in {"retrieve", "restore"} and self.request.GET.get("include_deleted") == "1"
        if not (include_deleted and u.has_role("SUPER_ADMIN")):
            qs = qs.exclude(deleted_at__isnull=False)
        if u.role in ("ADMIN", "SUPER_ADMIN"):
            # Admins see everything
            pass
        elif u.role == "MINISTER":
            # Ministers have institution-wide read-only visibility.
            qs = qs
        else:
            # All authenticated non-admin users may view non-deleted cases.
            # Workflow action authorization remains enforced by each action
            # endpoint and the state machine.
            pass
        # Optional status filter (e.g. ?status=APPROVED)
        status_filter = self.request.GET.get("status")
        if status_filter:
            valid = {c[0] for c in Case.Status.choices}
            if status_filter in valid:
                qs = qs.filter(status=status_filter)
        return qs

    def get_serializer_class(self):  # type: ignore[override]
        if self.action in {"create"}:
            return CreateCaseSerializer
        return CaseSerializer

    def perform_create(self, serializer):
        u = self.request.user
        if not isinstance(u, User):
            raise serializers.ValidationError(
                {"detail": "Authentication required to create a case."}
            )
        case = serializer.save(created_by=u)

        # Send new-claim notification to admin/approver roles.
        try:
            from notifications.service import send_new_claim
            send_new_claim(case=case)
        except Exception:
            pass  # Notifications must never block case creation.

        return case

    @with_idempotency
    def create(self, request, *args, **kwargs):
        return super().create(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        """Soft-delete a case (SUPER_ADMIN only).

        Sets deleted_at/deleted_by and records a CASE_DELETED audit event.
        The case is removed from normal queries but the audit trail is
        fully preserved.
        """
        if not IsSuperAdmin().has_permission(request, self):
            return Response(
                {"detail": "Only SUPER_ADMIN may delete cases."},
                status=status.HTTP_403_FORBIDDEN,
            )
        case = self.get_object()
        from django.utils import timezone as _tz

        prev_status = case.status
        prev_step = case.current_step
        case.status = Case.Status.DELETED
        case.deleted_at = _tz.now()
        case.deleted_by = request.user
        case.deleted_from_status = prev_status
        case.deleted_from_step = prev_step
        case.save(update_fields=["status", "deleted_at", "deleted_by", "deleted_from_status", "deleted_from_step"])

        Event.objects.create(
            case=case,
            actor=request.user,
            event_type=Event.Type.CASE_DELETED,
            from_step=prev_step,
            to_step=prev_step,
            notes=(
                f"Case deleted by super admin {request.user.email}. "
                f"Was status={prev_status}, step={prev_step}."
            ),
            payload_hash=Event.compute_hash(
                {
                    "action": "case_deleted",
                    "case_uid": str(case.uid),
                    "previous_status": prev_status,
                    "previous_step": prev_step,
                }
            ),
            idempotency_key=request.headers.get("Idempotency-Key", ""),
        )

        return Response(status=status.HTTP_204_NO_CONTENT)

    @action(detail=True, methods=["post"], url_path="restore")
    def restore(self, request, uid=None):
        if not IsSuperAdmin().has_permission(request, self):
            return Response({"detail": "Only SUPER_ADMIN may restore cases."}, status=status.HTTP_403_FORBIDDEN)
        with transaction.atomic():
            case = get_object_or_404(Case.objects.select_for_update(), uid=uid)
            if case.deleted_at is None or case.status != Case.Status.DELETED:
                return Response({"detail": "Case is not deleted."}, status=status.HTTP_400_BAD_REQUEST)
            if not case.deleted_from_status or case.deleted_from_step is None:
                return Response({"detail": "This legacy deleted case has no recoverable prior state."}, status=status.HTTP_409_CONFLICT)
            previous_status = case.deleted_from_status
            previous_step = case.deleted_from_step
            case.status = previous_status
            case.current_step = previous_step
            case.deleted_at = None
            case.deleted_by = None
            case.save(update_fields=["status", "current_step", "deleted_at", "deleted_by"])
            Event.objects.create(
                case=case,
                actor=request.user,
                event_type=Event.Type.CASE_RESTORED,
                from_step=previous_step,
                to_step=previous_step,
                notes=f"Case restored by super admin {request.user.email}. Was status={previous_status}, step={previous_step}.",
                payload_hash=Event.compute_hash({"action": "case_restored", "case_uid": str(case.uid), "previous_status": previous_status, "previous_step": previous_step}),
                idempotency_key=request.headers.get("Idempotency-Key", ""),
            )
        return Response(CaseSerializer(case).data)

    # ---- state transitions ----
    @action(detail=True, methods=["post"], url_path="submit")
    @with_idempotency
    def submit(self, request, uid=None):
        """CB submits a DRAFT case into the pipeline (DRAFT → SUBMITTED)."""
        case = self.get_object()
        if not (
            request.user.has_any_role("ADMIN", "SUPER_ADMIN")
            or (
                request.user.has_any_role("CB", "DP")
                and case.created_by_id == request.user.id
            )
        ):
            return Response(
                {"detail": "Only the case creator or an administrator can submit this case."},
                status=status.HTTP_403_FORBIDDEN,
            )
        if case.status != Case.Status.DRAFT:
            return Response(
                {"detail": "Only DRAFT cases can be submitted."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        notes = (request.data.get("notes") or "").strip()
        try:
            event = transition(
                case,
                "submit",
                request.user,
                notes=notes,
                idempotency_key=request.headers.get("Idempotency-Key", ""),
            )
        except StateError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(
            {"status": case.status, "event_id": event.id}
        )

    @action(detail=True, methods=["post"], url_path="verify")
    @with_idempotency
    def verify_case(self, request, uid=None):
        case = self.get_object()
        if not (
            request.user.has_any_role("ADMIN", "SUPER_ADMIN")
            or (
                request.user.has_any_role("CB", "DP")
                and case.created_by_id == request.user.id
            )
        ):
            return Response(
                {"detail": "Only the case creator or an administrator can verify this case."},
                status=status.HTTP_403_FORBIDDEN,
            )
        notes = (request.data.get("notes") or "").strip()
        try:
            event = transition(
                case,
                "verify",
                request.user,
                notes=notes,
                idempotency_key=request.headers.get("Idempotency-Key", ""),
            )
            # SLA: medical 48h, burial 72h (per spec §2.2)
            if case.case_type == Case.Type.MEDICAL:
                case.sla_deadline = timezone.now() + timedelta(hours=48)
            elif case.case_type == Case.Type.BURIAL:
                case.sla_deadline = timezone.now() + timedelta(hours=72)
            case.save(update_fields=["sla_deadline"])
        except StateError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(
            {
                "status": case.status,
                "current_step": case.current_step,
                "sla_deadline": case.sla_deadline,
                "event_id": event.id,
            }
        )

    @action(detail=True, methods=["post"], url_path="advance")
    @with_idempotency
    def advance(self, request, uid=None):
        """Advance the case to the next step in the approval chain.

        Automatically selects the correct transition (advance_ab,
        advance_wcs, etc.) based on the case's current_step.

        Case files are intentionally **progressive**: required file slots can
        be added at any point during the approval chain.  At AB advance
        (step 2→3) the UI displays the missing slots as a warning, but the
        case itself is always submittable — partial uploads are recorded on
        the audit trail so the next approver can see exactly what was and
        wasn't on file at the time of advance.
        """
        case = self.get_object()
        if case.status not in (Case.Status.AT_APPROVAL, Case.Status.SUBMITTED):
            return Response(
                {"detail": "Case is not in a state that can be advanced."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        notes = (request.data.get("notes") or "").strip()
        # Soft warning: record missing required slots on the audit trail but
        # never block the advance.  This implements the "progressive uploads"
        # rule from the case-files spec — files can always be added later.
        missing_slots: list[str] = []
        if case.current_step == 2:
            missing_slots = _missing_required_file_slots(case)
            if missing_slots:
                notes = (
                    notes + ("\n" if notes else "") +
                    f"[Progressive files notice] Missing required slots at advance: "
                    f"{', '.join(missing_slots)} — case advanced anyway; files can be added later."
                ).strip()
        try:
            t = advance_transition_for_step(case.current_step)
            event = transition(
                case,
                t.name,
                request.user,
                notes=notes,
                idempotency_key=request.headers.get("Idempotency-Key", ""),
            )
        except StateError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        resp = {
            "status": case.status,
            "current_step": case.current_step,
            "event_id": event.id,
        }
        if missing_slots:
            resp["missing_required_slots"] = missing_slots
            resp["warning"] = (
                "Case advanced with missing required file slots. "
                "They can still be uploaded by any approver at later stages."
            )
        return Response(resp)

    @action(detail=True, methods=["post"], url_path="reject")
    @with_idempotency
    def reject(self, request, uid=None):
        case = self.get_object()
        u = request.user
        if getattr(u, "role", None) in ("CB", "DP", "MINISTER"):
            return Response(
                {"detail": "This role cannot reject cases."},
                status=status.HTTP_403_FORBIDDEN,
            )
        if getattr(u, "role", None) != approver_role_for_step(case.current_step):
            return Response(
                {"detail": "Only the assigned reviewer can reject this case."},
                status=status.HTTP_403_FORBIDDEN,
            )
        if case.status != Case.Status.AT_APPROVAL:
            return Response(
                {"detail": "Case is not at approval."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        notes = (request.data.get("notes") or "").strip()
        try:
            event = transition(
                case,
                "reject",
                request.user,
                notes=notes,
                idempotency_key=request.headers.get("Idempotency-Key", ""),
            )
        except StateError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        return Response({"status": case.status, "event_id": event.id})

    @action(detail=True, methods=["post"], url_path="defer")
    @with_idempotency
    def defer(self, request, uid=None):
        """Send the case back one step for clarification.

        Available to any approver from step 2..6. The case moves to
        DEFERRED status at the previous step. A non-empty comment is required.
        """
        case = self.get_object()
        u = request.user
        if getattr(u, "role", None) in ("CB", "DP", "MINISTER"):
            return Response(
                {"detail": "This role cannot defer cases."},
                status=status.HTTP_403_FORBIDDEN,
            )
        if case.status != Case.Status.AT_APPROVAL:
            return Response(
                {"detail": "Case is not at approval."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if getattr(u, "role", None) != approver_role_for_step(case.current_step):
            return Response(
                {"detail": "Only the assigned reviewer can defer this case."},
                status=status.HTTP_403_FORBIDDEN,
            )
        notes = (request.data.get("notes") or "").strip()
        if not notes:
            return Response(
                {"notes": "A deferral reason is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            t = defer_for_step(case.current_step)
        except StateError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        try:
            event = transition(
                case,
                t.name,
                request.user,
                notes=notes,
                idempotency_key=request.headers.get("Idempotency-Key", ""),
            )
        except StateError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        return Response(
            {
                "status": case.status,
                "current_step": case.current_step,
                "event_id": event.id,
                "to_role": approver_role_for_step(case.current_step),
            }
        )

    @action(detail=True, methods=["post"], url_path="resume")
    @with_idempotency
    def resume(self, request, uid=None):
        """Resume a DEFERRED case back to AT_APPROVAL at the same step.

        The previous approver (the one the case was deferred *to*) calls
        this once they have re-checked or added comments. CB can also
        resume a DEFERRED case to re-submit at step 1.
        """
        case = self.get_object()
        user = request.user
        if getattr(user, "role", None) == "MINISTER":
            return Response({"detail": "Minister accounts are read-only."}, status=status.HTTP_403_FORBIDDEN)
        if case.status != Case.Status.DEFERRED:
            return Response(
                {"detail": "Case is not deferred."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not (
            user.has_any_role("ADMIN", "SUPER_ADMIN")
            or (
                case.current_step == 1
                and user.has_any_role("CB", "DP")
                and case.created_by_id == user.id
            )
            or user.role == approver_role_for_step(case.current_step)
        ):
            return Response(
                {"detail": "Only the assigned reviewer or an administrator can resume this case."},
                status=status.HTTP_403_FORBIDDEN,
            )
        case.status = Case.Status.AT_APPROVAL
        case.save(update_fields=["status"])
        Event.objects.create(
            case=case,
            actor=request.user,
            event_type=Event.Type.ADVANCED,
            from_step=case.current_step,
            to_step=case.current_step,
            notes=request.data.get("notes", "Resumed after clarification."),
            payload_hash=Event.compute_hash({"resumed": True}),
            idempotency_key=request.headers.get("Idempotency-Key", ""),
        )
        return Response(
            {
                "status": case.status,
                "current_step": case.current_step,
                "event_id": None,
                "to_role": approver_role_for_step(case.current_step),
            }
        )

    @action(
        detail=True,
        methods=["post"],
        url_path="amount",
        permission_classes=[IsAuthenticated],
    )
    @with_idempotency
    def set_amount(self, request, uid=None):
        """Set / update the amount on a case.

        - DGFC at step 4: proposes a draft amount. The case is still in
          AT_APPROVAL step 4, and DGFAP can revise or authorize.
        - DGFAP at step 5: AUTHORIZES the amount. This is the value that
          is locked in for the rest of the chain.

        The transition used (`dgfc_propose_amount` vs `dgfap_authorize_amount`)
        is chosen based on (current_step, role). The case.amount_authorized
        field is only locked when DGFAP authorizes.
        """
        case = self.get_object()
        role = getattr(request.user, "role", None)
        if case.status != Case.Status.AT_APPROVAL:
            return Response(
                {"detail": "amount can only be set while case is AT_APPROVAL."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        s = AmountSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        amount = s.validated_data["amount_xaf"]
        reason = s.validated_data.get("reason", "")
        if amount <= 0:
            return Response({"amount_xaf": "Must be > 0."}, status=status.HTTP_400_BAD_REQUEST)

        from cases.models import FundSettings
        ceiling = FundSettings.get_solo().ceiling_for(case.case_type)
        if amount > ceiling:
            return Response(
                {
                    "amount_xaf": (
                        f"Amount {amount:,} FCFA exceeds ceiling {ceiling:,} FCFA "
                        f"for case_type {case.case_type}."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Decide which transition applies.
        if case.current_step == 4 and role in ("DGFC", "SUPER_ADMIN"):
            transition_name = "dgfc_propose_amount"
            event_type = Event.Type.AMOUNT_PROPOSED
        elif case.current_step == 5 and role in ("DGFAP", "SUPER_ADMIN"):
            transition_name = "dgfap_authorize_amount"
            event_type = Event.Type.AMOUNT_AUTHORIZED
        else:
            return Response(
                {
                    "detail": (
                        f"Only DGFC may set amount at step 4 and only DGFAP at step 5. "
                        f"You are {role!r} on step {case.current_step}."
                    )
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        # Apply the transition (records the immutable event with reason).
        try:
            event = transition(
                case,
                transition_name,
                request.user,
                notes=reason,
                idempotency_key=request.headers.get("Idempotency-Key", ""),
                extra={"amount_xaf": amount, "ceiling_xaf": ceiling},
                amount_xaf=amount,
            )
        except StateError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)

        # For AUTHORIZE (DGFAP) the amount is locked. For PROPOSE (DGFC) we
        # also write the proposed amount to the case so the next approver
        # sees it.
        if event_type == Event.Type.AMOUNT_AUTHORIZED:
            case.amount_authorized = amount
            case.save(update_fields=["amount_authorized"])
            try:
                from notifications.service import send_amount_authorized
                send_amount_authorized(case=case, actor=request.user)
            except Exception:
                pass
        elif event_type == Event.Type.AMOUNT_PROPOSED:
            case.amount_proposed = amount
            case.save(update_fields=["amount_proposed"])
            try:
                from notifications.service import send_amount_proposed
                send_amount_proposed(case=case, actor=request.user)
            except Exception:
                pass

        return Response(
            {
                "uid": str(case.uid),
                "amount_authorized": str(case.amount_authorized) if case.amount_authorized is not None else None,
                "amount_proposed": str(case.amount_proposed) if case.amount_proposed is not None else None,
                "ceiling_xaf": ceiling,
                "set_by": role,
                "step": case.current_step,
                "kind": "authorized" if event_type == Event.Type.AMOUNT_AUTHORIZED else "proposed",
                "event_id": event.id,
            }
        )

    @action(detail=True, methods=["post"], url_path="close")
    @with_idempotency
    def close(self, request, uid=None):
        # WCS is the closer after DGFAP approval and payment processing.
        if getattr(request.user, "role", None) != "WCS":
            return Response(
                {"detail": "Only WCS may close a case (after payment confirmation)."},
                status=status.HTTP_403_FORBIDDEN,
            )
        case = self.get_object()
        if case.status != Case.Status.APPROVED:
            return Response(
                {"detail": "Only APPROVED cases can be closed."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        # Require at least one disbursement before closing
        disbursement_count = case.disbursements.filter(deleted_at__isnull=True).count()
        if disbursement_count == 0:
            return Response(
                {"detail": "Cannot close: record at least one disbursement before closing the case."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        # Require a closing comment
        notes = (request.data.get("notes") or "").strip()
        if not notes:
            return Response(
                {"notes": "A closing comment is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            event = transition(
                case,
                "close",
                request.user,
                notes=notes,
                idempotency_key=request.headers.get("Idempotency-Key", ""),
            )
        except StateError as e:
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        return Response({"status": case.status, "event_id": event.id})

    # ---- disbursements (WCS) ----

    @action(detail=True, methods=["get", "post"], url_path="disbursements")
    def disbursements(self, request, uid=None):
        """GET -> list disbursements + running totals.

        POST -> WCS records a single disbursement (an outgoing payment).
        Body: amount_xaf, purpose, recipient_kind, recipient_name,
              payment_date (YYYY-MM-DD), payment_reference, notes,
              proof_of_payment_id (optional FK to a FormAttachment).

        Validates that case.status is APPROVED and that the running sum
        of disbursements (including this one) does not exceed
        case.amount_authorized.
        """
        if request.method == "GET":
            return self._list_disbursements(request, uid)
        return self._record_disbursement(request, uid)

    def _list_disbursements(self, request, uid):
        case = self.get_object()
        items = []
        running = 0
        for d in case.disbursements.filter(deleted_at__isnull=True):
            running += d.amount_xaf
            proof_info = None
            if d.proof_of_payment:
                proof_info = {
                    "id": d.proof_of_payment.id,
                    "filename": d.proof_of_payment.filename,
                    "mime": d.proof_of_payment.mime,
                    "size_bytes": d.proof_of_payment.size_bytes,
                }
            items.append(
                {
                    "id": d.id,
                    "amount_xaf": d.amount_xaf,
                    "purpose": d.purpose,
                    "recipient_kind": d.recipient_kind,
                    "recipient_kind_other": d.recipient_kind_other,
                    "recipient_name": d.recipient_name,
                    "payment_date": d.payment_date,
                    "payment_reference": d.payment_reference,
                    "proof_of_payment_id": d.proof_of_payment_id,
                    "proof_of_payment": proof_info,
                    "paid_by": d.paid_by.email,
                    "created_at": d.created_at,
                    "notes": d.notes,
                }
            )
        authorized = int(case.amount_authorized) if case.amount_authorized is not None else 0
        remaining = max(0, authorized - running)
        pct = (running / authorized) if authorized > 0 else 0
        warning = pct >= 0.9
        return Response(
            {
                "results": items,
                "count": len(items),
                "authorized_xaf": authorized,
                "disbursed_xaf": running,
                "remaining_xaf": remaining,
                "utilization_pct": round(pct * 100, 1),
                "approaching_limit": warning,
            }
        )

    def _record_disbursement(self, request, uid):
        from .models import Disbursement
        if getattr(request.user, "role", None) != "WCS":
            return Response(
                {"detail": "Only WCS may record disbursements."},
                status=status.HTTP_403_FORBIDDEN,
            )
        case = self.get_object()
        if case.status not in (Case.Status.APPROVED, Case.Status.CLOSED):
            return Response(
                {"detail": "Disbursements can only be recorded on APPROVED cases."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if case.amount_authorized is None:
            return Response(
                {"detail": "No amount authorized for this case yet."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        s = DisbursementSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        d = s.validated_data
        amount = int(d["amount_xaf"])
        if amount <= 0:
            return Response({"amount_xaf": "Must be > 0."}, status=status.HTTP_400_BAD_REQUEST)

        already = sum(int(x.amount_xaf) for x in case.disbursements.all())
        if already + amount > int(case.amount_authorized):
            return Response(
                {
                    "detail": (
                        f"Disbursement of {amount:,} XAF would exceed authorized "
                        f"{int(case.amount_authorized):,} XAF "
                        f"(already disbursed: {already:,} XAF)."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        proof = d.get("proof_of_payment_id")
        if proof:
            from forms.models import FormAttachment
            att = FormAttachment.objects.filter(id=proof, deleted_at__isnull=True).first()
            if not att or att.submission.case_id != case.id:
                return Response(
                    {"proof_of_payment_id": "Attachment does not belong to this case."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        disb = Disbursement.objects.create(
            case=case,
            amount_xaf=amount,
            purpose=d["purpose"],
            recipient_kind=d["recipient_kind"],
            recipient_kind_other=d.get("recipient_kind_other", ""),
            recipient_name=d["recipient_name"],
            payment_date=d["payment_date"],
            payment_reference=d.get("payment_reference", ""),
            proof_of_payment_id=proof,
            paid_by=request.user,
            notes=d.get("notes", ""),
        )

        event = Event.objects.create(
            case=case,
            actor=request.user,
            event_type=Event.Type.DISBURSEMENT_RECORDED,
            from_step=case.current_step,
            to_step=case.current_step,
            notes=(
                f"{amount:,} XAF -> {disb.recipient_name} ({disb.get_recipient_kind_display()}) "
                f"for {disb.purpose} on {disb.payment_date} ref={disb.payment_reference or '-'}"
            ),
            payload_hash=Event.compute_hash(
                {
                    "disbursement_id": disb.id,
                    "amount_xaf": amount,
                    "recipient_kind": disb.recipient_kind,
                    "payment_date": str(disb.payment_date),
                }
            ),
            idempotency_key=request.headers.get("Idempotency-Key", ""),
        )

        return Response(
            {
                "id": disb.id,
                "amount_xaf": disb.amount_xaf,
                "purpose": disb.purpose,
                "recipient_kind": disb.recipient_kind,
                "recipient_kind_other": disb.recipient_kind_other,
                "recipient_name": disb.recipient_name,
                "payment_date": disb.payment_date,
                "payment_reference": disb.payment_reference,
                "proof_of_payment_id": disb.proof_of_payment_id,
                "paid_by": request.user.email,
                "created_at": disb.created_at,
                "event_id": event.id,
                "disbursed_total_xaf": already + amount,
                "authorized_xaf": int(case.amount_authorized),
                "remaining_xaf": int(case.amount_authorized) - (already + amount),
            },
            status=status.HTTP_201_CREATED,
        )

    # ---- update / delete disbursement ----

    @action(
        detail=True,
        methods=["patch", "delete"],
        url_path=r"disbursements/(?P<disbursement_id>\d+)",
    )
    @with_idempotency
    def disbursement_detail(self, request, uid=None, disbursement_id=None):
        """PATCH → edit a disbursement.  DELETE → soft-delete it.

        Both actions are WCS-only and create an immutable Event for
        the audit trail.
        """
        from .models import Disbursement
        from django.utils import timezone as _tz

        if getattr(request.user, "role", None) != "WCS":
            return Response(
                {"detail": "Only WCS may modify disbursements."},
                status=status.HTTP_403_FORBIDDEN,
            )

        case = self.get_object()
        if case.status not in (Case.Status.APPROVED, Case.Status.CLOSED):
            return Response(
                {"detail": "Disbursements can only be modified on APPROVED or CLOSED cases."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            disb = Disbursement.objects.get(id=disbursement_id, case=case, deleted_at__isnull=True)
        except Disbursement.DoesNotExist:
            return Response(
                {"detail": "Disbursement not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if request.method == "DELETE":
            disb.deleted_at = _tz.now()
            disb.deleted_by = request.user
            disb.save(update_fields=["deleted_at", "deleted_by"])

            Event.objects.create(
                case=case,
                actor=request.user,
                event_type=Event.Type.DISBURSEMENT_DELETED,
                from_step=case.current_step,
                to_step=case.current_step,
                notes=(
                    f"Deleted disbursement #{disb.id}: {disb.amount_xaf:,} XAF -> "
                    f"{disb.recipient_name} ({disb.get_recipient_kind_display()}) "
                    f"for {disb.purpose} on {disb.payment_date}"
                ),
                payload_hash=Event.compute_hash(
                    {
                        "action": "disbursement_deleted",
                        "disbursement_id": disb.id,
                        "amount_xaf": disb.amount_xaf,
                        "recipient_name": disb.recipient_name,
                    }
                ),
                idempotency_key=request.headers.get("Idempotency-Key", ""),
            )
            return Response(status=status.HTTP_204_NO_CONTENT)

        # PATCH — edit fields
        s = DisbursementEditSerializer(data=request.data, partial=True)
        s.is_valid(raise_exception=True)

        changes = []
        updatable = s.validated_data
        for field in ("amount_xaf", "purpose", "recipient_kind", "recipient_kind_other",
                       "recipient_name", "payment_date", "payment_reference", "notes"):
            if field in updatable:
                old_val = getattr(disb, field)
                new_val = updatable[field]
                if str(old_val) != str(new_val):
                    setattr(disb, field, new_val)
                    changes.append(f"{field}: {old_val} -> {new_val}")

        # Handle proof_of_payment_id update
        if "proof_of_payment_id" in updatable:
            new_proof_id = updatable["proof_of_payment_id"]
            if disb.proof_of_payment_id != new_proof_id:
                disb.proof_of_payment_id = new_proof_id
                changes.append(f"proof_of_payment_id: {disb.proof_of_payment_id} -> {new_proof_id}")

        if not changes:
            return Response(
                {"detail": "No changes provided."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Re-validate ceiling if amount changed
        if "amount_xaf" in updatable:
            already = sum(
                int(x.amount_xaf)
                for x in case.disbursements.filter(
                    deleted_at__isnull=True
                ).exclude(id=disb.id)
            )
            new_amount = int(disb.amount_xaf)
            if already + new_amount > int(case.amount_authorized):
                return Response(
                    {
                        "detail": (
                            f"Disbursement of {new_amount:,} XAF would exceed authorized "
                            f"{int(case.amount_authorized):,} XAF "
                            f"(already disbursed: {already:,} XAF)."
                        )
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

        disb.save()
        change_summary = "; ".join(changes)

        Event.objects.create(
            case=case,
            actor=request.user,
            event_type=Event.Type.DISBURSEMENT_UPDATED,
            from_step=case.current_step,
            to_step=case.current_step,
            notes=f"Updated disbursement #{disb.id}: {change_summary}",
            payload_hash=Event.compute_hash(
                {
                    "action": "disbursement_updated",
                    "disbursement_id": disb.id,
                    "changes": changes,
                }
            ),
            idempotency_key=request.headers.get("Idempotency-Key", ""),
        )

        return Response(
            {
                "id": disb.id,
                "amount_xaf": disb.amount_xaf,
                "purpose": disb.purpose,
                "recipient_kind": disb.recipient_kind,
                "recipient_kind_other": disb.recipient_kind_other,
                "recipient_name": disb.recipient_name,
                "payment_date": str(disb.payment_date),
                "payment_reference": disb.payment_reference,
                "proof_of_payment_id": disb.proof_of_payment_id,
                "notes": disb.notes,
                "paid_by": disb.paid_by.email,
                "created_at": disb.created_at.isoformat(),
                "changes": changes,
            }
        )

    # ---- attach proof of payment ----

    @action(
        detail=True,
        methods=["post"],
        url_path=r"disbursements/(?P<disbursement_id>\d+)/proof",
    )
    @with_idempotency
    def attach_proof(self, request, uid=None, disbursement_id=None):
        """POST to attach or replace proof-of-payment on a disbursement.

        Body: { "proof_of_payment_id": <FormAttachment.id> }
        """
        from .models import Disbursement
        from forms.models import FormAttachment

        if getattr(request.user, "role", None) != "WCS":
            return Response(
                {"detail": "Only WCS may attach proof of payment."},
                status=status.HTTP_403_FORBIDDEN,
            )

        case = self.get_object()

        try:
            disb = Disbursement.objects.get(id=disbursement_id, case=case, deleted_at__isnull=True)
        except Disbursement.DoesNotExist:
            return Response(
                {"detail": "Disbursement not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        proof_id = request.data.get("proof_of_payment_id")
        if not proof_id:
            return Response(
                {"proof_of_payment_id": "This field is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            att = FormAttachment.objects.get(id=proof_id, deleted_at__isnull=True)
        except FormAttachment.DoesNotExist:
            return Response(
                {"proof_of_payment_id": "Attachment not found."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if att.submission.case_id != case.id:
            return Response(
                {"proof_of_payment_id": "Attachment does not belong to this case."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        old_proof_id = disb.proof_of_payment_id
        disb.proof_of_payment_id = att.id
        disb.save(update_fields=["proof_of_payment_id"])

        Event.objects.create(
            case=case,
            actor=request.user,
            event_type=Event.Type.PROOF_UPLOADED,
            from_step=case.current_step,
            to_step=case.current_step,
            notes=(
                f"Proof of payment attached to disbursement #{disb.id}: "
                f"{att.filename} ({att.mime}, {att.size_bytes:,} bytes). "
                f"Previous proof: {old_proof_id or 'none'}"
            ),
            payload_hash=Event.compute_hash(
                {
                    "action": "proof_uploaded",
                    "disbursement_id": disb.id,
                    "attachment_id": att.id,
                    "filename": att.filename,
                    "size_bytes": att.size_bytes,
                    "previous_proof_id": old_proof_id,
                }
            ),
            idempotency_key=request.headers.get("Idempotency-Key", ""),
        )

        return Response(
            {
                "id": disb.id,
                "proof_of_payment_id": disb.proof_of_payment_id,
                "filename": att.filename,
                "mime": att.mime,
                "size_bytes": att.size_bytes,
            }
        )

    # ---- disbursement history (audit trail) ----

    @action(
        detail=True,
        methods=["get"],
        url_path="disbursements/history",
    )
    def disbursement_history(self, request, uid=None):
        """GET full audit trail for all disbursement activity on a case.

        Returns all Event rows related to disbursements, including
        recorded, updated, deleted, and proof-uploaded events.
        """
        case = self.get_object()
        event_types = [
            Event.Type.DISBURSEMENT_RECORDED,
            Event.Type.DISBURSEMENT_UPDATED,
            Event.Type.DISBURSEMENT_DELETED,
            Event.Type.PROOF_UPLOADED,
        ]
        events = Event.objects.filter(
            case=case,
            event_type__in=event_types,
        ).select_related("actor").order_by("-occurred_at")

        items = [
            {
                "id": e.id,
                "actor_email": e.actor.email,
                "actor_role": e.actor.role,
                "event_type": e.event_type,
                "occurred_at": e.occurred_at.isoformat(),
                "notes": e.notes,
                "from_step": e.from_step,
                "to_step": e.to_step,
                "idempotency_key": e.idempotency_key,
            }
            for e in events
        ]

        return Response({
            "results": items,
            "count": len(items),
        })
