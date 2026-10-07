#!/usr/bin/env python3
"""Probe telegram-webhook v17 — fresh update_id, plain 'hi'."""
import json, urllib.request, ssl, time, hashlib, base64, sys

def read_env(path=".env.hermes"):
    d = {}
    with open(path) as f:
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
ACCESS_TOKEN = env.get('SUPABASE_ACCESS_TOKEN', '')
if not SR_KEY:
    print('No SUPABASE_SERVICE_ROLE_KEY', file=sys.stderr)
    sys.exit(1)

PROJECT = 'mwzogsqkhjhxrdipqxvi'
BASE = f'https://{PROJECT}.supabase.co'
FUNC_URL = f'{BASE}/functions/v1/telegram-webhook'

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

# --- Build a signed JWT using SR_KEY as HMAC secret ---
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

# --- Probe update ---
update_id = int(now_ts * 1000) + 88888
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
print(f'JWT: {jwt[:50]}... (len={len(jwt)})')
print(f'SR_KEY: {SR_KEY[:30]}... (len={len(SR_KEY)})')

try:
    with urllib.request.urlopen(req, timeout=60, context=ctx) as resp:
        status = resp.status
        body = resp.read()
        print(f'\nHTTP {status}')
        print(f'Body ({len(body)} bytes):')
        print(body.decode(errors='replace')[:2000])
except urllib.error.HTTPError as e:
    body = e.read()
    print(f'\nHTTP Error {e.code}')
    print(f'Body ({len(body)} bytes):')
    print(body.decode(errors='replace')[:2000])
except Exception as e:
    print(f'\nERROR: {type(e).__name__}: {e}')
