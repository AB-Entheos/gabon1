"""Data migration: promote legacy label:'string' → label:{'en','fr'}.

Idempotent. Runs against all existing FormDefinition rows.
"""
from django.db import migrations

from forms.jsonschema import normalize_legacy_bilingual


def promote(apps, schema_editor):
    FormDefinition = apps.get_model("forms", "FormDefinition")
    for fd in FormDefinition.objects.all():
        normalized = normalize_legacy_bilingual(fd.schema)
        if normalized != fd.schema:
            fd.schema = normalized
            fd.save(update_fields=["schema"])


def reverse(apps, schema_editor):
    pass  # No reverse needed — the original "string" labels are no longer needed.


class Migration(migrations.Migration):
    dependencies = [
        ("forms", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(promote, reverse),
    ]
