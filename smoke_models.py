#!/usr/bin/env python3
"""Smoke test all Gemini model names used in the project."""
import json, urllib.request, ssl, sys, time

KEY = open('.env.hermes').read().split('GEMINI_API_KEY=')[1].split('\n')[0]

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

BASE = 'https://generativelanguage.googleapis.com/v1beta'
models_to_test = {
    'gemini-3.6-flash':      'generateContent',
    'gemini-3.5-flash-lite': 'generateContent',
    'gemini-embedding-001':  'embedContent',
}

def api_call(url, method='GET', body=None):
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header('Content-Type', 'application/json')
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=30, context=ctx) as r:
                resp = r.read()
                return r.status, json.loads(resp) if resp else {}
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read())
        except Exception as e:
            if attempt < 2:
                time.sleep(1)
                continue
            return None, str(e)

print(f'API Key: {KEY[:20]}... (len={len(KEY)})')
print()

results = {}
for model_name, method in models_to_test.items():
    print(f'=== {model_name} ({method}) ===')
    
    if method == 'generateContent':
        url = f'{BASE}/models/{model_name}:generateContent?key={KEY}'
        body = {
            'contents': [{'parts': [{'text': 'Reply with just: OK'}]}],
            'generationConfig': {'temperature': 0, 'maxOutputTokens': 5}
        }
    else:  # embedContent
        url = f'{BASE}/models/{model_name}:embedContent?key={KEY}'
        body = {
            'content': {'parts': [{'text': 'Test embedding'}]},
            'outputDimensionality': 768,
        }
    
    status, resp = api_call(url, 'POST', body)
    if status == 200:
        if method == 'generateContent':
            text = (resp.get('candidates', [{}])[0]
                    .get('content', {})
                    .get('parts', [{}])[0]
                    .get('text', '[empty]'))
            print(f'  OK: "{text}"')
            results[model_name] = 'OK'
        else:
            dims = len(resp.get('embedding', {}).get('values', []))
            print(f'  OK: {dims} dimensions (requested 768)')
            results[model_name] = f'OK ({dims} dims)'
    else:
        err = resp.get('error', {}).get('message', f'HTTP {status}')
        print(f'  FAIL: {err}')
        results[model_name] = f'FAIL: {err}'
    print()

print('=== Summary ===')
for name, result in results.items():
    print(f'  {name}: {result}')
