#!/usr/bin/env python3
"""Read current deployed secrets via Management API. Report names + updated_at only."""
import json, urllib.request, sys, os

def read_token():
    with open(".env.hermes") as f:
        for line in f:
            line = line.strip()
            if line.startswith("SUPABASE_ACCESS_TOKEN="):
                return line.split("=", 1)[1]
    raise SystemExit("No SUPABASE_ACCESS_TOKEN in .env.hermes")

TOKEN = read_token()
PROJECT = "mwzogsqkhjhxrdipqxvi"
URL = f"https://api.supabase.com/v1/projects/{PROJECT}/secrets"

req = urllib.request.Request(URL, headers={
    "Authorization": f"Bearer {TOKEN}",
    "Content-Type": "application/json",
})
try:
    with urllib.request.urlopen(req, timeout=15) as r:
        data = json.loads(r.read())
    secrets = data if isinstance(data, list) else data.get("secrets", data if isinstance(data, dict) else [])
    print(f"Total secrets: {len(secrets) if isinstance(secrets, list) else 'nested'}")
    if isinstance(secrets, list):
        for s in secrets:
            name = s.get("name", "?") if isinstance(s, dict) else str(s)
            updated = s.get("updated_at", "?") if isinstance(s, dict) else "?"
            print(f"  {name:30s} updated_at={updated}")
    elif isinstance(secrets, dict):
        for name, info in secrets.items():
            if isinstance(info, dict):
                print(f"  {name:30s} updated_at={info.get('updated_at', '?')}")
            else:
                print(f"  {name:30s} -> {type(info).__name__}")
    else:
        print(f"Unexpected format: {json.dumps(secrets, indent=2)[:1000]}")
except urllib.error.HTTPError as e:
    body = e.read().decode()
    print(f"HTTP {e.code}: {body[:500]}")
except Exception as e:
    print(f"ERROR: {type(e).__name__}: {e}")
