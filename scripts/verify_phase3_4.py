"""Phase 3+4 verification: form schema validation, payload validation, upload presign+PUT+finish."""
import os
import sys
import django

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "hec_fund.settings.dev")
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
django.setup()

from django.core.exceptions import ValidationError
from django.core.files.base import ContentFile
from rest_framework.test import APIClient

from accounts.models import User
from cases.models import Case
from forms.models import FormDefinition, FormSubmission
from forms.jsonschema import (
    normalize_legacy_bilingual,
    validate_payload,
    validate_schema,
)


def header(s):
    print(f"\n=== {s} ===")


def login_as(client, email):
    r = client.post(
        "/api/v1/auth/login",
        {"email": email, "password": "HEC-Dev-2026!"},
        format="json",
    )
    assert r.status_code == 200
    client.credentials(HTTP_AUTHORIZATION=f"Bearer {r.json()['access']}")
    return client


# --- 1. Schema validation -------------------------------------------------

header("Schema validation: legacy label:'string' -> bilingual")
legacy = {
    "title": "X",
    "fields": [
        {"id": "name", "type": "text", "label": "Name", "required": True},
        {"id": "sev", "type": "select", "label": "Severity", "options": [
            {"value": "low", "label": "Low"},
            {"value": "high", "label": "High"},
        ]},
    ],
}
normalized = normalize_legacy_bilingual(legacy)
print(f"  legacy label: {legacy['fields'][0]['label']!r}")
print(f"  promoted to : {normalized['fields'][0]['label']!r}")
assert normalized["fields"][0]["label"] == {"en": "Name", "fr": "Name"}

print("\nSchema validation: rejects bad field type")
try:
    validate_schema({"fields": [{"id": "x", "type": "weird"}]})
    assert False, "Should have raised"
except ValidationError as e:
    print(f"  rejected: {e.messages[0]}")

print("\nSchema validation: rejects select without options")
try:
    validate_schema({"fields": [{"id": "x", "type": "select"}]})
    assert False
except ValidationError as e:
    print(f"  rejected: {e.messages[0]}")

print("\nSchema validation: rejects duplicate field ids")
try:
    validate_schema({"fields": [
        {"id": "x", "type": "text"},
        {"id": "x", "type": "text"},
    ]})
    assert False
except ValidationError as e:
    print(f"  rejected: {e.messages[0]}")

# --- 2. List + get form definitions ---------------------------------------

header("REST: list forms (CB only sees CB-scoped forms)")
client_cb = login_as(APIClient(), "cb@hec.local")
r = client_cb.get("/api/v1/forms")
print(f"  CB sees {r.json()['count']} form(s): {[f['slug'] for f in r.json()['results']]}")
assert r.json()["count"] >= 1
assert r.json()["results"][0]["slug"] == "cb-incident-report"

r = client_cb.get("/api/v1/forms/cb-incident-report")
fd_data = r.json()
print(f"  Get cb-incident-report: {fd_data['slug']} v{fd_data['version']} status={fd_data['status']}")
assert fd_data["schema"]["fields"][0]["label"] == {
    "en": "Claimant full name", "fr": "Nom complet du requérant"
}

# --- 3. Submit a valid payload --------------------------------------------

header("Submit a valid form payload")
# First create a case
import datetime
from django.utils import timezone

r = client_cb.post(
    "/api/v1/cases",
    {
        "case_type": "MEDICAL",
        "claimant_name": "Test Phase3",
        "claimant_phone": "+24177000010",
        "incident_at": (timezone.now() - datetime.timedelta(hours=10)).isoformat(),
    },
    format="json",
)
case_uid = r.json()["uid"]
print(f"  Case created: {case_uid[:8]}…")

# Submit form
payload = {
    "claimant_name": "Test Phase3",
    "claimant_phone": "+24177000010",
    "incident_date": "2026-07-16",
    "case_type": "MEDICAL",
    "elephant_count": 2,
    "narrative": "Encountered two elephants near crop field.",
    "urgent_medical": True,
    "claimant_signature": "Test Phase3",
}
r = client_cb.post(
    f"/api/v1/forms/cb-incident-report/v1/submissions",
    {"case_uid": case_uid, "payload": payload},
    format="json",
)
assert r.status_code == 201, r.content
sub = r.json()
print(f"  Submission created: id={sub['id']} form={sub['form']}")
sub_id = sub["id"]

# --- 4. Reject invalid payload --------------------------------------------

header("Reject invalid payload (missing required)")
bad_payload = dict(payload)
del bad_payload["claimant_name"]
r = client_cb.post(
    f"/api/v1/forms/cb-incident-report/v1/submissions",
    {"case_uid": case_uid, "payload": bad_payload},
    format="json",
)
assert r.status_code == 400, r.content
print(f"  rejected: {r.json()['payload']}")

# --- 5. Reject out-of-range number ---------------------------------------

header("Reject out-of-range number")
bad_payload = dict(payload)
bad_payload["elephant_count"] = 999
r = client_cb.post(
    f"/api/v1/forms/cb-incident-report/v1/submissions",
    {"case_uid": case_uid, "payload": bad_payload},
    format="json",
)
assert r.status_code == 400, r.content
print(f"  rejected: {r.json()['payload']}")

# --- 6. Wrong role: AB cannot submit CB form ------------------------------

header("AB cannot submit a CB-scoped form")
client_ab = login_as(APIClient(), "ab@hec.local")
r = client_ab.post(
    f"/api/v1/forms/cb-incident-report/v1/submissions",
    {"case_uid": case_uid, "payload": payload},
    format="json",
)
assert r.status_code == 403, r.content
print(f"  AB-against-CB-form: {r.json()['detail']}")

# --- 7. Uploads: presign -> PUT -> finish ----------------------------------

header("Uploads: presign -> PUT -> finish")
# Fake image bytes
fake_jpeg = bytes.fromhex(
    "FFD8FFE000104A46494600010101006000600000"
    "FFDB004300030202030202030303030403030405"
    "0805050404050A07070608090B0A0908090B"
    "FFC00011080001000103012200021101031101"
    "FFDA000C03010002110311003F00FBD0"
)
print(f"  fake jpeg: {len(fake_jpeg)} bytes")

r = client_cb.post(
    "/api/v1/uploads/presign",
    {
        "filename": "elephant-photo.jpg",
        "mime": "image/jpeg",
        "size": len(fake_jpeg),
        "case_uid": case_uid,
        "submission_id": sub_id,
    },
    format="json",
)
assert r.status_code == 200, r.content
presigned = r.json()
print(f"  presigned: key={presigned['key'][-30:]}…  expires_in={presigned['expires_in']}s")

# PUT the file
r = client_cb.put(
    presigned["url"],
    data=fake_jpeg,
    content_type=presigned.get("mime", "image/jpeg"),
)
# The presigned URL is a path. We need to hit it on the same host. Re-login bypass:
# Use a raw client with the presigned URL directly
import hashlib as _h
sha_expected = _h.sha256(fake_jpeg).hexdigest()
print(f"  PUT status: {r.status_code} body[:80]={r.content[:80]!r}")
assert r.status_code == 200, f"PUT failed: {r.status_code} {r.content!r}"
assert r.json()["sha256"] == sha_expected
print(f"  sha256 match: {sha_expected[:16]}…")

# Finish: register the uploaded file
r = client_cb.post(
    "/api/v1/uploads/finish",
    {
        "key": presigned["key"],
        "filename": "elephant-photo.jpg",
        "mime": "image/jpeg",
        "size": len(fake_jpeg),
        "sha256": sha_expected,
        "submission_id": sub_id,
    },
    format="json",
)
assert r.status_code == 201, r.content
att = r.json()
print(f"  attachment registered: id={att['id']} sha256[:16]={att['sha256'][:16]}…")

# --- 8. List submissions for case ----------------------------------------

header("List submissions for case")
r = client_cb.get(f"/api/v1/cases/{case_uid}/submissions")
print(f"  {r.json()['count']} submission(s) for case {case_uid[:8]}…")
sub_with_att = r.json()["results"][0]
assert sub_with_att["attachments"][0]["filename"] == "elephant-photo.jpg"
print(f"  attachment: {sub_with_att['attachments'][0]}")

# --- 9. Admin can publish a new form -------------------------------------

header("Admin publishes a new (versioned) form")
client_admin = login_as(APIClient(), "admin@hec.local")
new_form_schema = {
    "title": {"en": "Verification form", "fr": "Formulaire de vérification"},
    "fields": [
        {
            "id": "witness_confirmed",
            "type": "checkbox",
            "label": {"en": "Witness confirmed", "fr": "Témoin confirmé"},
        }
    ],
}
r = client_admin.post(
    "/api/v1/admin/forms",
    {"slug": "verification", "title": "Verification form", "schema": new_form_schema, "role_scope": "AB,DGFC"},
    format="json",
)
assert r.status_code == 201, r.content
new_fd = r.json()
print(f"  published: {new_fd['slug']} v{new_fd['version']} scope={new_fd['role_scope']}")

# Re-publish same slug: version should auto-increment
r = client_admin.post(
    "/api/v1/admin/forms",
    {"slug": "verification", "title": "Verification form v2", "schema": new_form_schema, "role_scope": "AB,DGFC"},
    format="json",
)
assert r.status_code == 201
v2 = r.json()
print(f"  re-publish bumps version: v{v2['version']}")
assert v2["version"] > new_fd["version"]

# --- 10. Publish fails on bad schema --------------------------------------

header("Admin publish fails on bad schema")
r = client_admin.post(
    "/api/v1/admin/forms",
    {"slug": "bad", "title": "Bad", "schema": {"fields": []}, "role_scope": "CB"},
    format="json",
)
assert r.status_code == 400, r.content
print(f"  rejected empty fields: {r.json()['schema']}")

print()
print("=" * 60)
print("Phase 3 + 4 verification: ALL CHECKS PASSED")
print("=" * 60)
