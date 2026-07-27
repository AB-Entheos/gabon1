import os
import django

os.environ['DJANGO_SETTINGS_MODULE'] = 'hec_fund.settings.dev'
django.setup()

from forms.jsonschema import validate_payload
from forms.models import FormDefinition

fd = FormDefinition.objects.get(slug='cb-incident-report')

# Replay what the frontend sent
payload = {
    "claimant_name": "Marie-Claire Moukagni",
    "claimant_phone": "+24177000001",
    "incident_date": "2026-07-15",
    "case_type": "MEDICAL",
    "elephant_count": "2",
    "witness_names": "",
    "narrative": "Deux éléphants ont attaqué le champ de manioc près du village de Libreville vers 18h00. Blessures à la jambe gauche.",
    "urgent_medical": True,
    "claimant_signature": "Marie-Claire Moukagni",
}

try:
    validate_payload(fd.schema, payload)
    print("VALID")
except Exception as e:
    print(f"INVALID: {e}")
