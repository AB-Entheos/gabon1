import hashlib
import json

from django.db import migrations


def migration_payload_hash(payload):
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def migrate_minister_pending_cases(apps, schema_editor):
    Case = apps.get_model("cases", "Case")
    Event = apps.get_model("cases", "Event")
    User = apps.get_model("accounts", "User")
    pending_cases = Case.objects.filter(status="AT_APPROVAL", current_step=6)

    if not pending_cases.exists():
        return

    actor = User.objects.filter(role="DGFAP", is_active=True).order_by("id").first()
    if actor is None:
        actor = User.objects.filter(role="SUPER_ADMIN", is_active=True).order_by("id").first()
    if actor is None:
        raise RuntimeError(
            "Cannot migrate Minister-pending cases without an active DGFAP or SUPER_ADMIN actor."
        )

    for case in pending_cases:
        case.status = "AT_APPROVAL"
        case.current_step = 5
        case.save(update_fields=["status", "current_step"])
        Event.objects.create(
            case=case,
            actor=actor,
            event_type="ADVANCED",
            from_step=6,
            to_step=5,
            notes=(
                "Migrated from the former Minister approval stage to DGFAP final approval. "
                "The case remains pending and was not automatically approved."
            ),
            payload_hash=migration_payload_hash(
                {"migration": "dgfap_final_approval", "from_step": 6, "to_step": 5}
            ),
        )


class Migration(migrations.Migration):
    dependencies = [
        ("cases", "0017_case_soft_delete"),
    ]

    operations = [
        migrations.RunPython(migrate_minister_pending_cases, migrations.RunPython.noop),
    ]
