import urllib.request, json, ssl, base64

SR_KEY = 'eyJhbG...B71A'  # SUPABASE_SERVICE_ROLE_KEY from .env.hermes
PROJECT = 'mwzogsqkhjhxrdipqxvi'

session = ssl.create_default_context()
session.check_hostname = False
session.verify_mode = ssl.CERT_NONE

# 1. Check current secrets on all three functions
for suffix in ['chat', 'telegram-webhook', 'onboarding']:
    url = f'https://mwzogsqkhjhxrdipqxvi.supabase.co/functions/v1/{suffix}/secrets'
    req = urllib.request.Request(url, method='GET')
    req.add_header('apikey', SR_KEY)
    req.add_header('Authorization', f'Bearer {SR_KEY}')
    try:
        resp = urllib.request.urlopen(req, timeout=10, context=session)
        print(f'{suffix}: {resp.status} {json.dumps(json.loads(resp.read()), indent=2)[:500]}')
    except urllib.error.HTTPError as e:
        print(f'{suffix}: HTTP {e.code}')
    except Exception as e:
        print(f'{suffix}: ERROR {e}')

# 2. Try the v1 functions endpoint with POST
for suffix in ['chat', 'telegram-webhook', 'onboarding']:
    url = f'https://mwzogsqkhjhxrdipqxvi.supabase.co/functions/v1/{suffix}/secrets'
    req = urllib.request.Request(url, data=json.dumps({}).encode(), method='POST')
    req.add_header('apikey', SR_KEY)
    req.add_header('Authorization', f'Bearer {SR_KEY}')
    req.add_header('Content-Type', 'application/json')
    try:
        resp = urllib.request.urlopen(req, timeout=10, context=session)
        print(f'{suffix} POST: {resp.status} {resp.read()[:200]}')
    except urllib.error.HTTPError as e:
        print(f'{suffix} POST: HTTP {e.code} {e.read()[:200]}')
    except Exception as e:
        print(f'{suffix} POST: ERROR {e}')
