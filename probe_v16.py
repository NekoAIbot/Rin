#!/usr/bin/env python3
"""Signed probe of telegram-webhook v16 — fresh update_id, plain 'hi'."""
import urllib.request, json, ssl, time, hashlib, base64, sys

def read_env():
    d = {}
    with open('.env.hermes') as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            if '=' in line:
                k, v = line.split('=', 1)
                d[k.strip()] = v.strip().strip('"').strip("'")
    return d

env = read_env()
SR_KEY = env.get('SUPABASE_SERVICE_ROLE_KEY', '')
TOKEN = env.get('TELEGRAM_BOT_TOKEN', '')
if not SR_KEY:
    print('No SUPABASE_SERVICE_ROLE_KEY in .env.hermes', file=sys.stderr); sys.exit(1)
if not TOKEN:
    print('No TELEGRAM_BOT_TOKEN in .env.hermes', file=sys.stderr); sys.exit(1)

PROJECT = 'mwzogsqkhjhxrdipqxvi'
BASE = f'https://{PROJECT}.supabase.co'
FUNC_URL = f'{BASE}/functions/v1/telegram-webhook'

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

# --- Build a signed JWT (anon role) ---
now_ts = int(time.time())
payload = {
    'role': 'anon',
    'exp': now_ts + 300,
    'prn': f'postgrest-{PROJECT}/telegram-webhook',
}
payload_b64 = base64.urlsafe_b64encode(json.dumps(payload).encode()).decode().rstrip('=')
header_b64 = base64.urlsafe_b64encode(json.dumps({'alg': 'HS256', 'typ': 'JWT'}).encode()).decode().rstrip('=')
sig_input = f'{header_b64}.{payload_b64}'
sig = base64.urlsafe_b64encode(
    hashlib.sha256((sig_input + SR_KEY).encode()).digest()
).decode().rstrip('=')
jwt = f'{header_b64}.{payload_b64}.{sig}'

# --- Build the probe update ---
update_id = int(now_ts * 1000) + 77777
text = 'hi'
update = {
    'update_id': update_id,
    'message': {
        'message_id': 1,
        'from': {'id': 12345, 'is_bot': False, 'first_name': 'Probe', 'language_code': 'en'},
        'chat': {'id': 12345, 'type': 'private'},
        'date': now_ts,
        'text': text,
    },
}

req = urllib.request.Request(
    FUNC_URL,
    data=json.dumps(update).encode(),
    headers={
        'Authorization': f'Bearer {jwt}',
        'Content-Type': 'application/json',
        'User-Agent': 'rin-probe/1.0',
    },
    method='POST',
)

print(f'PROBE: update_id={update_id}, text={text}')
print(f'Function: {FUNC_URL}')
try:
    with urllib.request.urlopen(req, timeout=60, context=ctx) as resp:
        status = resp.status
        body = resp.read()
        print(f'HTTP {status}')
        print(f'Headers: {dict(resp.headers)}')
        print(f'Body ({len(body)} bytes):')
        print(body.decode(errors='replace')[:2000])
except urllib.error.HTTPError as e:
    body = e.read()
    print(f'HTTP Error {e.code}')
    print(f'Body ({len(body)} bytes):')
    print(body.decode(errors='replace')[:2000])
except Exception as e:
    print(f'ERROR: {type(e).__name__}: {e}')
