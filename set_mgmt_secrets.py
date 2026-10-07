#!/usr/bin/env python3
"""Set secrets on telegram-webhook, chat, and onboarding via Supabase Management API.

Requires: SUPABASE_MANAGEMENT_API_TOKEN env var.
Falls back to .env.hermes if not set.

Reads AI provider keys:
  - GEMINI_API_KEY  (Google AI Studio / Vertex)
  - GROQ_API_KEY
  - OPENROUTER_API_KEY
Also sets:
  - SUPABASE_SERVICE_ROLE_KEY (for DB access from edge functions)
  - TELEGRAM_BOT_TOKEN       (for Telegram webhook)
  - SENDGRID_API_KEY         (for report email)
  - TAVILY_API_KEY           (for proactive insights search)
  - EMBEDDING_MODEL          (override, optional)

Usage:
  python3 set_mgmt_secrets.py
  # or with explicit token:
  SUPABASE_MANAGEMENT_API_TOKEN=... python3 set_mgmt_secrets.py
"""

import os
import sys
import json
import urllib.request
import urllib.error
import ssl

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
PROJECT_REF  = "mwzogsqkhjhxrdipqxvi"          # mwzogsqkhjhxrdipqxvi
BASE_URL     = f"https://api.supabase.com/v1/projects/{PROJECT_REF}"

FUNCTIONS = [
    "telegram-webhook",
    "chat",
    "onboarding",
]

# Each function → dict of secret name → value.
# Values read from environment; missing values logged & skipped.
def build_secrets():
    secrets = {}
    for key in [
        "GEMINI_API_KEY",        # Google AI
        "GROQ_API_KEY",          # Groq
        "OPENROUTER_API_KEY",    # OpenRouter
        "SUPABASE_SERVICE_ROLE_KEY",
        "TELEGRAM_BOT_TOKEN",
        "SENDGRID_API_KEY",
        "TAVILY_API_KEY",
        "EMBEDDING_MODEL",
    ]:
        val = os.environ.get(key, "")
        if val:
            secrets[key] = val
    return secrets

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
SESSION = ssl.create_default_context()
SESSION.check_hostname = False
SESSION.verify_mode = ssl.CERT_NONE

def api_call(method: str, path: str, body=None):
    url = f"{BASE_URL}{path}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", f"Bearer {TOKEN}")
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=30, context=SESSION) as resp:
            raw = resp.read()
            try:
                return resp.status, json.loads(raw)
            except Exception:
                return resp.status, raw.decode("utf-8", errors="replace")
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        return exc.code, body
    except Exception as exc:
        return None, str(exc)

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    TOKEN = os.environ.get("SUPABASE_MANAGEMENT_API_TOKEN", "")
    if not TOKEN:
        # Try reading from .env.hermes
        try:
            with open(".env.hermes") as f:
                for line in f:
                    line = line.strip()
                    if not line or line.startswith("#"):
                        continue
                    if "=" in line:
                        k, v = line.split("=", 1)
                        k = k.strip()
                        v = v.strip().strip('"').strip("'")
                        if k == "SUPABASE_MANAGEMENT_API_TOKEN":
                            TOKEN = v
                            break
        except FileNotFoundError:
            pass

    if not TOKEN:
        print("ERROR: SUPABASE_MANAGEMENT_API_TOKEN not set and not found in .env.hermes", file=sys.stderr)
        sys.exit(1)

    secrets = build_secrets()
    if not secrets:
        print("WARNING: No secrets to set (all env vars empty).", file=sys.stderr)

    print(f"Setting {len(secrets)} secret(s) on {len(FUNCTIONS)} function(s)...")
    for name in FUNCTIONS:
        status, result = api_call(
            "PUT",
            f"/functions/{name}/secrets",
            body=secrets,
        )
        if isinstance(result, dict) and "error" in result:
            print(f"  {name}: FAILED ({status}) -> {result.get('error', result)}")
        elif isinstance(result, str):
            print(f"  {name}: status={status}, body={result[:200]}")
        else:
            print(f"  {name}: OK (status={status})")
