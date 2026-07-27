from django.db import migrations, models
import django.db.models.deletion
from django.conf import settings


class Migration(migrations.Migration):

    dependencies = [
        ("cases", "0006_case_urgent_death_payment_events"),
        ("forms", "0006_merge_20260723_1625"),
    ]

    operations = [
        # 1) Add the new AMOUNT_PROPOSED / AMOUNT_AUTHORIZED / DISBURSEMENT_RECORDED event types
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
                    ("CLOSED", "Closed"),
                    ("COMMENT", "Comment"),
                ],
                max_length=32,
            ),
        ),

        # 2) Remove accelerated_benefit fields + urgent flags from Case
        migrations.RemoveField(
            model_name="case",
            name="urgent_medical",
        ),
        migrations.RemoveField(
            model_name="case",
            name="urgent_death",
        ),
        migrations.RemoveField(
            model_name="case",
            name="accelerated_benefit_released",
        ),
        migrations.RemoveField(
            model_name="case",
            name="accelerated_benefit_amount_xaf",
        ),

        # 3) Remove accelerated_benefit_pct from FundSettings
        migrations.RemoveField(
            model_name="fundsettings",
            name="accelerated_benefit_pct",
        ),

        # 4) Add the Disbursement model
        migrations.CreateModel(
            name="Disbursement",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("amount_xaf", models.PositiveIntegerField()),
                ("purpose", models.CharField(max_length=200)),
                (
                    "recipient_kind",
                    models.CharField(
                        choices=[
                            ("CLAIMANT", "Claimant"),
                            ("HOSPITAL", "Hospital / clinic"),
                            ("MORTUARY", "Mortuary / funeral home"),
                            ("PHARMACY", "Pharmacy"),
                            ("TRANSPORT", "Transport (ambulance etc.)"),
                            ("GOVERNMENT", "Government / ministry"),
                            ("INSURANCE", "Insurance"),
                            ("OTHER", "Other"),
                        ],
                        default="CLAIMANT",
                        max_length=16,
                    ),
                ),
                ("recipient_name", models.CharField(max_length=200)),
                ("payment_date", models.DateField()),
                ("payment_reference", models.CharField(blank=True, max_length=128)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("notes", models.TextField(blank=True)),
                (
                    "case",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="disbursements",
                        to="cases.case",
                    ),
                ),
                (
                    "paid_by",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="disbursements_paid",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "proof_of_payment",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="disbursement_proofs",
                        to="forms.formattachment",
                    ),
                ),
            ],
            options={
                "ordering": ["-payment_date", "-created_at"],
            },
        ),
        migrations.AddIndex(
            model_name="disbursement",
            index=models.Index(fields=["case", "-payment_date"], name="cases_disbu_case_id_7a9b35_idx"),
        ),
    ]
