#!/usr/bin/env bash
# Rin TTS launcher — HOST side (Termux).
# Runs the Piper server inside the debian container and cloudflared on the
# host, wires them together via the shared tunnel-URL file.
#
# The container shares the host filesystem through proot-distro's default
# binding, so /root/.rin-tts-tunnel-url (container view) is written by this
# script via the host path below.
#
# Secrets: /root/.rin-tts-env inside the container (never printed).
#
# Usage: bash tts-server/start_tts.sh [port]   (default 8085)
set -u
PORT="${1:-8085}"
DIR="$(cd "$(dirname "$0")" && pwd)"

# Container rootfs (proot-distro v5+ layout) — the host writes the tunnel URL
# file here; the container sees it as /root/.rin-tts-tunnel-url.
ROOTFS="/data/data/com.termux/files/usr/var/lib/proot-distro/containers/debian/rootfs"
URL_FILE_HOST="$ROOTFS/root/.rin-tts-tunnel-url"
URL_FILE_CONT="/root/.rin-tts-tunnel-url"

# Copy server code into the container (survives independent of the repo).
mkdir -p "$ROOTFS/root/rin-tts"
cp "$DIR/tts_server.py" "$ROOTFS/root/rin-tts/tts_server.py"

# Copy the env file template if the user hasn't created one yet (do not
# overwrite an existing one — it holds real secrets).
if [ ! -f "$ROOTFS/root/.rin-tts-env" ]; then
  cat > "$ROOTFS/root/.rin-tts-env" << 'EOF'
# Rin TTS secrets — fill these in (never printed by scripts):
TTS_SHARED_SECRET=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
EOF
  echo "[launcher] created $URL_FILE_CONT template at container /root/.rin-tts-env — FILL IT IN"
fi

echo "[launcher] starting TTS server (debian container) on port $PORT"
proot-distro login debian -- bash -c "python3 /root/rin-tts/tts_server.py $PORT" &
TTS_PID=$!
sleep 3

if ! kill -0 "$TTS_PID" 2>/dev/null; then
  echo "[launcher] TTS server died at startup — aborting"
  wait $TTS_PID
  exit 1
fi

echo "[launcher] starting cloudflared quick tunnel (host)"
cloudflared tunnel --url "http://127.0.0.1:$PORT" 2>&1 | while IFS= read -r line; do
  echo "[cloudflared] $line"
  case "$line" in
    *trycloudflare.com*)
      url="$(echo "$line" | grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' | head -1)"
      if [ -n "$url" ]; then
        echo "$url" > "$URL_FILE_HOST"
        echo "[launcher] tunnel URL captured: $url"
        # Tell the server (container) to re-read + upsert to Supabase.
        curl -s -X POST "http://127.0.0.1:$PORT/announce" >/dev/null 2>&1 || true
      fi
      ;;
  esac
done
