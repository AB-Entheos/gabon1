"""End-to-end HTTP smoke test against the live dev server.

Drives the full lifecycle via real HTTP calls (presign+finish file uploads
included) so we exercise the same code paths the React UI hits.
"""
import json
import os
import urllib.request
import urllib.error

BASE = "http://localhost:8000/api/v1"
EMAIL = {
    "CB":  "cb.libreville@hec.local",
    "AB":  "ab@hec.local",
    "WCS": "wcs@hec.local",
    "DGFC":"dgfc@hec.local",
    "DGFAP":"dgfap@hec.local",
    "MIN": "minister@hec.local",
    "ADM": "admin@hec.local",
}
PWD = "HEC-Dev-2026!"


def http(method, path, token=None, body=None, raw=False):
    url = BASE + path
    data = None if body is None else (json.dumps(body).encode() if not isinstance(body, bytes) else body)
    headers = {"Content-Type": "application/json"} if body is not None else {}
    if token:
        headers["Authorization"] = "Bearer " + token
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        r = urllib.request.urlopen(req)
        text = r.read().decode()
        return r.status, (text if raw else (json.loads(text) if text else {}))
    except urllib.error.HTTPError as e:
        text = e.read().decode()
        return e.code, text


def login(role):
    s, body = http("POST", "/auth/login", body={"email": EMAIL[role], "password": PWD})
    assert s == 200, f"login {role}: {s} {body}"
    return body["access"]


def step(label):
    print(f"\n--- {label} ---")


def main():
    cb = login("CB")
    ab = login("AB")
    wcs = login("WCS")
    dgfc = login("DGFC")
    dgfap = login("DGFAP")
    minister = login("MIN")
    admin = login("ADM")

    step("CB: create draft")
    s, body = http("POST", "/cases", token=cb, body={
        "case_type": "MEDICAL",
        "claimant_name": "HTTP Tester",
        "claimant_phone": "+24177000999",
        "incident_at": "2026-07-24T10:00:00Z",
        "priority_score": 5,
        "urgent_medical": True,
    })
    assert s == 201, f"create: {s} {body}"
    uid = body["uid"]
    print(f"   case uid={uid}")

    step("CB: upload 3 required case files via presign/finish")
    for slot in ("medical_report", "claimant_id", "ambulance_receipt"):
        body_bytes = f"fake {slot}".encode()
        s, p = http("POST", "/uploads/presign", token=cb, body={
            "filename": f"{slot}.pdf",
            "mime": "application/pdf",
            "size": len(body_bytes),
            "case_uid": uid,
            "file_type": slot,
        })
        assert s == 200, f"presign {slot}: {s} {p}"
        # The dev PUT sink is a Django view. Bypass Vite's proxy by hitting
        # the backend directly. Vite (port 3001) sometimes strips query
        # strings on PUTs, so always go to 8000.
        put_url = p["url"]
        if put_url.startswith("/"):
            put_url = "http://127.0.0.1:8000" + put_url
        req = urllib.request.Request(put_url, data=body_bytes, method="PUT",
                                     headers={"Content-Type": "application/pdf"})
        try:
            r = urllib.request.urlopen(req)
            s = r.status
        except urllib.error.HTTPError as e:
            s = e.code
        assert s == 200, f"PUT {slot}: {s}"
        sha = __import__("hashlib").sha256(body_bytes).hexdigest()
        s, f = http("POST", "/uploads/finish", token=cb, body={
            "key": p["key"],
            "filename": f"{slot}.pdf",
            "mime": "application/pdf",
            "size": len(body_bytes),
            "sha256": sha,
            "submission_id": 0,  # synthetic
            "case_uid": uid,
            "file_type": slot,
            "description": f"e2e {slot}",
            "uploaded_by_name": "CB Tester",
        })
        assert s == 201, f"finish {slot}: {s} {f}"
        print(f"   uploaded {slot}")

    step("CB: submit")
    s, body = http("POST", f"/cases/{uid}/submit", token=cb)
    assert s == 200, f"submit: {s} {body}"
    print(f"   status={body['status']}")

    step("CB: verify")
    s, body = http("POST", f"/cases/{uid}/verify", token=cb)
    assert s == 200, f"verify: {s} {body}"
    assert body["current_step"] == 2, body
    print(f"   status={body['status']} step={body['current_step']}")

    step("AB: advance")
    s, body = http("POST", f"/cases/{uid}/advance", token=ab)
    assert s == 200, f"advance_ab: {s} {body}"
    assert body["current_step"] == 3, body
    print(f"   status={body['status']} step={body['current_step']}")

    step("WCS: accelerated benefit (urgent)")
    s, body = http("POST", f"/cases/{uid}/accelerated-benefit", token=wcs)
    assert s == 200, f"accelerated: {s} {body}"
    print(f"   accelerated benefit: {body.get('accelerated_benefit_amount_xaf')} XAF")

    step("WCS: advance")
    s, body = http("POST", f"/cases/{uid}/advance", token=wcs)
    assert s == 200, f"advance_wcs: {s} {body}"
    assert body["current_step"] == 4, body

    step("DGFC: advance")
    s, body = http("POST", f"/cases/{uid}/advance", token=dgfc)
    assert s == 200, f"advance_dgfc: {s} {body}"
    assert body["current_step"] == 5, body

    step("DGFAP: set amount + advance")
    s, body = http("POST", f"/cases/{uid}/amount", token=dgfap, body={
        "amount_xaf": 1500000, "reason": "E2E test"
    })
    assert s == 200, f"amount: {s} {body}"
    s, body = http("POST", f"/cases/{uid}/advance", token=dgfap)
    assert s == 200, f"advance_dgfap: {s} {body}"
    assert body["current_step"] == 6, body

    step("Minister: final approve")
    s, body = http("POST", f"/cases/{uid}/advance", token=minister)
    assert s == 200, f"approve_minister: {s} {body}"
    assert body["status"] == "APPROVED", body

    step("Admin: close")
    s, body = http("POST", f"/cases/{uid}/close", token=admin)
    assert s == 200, f"close: {s} {body}"
    assert body["status"] == "CLOSED", body

    print(f"\n*** HTTP E2E PASS — case {uid} is CLOSED ***")


if __name__ == "__main__":
    main()