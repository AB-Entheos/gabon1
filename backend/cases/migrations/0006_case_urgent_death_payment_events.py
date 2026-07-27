from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("cases", "0005_drop_crop_damage_rename_first_aid"),
        ("forms", "0006_merge_20260723_1625"),
    ]

    operations = [
        migrations.AddField(
            model_name="case",
            name="urgent_death",
            field=models.BooleanField(
                default=False,
                help_text=(
                    "Set by CB on create. If true and case is BURIAL, after WCS "
                    "releases the accelerated benefit the case skips "
                    "DGFC/DGFAP/Minister and goes straight to the payment step."
                ),
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
                    ("AMOUNT_SET", "Amount set"),
                    ("ACCELERATED_BENEFIT_RELEASED", "Accelerated benefit released"),
                    ("APPROVED", "Approved"),
                    ("PAYMENT_PROOF_UPLOADED", "Payment proof uploaded"),
                    ("PAYMENT_CONFIRMED", "Payment confirmed"),
                    ("CLOSED", "Closed"),
                    ("COMMENT", "Comment"),
                ],
                max_length=32,
            ),
        ),
    ]
