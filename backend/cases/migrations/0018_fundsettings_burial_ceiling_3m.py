from django.db import migrations


def update_burial_ceiling(apps, schema_editor):
    FundSettings = apps.get_model("cases", "FundSettings")
    FundSettings.objects.filter(pk=1).update(burial_ceiling_xaf=3_000_000)


class Migration(migrations.Migration):

    dependencies = [
        ("cases", "0017_case_soft_delete"),
    ]

    operations = [
        migrations.RunPython(update_burial_ceiling, migrations.RunPython.noop),
    ]
