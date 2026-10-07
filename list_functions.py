#!/usr/bin/env python3
"""Read SUPABASE_ACCESS_TOKEN from .env.hermes, list functions, report."""
import json, urllib.request, sys

with open(".env.hermes") as f:
    for line in f:
        line = line.strip()
        if line.startswith("SUPABASE_ACCESS_TOKEN="):
            token = line.split("=", 1)[1]
            break

url = "https://api.supabase.com/v1/projects/mwzogsqkhjhxrdipqxvi/functions"
req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
try:
    with urllib.request.urlopen(req, timeout=15) as r:
        data = json.loads(r.read())
    funcs = data if isinstance(data, list) else data.get("functions", [])
    print(f"HTTP 200 — {len(funcs)} functions")
    for f in funcs:
        name = f.get("name","?") if isinstance(f, dict) else str(f)
        ver  = f.get("version","?") if isinstance(f, dict) else "?"
        fid  = f.get("id","?")[:12] if isinstance(f, dict) and f.get("id") else "?"
        print(f"  {name:30s} v{ver}  id={fid}")
except urllib.error.HTTPError as e:
    body = e.read().decode()
    print(f"HTTP {e.code}: {body[:500]}")
except Exception as e:
    print(f"ERROR: {type(e).__name__}: {e}")
