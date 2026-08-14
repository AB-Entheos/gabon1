from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("cases", "0020_merge_approval_and_fundsettings")]

    operations = [
        migrations.AddField(
            model_name="case",
            name="deleted_from_status",
            field=models.CharField(blank=True, default="", max_length=16),
        ),
        migrations.AddField(
            model_name="case",
            name="deleted_from_step",
            field=models.PositiveSmallIntegerField(blank=True, null=True),
        ),
        migrations.AlterField(
            model_name="event",
            name="event_type",
            field=models.CharField(
                choices=[
                    ("CREATED", "Created"), ("SUBMITTED", "Submitted"), ("VERIFIED", "Verified"),
                    ("ADVANCED", "Advanced"), ("DEFERRED", "Deferred"), ("REJECTED", "Rejected"),
                    ("AMOUNT_PROPOSED", "Amount proposed"), ("AMOUNT_AUTHORIZED", "Amount authorized"),
                    ("APPROVED", "Approved"), ("DISBURSEMENT_RECORDED", "Disbursement recorded"),
                    ("DISBURSEMENT_UPDATED", "Disbursement updated"), ("DISBURSEMENT_DELETED", "Disbursement deleted"),
                    ("PROOF_UPLOADED", "Proof of payment uploaded"), ("FILE_DELETED", "File deleted"),
                    ("FILE_SOFT_DELETED", "File soft-deleted (retained for audit)"),
                    ("FILE_SUPERSEDED", "File replaced (old version retained for history)"),
                    ("CLOSED", "Closed"), ("CASE_DELETED", "Case deleted"), ("CASE_RESTORED", "Case restored"),
                    ("COMMENT", "Comment"),
                ],
                max_length=32,
            ),
        ),
    ]
