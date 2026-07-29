"""Comprehensive API endpoint test."""
import urllib.request, urllib.error, json, sys

API = "http://localhost:8000/api/v1"
SEED = "HEC-Dev-2026!"

def req(method, path, token=None, body=None):
    url = API + path
    data = json.dumps(body).encode() if body else None
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    r = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(r) as resp:
            raw = resp.read()
            try:
                return resp.status, json.loads(raw) if raw else {}
            except (json.JSONDecodeError, ValueError):
                return resp.status, {"_raw": raw.decode("utf-8", errors="replace")[:200]}
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, json.loads(raw) if raw else {}
        except (json.JSONDecodeError, ValueError):
            return e.code, {"_raw": raw.decode("utf-8", errors="replace")[:200]}

results = []

def check(label, passed, detail=""):
    status = "PASS" if passed else "FAIL"
    results.append((label, passed))
    suffix = f" -- {detail}" if detail else ""
    print(f"  [{status}] {label}{suffix}")

# 1. Health check
print("\n=== 1. Health Check ===")
code, r = req("GET", "/health")
check("GET /health", code == 200, f"code={code}")

# 2. Login all users
print("\n=== 2. Authentication ===")
users = [
    ("cb.libreville@hec.local", "CB"),
    ("ab@hec.local", "AB"),
    ("wcs@hec.local", "WCS"),
    ("dgfc@hec.local", "DGFC"),
    ("dgfap@hec.local", "DGFAP"),
    ("minister@hec.local", "MINISTER"),
    ("admin@hec.local", "ADMIN"),
    ("superadmin@hec.local", "SUPER_ADMIN"),
]
tokens = {}
for email, role in users:
    code, r = req("POST", "/auth/login", body={"email": email, "password": SEED})
    ok = code == 200 and "access" in r
    if ok:
        tokens[email] = r["access"]
    check(f"Login {role} ({email})", ok, f"code={code}")

# 3. Login with wrong password
code, r = req("POST", "/auth/login", body={"email": "cb.libreville@hec.local", "password": "wrong"})
check("Reject wrong password", code == 401, f"code={code}")

# 4. User profiles
print("\n=== 3. User Profiles ===")
cb_token = tokens.get("cb.libreville@hec.local")
admin_token = tokens.get("admin@hec.local")
sa_token = tokens.get("superadmin@hec.local")

if cb_token:
    code, r = req("GET", "/users/me", cb_token)
    check("GET /users/me (CB)", code == 200 and r.get("role") == "CB", f"role={r.get('role')}")

if sa_token:
    code, r = req("GET", "/users/me", sa_token)
    check("GET /users/me (SUPER_ADMIN)", code == 200 and r.get("role") == "SUPER_ADMIN")

# 5. User management (superadmin)
print("\n=== 4. User Management (SUPER_ADMIN) ===")
if sa_token:
    code, r = req("GET", "/users", sa_token)
    check("GET /users (list)", code == 200, f"count={r.get('count', '?')}")

    # Non-superadmin should be rejected
    if cb_token:
        code, r = req("GET", "/users", cb_token)
        check("Reject non-SA user list", code in (403, 401), f"code={code}")

# 6. Case CRUD
print("\n=== 5. Case CRUD ===")
case_uid = None
if cb_token:
    # Create draft
    code, r = req("POST", "/cases", cb_token, body={
        "case_type": "MEDICAL",
        "claimant_name": "E2E Test Claimant",
        "claimant_phone": "+24106999999",
        "incident_at": "2026-07-28T10:00:00Z",
    })
    created = code in (200, 201)
    if created:
        case_uid = r["uid"]
    check("Create case (CB)", created, f"code={code} uid={case_uid}")

    # Non-CB cannot create
    if admin_token:
        code, r = req("POST", "/cases", admin_token, body={
            "case_type": "MEDICAL",
            "claimant_name": "Should Fail",
            "incident_at": "2026-07-28T10:00:00Z",
        })
        check("Reject non-CB create", code in (403, 401), f"code={code}")

    # List cases
    code, r = req("GET", "/cases", cb_token)
    check("List cases (CB)", code == 200, f"count={r.get('count', '?')}")

    if admin_token:
        code, r = req("GET", "/cases", admin_token)
        check("List cases (Admin)", code == 200, f"count={r.get('count', '?')}")

# 7. Case state machine
print("\n=== 6. Case State Machine ===")
if case_uid and cb_token:
    # Get detail
    code, r = req("GET", f"/cases/{case_uid}", cb_token)
    check("GET case detail", code == 200, f"status={r.get('status')} step={r.get('current_step')}")

    # Submit
    code, r = req("POST", f"/cases/{case_uid}/submit", cb_token)
    check("Submit case (CB)", code in (200, 201), f"code={code}")

    # Verify
    code, r = req("POST", f"/cases/{case_uid}/verify", cb_token)
    check("Verify case (CB)", code in (200, 201), f"code={code}")

    # Check status
    code, r = req("GET", f"/cases/{case_uid}", cb_token)
    check("Case at approval step 2", r.get("current_step") == 2, f"step={r.get('current_step')}")

    # AB advance (without required files - should fail)
    ab_token = tokens.get("ab@hec.local")
    if ab_token:
        code, r = req("POST", f"/cases/{case_uid}/advance", ab_token, {"note": "test"})
        check("AB advance without files", code >= 400, f"code={code}")

# 8. Upload flow
print("\n=== 7. File Upload Flow ===")
if case_uid and cb_token:
    code, r = req("POST", "/uploads/presign", cb_token, body={
        "case_uid": case_uid,
        "filename": "medical_report.png",
        "mime": "image/png",
        "size": 1024,
        "kind": "case_file",
        "slot": "medical_report",
        "description": "Medical report",
        "uploaded_by_name": "CB Test",
    })
    presigned = code == 200 and "url" in r
    check("Presign upload URL", presigned, f"code={code}")

# 9. Forms
print("\n=== 8. Forms ===")
if cb_token:
    code, r = req("GET", "/forms", cb_token)
    check("List published forms", code == 200, f"code={code} count={r.get('count', '?')}")

    if admin_token:
        code, r = req("POST", "/admin/forms", admin_token, body={
            "slug": "test-form-e2e",
            "version": 1,
            "title": "Test Form",
            "schema": {"fields": [{"name": "q1", "type": "text", "label": "Question 1"}]},
            "role_scope": "CB",
            "status": "PUBLISHED",
        })
        check("Publish form (Admin)", code in (200, 201), f"code={code}")

# 10. Audit
print("\n=== 9. Audit Log ===")
if admin_token:
    code, r = req("GET", "/audit", admin_token)
    check("GET /audit (Admin)", code == 200, f"code={code} count={r.get('count', '?')}")

    if cb_token:
        code, r = req("GET", "/audit", cb_token)
        check("Reject non-admin audit", code in (403, 401), f"code={code}")

# 11. Reports
print("\n=== 10. Reports ===")
if admin_token:
    code, r = req("GET", "/reports/summary", admin_token)
    check("GET /reports/summary", code == 200, f"code={code}")

    code, r = req("GET", "/reports/quarterly?year=2026&q=3", admin_token)
    check("GET /reports/quarterly", code == 200, f"code={code}")

    code, r = req("GET", "/reports/annual?year=2026", admin_token)
    check("GET /reports/annual", code == 200, f"code={code}")

# 12. Case stages
print("\n=== 11. Dashboard Stages ===")
if cb_token:
    code, r = req("GET", "/cases-stages", cb_token)
    check("GET /cases-stages", code == 200, f"code={code}")

# 13. 2FA
print("\n=== 12. 2FA Enrollment ===")
if cb_token:
    code, r = req("POST", "/auth/2fa/enroll", cb_token)
    check("2FA enroll", code == 200 and "secret" in r, f"code={code}")

# 14. Password management
print("\n=== 13. Password Management ===")
if cb_token:
    code, r = req("POST", "/auth/force-change-password", cb_token, body={
        "new_password": "TempPass123!"
    })
    check("Force change password", code in (200, 201, 204), f"code={code}")
    # Change it back
    code, r = req("POST", "/auth/force-change-password", cb_token, body={
        "new_password": SEED
    })
    check("Change password back", code in (200, 201, 204), f"code={code}")

# 15. Payment endpoints
print("\n=== 14. Payment Endpoints ===")
if admin_token:
    code, r = req("POST", "/payments/export", admin_token, body={"format": "csv"})
    check("POST /payments/export", code in (200, 201, 204, 400), f"code={code}")

# 16. Comments
print("\n=== 15. Case Comments ===")
if case_uid and cb_token:
    code, r = req("POST", f"/cases/{case_uid}/comment", cb_token, body={
        "text": "Test comment from E2E"
    })
    check("Post comment", code in (200, 201), f"code={code}")

# 17. Case stages
print("\n=== 16. Stage Dashboard ===")
if cb_token:
    code, r = req("GET", "/cases-stages", cb_token)
    check("GET /cases-stages", code == 200, f"code={code}")

# Summary
print("\n" + "=" * 70)
passed = sum(1 for _, p in results if p)
failed = sum(1 for _, p in results if not p)
print(f"RESULTS: {passed} passed, {failed} failed, {len(results)} total")
print("=" * 70)

if failed:
    print("\nFailed tests:")
    for label, p in results:
        if not p:
            print(f"  - {label}")
