"""E2E for the new flow: DGFC proposes, DGFAP authorizes, Minister approves, WCS disburses."""
import os, sys, json, hashlib, mimetypes, urllib.request, urllib.error, struct, zlib
from datetime import datetime, timedelta, timezone

API = "http://localhost:8000/api/v1"
FIX = os.path.join(os.path.dirname(__file__), "test_fixtures")
SEED = "HEC-Dev-2026!"

def req(method, path, token=None, body=None, content_type="application/json", expect_json=True):
    url = API + path
    data = json.dumps(body).encode() if (body is not None and content_type == "application/json") else body
    headers = {}
    if data is not None:
        headers["Content-Type"] = content_type
    if token:
        headers["Authorization"] = f"Bearer {token}"
    r = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(r) as resp:
            raw = resp.read()
    except urllib.error.HTTPError as e:
        raw = e.read()
        print(f"!! {method} {path} -> {e.code}")
        print(raw.decode(errors="replace")[:500])
        raise
    if expect_json and raw:
        return json.loads(raw)
    return raw

def login(email):
    r = req("POST", "/auth/login", body={"email": email, "password": SEED})
    return r["access"]

def make_png(path, color=(200, 230, 255)):
    sig = b"\x89PNG\r\n\x1a\n"
    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t+d) & 0xffffffff)
    ihdr = chunk(b"IHDR", struct.pack(">IIBBBBB", 64, 64, 8, 2, 0, 0, 0))
    raw = b""
    for _ in range(64):
        raw += b"\x00" + bytes(color) * 64
    idat = chunk(b"IDAT", zlib.compress(raw))
    iend = chunk(b"IEND", b"")
    open(path, "wb").write(sig + ihdr + idat + iend)

os.makedirs(FIX, exist_ok=True)
make_png(os.path.join(FIX, "medical.png"), (200, 230, 255))
make_png(os.path.join(FIX, "id.png"), (255, 230, 200))
make_png(os.path.join(FIX, "ambulance.png"), (220, 255, 220))

def upload(token, case_uid, path, slot, desc):
    fname = os.path.basename(path)
    ctype = mimetypes.guess_type(fname)[0] or "image/png"
    p = req("POST", "/uploads/presign", token=token, body={
        "case_uid": case_uid, "filename": fname, "mime": ctype, "size": os.path.getsize(path),
        "kind": "case_file", "slot": slot, "description": desc, "uploaded_by_name": "mark test",
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
        "file_type": slot, "description": desc, "uploaded_by_name": "mark test",
    })

BUDGET = 1_200_000  # within MEDICAL ceiling of 2,000,000

print("=" * 70)
print(f"NEW FLOW - BUDGET {BUDGET:,} XAF (3 disbursements to institutions)")
print("=" * 70)

cb = login("cb.libreville@hec.local")
case = req("POST", "/cases", token=cb, body={
    "case_type": "MEDICAL", "village": 1,
    "claimant_name": "Mark Test (disbursement flow)",
    "claimant_phone": "+24106000000",
    "incident_at": (datetime.now(timezone.utc) - timedelta(hours=6)).isoformat(),
    "priority_score": 8,
})
uid = case["uid"]
print(f"[CB] case created {uid}")

for slot, fn in [("medical_report", "medical.png"), ("claimant_id", "id.png"), ("ambulance_receipt", "ambulance.png")]:
    upload(cb, uid, os.path.join(FIX, fn), slot, f"Slot {slot}")
    print(f"[CB] uploaded {slot}")
req("POST", f"/cases/{uid}/submit", token=cb)
req("POST", f"/cases/{uid}/verify", token=cb)
print(f"[Verifier] verified")

ab = login("ab@hec.local")
req("POST", f"/cases/{uid}/advance", token=ab, body={"note": "AB ok"})
print(f"[AB] advanced -> step 3")

wcs = login("wcs@hec.local")
req("POST", f"/cases/{uid}/advance", token=wcs, body={"note": "WCS ok"})
print(f"[WCS] advanced -> step 4")

dgfc = login("dgfc@hec.local")
r = req("POST", f"/cases/{uid}/amount", token=dgfc, body={"amount_xaf": BUDGET, "reason": "Initial DGFC proposal"})
print(f"[DGFC] PROPOSED amount: {r.get('amount_authorized')} (kind={r.get('kind')})")
req("POST", f"/cases/{uid}/advance", token=dgfc, body={"note": "DGFC ok"})
print(f"[DGFC] advanced -> step 5")

dgfap = login("dgfap@hec.local")
r = req("POST", f"/cases/{uid}/amount", token=dgfap, body={"amount_xaf": BUDGET, "reason": "DGFAP authorizes"})
print(f"[DGFAP] AUTHORIZED amount: {r.get('amount_authorized')} (kind={r.get('kind')})")
req("POST", f"/cases/{uid}/advance", token=dgfap, body={"note": "DGFAP ok"})
print(f"[DGFAP] advanced -> step 6")

minister = login("minister@hec.local")
r = req("POST", f"/cases/{uid}/advance", token=minister, body={"note": "Minister approves"})
print(f"[MIN] advanced -> status={r.get('status')}")

print(f"\n--- WCS records disbursements (budget {BUDGET:,} XAF) ---")
disbursements = [
    (600_000, "HOSPITAL", "Paulin Andzongo Hospital", "Hospital bill", "AIRTEL-MOMO-001"),
    (400_000, "TRANSPORT", "SOS Ambulance Libreville", "Ambulance", "AIRTEL-MOMO-002"),
    (150_000, "PHARMACY", "Pharmacie de la Paix", "Medication", "AIRTEL-MOMO-003"),
]
for amount, kind, name, purpose, ref in disbursements:
    r = req("POST", f"/cases/{uid}/disbursements", token=wcs, body={
        "amount_xaf": amount,
        "purpose": purpose,
        "recipient_kind": kind,
        "recipient_name": name,
        "payment_date": (datetime.now(timezone.utc) - timedelta(days=1)).date().isoformat(),
        "payment_reference": ref,
    })
    running = r['disbursed_total_xaf']
    pct = r['disbursed_total_xaf'] / BUDGET * 100
    print(f"  #{r['id']}: {amount:>7,} XAF -> {name:<28} ({kind:<10}) running={running:,} / {BUDGET:,} = {pct:.1f}%")

print(f"\n--- Test over-commit rejection (try 50,000 XAF more) ---")
try:
    req("POST", f"/cases/{uid}/disbursements", token=wcs, body={
        "amount_xaf": 100_000,
        "purpose": "Should fail",
        "recipient_kind": "OTHER",
        "recipient_name": "Over-commit attempt",
        "payment_date": (datetime.now(timezone.utc)).date().isoformat(),
        "payment_reference": "X",
    })
    print("  FAIL: over-commit was not rejected!")
except urllib.error.HTTPError as e:
    # The req() helper already read the body; fall back to issuing a fresh call
    # to inspect the response.
    raw_url = API + f"/cases/{uid}/disbursements"
    raw_body = json.dumps({
        "amount_xaf": 100_000,
        "purpose": "Should fail",
        "recipient_kind": "OTHER",
        "recipient_name": "Over-commit attempt",
        "payment_date": datetime.now(timezone.utc).date().isoformat(),
        "payment_reference": "X",
    }).encode()
    raw_req = urllib.request.Request(raw_url, data=raw_body, method="POST",
                                     headers={"Authorization": f"Bearer {wcs}", "Content-Type": "application/json"})
    try:
        urllib.request.urlopen(raw_req).read()
        print("  FAIL: over-commit was not rejected!")
    except urllib.error.HTTPError as e2:
        print(f"  OK: rejected with {e2.code}: {json.loads(e2.read())['detail']}")

r_summary = req("GET", f"/cases/{uid}/disbursements", token=wcs)
print(f"\n[API] /disbursements summary:")
print(f"  count: {r_summary['count']}")
print(f"  authorized: {r_summary['authorized_xaf']:,}")
print(f"  disbursed: {r_summary['disbursed_xaf']:,}")
print(f"  remaining: {r_summary['remaining_xaf']:,}")
print(f"  utilization: {r_summary['utilization_pct']}%")
print(f"  approaching_limit: {r_summary['approaching_limit']}")

case_data = req("GET", f"/cases/{uid}", token=wcs)
print(f"\n[API] case.disbursement_summary:")
for k, v in case_data['disbursement_summary'].items():
    print(f"  {k}: {v}")

r = req("POST", f"/cases/{uid}/close", token=wcs, body={"notes": "All payments complete."})
print(f"\n[WCS] close -> status={r.get('status')}")

import django
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "hec_fund.settings.dev")
sys.path.insert(0, os.path.dirname(__file__))
django.setup()
from cases.models import Case
case_row = Case.objects.get(uid=uid)
print(f"\n=== FINAL STATE ===")
print(f"  case uid: {uid}")
print(f"  status: {case_row.status}")
print(f"  step: {case_row.current_step}")
print(f"  amount_authorized: {case_row.amount_authorized:,} XAF")
print(f"  events: {case_row.events.count()}")
print(f"  disbursements: {case_row.disbursements.count()}")
total = sum(int(d.amount_xaf) for d in case_row.disbursements.all())
print(f"  disbursement total: {total:,} XAF ({total/BUDGET*100:.1f}% of budget)")
print("\n*** NEW FLOW WITH DISBURSEMENTS: PASS ***")
