from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


def seed_initial_role_assignments(apps, schema_editor):
    User = apps.get_model("accounts", "User")
    RoleAssignment = apps.get_model("accounts", "RoleAssignment")
    for user in User.objects.all():
        RoleAssignment.objects.get_or_create(
            user=user,
            role=user.role,
            revoked_at=None,
            defaults={"assigned_by": user, "reason": "Initial role migration"},
        )


class Migration(migrations.Migration):
    dependencies = [("accounts", "0005_password_reset_token")]

    operations = [
        migrations.CreateModel(
            name="RoleAssignment",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("role", models.CharField(choices=[("CB", "Chef de Brigade"), ("DP", "Delegué Provincial"), ("AB", "AB Entheos"), ("WCS", "WCS"), ("DGFC", "DGFC"), ("DGFAP", "DGFAP"), ("MINISTER", "Minister"), ("ADMIN", "Administrator"), ("SUPER_ADMIN", "Super Administrator")], max_length=16)),
                ("assigned_at", models.DateTimeField(auto_now_add=True)),
                ("expires_at", models.DateTimeField(blank=True, null=True)),
                ("revoked_at", models.DateTimeField(blank=True, null=True)),
                ("reason", models.CharField(blank=True, max_length=512)),
                ("assigned_by", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="role_assignments_created", to=settings.AUTH_USER_MODEL)),
                ("user", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="role_assignments", to=settings.AUTH_USER_MODEL)),
            ],
        ),
        migrations.AddConstraint(
            model_name="roleassignment",
            constraint=models.UniqueConstraint(condition=models.Q(("revoked_at__isnull", True)), fields=("user", "role"), name="unique_active_role_assignment"),
        ),
        migrations.RunPython(
            seed_initial_role_assignments,
            migrations.RunPython.noop,
        ),
    ]