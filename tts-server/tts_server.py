#!/usr/bin/env python3
"""
Rin TTS server — self-hosted Piper wrapper behind a Cloudflare quick tunnel.
Runs INSIDE the debian proot container (piper + onnxruntime live there).

POST /speak  {"text": "..."}  -> audio/wav bytes
  Requires X-TTS-Secret header matching TTS_SHARED_SECRET from /root/.rin-tts-env.
GET  /health -> {"ok": true, "voice": ...}

On startup:
  1. Synthesizes a test phrase to verify Piper + the voice model work.
  2. Upserts the current tunnel URL into Supabase tts_endpoint (id=1) using
     the service role key (from /root/.rin-tts-env, never printed).

Run (in container):  python3 /root/rin-tts/tts_server.py [port]   (default 8085)
"""
import json
import os
import sys
import time
import subprocess
import tempfile
import urllib.request
import urllib.error
from http.server import HTTPServer, BaseHTTPRequestHandler

# ---------------------------------------------------------------- config

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8085
TUNNEL_URL_FILE = "/root/.rin-tts-tunnel-url"
ENV_FILE = "/root/.rin-tts-env"

# Voice: en_US-lessac-medium — a warm, natural female voice, good default.
PIPER_MODEL = "/root/piper-voices/en_US-lessac-medium.onnx"


def load_env():
    """Read TTS_SHARED_SECRET / SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
    from /root/.rin-tts-env (KEY=VALUE lines). Never printed."""
    vals = {}
    try:
        with open(ENV_FILE) as f:
            for line in f:
                line = line.strip()
                if "=" in line and not line.startswith("#"):
                    k, v = line.split("=", 1)
                    vals[k.strip()] = v.strip()
    except FileNotFoundError:
        pass
    return vals


ENV = load_env()
SECRET = ENV.get("TTS_SHARED_SECRET", "")
SUPABASE_URL = ENV.get("SUPABASE_URL", "")
SERVICE_ROLE_KEY = ENV.get("SUPABASE_SERVICE_ROLE_KEY", "")


# ---------------------------------------------------------------- piper

def synthesize(text: str) -> bytes:
    """Run Piper on text, return WAV bytes. Raises on failure."""
    # piper 1.8.0 needs -f for WAV output (stdout default is raw PCM).
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tf:
        out_path = tf.name
    try:
        proc = subprocess.run(
            ["piper", "-m", PIPER_MODEL, "-f", out_path],
            input=text.encode("utf-8"),
            capture_output=True,
            timeout=60,
        )
        if proc.returncode != 0 or not os.path.exists(out_path):
            raise RuntimeError(
                f"piper exited {proc.returncode}: {proc.stderr.decode(errors='replace')[:200]}"
            )
        with open(out_path, "rb") as f:
            wav = f.read()
        if len(wav) < 1000:
            raise RuntimeError(f"piper output suspiciously small: {len(wav)} bytes")
        return wav
    finally:
        try:
            os.unlink(out_path)
        except OSError:
            pass


def verify_piper() -> str:
    """Startup self-test. Returns voice/model description; raises on failure."""
    wav = synthesize("Voice check. Rin here.")
    return f"en_US-lessac-medium: {len(wav)} bytes test WAV OK"


# ---------------------------------------------------------------- supabase

def upsert_tunnel_url(tunnel_url: str):
    """PATCH the current tunnel URL to Supabase tts_endpoint row id=1."""
    if not (SUPABASE_URL and SERVICE_ROLE_KEY):
        print("[warn] SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — "
              "skipping tts_endpoint upsert (edge function will see stale URL)")
        return False
    body = json.dumps({"url": tunnel_url, "updated_at": time.strftime(
        "%Y-%m-%dT%H:%M:%S+00:00", time.gmtime())}).encode()
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/tts_endpoint?id=eq.1",
        data=body,
        method="PATCH",
        headers={
            "apikey": SERVICE_ROLE_KEY,
            "Authorization": f"Bearer {SERVICE_ROLE_KEY}",
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            print(f"[supabase] tts_endpoint upsert -> HTTP {resp.status}")
            return True
    except urllib.error.HTTPError as e:
        print(f"[supabase] upsert failed: {e.code} {e.read().decode(errors='replace')[:200]}")
        return False
    except Exception as e:
        print(f"[supabase] upsert failed: {e}")
        return False


def announce_tunnel():
    """Re-read the tunnel URL file and upsert. Called at startup and when
    cloudflared (running on the host) writes a fresh URL."""
    if not os.path.exists(TUNNEL_URL_FILE):
        print("[warn] no tunnel URL file yet — upsert will happen on next restart")
        return
    with open(TUNNEL_URL_FILE) as f:
        url = f.read().strip()
    if url.startswith("https://"):
        print(f"[tunnel] current URL: {url}")
        upsert_tunnel_url(url)
    else:
        print(f"[warn] tunnel URL file exists but not https: {url[:30]!r}")


# ---------------------------------------------------------------- server

class Handler(BaseHTTPRequestHandler):
    def _deny(self, why: str, code: int = 403):
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps({"error": why}).encode())

    def do_GET(self):
        if self.path == "/health":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"ok": True, "voice": "en_US-lessac-medium"}).encode())
        else:
            self._deny("not found", 404)

    def do_POST(self):
        if self.path == "/announce":
            # Host-side cloudflared wrapper signals a fresh tunnel URL.
            # Only meaningful from localhost; no secret needed (it just
            # re-reads the shared file the host wrote).
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"ok": True}).encode())
            announce_tunnel()
            return
        if self.path != "/speak":
            self._deny("not found", 404)
            return
        if not SECRET:
            self._deny("server misconfigured: no shared secret set")
            return
        if self.headers.get("X-TTS-Secret") != SECRET:
            self._deny("bad secret")
            return
        try:
            length = int(self.headers.get("Content-Length", 0))
            if length <= 0 or length > 100_000:
                self._deny("bad content length")
                return
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            text = (payload.get("text") or "").strip()
            if not text:
                self._deny("empty text")
                return
            if len(text) > 1800:
                text = text[:1800]
            wav = synthesize(text)
            self.send_response(200)
            self.send_header("Content-Type", "audio/wav")
            self.send_header("Content-Length", str(len(wav)))
            self.end_headers()
            self.wfile.write(wav)
        except Exception as e:
            print(f"[speak] error: {e}", file=sys.stderr)
            self.send_response(500)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)[:200]}).encode())

    def log_message(self, fmt, *args):
        # Compact one-line logs, no secret material.
        print(f"[http] {self.address_string()} {fmt % args}")


def main():
    print(f"[boot] Rin TTS server starting on port {PORT}")
    print(f"[boot] voice model: en_US-lessac-medium")

    # 1. Verify Piper works before opening the tunnel.
    print(f"[boot] {verify_piper()}")

    # 2. Upsert tunnel URL if the host wrapper already wrote it.
    announce_tunnel()

    # 3. Start HTTP server.
    server = HTTPServer(("0.0.0.0", PORT), Handler)
    print(f"[boot] listening on 0.0.0.0:{PORT} (tunnel target)")
    print("[boot] ready")
    server.serve_forever()


if __name__ == "__main__":
    main()
