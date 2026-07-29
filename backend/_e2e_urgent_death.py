"""BURIAL case with urgent_death=True - tests the urgent death flow.
"""
import os, sys, json, urllib.request, urllib.error, hashlib, mimetypes
from datetime import datetime, timedelta, timezone

API = "http://localhost:8000/api/v1"
FIX = os.path.join(os.path.dirname(__file__), "test_fixtures")
SEED = "HEC-Dev-2026!"

def req(method, path, token=None, body=None, content_type="application/json"):
    url = API + path
    data = json.dumps(body).encode() if body is not None and content_type == "application/json" else body
    headers = {}
    if data is not None:
        headers["Content-Type"] = content_type
    if token:
        headers["Authorization"] = f"Bearer {token}"
    r = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(r) as resp:
            return json.loads(resp.read() or b"{}")
    except urllib.error.HTTPError as e:
        print(f"!! {method} {path} -> {e.code}")
        print(e.read().decode()[:500])
        raise

def login(email, pw=SEED):
    r = req("POST", "/auth/login", body={"email": email, "password": pw})
    if "access" not in r:
        raise RuntimeError(r)
    return r["access"]

def upload(token, path, *, case_uid, slot, description):
    fname = os.path.basename(path)
    ctype = mimetypes.guess_type(fname)[0] or "image/png"
    p = req("POST", "/uploads/presign", token=token, body={
        "case_uid": case_uid, "filename": fname, "mime": ctype,
        "size": os.path.getsize(path), "kind": "case_file", "slot": slot,
        "description": description, "uploaded_by_name": "mark test (CB)",
    })
    put_url = p["url"] if not p["url"].startswith("/") else "http://localhost:8000" + p["url"]
    with open(path, "rb") as f:
        body = f.read()
    r = urllib.request.Request(put_url, data=body, method="PUT", headers={"Content-Type": ctype})
    with urllib.request.urlopen(r) as resp:
        assert resp.status == 200
    return req("POST", "/uploads/finish", token=token, body={
        "case_uid": case_uid, "key": p["key"], "filename": fname, "mime": ctype,
        "size": len(body), "sha256": hashlib.sha256(body).hexdigest(),
        "file_type": slot, "description": description, "uploaded_by_name": "mark test (CB)",
    })

print("=" * 70)
print("URGENT DEATH SKIP - BURIAL case with urgent_death=True")
print("=" * 70)

cb = login("cb.libreville@hec.local")
case = req("POST", "/cases", token=cb, body={
    "case_type": "BURIAL",
    "village": 1,
    "claimant_name": "mark test (deceased)",
    "claimant_phone": "+24106000000",
    "incident_at": (datetime.now(timezone.utc) - timedelta(days=1)).isoformat(),
    "priority_score": 90,
    "urgent_medical": False,
    "urgent_death": True,
})
uid = case["uid"]
print(f"[CB] created BURIAL case uid={uid} urgent_death=True")

# Upload 3 burial slots: death_certificate, claimant_id, funeral_receipt
for slot, fn in [
    ("death_certificate", "medical_report.png"),
    ("claimant_id", "claimant_id.png"),
    ("funeral_receipt", "ambulance_receipt.png"),
]:
    upload(cb, os.path.join(FIX, fn), case_uid=uid, slot=slot,
           description=f"BURIAL {slot}")
    print(f"[CB] uploaded {slot}")

# Submit + verify
req("POST", f"/cases/{uid}/submit", token=cb)
req("POST", f"/cases/{uid}/verify", token=cb)
print(f"[Verifier] verified")

# AB advance to step 3
ab = login("ab@hec.local")
req("POST", f"/cases/{uid}/advance", token=ab, body={"note": "AB ok"})
print(f"[AB] advanced to step 3")

# WCS at step 3: set amount and advance
wcs = login("wcs@hec.local")
req("POST", f"/cases/{uid}/amount", token=wcs, body={"amount_xaf": 1500000, "reason": "Full burial ceiling"})
print(f"[WCS] set amount 1,500,000 XAF")

req("POST", f"/cases/{uid}/advance", token=wcs, body={"note": "WCS review ok"})
print(f"[WCS] advanced to step 4")

# Verify the death-skip landed on APPROVED (step 6)
final_check = req("GET", f"/cases/{uid}", token=wcs)
print(f"[CHECK] status={final_check.get('status')} current_step={final_check.get('current_step')}")
assert final_check.get("status") == "APPROVED", f"Expected APPROVED after death-skip, got {final_check.get('status')}"
assert final_check.get("current_step") == 6, f"Expected step 6 after death-skip, got {final_check.get('current_step')}"
print("[OK] death-skip transitioned case to APPROVED, step 6")

# Now WCS uploads proof + Admin confirms + WCS closes
req("POST", f"/cases/{uid}/payment-proof", token=wcs, body={"notes": "MM transfer to family", "payment_method": "AIRTEL_MONEY"})
print(f"[WCS] payment proof uploaded")
adm = login("admin@hec.local")
req("POST", f"/cases/{uid}/confirm-payment", token=adm, body={"notes": "Receipt verified"})
print(f"[ADMIN] payment confirmed")
r = req("POST", f"/cases/{uid}/close", token=wcs, body={"notes": "Done"})
print(f"[WCS] closed: {r}")

# Summary
print()
print("EVENTS (chronological)")
import django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "hec_fund.settings.dev")
sys.path.insert(0, os.path.dirname(__file__))
django.setup()
from cases.models import Case, Event
from forms.models import FormAttachment
case_row = Case.objects.get(uid=uid)
for e in Event.objects.filter(case=case_row).order_by("occurred_at"):
    print(f"  {str(e.occurred_at)[:19]}  {e.event_type:30s} step {e.from_step}->{e.to_step}  by={e.actor.email}")
print(f"\nattachments: {FormAttachment.objects.filter(submission__case=case_row).count()}")
print("ALL DONE - URGENT DEATH SKIP WORKS")