#!/usr/bin/env python3
"""Minimal probe of telegram-webhook v15."""
import json, urllib.request, sys

with open(".env.hermes") as f:
    auth = None
    role = None
    for line in f:
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" in line:
            k, v = line.split("=", 1)
            k, v = k.strip(), v.strip().strip('"').strip("'")
            if k == "TELEGRAM_BOT_TOKEN":
                auth = v
            elif k == "SUPABASE_SERVICE_ROLE_KEY":
                role = v

if not auth:
    print("No TELEGRAM_BOT_TOKEN", file=sys.stderr)
    sys.exit(1)

url = "https://mwzogsqkhjhxrdipqxvi.supabase.co/functions/v1/telegram-webhook"

update_id = 9090575577
payload = {
    "update_id": update_id,
    "message...[truncated]
