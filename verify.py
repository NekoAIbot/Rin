#!/usr/bin/env python3
import json, urllib.request, urllib.error, hashlib, base64, time

with open(".env.hermes") as f:
    creds = {}
    for line in f:
        line = line.strip()
        if "=" in line:
            k, v = line.split("=", 1)
            creds[k] = v

BOT_TOKEN = creds["TELEGRAM_BOT_TOKEN"]
SR_KEY = creds["SUPABASE_SERVICE_ROLE_KEY"]
PROJECT_REF = "mwzogsqkhjhxrdipqxvi"
SUPABASE_URL = f"https://{PROJECT_REF}.supabase.co"
WEBHOOK_URL = f"{SUPABASE_URL}/functions/v1/telegram-webhook"

digest = hashlib.sha256(f"rin-telegram:{BOT_TOKEN}".encode()).digest()
WEBHOOK_SECRET = base64.b64encode(digest).decode().translate(str.maketrans('+/', '-_')).rstrip('=')
print(f"[info] Webhook secret derived (len={len(WEBHOOK_SECRET)})")

AUTH = {"apikey": SR_KEY, "Authorization": f"Bearer {SR_KEY}", "Content-Type": "application/json"}

def post(path, body, extra=None):
    h = dict(AUTH)
    if extra: h.update(extra)
    req = urllib.request.Request(f"{SUPABASE_URL}{path}", data=json.dumps(body).encode(), headers=h, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return r.status, json.loads(r.read())
    except urllib.error.URLError as e:
        return -1, {"_urlerror": str(e.reason)}
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, {"_raw": raw.decode(errors="replace")}
    except Exception as e:
        return -1, {"_error": str(e)}

def get(path):
    req = urllib.request.Request(f"{SUPABASE_URL}{path}", headers=AUTH)
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.status, json.loads(r.read())
    except urllib.error.URLError as e:
        return -1, {"_urlerror": str(e.reason)}
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, {"_raw": raw.decode(errors="replace")}
    except Exception as e:
        return -1, {"_error": str(e)}

# --- STEP 1: signed probe ---
print("\n=== STEP 1: signed probe (text='hi') ===")
PROBE_UPDATE_ID = 777777790
PROBE_CHAT_ID = 777777790
payload = {
    "update_id": PROBE_UPDATE_ID,
    "message": {
        "message_id": 1,
        "from": {"id": PROBE_CHAT_ID, "is_bot": False, "first_name": "ProbeUser", "language_code": "en"},
        "chat": {"id": PROBE_CHAT_ID, "first_name": "ProbeUser", "type": "private"},
        "date": int(time.time()),
        "text": "hi",
    },
}
status, body = post("/functions/v1/telegram-webhook", payload, {"X-Telegram-Bot-Api-Secret-Token": WEBHOOK_SECRET})
print(f"HTTP Status: {status}")
print(f"Response: {json.dumps(body)[:400]}")

# --- STEP 2: error_log (last 5) ---
print("\n=== STEP 2: error_log (last 5) ===")
status, rows = get(f"/rest/v1/error_log?select=id,function_name,error_message,created_at&order=created_at.desc&limit=5")
if isinstance(rows, list):
    print(f"entries: {len(rows)}")
    for r in rows:
        print(f"  [{r.get('created_at')}] {r.get('function_name')}: {r.get('error_message','')[:200]}")
else:
    print(f"Unexpected: {rows}")

# --- STEP 3: messages (last 5) ---
print("\n=== STEP 3: messages (last 5) ===")
status, rows = get(f"/rest/v1/messages?select=id,user_id,role,content,created_at&order=created_at.desc&limit=5")
if isinstance(rows, list):
    print(f"messages: {len(rows)}")
    for r in rows:
        print(f"  [{r.get('created_at')}] user={r.get('user_id')} role={r.get('role')}: {r.get('content','')[:300]}")
else:
    print(f"Unexpected: {rows}")

print("\n=== DONE ===")
