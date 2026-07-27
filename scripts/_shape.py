import json, urllib.request
r = urllib.request.urlopen(urllib.request.Request("http://127.0.0.1:8000/api/v1/auth/login",
    data=json.dumps({"email": "admin@hec.local", "password": "HEC-Dev-2026!"}).encode(),
    headers={"Content-Type": "application/json"}, method="POST"))
token = json.loads(r.read())["access"]

r = urllib.request.urlopen(urllib.request.Request("http://127.0.0.1:8000/api/v1/cases",
    headers={"Authorization": f"Bearer {token}"}))
data = json.loads(r.read())
print(f"type: {type(data).__name__}")
print(f"keys: {sorted(data.keys()) if isinstance(data, dict) else 'N/A (array)'}")
print(f"count: {data.get('count') if isinstance(data, dict) else 'N/A'}")
print(f"results count: {len(data.get('results', [])) if isinstance(data, dict) else 'N/A'}")
print(f"first item keys: {sorted(data['results'][0].keys()) if isinstance(data, dict) and data.get('results') else 'N/A'}")
