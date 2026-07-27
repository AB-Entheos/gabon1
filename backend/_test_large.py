import requests
import sys

base = 'http://127.0.0.1:8000/api/v1'

r = requests.post(f'{base}/auth/login', json={'email': 'admin@hec.local', 'password': 'HEC-Dev-2026!'})
print('login:', r.status_code)
token = r.json()['access']
H = {'Authorization': f'Bearer {token}'}

# Use an existing case (case 116 was used in earlier tests)
case_uid = 'ffb5bbfa86b3468595da4e08ca7396fd'

# Test 1: 3 MB (should have worked before with 2.5MB default... barely over)
data_3mb = b'\x89PNG\r\n\x1a\n' + b'\x00' * (3 * 1024 * 1024 - 8)
print('test 1: 3 MB')
body = {'filename': 'test3.png', 'mime': 'image/png', 'size': len(data_3mb), 'case_uid': case_uid, 'file_type': 'other', 'uploaded_by_name': 'Test'}
r = requests.post(f'{base}/uploads/presign', headers=H, json=body)
print('  presign:', r.status_code)
if r.status_code == 200:
    presigned = r.json()
    r2 = requests.put(f'http://127.0.0.1:8000{presigned["url"]}', data=data_3mb)
    print('  PUT:', r2.status_code)
    if r2.status_code == 200:
        finish = {'key': presigned['key'], 'filename': 'test3.png', 'mime': 'image/png', 'size': len(data_3mb), 'sha256': r2.json()['sha256'], 'case_uid': case_uid, 'file_type': 'other', 'uploaded_by_name': 'Test'}
        r3 = requests.post(f'{base}/uploads/finish', headers=H, json=finish)
        print('  finish:', r3.status_code, r3.text[:100])

# Test 2: 10 MB
print('test 2: 10 MB')
data_10mb = b'\x89PNG\r\n\x1a\n' + b'\x00' * (10 * 1024 * 1024 - 8)
body = {'filename': 'test10.png', 'mime': 'image/png', 'size': len(data_10mb), 'case_uid': case_uid, 'file_type': 'other', 'uploaded_by_name': 'Test'}
r = requests.post(f'{base}/uploads/presign', headers=H, json=body)
print('  presign:', r.status_code)
if r.status_code == 200:
    presigned = r.json()
    r2 = requests.put(f'http://127.0.0.1:8000{presigned["url"]}', data=data_10mb)
    print('  PUT:', r2.status_code)
    if r2.status_code == 200:
        finish = {'key': presigned['key'], 'filename': 'test10.png', 'mime': 'image/png', 'size': len(data_10mb), 'sha256': r2.json()['sha256'], 'case_uid': case_uid, 'file_type': 'other', 'uploaded_by_name': 'Test'}
        r3 = requests.post(f'{base}/uploads/finish', headers=H, json=finish)
        print('  finish:', r3.status_code, r3.text[:100])

# Test 3: 25 MB (the frontend max)
print('test 3: 25 MB')
data_25mb = b'\x89PNG\r\n\x1a\n' + b'\x00' * (25 * 1024 * 1024 - 8)
body = {'filename': 'test25.png', 'mime': 'image/png', 'size': len(data_25mb), 'case_uid': case_uid, 'file_type': 'other', 'uploaded_by_name': 'Test'}
r = requests.post(f'{base}/uploads/presign', headers=H, json=body)
print('  presign:', r.status_code)
if r.status_code == 200:
    presigned = r.json()
    r2 = requests.put(f'http://127.0.0.1:8000{presigned["url"]}', data=data_25mb)
    print('  PUT:', r2.status_code)
    if r2.status_code == 200:
        finish = {'key': presigned['key'], 'filename': 'test25.png', 'mime': 'image/png', 'size': len(data_25mb), 'sha256': r2.json()['sha256'], 'case_uid': case_uid, 'file_type': 'other', 'uploaded_by_name': 'Test'}
        r3 = requests.post(f'{base}/uploads/finish', headers=H, json=finish)
        print('  finish:', r3.status_code, r3.text[:100])
