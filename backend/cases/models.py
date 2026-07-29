import hashlib
import json
import uuid
from decimal import Decimal
from django.conf import settings
from django.db import models


class FundSettings(models.Model):
    """Singleton row. Per-case ceilings."""

    medical_ceiling_xaf = models.PositiveIntegerField(default=2_000_000)
    burial_ceiling_xaf = models.PositiveIntegerField(default=1_500_000)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Fund settings"

    @classmethod
    def get_solo(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj

    def ceiling_for(self, case_type: str) -> int:
        if case_type == Case.Type.MEDICAL:
            return self.medical_ceiling_xaf
        if case_type == Case.Type.BURIAL:
            return self.burial_ceiling_xaf
        raise ValueError(f"Unknown case type: {case_type}")

    def __str__(self) -> str:
        return "Fund settings"


class Case(models.Model):
    """A HEC compensation claim."""

    class Type(models.TextChoices):
        MEDICAL = "MEDICAL", "Medical (injury)"
        BURIAL = "BURIAL", "Burial (death)"

    class Status(models.TextChoices):
        DRAFT = "DRAFT", "Draft"
        SUBMITTED = "SUBMITTED", "Submitted"
        VERIFIED = "VERIFIED", "Verified"
        AT_APPROVAL = "AT_APPROVAL", "At approval"
        APPROVED = "APPROVED", "Approved"
        REJECTED = "REJECTED", "Rejected"
        DEFERRED = "DEFERRED", "Deferred"
        CLOSED = "CLOSED", "Closed"

    uid = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    case_type = models.CharField(max_length=16, choices=Type.choices, default=Type.MEDICAL)
    claimant_name = models.CharField(max_length=200)
    claimant_phone = models.CharField(max_length=32, blank=True)
    claimant_id_number = models.CharField(max_length=64, blank=True, help_text="National ID or passport number")
    claimant_id_type = models.CharField(
        max_length=16,
        blank=True,
        choices=[
            ("NATIONAL_ID", "National ID"),
            ("PASSPORT", "Passport"),
            ("DRIVER_LICENSE", "Driver License"),
            ("OTHER", "Other"),
        ],
        default="NATIONAL_ID",
    )
    claimant_date_of_birth = models.DateField(null=True, blank=True)
    claimant_gender = models.CharField(
        max_length=8,
        blank=True,
        choices=[
            ("M", "Male"),
            ("F", "Female"),
            ("OTHER", "Other"),
        ],
    )
    claimant_address = models.CharField(max_length=300, blank=True, help_text="Full address of the claimant")
    incident_location = models.CharField(max_length=300, blank=True, help_text="Location where the incident occurred")
    relationship_to_claimant = models.CharField(
        max_length=32,
        blank=True,
        choices=[
            ("SELF", "Self"),
            ("SPOUSE", "Spouse"),
            ("PARENT", "Parent"),
            ("CHILD", "Child"),
            ("SIBLING", "Sibling"),
            ("OTHER", "Other"),
        ],
        default="SELF",
    )
    village = models.ForeignKey(
        "accounts.Village",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="cases",
    )
    # Free-text fields for village name and chef de village, captured at
    # intake time.  These are intentionally denormalized from the Village
    # FK so a Case record remains self-describing even if the Village row
    # is later renamed, merged, or removed.
    village_name_text = models.CharField(
        max_length=128,
        blank=True,
        default="",
        help_text="Free-text village name entered by the field reporter (CB/DP).",
    )
    chef_de_village = models.CharField(
        max_length=128,
        blank=True,
        default="",
        help_text="Free-text name of the village chief (chef de village).",
    )
    incident_at = models.DateTimeField()
    reported_at = models.DateTimeField(auto_now_add=True)
    current_step = models.PositiveSmallIntegerField(default=1)
    status = models.CharField(
        max_length=16,
        choices=Status.choices,
        default=Status.DRAFT,
    )
    amount_authorized = models.DecimalField(
        max_digits=14, decimal_places=0, null=True, blank=True
    )
    amount_proposed = models.DecimalField(
        max_digits=14, decimal_places=0, null=True, blank=True,
        help_text="Proposed amount by DGFC at step 4, visible to DGFAP at step 5."
    )
    sla_deadline = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="created_cases",
    )

    class Meta:
        ordering = ["-reported_at"]
        indexes = [
            models.Index(fields=["status"]),
            models.Index(fields=["current_step"]),
            models.Index(fields=["village"]),
        ]

    def __str__(self) -> str:
        return f"Case {self.uid.hex[:8]} — {self.claimant_name}"


class Event(models.Model):
    """Immutable audit event. DB trigger blocks UPDATE/DELETE."""

    class Type(models.TextChoices):
        CREATED = "CREATED", "Created"
        SUBMITTED = "SUBMITTED", "Submitted"
        VERIFIED = "VERIFIED", "Verified"
        ADVANCED = "ADVANCED", "Advanced"
        DEFERRED = "DEFERRED", "Deferred"
        REJECTED = "REJECTED", "Rejected"
        AMOUNT_PROPOSED = "AMOUNT_PROPOSED", "Amount proposed"
        AMOUNT_AUTHORIZED = "AMOUNT_AUTHORIZED", "Amount authorized"
        APPROVED = "APPROVED", "Approved"
        DISBURSEMENT_RECORDED = "DISBURSEMENT_RECORDED", "Disbursement recorded"
        DISBURSEMENT_UPDATED = "DISBURSEMENT_UPDATED", "Disbursement updated"
        DISBURSEMENT_DELETED = "DISBURSEMENT_DELETED", "Disbursement deleted"
        PROOF_UPLOADED = "PROOF_UPLOADED", "Proof of payment uploaded"
        FILE_DELETED = "FILE_DELETED", "File deleted"  # legacy – kept for existing rows
        FILE_SOFT_DELETED = "FILE_SOFT_DELETED", "File soft-deleted (retained for audit)"
        FILE_SUPERSEDED = "FILE_SUPERSEDED", "File replaced (old version retained for history)"
        CLOSED = "CLOSED", "Closed"
        COMMENT = "COMMENT", "Comment"

    case = models.ForeignKey(Case, on_delete=models.CASCADE, related_name="events")
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="events",
    )
    occurred_at = models.DateTimeField(auto_now_add=True)
    event_type = models.CharField(max_length=32, choices=Type.choices)
    from_step = models.PositiveSmallIntegerField(null=True, blank=True)
    to_step = models.PositiveSmallIntegerField(null=True, blank=True)
    payload_hash = models.CharField(max_length=64, blank=True)
    notes = models.TextField(blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=512, blank=True)
    idempotency_key = models.CharField(max_length=128, blank=True)
    amount_xaf = models.DecimalField(
        max_digits=14, decimal_places=0, null=True, blank=True,
        help_text="Amount set by the actor (proposed or authorized), copied from the set_amount view."
    )

    class Meta:
        ordering = ["occurred_at"]
        indexes = [
            models.Index(fields=["case", "occurred_at"]),
            models.Index(fields=["actor"]),
            models.Index(fields=["event_type"]),
        ]

    def __str__(self) -> str:
        return f"{self.case.uid.hex[:8]} · {self.event_type} · {self.occurred_at:%Y-%m-%d %H:%M}"

    @staticmethod
    def compute_hash(payload: dict) -> str:
        """Stable hash of a JSON payload (for tamper-detection on signed approvals)."""
        canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)
        return hashlib.sha256(canonical.encode("utf-8")).hexdigest()

    def sign(self, secret: str) -> str:
        """Server-side HMAC over (typed_name, case_uid, step, ts, ip, ua)."""
        import hmac as _hmac
        msg = "|".join(
            str(x) for x in [
                self.notes,
                self.case.uid,
                self.to_step,
                int(self.occurred_at.timestamp()),
                self.ip_address or "",
                self.user_agent or "",
            ]
        ).encode("utf-8")
        return _hmac.new(secret.encode("utf-8"), msg, hashlib.sha256).hexdigest()


class Disbursement(models.Model):
    """A single payment out of the authorized amount for a case.

    WCS records each disbursement with: amount, purpose, proof-of-payment
    attachment, payment_date, payment_reference, and the recipient
    (claimant or an institution such as a hospital, mortuary, etc.).

    The sum of all mount_xaf for a case MUST NOT exceed the case's
    mount_authorized. Enforced in the view; over-commit is rejected
    with HTTP 400.
    """

    class RecipientKind(models.TextChoices):
        CLAIMANT = "CLAIMANT", "Claimant"
        HOSPITAL = "HOSPITAL", "Hospital / clinic"
        MORTUARY = "MORTUARY", "Mortuary / funeral home"
        PHARMACY = "PHARMACY", "Pharmacy"
        TRANSPORT = "TRANSPORT", "Transport (ambulance etc.)"
        GOVERNMENT = "GOVERNMENT", "Government / ministry"
        INSURANCE = "INSURANCE", "Insurance"
        OTHER = "OTHER", "Other"

    case = models.ForeignKey(Case, on_delete=models.CASCADE, related_name="disbursements")
    amount_xaf = models.PositiveIntegerField()
    purpose = models.CharField(max_length=200)
    recipient_kind = models.CharField(
        max_length=16, choices=RecipientKind.choices, default=RecipientKind.CLAIMANT
    )
    recipient_name = models.CharField(max_length=200)
    payment_date = models.DateField()
    payment_reference = models.CharField(max_length=128, blank=True)
    proof_of_payment = models.ForeignKey(
        "forms.FormAttachment",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="disbursement_proofs",
    )
    paid_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.PROTECT,
        related_name="disbursements_paid",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    notes = models.TextField(blank=True)
    deleted_at = models.DateTimeField(null=True, blank=True, db_index=True)
    deleted_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="deleted_disbursements",
    )

    class Meta:
        ordering = ["-payment_date", "-created_at"]
        indexes = [
            models.Index(fields=["case", "-payment_date"]),
        ]

    def __str__(self) -> str:
        return f"{self.case.uid.hex[:8]} · {self.amount_xaf:,} XAF · {self.purpose[:40]}"