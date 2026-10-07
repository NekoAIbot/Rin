#!/usr/bin/env python3
"""Probe telegram-webhook v16 with multiple auth approaches."""
import urllib.request, json, ssl, sys, time

def read_env(path=".env.hermes"):
    d = {}
    try:
        with open(path) as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith('#'):
                    continue
                if '=' in line:
                    k, v = line.split('=', 1)
                    d[k.strip()] = v.strip().strip('"').strip("'")
    except FileNotFoundError:
        pass
    return d

env = read_env()
SR_KEY = env.get('SUPABASE_SERVICE_ROLE_KEY', '')
PUB_KEY = env.get('VITE_SUPABASE_PUBLISHABLE_KEY', '')
ACCESS_TOKEN = env.get('SUPABASE_ACCESS_TOKEN', '')
TOKEN = env.get('TELEGRAM_BOT_TOKEN', '')
if not PUB_KEY:
    print('No publishable key — checking alternative env names...')
    for alt in ['VITE_SUPABASE_ANON_KEY', 'ANON_KEY', 'SUPABASE_ANON_KEY']:
        if alt in env:
            PUB_KEY = env[alt]
            break

PROJECT = 'mwzogsqkhjhxrdipqxvi'
BASE = f'https://{PROJECT}.supabase.co'
FUNC_URL = f'{BASE}/functions/v1/telegram-webhook'

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

update_id = int(time.time() * 1000) + 88888
text = 'hi'
update = {
    'update_id': update_id,
    'message': {
        'message_id': 1,
        'from': {'id': 12345, 'is_bot': False, 'first_name': 'Probe', 'language_code': 'en'},
        'chat': {'id': 12345, 'type': 'private'},
        'date': int(time.time()),
        'text': text,
    },
}

def try_probe(label, headers):
    print(f'\n=== {label} ===')
    req = urllib.request.Request(
        FUNC_URL,
        data=json.dumps(update).encode(),
        headers=headers,
        method='POST',
    )
    try:
        with urllib.request.urlopen(req, timeout=30, context=ctx) as resp:
            status = resp.status
            body = resp.read()
            print(f'HTTP {status} ({len(body)} bytes)')
            print(body.decode(errors='replace')[:2000])
            return status, body
    except urllib.error.HTTPError as e:
        body = e.read()
        print(f'HTTP Error {e.code} ({len(body)} bytes)')
        print(body.decode(errors='replace')[:1000])
        return e.code, body
    except Exception as e:
        print(f'ERROR: {type(e).__name__}: {e}')
        return None, str(e).encode()

results = {}

# Approach 1: publishable key as apikey
if PUB_KEY:
    results['pubkey_apikey'] = try_probe(
        f'Publishable key as apikey (len={len(PUB_KEY)})',
        {'apikey': PUB_KEY, 'Content-Type': 'application/json'}
    )

# Approach 2: service role key as apikey
if SR_KEY:
    results['sr_apikey'] = try_probe(
        f'Service role key as apikey (len={len(SR_KEY)})',
        {'apikey': SR_KEY, 'Content-Type': 'application/json'}
    )

# Approach 3: access token as Bearer
if ACCESS_TOKEN:
    results['access_bearer'] = try_probe(
        f'Access token as Bearer (len={len(ACCESS_TOKEN)})',
        {'Authorization': f'Bearer {ACCESS_TOKEN}', 'Content-Type': 'application/json'}
    )

print('\n=== Summary ===')
for label, (status, _) in results.items():
    print(f'  {label}: HTTP {status}')
