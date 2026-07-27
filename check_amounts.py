import json
d = json.load(open('case.json'))
for e in d.get('events', []):
    print(f'  {e["event_type"]}: amount_xaf={e.get("amount_xaf")}')