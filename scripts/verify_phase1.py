import os
import django

os.environ['DJANGO_SETTINGS_MODULE'] = 'hec_fund.settings.dev'
django.setup()

import pyotp
from django_otp.plugins.otp_totp.models import TOTPDevice
from accounts.models import User
from forms.models import FormDefinition
from cases.models import FundSettings

print("=== User 2FA state ===")
for email in ['cb@hec.local', 'ab@hec.local', 'wcs@hec.local', 'dgfc@hec.local',
              'dgfap@hec.local', 'minister@hec.local', 'admin@hec.local']:
    u = User.objects.get(email=email)
    print(f"  {u.role:8s} {email:24s} 2fa_enabled={u.is_2fa_enabled} requires_2fa={u.requires_2fa()} lang={u.preferred_language}")

print()
print("=== Bilingual form ===")
fd = FormDefinition.objects.get(slug='cb-incident-report')
print(f"  {fd.slug} v{fd.version} status={fd.status} fields={len(fd.schema['fields'])} role_scope={fd.role_scope}")
for f in fd.schema['fields'][:4]:
    print(f"  - {f['id']:24s} type={f['type']:10s} fr={f['label']['fr']!r:30s} en={f['label']['en']!r}")

print()
print("=== FundSettings ===")
fs = FundSettings.get_solo()
print(f"  medical={fs.medical_ceiling_xaf:,} XAF  burial={fs.burial_ceiling_xaf:,} XAF  first_aid={fs.first_aid_pct}%")
print(f"  first_aid MEDICAL: {fs.first_aid_amount('MEDICAL'):,} XAF")
print(f"  first_aid BURIAL:  {fs.first_aid_amount('BURIAL'):,} XAF")

print()
print("=== TOTP round-trip ===")
secret = pyotp.random_base32()
print(f"  secret={secret}")
print(f"  TOTP code now: {pyotp.TOTP(secret).now()}")
print(f"  verify previous step: {pyotp.TOTP(secret).verify(pyotp.TOTP(secret).now())}")
