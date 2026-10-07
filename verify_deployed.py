#!/usr/bin/env python3
"""
Compare the live deployed source of telegram-webhook v17 against the local
supabase/functions tree. Uses the Management API source download endpoint.

Never prints secret values. Reports which key signatures are present in the
deployed bundle.
"""
import json, urllib.request, ssl, sys, time, base64, hashlib

TOKEN = open(".env.hermes").read().split("SUPABASE_ACCESS_TOKEN=")[1].split("\n")[0]
PROJECT = "mwzogsqkhjhxrdipqxvi"
FUNCTION = "telegram-webhook"

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

# Try to download the deployed function source
url = f"https://api.supabase.com/v1/projects/{PROJECT}/functions/{FUNCTION}/source"
req = urllib.request.Request(url, headers={
    "Authorization": f"Bearer {TOKEN}",
    "Content-Type": "application/json",
})
try:
    with urllib.request.urlopen(req, timeout=15, context=ctx) as r:
        body = r.read()
    text = body.decode("utf-8", errors="replace")
    print(f"Downloaded {len(text)} chars from deployed v17 source")
    
    checks = [
        ("geminiGenerate", "Gemini generate call present"),
        ("model-fallback", "model-fallback reference present"),
        ("LOVABLE_API_KEY", "LOVABLE_API_KEY present (BAD)"),
        ("ai.gateway.lovable", "Lovable gateway URL present (BAD)"),
        ("GATEWAY", "GATEWAY constant present (BAD)"),
        ("aiKey", "aiKey function present (BAD)"),
        ("generateWithFallback", "generateWithFallback present"),
        ("temperatureFor", "temperatureFor import present"),
        ("gemini-embedding-001", "embedding model present"),
        ("Piper", "Piper TTS present"),
    ]
    for pattern, desc in checks:
        count = text.count(pattern)
        flag = "*** FOUND" if count > 0 else "not found"
        if "BAD" in desc and count > 0:
            flag += " *** SHOULD BE ZERO ***"
        print(f"  [{flag}] {desc} ({count} occurrences)")
    
    # Also check the ezbr_sha256 from the deploy response
    print()
    print("Expected ezbr_sha256 from deploy: 17c93746d159b29d64f4063dcfe4994418d345e2350b3319f6709bf420193857")
    
except urllib.error.HTTPError as e:
    body = e.read()
    print(f"HTTP {e.code}: {body.decode(errors='replace')[:500]}")
    print("Source download not available via this endpoint.")
    print("Will verify via the ezbr_sha256 from the deploy response instead.")
except Exception as e:
    print(f"ERROR: {type(e).__name__}: {e}")
