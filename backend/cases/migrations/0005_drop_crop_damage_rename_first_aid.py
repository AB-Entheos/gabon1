"""Remove crop-damage support and rename first-aid to accelerated benefit.
"""
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("cases", "0004_alter_case_status_alter_event_event_type"),
    ]

    operations = [
        # Drop the crop-damage ceiling; it no longer exists.
        migrations.RemoveField(
            model_name="fundsettings",
            name="crop_ceiling_xaf",
        ),
        migrations.RenameField(
            model_name="fundsettings",
            old_name="first_aid_pct",
            new_name="accelerated_benefit_pct",
        ),

        # Case: rename first-aid flags, drop crop-damage choice.
        migrations.RenameField(
            model_name="case",
            old_name="first_aid_released",
            new_name="accelerated_benefit_released",
        ),
        migrations.RenameField(
            model_name="case",
            old_name="first_aid_amount_xaf",
            new_name="accelerated_benefit_amount_xaf",
        ),
        migrations.AlterField(
            model_name="case",
            name="case_type",
            field=models.CharField(
                choices=[("MEDICAL", "Medical (injury)"), ("BURIAL", "Burial (death)")],
                default="MEDICAL",
                max_length=16,
            ),
        ),

        # Event: rename first-aid event type to accelerated benefit.
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
                    ("CLOSED", "Closed"),
                    ("COMMENT", "Comment"),
                ],
                max_length=32,
            ),
        ),
    ]