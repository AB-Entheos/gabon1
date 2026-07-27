import json
d = json.load(open('case.json'))
for e in d.get('events', []):
    if e['event_type'] in ('AMOUNT_PROPOSED', 'AMOUNT_AUTHORIZED'):
        print(f'  {e["event_type"]}: amount_xaf={e.get("amount_xaf")}')