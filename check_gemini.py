#!/usr/bin/env python3
"""
Verify GEMINI_API_KEY and check model availability.
Lists models from Gemini API and checks if our model names are valid.
"""
import urllib.request
import json
import ssl

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

# Read key from .env.hermes
key = None
try:
    with open('.env.hermes') as f:
        for line in f:
            if line.startswith('GEMINI_API_KEY='):
                key = line.split('=',1)[1].strip().strip('"').strip("'")
                break
except FileNotFoundError:
    pass

if not key:
    print("ERROR: No GEMINI_API_KEY found in .env.hermes")
    exit(1)

print(f"API key present (length={len(key)}): {key[:20]}...")
print()

# 1. List models to verify key validity
print("=== 1. Listing available Gemini models ===")
url = f"https://generativelanguage.googleapis.com/v1beta/models?key={key}"
req = urllib.request.Request(url, headers={"Content-Type": "application/json"})
try:
    with urllib.request.urlopen(req, timeout=15, context=ctx) as resp:
        data = json.loads(resp.read())
        if "error" in data:
            print("Key error:", json.dumps(data["error"], indent=2)[:500])
        else:
            models = data.get("models", [])
            names = [m.get("name", "?") for m in models]
            print(f"Key valid. {len(models)} models available.")
            print("Model names:")
            for name in names:
                print(f"  {name}")
            print()

            # Check our model names
            our_models = [
                "gemini-3.6-flash",
                "gemini-3.5-flash-lite",
                "gemini-3.1-flash-image",
                "gemini-embedding-001",
            ]
            print("=== 2. Checking our model names ===")
            for name in our_models:
                full = f"models/{name}"
                found = full in names
                status = "FOUND" if found else "NOT FOUND"
                print(f"  {name:40s} -> {status}")
            print()

            # 3. Try a simple generateContent call
            print("=== 3. Test generateContent ===")
            test_body = json.dumps({
                "contents": [{"parts": [{"text": "Say 'OK' in one word"}]}],
                "generationConfig": {"temperature": 0.0, "maxOutputTokens": 10},
            }).encode()
            gen_url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key={key}"
            gen_req = urllib.request.Request(
                gen_url,
                data=test_body,
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            try:
                with urllib.request.urlopen(gen_req, timeout=30, context=ctx) as resp:
                    result = json.loads(resp.read())
                    if "error" in result:
                        print("Generate error:", json.dumps(result["error"], indent=2)[:500])
                    else:
                        text = result.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "[no text]")
                        print(f"Response: {text}")
            except urllib.error.HTTPError as e:
                print(f"HTTP {e.code}: {e.read()[:500]}")
            except Exception as e:
                print(f"Error: {type(e).__name__}: {e}")
except urllib.error.HTTPError as e:
    print(f"HTTP {e.code}: {e.read()[:500]}")
except Exception as e:
    print(f"Error: {type(e).__name__}: {e}")
