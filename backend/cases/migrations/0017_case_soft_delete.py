import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("cases", "0016_add_disbursement_recipient_kind_other"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name="case",
            name="deleted_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="case",
            name="deleted_by",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="deleted_cases",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AlterField(
            model_name="case",
            name="status",
            field=models.CharField(
                choices=[
                    ("DRAFT", "Draft"),
                    ("SUBMITTED", "Submitted"),
                    ("VERIFIED", "Verified"),
                    ("AT_APPROVAL", "At approval"),
                    ("APPROVED", "Approved"),
                    ("REJECTED", "Rejected"),
                    ("DEFERRED", "Deferred"),
                    ("CLOSED", "Closed"),
                    ("DELETED", "Deleted"),
                ],
                default="DRAFT",
                max_length=16,
            ),
        ),
        migrations.AlterField(
            model_name="event",
            name="event_type",
            field=models.CharField(
                choices=[
                    ("CREATED", "Created"),
                    ("SUBMITTED", "Submitted"),
                    ("VERIFIED", "Verified"),
                    ("ADVANCED", "Advanced"),
                    ("DEFERRED", "Deferred"),
                    ("REJECTED", "Rejected"),
                    ("AMOUNT_PROPOSED", "Amount proposed"),
                    ("AMOUNT_AUTHORIZED", "Amount authorized"),
                    ("APPROVED", "Approved"),
                    ("DISBURSEMENT_RECORDED", "Disbursement recorded"),
                    ("DISBURSEMENT_UPDATED", "Disbursement updated"),
                    ("DISBURSEMENT_DELETED", "Disbursement deleted"),
                    ("PROOF_UPLOADED", "Proof of payment uploaded"),
                    ("FILE_DELETED", "File deleted"),
                    ("FILE_SOFT_DELETED", "File soft-deleted (retained for audit)"),
                    ("FILE_SUPERSEDED", "File replaced (old version retained for history)"),
                    ("CLOSED", "Closed"),
                    ("CASE_DELETED", "Case deleted"),
                    ("COMMENT", "Comment"),
                ],
                max_length=32,
            ),
        ),
    ]
