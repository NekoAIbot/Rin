#!/usr/bin/env python3
"""Empty Ctrl+D to exit; Ctrl+C to abort current turn; runs a continuous agent loop with Ollama."""
import sys, os, signal, json, time, datetime, urllib.request, urllib.error

OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434")
MODEL = os.environ.get("MODEL", "solar-pro4:latest")
HISTORY_FILE = os.environ.get("HISTORY_FILE", "conversation_history.jsonl")
SHOW_MODEL_META = os.environ.get("SHOW_MODEL_META", "").lower() in ("1", "true", "yes")

session_start = datetime.datetime.now(datetime.timezone.utc).isoformat()

def log(msg):
    print(msg, flush=True)

def log_history(role, content):
    with open(HISTORY_FILE, "a") as f:
        f.write(json.dumps({"timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(), "role": role, "content": content}, ensure_ascii=False) + "\n")

def ollama_chat(messages):
    payload = json.dumps({"model": MODEL, "messages": messages, "stream": False}).encode()
    req = urllib.request.Request(f"{OLLAMA_URL}/api/chat", data=payload, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            data = json.loads(resp.read())
            return data.get("message", {}).get("content", ""), data.get("metrics", {})
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        return f"HTTP {e.code} from Ollama: {body[:500]}", {}
    except Exception as e:
        return f"Connection error: {e}", {}

def signal_handler(sig, frame):
    log("\n[INFO] Ctrl+C received. Exiting.")
    sys.exit(0)

signal.signal(signal.SIGINT, signal_handler)
signal.signal(signal.SIGTERM, signal_handler)

if SHOW_MODEL_META:
    try:
        with urllib.request.urlopen(f"{OLLAMA_URL}/api/show", timeout=10) as resp:
            show_data = json.loads(resp.read())
        log(f"[INFO] model={show_data.get('model','?')} | parameters={show_data.get('parameters','?')} | format={show_data.get('format','?')} | Ollama={show_data.get('ollama_version','?')} | num_ctx={show_data.get('main Layer',{}).get('num_ctx','?')}")
        log(f"[INFO] context window size: {show_data.get('main Layer',{}).get('num_ctx','?')}")
    except Exception as e:
        log(f"[WARN] could not fetch model metadata: {e}")

log(f"=== AGENT LOOP STARTED at {session_start} ===")
log(f"Model: {MODEL} | Ollama: {OLLAMA_URL} | History: {HISTORY_FILE}")
log(f"Type your message (blank lines allowed) and press Ctrl+D to send. Ctrl+C to abort current turn and exit. Empty Ctrl+D to exit.")
log("=" * 60)

messages = []
while True:
    try:
        print("\n[You] ", end="", flush=True)
        lines = []
        while True:
            try:
                line = input()
                lines.append(line)
            except EOFError:
                break
            except KeyboardInterrupt:
                log("\n[INFO] Turn aborted (Ctrl+C). Exiting.")
                sys.exit(0)
        if not lines:
            log("[INFO] Empty input (Ctrl+D with no text). Exiting loop.")
            break
        user_text = "\n".join(lines).strip()
        if not user_text:
            continue
        messages.append({"role": "user", "content": user_text})
        log_history("user", user_text)
        log(f"[INFO] turn {len(messages)//2+1}: user={len(user_text)} chars")

        response, metrics = ollama_chat(messages)
        messages.append({"role": "assistant", "content": response})
        log_history("assistant", response)
        log(f"[INFO] turn {len(messages)//2}: assistant={len(response)} chars | metrics={metrics}")
        log("---")
        print(response)
        log("---")
    except EOFError:
        log("[INFO] Empty Ctrl+D. Exiting loop.")
        break

log(f"=== AGENT LOOP ENDED at {datetime.datetime.now(datetime.timezone.utc).isoformat()} ===")
