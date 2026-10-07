#!/usr/bin/env python3
import urllib.request, json, ssl, sys

KEY = open('.env.hermes').read().split('GEMINI_API_KEY=')[1].split('\n')[0]
BASE = 'https://generativelanguage.googleapis.com/v1beta'

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

# List models to verify key
url = f'{BASE}/models?key={KEY}'
req = urllib.request.Request(url, headers={'Content-Type': 'application/json'})
try:
    with urllib.request.urlopen(req, timeout=15, context=ctx) as r:
        data = json.loads(r.read())
    if 'error' in data:
        print(f'Key error: {json.dumps(data["error"], indent=2)[:500]}')
        sys.exit(1)
    models = {m['name']: m.get('supportedGenerationMethods', []) for m in data['models']}
    print(f'Key valid. {len(models)} models. Our models:')
    our = ['gemini-3.6-flash', 'gemini-3.5-flash-lite', 'gemini-embedding-001']
    for m in our:
        full = f'models/{m}'
        found = full in models
        print(f'  {m:35s} -> {"FOUND" if found else "MISSING"}')
        if found:
            print(f'    methods: {models[full]}')
except urllib.error.HTTPError as e:
    print(f'HTTP {e.code}: {e.read()[:500]}')
    sys.exit(1)
