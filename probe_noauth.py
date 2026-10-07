#!/usr/bin/env python3
"""Probe telegram-webhook v17 with NO auth headers (verify_jwt=false)."""
import json, urllib.request, ssl, time, sys

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
TOKEN = env.get('TELEGRAM_BOT_TOKEN', '')

PROJECT = 'mwzogsqkhjhxrdipqxvi'
BASE = f'https://{PROJECT}.supabase.co'
FUNC_URL = f'{BASE}/functions/v1/telegram-webhook'

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

update_id = int(time.time() * 1000) + 11111
text = 'hello'
update = {
    'update_id': update_id,
    'message': {
        'message_id': 1,
        'from': {'id': 12345, 'is_bot': False, 'first_name': 'Test', 'language_code': 'en'},
        'chat': {'id': 12345, 'type': 'private'},
        'date': int(time.time()),
        'text': text,
    },
}

def try_request(label, headers):
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
            text = body.decode(errors='replace')
            print(text[:2000])
            return status, text
    except urllib.error.HTTPError as e:
        body = e.read()
        print(f'HTTP Error {e.code} ({len(body)} bytes)')
        print(body.decode(errors='replace')[:1000])
        return e.code, body.decode(errors='replace')
    except Exception as e:
        print(f'ERROR: {type(e).__name__}: {e}')
        return None, str(e)

results = {}

# 1. No auth headers at all
results['no_auth'] = try_request('No auth headers', {'Content-Type': 'application/json'})

# 2. Empty apikey
results['empty_apikey'] = try_request('Empty apikey', {'apikey': '', 'Content-Type': 'application/json'})

# 3. Dummy apikey value  
results['dummy_apikey'] = try_request('Dummy apikey', {'apikey': 'test', 'Content-Type': 'application/json'})

# 4. Telegram bot token as apikey (the function reads this from env, but maybe it accepts it as auth?)
if TOKEN:
    results['bot_token_apikey'] = try_request(f'Telegram bot token as apikey', {'apikey': TOKEN, 'Content-Type': 'application/json'})

print('\n=== Summary ===')
for label, (status, _) in results.items():
    print(f'  {label}: HTTP {status}')
