from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    initial = True
    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("cases", "0020_merge_approval_and_fundsettings"),
    ]
    operations = [
        migrations.CreateModel(
            name="InAppNotification",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("kind", models.CharField(choices=[("INFO", "Information"), ("ACTION", "Action required"), ("SUCCESS", "Success"), ("WARNING", "Warning")], default="INFO", max_length=16)),
                ("event_key", models.CharField(max_length=64)),
                ("title", models.JSONField(default=dict)),
                ("message", models.JSONField(default=dict)),
                ("payload", models.JSONField(blank=True, default=dict)),
                ("read_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("case", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name="in_app_notifications", to="cases.case")),
                ("recipient", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="in_app_notifications", to=settings.AUTH_USER_MODEL)),
            ],
            options={"ordering": ["-created_at"], "indexes": [models.Index(fields=["recipient", "read_at"], name="notifications_recipient_read_idx"), models.Index(fields=["recipient", "created_at"], name="notifications_recipient_created_idx")]},
        ),
    ]
