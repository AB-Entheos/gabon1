# Adds village_name_text and chef_de_village to the Case model.  These
# are free-text fields captured at intake by field reporters (CB/DP) and
# stored on the Case row so they are queryable without joining to the
# FormSubmission payload.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('cases', '0014_event_file_superseded'),
    ]

    operations = [
        migrations.AddField(
            model_name='case',
            name='village_name_text',
            field=models.CharField(blank=True, default='', help_text='Free-text village name entered by the field reporter (CB/DP).', max_length=128),
        ),
        migrations.AddField(
            model_name='case',
            name='chef_de_village',
            field=models.CharField(blank=True, default='', help_text='Free-text name of the village chief (chef de village).', max_length=128),
        ),
    ]
