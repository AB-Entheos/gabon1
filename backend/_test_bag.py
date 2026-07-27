import requests
base = 'http://localhost:8000/api/v1'
r = requests.post(f'{base}/auth/login', json={'email': 'admin@hec.local', 'password': 'HEC-Dev-2026!'})
token = r.json()['access']
H = {'Authorization': f'Bearer {token}'}
# Case 116: had bag with 3 attachments
r2 = requests.get(f'{base}/cases/ffb5bbfa86b3468595da4e08ca7396fd/submissions?include_bag=1', headers=H)
data = r2.json()
print('bag data for case 116:')
for s in data['results']:
    print('  form:', s['form'], 'attachments:', len(s['attachments']))
    for a in s['attachments']:
        print('    -', a['filename'], '(file_type=', a.get('file_type'), ')')
