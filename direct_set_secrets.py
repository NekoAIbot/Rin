#!/usr/bin/env python3
"""
Directly push secrets to Supabase functions using the v1 REST endpoint
(vertex):///functions/v1/{function}/secrets with the service role key.

Requires: SUPABASE_SERVICE_ROLE_KEY in environment (from .env.hermes).

Secrets pushed (same set all three functions receive):
  GEMINI_API_KEY,        # Google AI Studio
  GROQ_API_KEY,          # Groq
  OPENROUTER_API_KEY,    # OpenRouter
  SUPABASE_SERVICE_ROLE_KEY,
  TELEGRAM_BOT_TOKEN,
  SENDGRID_API_KEY,
  TAVILY_API_KEY,
  EMBEDDING_MODEL,
  BACKEND_URL,
  POSTHOG_API_KEY,
  POSTHOG_HOST,
  KV_USER_AGENT,
  DEEP_SEARCH_MAX_RESULTS,
  TAVILY_MAX_RESULTS,
"""

import os, sys, json, urllib.request, ssl

SR_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
if not SR_KEY:
    try:
        with open(".env.hermes") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                if "=" in line:
                    k, v = line.split("=", 1)
                    if k.strip() == "SUPABASE_SERVICE_ROLE_KEY":
                        SR_KEY = v.strip().strip('"').strip("'")
                        break
    except FileNotFoundError:
        pass

if not SR_KEY:
    print("ERROR: SUPABASE_SERVICE_ROLE_KEY not available", file=sys.stderr)
    sys.exit(1)

PROJECT = "mwzogsqkhjhxrdipqxvi"
BASE = f"https://{PROJECT}.supabase.co"

SECRETS = {}
for key in [
    "GEMINI_API_KEY", "GROQ_API_KEY", "OPENROUTER_API_KEY",
    "SUPABASE_SERVICE_ROLE_KEY", "TELEGRAM_BOT_TOKEN",
    "SENDGRID_API_KEY", "TAVILY_API_KEY", "EMBEDDING_MODEL",
    "BACKEND_URL", "POSTHOG_API_KEY", "POSTHOG_HOST",
    "KV_USER_AGENT", "DEEP_SEARCH_MAX_RESULTS", "TAVILY_MAX_RESULTS",
]:
    val = os.environ.get(key, "")
    if val:
        SECRETS[key] = val
    else:
        # also check .env.hermes
        try:
            with open(".env.hermes") as f:
                for line in f:
                    line = line.strip()
                    if not line or line.startswith("#"):
                        continue
                    if "=" in line:
                        k, v = line.split("=", 1)
                        if k.strip() == key:
                            val = v.strip().strip('"').strip("'")
                            if val:
                                SECRETS[key] = val
                            break
        except FileNotFoundError:
            pass

if not SECRETS:
    print("No secrets to set.", file=sys.stderr)
    sys.exit(0)

print(f"Setting {len(SECRETS)} secret(s): {', '.join(sorted(SECRETS.keys()))}")

session = ssl.create_default_context()
session.check_hostname = False
session.verify_mode = ssl.CERT_NONE

for fn in ["telegram-webhook", "chat", "onboarding"]:
    url = f"{BASE}/functions/v1/{fn}/secrets"
    body = json.dumps(SECRETS).encode()
    req = urllib.request.Request(url, data=body, method="PUT")
    req.add_header("apikey", SR_KEY)
    req.add_header("Authorization", f"Bearer {SR_KEY}")
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=30, context=session) as resp:
            text = resp.read().decode()
            print(f"  {fn}: HTTP {resp.status} — {text[:120]}")
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f"  {fn}: HTTP {e.code} — {body[:200]}")
    except Exception as e:
        print(f"  {fn}: ERROR {type(e).__name__}: {e}")
