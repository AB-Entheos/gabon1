# Adds the DP (Delegué Provincial) role to the User.role enum.
# Mirrors CB: a DP is a field reporter who can open cases, attach files,
# and submit them for approval.  DPs are exempted from 2FA.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0003_add_must_change_password'),
    ]

    operations = [
        migrations.AlterField(
            model_name='user',
            name='role',
            field=models.CharField(choices=[
                ('CB', 'Chef de Brigade'),
                ('DP', 'Delegué Provincial'),
                ('AB', 'AB Entheos'),
                ('WCS', 'WCS'),
                ('DGFC', 'DGFC'),
                ('DGFAP', 'DGFAP'),
                ('MINISTER', 'Minister'),
                ('ADMIN', 'Administrator'),
                ('SUPER_ADMIN', 'Super Administrator'),
            ], max_length=16),
        ),
    ]
