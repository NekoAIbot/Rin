#!/usr/bin/env python3
"""Probe telegram-webhook v17 — fresh update_id, plain 'hi', signed URL."""
import json, hashlib, base64, urllib.request, ssl, time, sys

SR_KEY = open('.env.hermes').read().split('SUPABASE_SERVICE_ROLE_KEY=')[1].split('\n')[0]
TOKEN = open('.env.hermes').read().split('TELEGRAM_BOT_TOKEN=')[1].split('\n')[0]
PROJECT = 'mwzogsqkhjhxrdipqxvi'
BASE = f'https://{PROJECT}.supabase.co'

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

# Sign the URL with the Service Role Key (the JWT secret)
now = int(time.time())
payload = json.dumps({
    "role": "anon",
    "exp": now + 300,
    "prn": f"postgrest-{PROJECT}/telegram-webhook",
}).encode()
payload_b64 = base64.urlsafe_b64encode(payload).decode().rstrip("=")
header = json.dumps({"alg": "HS256", "typ": "JWT"}).encode()
header_b64 = base64.urlsafe_b64encode(header).decode().rstrip("=")
sig = base64.urlsafe_b64encode(
    hashlib.sha256((header_b64 + "." + payload_b64 + SR_KEY).encode()).digest()
).decode().rstrip("=")
jwt = f"{header_b64}.{payload_b64}.{sig}"

# Fresh update
update_id = int(now * 1000) + 99999
update = {
    "update_id": update_id,
    "message": {
        "message_id": 1,
        "from": {"id": 12345, "first_name": "Probe", "is_bot": False, "language_code": "en"},
        "chat": {"id": 12345, "type": "private"},
        "date": now,
        "text": "hi",
    },
}

url = f"{BASE}/functions/v1/telegram-webhook"
req = urllib.request.Request(
    url,
    data=json.dumps(update).encode(),
    headers={
        "Authorization": f"Bearer {jwt}",
        "Content-Type": "application/json",
        "User-Agent": "rin-probe/1.0",
    },
    method="POST",
)

print(f"PROBE: update_id={update_id}, text=hi")
print(f"JWT: {jwt[:50]}... (len={len(jwt)})")
print(f"SR_KEY: {SR_KEY[:30]}... (len={len(SR_KEY)})")

try:
    with urllib.request.urlopen(req, timeout=60, context=ctx) as resp:
        status = resp.status
        body = resp.read()
        print(f"\nHTTP {status}")
        print(f"Body ({len(body)} bytes): {body.decode(errors='replace')[:2000]}")
except urllib.error.HTTPError as e:
    body = e.read()
    print(f"\nHTTP Error {e.code} ({len(body)} bytes)")
    print(f"Body: {body.decode(errors='replace')[:2000]}")
except Exception as e:
    print(f"ERROR: {type(e).__name__}: {e}")
