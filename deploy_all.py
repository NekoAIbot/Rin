#!/usr/bin/env python3
"""
Deploy ALL Supabase edge functions via Management API.
Reads SUPABASE_ACCESS_TOKEN from .env.hermes.
Deploys each function found in supabase/functions/.
"""
import json
import uuid
import pathlib
import http.client
import ssl
import os
import re
import sys
import urllib.request

# Resolve the repo relative to this script so it runs on any machine, not only
# the Termux path it was originally written against.
ROOT = pathlib.Path(__file__).resolve().parent
FUNCTIONS_DIR = ROOT / "supabase" / "functions"
TOKEN = os.environ.get("SUPABASE_ACCESS_TOKEN", "")
if not TOKEN:
    try:
        with open(ROOT / ".env.hermes") as f:
            for line in f:
                if line.startswith("SUPABASE_ACCESS_TOKEN="):
                    TOKEN = line.split("=", 1)[1].strip()
                    break
    except FileNotFoundError:
        pass
if not TOKEN:
    print("ERROR: SUPABASE_ACCESS_TOKEN not found in .env.hermes", file=sys.stderr)
    sys.exit(1)

PROJECT = "mwzogsqkhjhxrdipqxvi"

# Never eyeball-match a project ref: decode it from the service_role JWT and
# compare. A mismatch means this script is pointed at the wrong project.
_service = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
if not _service:
    try:
        with open(ROOT / ".env.hermes") as f:
            for line in f:
                if line.startswith("SUPABASE_SERVICE_ROLE_KEY="):
                    _service = line.split("=", 1)[1].strip()
                    break
    except FileNotFoundError:
        pass
if _service:
    try:
        import base64 as _b64
        _payload = _service.split(".")[1]
        _payload += "=" * (-len(_payload) % 4)
        _ref = json.loads(_b64.urlsafe_b64decode(_payload)).get("ref")
        if _ref and _ref != PROJECT:
            print(f"ERROR: PROJECT={PROJECT} but service_role JWT says ref={_ref}", file=sys.stderr)
            sys.exit(1)
        if _ref:
            print(f"project ref verified against service_role JWT: {_ref}")
    except Exception as _e:
        print(f"WARNING: could not decode service_role JWT ref: {_e}", file=sys.stderr)

# TLS certificate verification stays ON -- this request carries the access token.
ctx = ssl.create_default_context()

# --list: show deployed functions and flag UUID-slugged duplicates, which is how
# earlier deploys silently created parallel copies instead of updating a slug.
if "--list" in sys.argv:
    _req = urllib.request.Request(
        f"https://api.supabase.com/v1/projects/{PROJECT}/functions", method="GET")
    _req.add_header("Authorization", f"Bearer {TOKEN}")
    with urllib.request.urlopen(_req, timeout=60, context=ctx) as _resp:
        _rows = json.loads(_resp.read().decode())
    print(f"{len(_rows)} deployed functions:")
    for _fn in sorted(_rows, key=lambda f: f.get("slug", "")):
        _slug = _fn.get("slug", "?")
        _flag = "   <-- UUID SLUG (duplicate)" if re.match(r"^[0-9a-f]{8}-", _slug, re.I) else ""
        print(f"  {_slug:34s} version={_fn.get('version')} status={_fn.get('status')}{_flag}")
    sys.exit(0)

# --secrets: project secret NAMES and updated_at only. The API returns values
# too; they are deliberately never printed.
if "--secrets" in sys.argv:
    _req = urllib.request.Request(
        f"https://api.supabase.com/v1/projects/{PROJECT}/secrets", method="GET")
    _req.add_header("Authorization", f"Bearer {TOKEN}")
    with urllib.request.urlopen(_req, timeout=60, context=ctx) as _resp:
        _secs = json.loads(_resp.read().decode())
    print(f"{len(_secs)} project secrets (names + updated_at only):")
    for _s in sorted(_secs, key=lambda s: s.get("name", "")):
        print(f"  {_s.get('name'):34s} updated_at={_s.get('updated_at')}")
    sys.exit(0)

# --logs: recent error_log and messages rows. Runs SQL through the Management
# API rather than the project's REST endpoint, because this machine's resolver
# reaches api.supabase.com but not <ref>.supabase.co.
if "--logs" in sys.argv:
    _ep = f"https://api.supabase.com/v1/projects/{PROJECT}/database/query"
    for _label, _sql in (
        # context carries the per-provider fallback chain (provider, status, ok,
        # snippet). Without it the only thing visible is the generic
        # "All N AI providers failed" summary, which cannot distinguish an
        # absent API key from a provider rejecting one.
        ("error_log",
         "select created_at, function_name, error_message, context from error_log "
         "order by created_at desc limit 10"),
        ("messages",
         "select created_at, role, left(content, 300) as content from messages "
         "order by created_at desc limit 10"),
    ):
        print(f"\n=== {_label} (latest 10) ===")
        try:
            _r = urllib.request.Request(
                _ep, data=json.dumps({"query": _sql}).encode(), method="POST")
            _r.add_header("Authorization", f"Bearer {TOKEN}")
            _r.add_header("Content-Type", "application/json")
            with urllib.request.urlopen(_r, timeout=120, context=ctx) as _resp:
                _rows = json.loads(_resp.read().decode())
            if not _rows:
                print("  (no rows)")
            for _row in _rows:
                # Generous limit: an 8-attempt fallback chain with 200-char
                # snippets overflows 700 chars and would cut off the OpenRouter
                # rung -- the last one, and the one that matters here.
                print("  " + json.dumps(_row, ensure_ascii=False)[:3000])
        except urllib.error.HTTPError as _e:
            print(f"  HTTP {_e.code}: {_e.read().decode(errors='replace')[:300]}")
        except Exception as _e:
            print(f"  ERROR {type(_e).__name__}: {str(_e)[:200]}")
    sys.exit(0)

# --status / --restore. A paused project reports status INACTIVE, its service
# plane is down, and deploys 404 with "Cannot retrieve service ... 'INACTIVE'".
# The control plane still answers metadata reads -- which is exactly why --list
# and --secrets work while every deploy fails.
if "--status" in sys.argv or "--restore" in sys.argv:
    _ep = f"https://api.supabase.com/v1/projects/{PROJECT}"
    _r = urllib.request.Request(_ep, method="GET")
    _r.add_header("Authorization", f"Bearer {TOKEN}")
    with urllib.request.urlopen(_r, timeout=60, context=ctx) as _resp:
        _p = json.loads(_resp.read().decode())
    print(f"project: {_p.get('name')}  status={_p.get('status')}  region={_p.get('region')}")

    if "--status" in sys.argv:
        sys.exit(0)

    if _p.get("status") != "INACTIVE":
        print("project is not INACTIVE -- nothing to restore.")
        sys.exit(0)

    _rr = urllib.request.Request(f"{_ep}/restore", data=b"{}", method="POST")
    _rr.add_header("Authorization", f"Bearer {TOKEN}")
    _rr.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(_rr, timeout=180, context=ctx) as _resp2:
            print(f"restore requested -> HTTP {_resp2.status} {_resp2.read().decode()[:200]}")
    except urllib.error.HTTPError as _e:
        print(f"restore HTTP {_e.code}: {_e.read().decode(errors='replace')[:300]}")
    sys.exit(0)

# --rm-secret NAME: delete a project secret. The Management API has accepted a
# few different body shapes for this over time, so try each and say which worked.
if "--rm-secret" in sys.argv or any(a.startswith("--rm-secret=") for a in sys.argv):
    if "--rm-secret" in sys.argv:
        _name = sys.argv[sys.argv.index("--rm-secret") + 1]
    else:
        _name = [a.split("=", 1)[1] for a in sys.argv if a.startswith("--rm-secret=")][0]
    _ep = f"https://api.supabase.com/v1/projects/{PROJECT}/secrets"
    print(f"deleting secret: {_name}")
    for _shape in ({"names": [_name]}, {"name": _name}, [_name]):
        _r = urllib.request.Request(_ep, data=json.dumps(_shape).encode(), method="DELETE")
        _r.add_header("Authorization", f"Bearer {TOKEN}")
        _r.add_header("Content-Type", "application/json")
        try:
            with urllib.request.urlopen(_r, timeout=60, context=ctx) as _resp:
                print(f"  OK HTTP {_resp.status}  body={json.dumps(_shape)[:40]}")
                sys.exit(0)
        except urllib.error.HTTPError as _e:
            print(f"  HTTP {_e.code} for {json.dumps(_shape)[:40]}: "
                  f"{_e.read().decode(errors='replace')[:160]}")
        except Exception as _e:
            print(f"  ERROR {type(_e).__name__}: {_e}")
    sys.exit(1)

def read_env_file(path):
    """Parse KEY=VALUE lines from a credentials file.

    Duplicate names are reported rather than silently resolved. This file had
    GEMINI_API_KEY and SUPABASE_ACCESS_TOKEN each defined twice with different
    values, and a first-match-wins reader quietly picked the stale one -- which
    is exactly how a dead key keeps getting pushed to the server.
    """
    values, dupes = {}, {}
    try:
        with open(path) as f:
            for lineno, line in enumerate(f, 1):
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, val = line.split("=", 1)
                key, val = key.strip(), val.strip()
                if key in values:
                    dupes.setdefault(key, []).append(lineno)
                values[key] = val
    except FileNotFoundError:
        pass
    for key, lines in dupes.items():
        print(f"WARNING: duplicate key {key} at lines {lines} -- last value wins",
              file=sys.stderr)
    return values


# --push-secrets NAME [NAME...]: update project secrets from .env.hermes.
# Values are never printed -- only names and lengths, so a paste of this output
# cannot leak a credential.
if "--push-secrets" in sys.argv:
    _names = [a for a in sys.argv[sys.argv.index("--push-secrets") + 1:]
              if not a.startswith("--")]
    if not _names:
        print("usage: --push-secrets NAME [NAME...]", file=sys.stderr)
        sys.exit(1)

    _env = read_env_file(ROOT / ".env.hermes")

    # The management token grants full account access across every project.
    # No edge function has any business holding it, so refuse to ship it.
    _BANNED = {"SUPABASE_ACCESS_TOKEN"}

    _payload = []
    for _n in _names:
        if _n in _BANNED:
            print(f"REFUSING {_n}: management token must not be shipped as an "
                  f"edge secret", file=sys.stderr)
            sys.exit(1)
        _v = os.environ.get(_n) or _env.get(_n) or ""
        if not _v.strip():
            print(f"MISSING {_n}: no value in the environment or .env.hermes",
                  file=sys.stderr)
            sys.exit(1)
        if _v != _v.strip():
            print(f"NOTE {_n}: value carried surrounding whitespace -- trimmed")
            _v = _v.strip()
        _payload.append({"name": _n, "value": _v})

    print("pushing secrets (names and value lengths only):")
    for _item in _payload:
        print(f"  {_item['name']:28s} {len(_item['value'])} chars")

    _req = urllib.request.Request(
        f"https://api.supabase.com/v1/projects/{PROJECT}/secrets",
        data=json.dumps(_payload).encode(), method="POST")
    _req.add_header("Authorization", f"Bearer {TOKEN}")
    _req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(_req, timeout=120, context=ctx) as _resp:
            print(f"push -> HTTP {_resp.status}")
    except urllib.error.HTTPError as _e:
        print(f"push HTTP {_e.code}: {_e.read().decode(errors='replace')[:300]}")
        sys.exit(1)
    print("NOTE: secrets are injected when a function boots, so the functions "
          "must be redeployed (or a new version deployed) before the new "
          "values are what the running code reads.")
    sys.exit(0)

# Discover all function directories
func_dirs = sorted(d for d in FUNCTIONS_DIR.iterdir() if d.is_dir() and (d / "index.ts").exists())
print(f"Found {len(func_dirs)} functions to deploy:")
for d in func_dirs:
    print(f"  {d.name}")

DRY_RUN = "--dry-run" in sys.argv
REQUESTED = [a for a in sys.argv[1:] if not a.startswith("--")]
if REQUESTED:
    func_dirs = [d for d in func_dirs if d.name in REQUESTED]
    _missing = sorted(set(REQUESTED) - {d.name for d in func_dirs})
    if _missing:
        print(f"WARNING: no such function: {', '.join(_missing)}", file=sys.stderr)
    print(f"\nSelected {len(func_dirs)}: {', '.join(d.name for d in func_dirs)}")
elif not DRY_RUN:
    print("\n(no slugs given -- deploying ALL. Pass --dry-run to preview first.)")

results = []
for func_dir in func_dirs:
    slug = func_dir.name
    url = f"https://api.supabase.com/v1/projects/{PROJECT}/functions/deploy?slug={slug}"
    print(f"\n--- Deploying {slug} ---")

    # Build multipart body
    shared = FUNCTIONS_DIR / "_shared"
    file_parts = [("index.ts", func_dir / "index.ts")]
    # Glob every shared module. The old hardcoded list omitted ai.ts and auth.ts,
    # so functions importing them would fail to boot after deploy.
    for src in sorted(shared.glob("*.ts")):
        file_parts.append((f"_shared/{src.name}", src))

    METADATA = {
        "entrypoint_path": "index.ts",
        "name": slug,
        "verify_jwt": False,
    }
    meta_str = json.dumps(METADATA, separators=(",", ":"))

    boundary = uuid.uuid4().hex
    parts = []
    # metadata part
    parts.append(f"--{boundary}".encode())
    parts.append(b'Content-Disposition: form-data; name="metadata"')
    parts.append(b"")
    parts.append(meta_str.encode())
    # file parts
    for name, path in file_parts:
        data = path.read_bytes()
        parts.append(f"--{boundary}".encode())
        parts.append(f'Content-Disposition: form-data; name="file"; filename="{name}"'.encode())
        parts.append(b"")
        parts.append(data)
    parts.append(f"--{boundary}--".encode())
    body = b"\r\n".join(parts) + b"\r\n"

    print(f"  files: {', '.join(n for n, _ in file_parts)}")
    if DRY_RUN:
        print(f"  DRY RUN: {len(body)} bytes staged for slug={slug} (nothing sent)")
        continue

    headers = {
        "Authorization": f"Bearer {TOKEN}",
        "Content-Type": f"multipart/form-data; boundary={boundary}",
        "Content-Length": str(len(body)),
    }

    parsed = url.split("/")
    host = parsed[2]
    path = "/" + "/".join(parsed[3:])

    try:
        conn = http.client.HTTPSConnection(host, context=ctx)
        conn.request("POST", path, body=body, headers=headers)
        resp = conn.getresponse()
        out = resp.read().decode(errors="replace")
        print(f"HTTP {resp.status} {resp.reason}")
        if resp.status == 200:
            try:
                info = json.loads(out)
                print(f"  name: {info.get('name')}")
                print(f"  version: {info.get('version')}")
                print(f"  id: {info.get('id')}")
            except json.JSONDecodeError:
                print(f"  response: {out[:500]}")
        else:
            print(f"  response: {out[:1000]}")
        conn.close()
        results.append((slug, resp.status, out[:200]))
    except Exception as e:
        print(f"  ERROR: {type(e).__name__}: {e}")
        results.append((slug, None, str(e)))

print("\n=== Summary ===")
for slug, status, info in results:
    status_str = str(status) if status else "ERROR"
    print(f"  {slug:30s} -> HTTP {status_str}")
    if status != 200:
        print(f"    {info[:150]}")
