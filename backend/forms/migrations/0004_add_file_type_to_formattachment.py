from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("forms", "0003_alter_formdefinition_slug"),
    ]

    operations = [
        migrations.AddField(
            model_name="formattachment",
            name="file_type",
            field=models.CharField(blank=True, max_length=128, null=True),
        ),
    ]
