"""Add description + uploaded_by_name metadata to FormAttachment.

This migration lives on `forms` (the app that owns FormAttachment) and
adds two columns used for self-describing attachments.
"""
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("forms", "0004_add_file_type_to_formattachment"),
    ]

    operations = [
        migrations.AddField(
            model_name="formattachment",
            name="description",
            field=models.CharField(blank=True, default="", max_length=512),
        ),
        migrations.AddField(
            model_name="formattachment",
            name="uploaded_by_name",
            field=models.CharField(blank=True, default="", max_length=200),
        ),
    ]