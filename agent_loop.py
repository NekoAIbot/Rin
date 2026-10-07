#!/usr/bin/env python3
"""
Persistent agent loop: read multi-line messages from stdin, call a local Ollama
model, print the response, and repeat.  Logs every turn to a JSONL file.

Input termination:
  - Ctrl+D (EOF) sends the accumulated message (even if it contains blank lines).
  - An empty Ctrl+D (no prior input) exits the loop.
  - Ctrl+C at any point prints a newline and exits immediately.

Requirements:
  - Ollama running on http://localhost:11434
  - Model "solar-pro4:latest" pulled (or override via MODEL env var)
"""

from __future__ import annotations

import json
import os
import signal
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
MODEL: str = os.environ.get("MODEL", "solar-pro4:latest")
OLLAMA_URL: str = os.environ.get("OLLAMA_URL", "http://localhost:11434/api/chat")
HISTORY_FILE: str = os.environ.get("HISTORY_FILE", "conversation_history.jsonl")
REQUEST_TIMEOUT: int = int(os.environ.get("REQUEST_TIMEOUT", "120"))

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def log_message(role: str, content: str) -> None:
    """Append a timestamped role/content pair to the JSONL log."""
    entry: Dict[str, Any] = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "role": role,
        "content": content,
    }
    with open(HISTORY_FILE, "a", encoding="utf-8") as fh:
        fh.write(json.dumps(entry, ensure_ascii=False) + "\n")


def call_ollama(messages: List[Dict[str, str]]) -> str:
    """Send the conversation history to Ollama and return the assistant reply."""
    payload: bytes = json.dumps(
        {"model": MODEL, "messages": messages, "stream": False}, ensure_ascii=False
    ).encode("utf-8")

    req = urllib.request.Request(
        OLLAMA_URL,
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT) as resp:
            body = json.loads(resp.read().decode("utf-8"))
            # Ollama /api/chat returns {"message": {"role": "...", "content": "..."}}
            return body.get("message", {}).get("content", "[empty response]")
    except urllib.error.HTTPError as exc:
        try:
            detail = exc.read().decode("utf-8", errors="replace")
        except Exception:
            detail = "(unable to read error body)"
        return f"[HTTP {exc.code}] {detail}"
    except urllib.error.URLError as exc:
        return f"[connection error] {exc.reason}"
    except TimeoutError:
        return "[timeout] Ollama did not respond within the request window"
    except Exception as exc:
        return f"[error] {type(exc).__name__}: {exc}"


def print_separator() -> None:
    print("-" * 60)


# ---------------------------------------------------------------------------
# Signal handling
# ---------------------------------------------------------------------------

_running = True


def _handle_sigint(signum: int, frame: Any) -> None:
    global _running
    _running = False
    # print newline to move below the current input line
    print(file=sys.stderr)


signal.signal(signal.SIGINT, _handle_sigint)


# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------

def main() -> None:
    print(
        f"Agent loop starting.  Model: {MODEL}  |  Ollama: {OLLAMA_URL}\n"
        f"Logging to: {HISTORY_FILE}\n"
        f"Send a message: type your text (blank lines allowed), then press Ctrl+D.\n"
        f"Press Ctrl+C to exit at any time.\n"
    )
    print_separator()
    sys.stdout.flush()

    conversation: List[Dict[str, str]] = []

    while _running:
        # --- read one multi-line message ------------------------------------
        print("> ", end="", flush=True)
        lines: List[str] = []
        eof = False

        while _running and not eof:
            try:
                line = input()
            except EOFError:
                eof = True
                break
            except KeyboardInterrupt:
                # Ctrl+C during input → exit immediately
                print(file=sys.stderr)
                sys.exit(0)
            lines.append(line)

        if not _running:
            break

        # Empty Ctrl+D → exit cleanly
        if not lines:
            print("Exiting (empty input).")
            break

        user_message: str = "\n".join(lines)
        print(f"\n[input received, {len(user_message)} chars]\n")

        # --- append user turn ------------------------------------------------
        conversation.append({"role": "user", "content": user_message})
        log_message("user", user_message)

        # --- call the model --------------------------------------------------
        print(f"Calling {MODEL} …", end=" ", flush=True)
        assistant_message: str = call_ollama(conversation)
        print("done.\n")

        conversation.append({"role": "assistant", "content": assistant_message})
        log_message("assistant", assistant_message)

        # --- display ---------------------------------------------------------
        print_separator()
        print(assistant_message)
        print_separator()
        sys.stdout.flush()

    print("Agent loop ended.")


if __name__ == "__main__":
    main()
