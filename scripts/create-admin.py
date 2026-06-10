import paramiko
import sys

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('160.250.131.12', username='root', password='Tkep2h0NavMPcY9v')

script = """
import urllib.request
import json
import sys

env_vars = {}
with open('/root/AI_social/.env', 'r') as f:
    for line in f:
        if '=' in line and not line.startswith('#'):
            k, v = line.strip().split('=', 1)
            env_vars[k] = v

url = env_vars['SUPABASE_URL']
service_key = env_vars['SUPABASE_SERVICE_ROLE_KEY']

headers = {
    'apikey': service_key,
    'Authorization': f'Bearer {service_key}',
    'Content-Type': 'application/json'
}

email = 'admin@doralove.io.vn'
password = 'AdminPassword123!'

user_data = {
    'email': email,
    'password': password,
    'email_confirm': True
}
req = urllib.request.Request(f'{url}/auth/v1/admin/users', data=json.dumps(user_data).encode(), headers=headers)
try:
    with urllib.request.urlopen(req) as res:
        user_resp = json.loads(res.read().decode())
        user_id = user_resp['id']
        print(f'User created with ID: {user_id}')
except urllib.error.HTTPError as e:
    resp = e.read().decode()
    if 'User already registered' in resp:
        print('User already exists, skipping creation.')
        # we'd need to fetch user_id, but for now let's just abort if exists to keep it simple
        sys.exit(1)
    else:
        print('Failed to create user:', resp)
        sys.exit(1)

profile_data = {
    'id': user_id,
    'email': email,
    'role': 'admin'
}
headers['Prefer'] = 'resolution=ignore-duplicates'
req2 = urllib.request.Request(f'{url}/rest/v1/profiles', data=json.dumps(profile_data).encode(), headers=headers)
try:
    with urllib.request.urlopen(req2) as res2:
        print('Profile created and set to admin.')
except urllib.error.HTTPError as e:
    print('Failed to create profile:', e.read().decode())
"""

stdin, stdout, stderr = ssh.exec_command("python3 -c \"{}\"".format(script.replace('"', '\\"')))
print("STDOUT:", stdout.read().decode().strip())
print("STDERR:", stderr.read().decode().strip())
ssh.close()
