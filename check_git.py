#!/usr/bin/env python3
"""Compare two commits' file contents without using git diff (avoids shallow issue)."""
import subprocess
import sys

def cat_file(commit: str, path: str) -> str:
    r = subprocess.run(
        ["git", "cat-file", "-p", f"{commit}:{path}"],
        capture_output=True, text=True, cwd="/data/data/com.termux/files/home/projects/aurora/rin-companion-v2"
    )
    if r.returncode != 0:
        return f"ERROR (rc={r.returncode}): {r.stderr.strip()}"
    return r.stdout

def grep_count(text: str, patterns: list[str]) -> int:
    import re
    count = 0
    for line in text.splitlines():
        for p in patterns:
            if re.search(p, line):
                count += 1
                break
    return count

def show_diff_lines(old: str, new: str, label_old: str, label_new: str):
    """Simple unified-diff-style line printer for small files."""
    old_lines = old.splitlines()
    new_lines = new.splitlines()
    max_lines = max(len(old_lines), len(new_lines))
    for i in range(max_lines):
        o = old_lines[i] if i < len(old_lines) else None
        n = new_lines[i] if i < len(new_lines) else None
        if o == n:
            continue
        if o is not None:
            print(f"  - {label_old} L{i+1}: {o}")
        if n is not None:
            print(f"  + {label_new} L{i+1}: {n}")

if __name__ == "__main__":
    c1 = "1a9a5b4c458589f8b0a50ddfcd33751de9c384b4"
    c2 = "8ef844ad306733ced3d47d95a34c372657b5d285"

    files = [
        ("supabase/functions/telegram-webhook/index.ts", "index.ts"),
        ("supabase/functions/_shared/nl-actions.ts", "nl-actions.ts"),
        ("supabase/functions/_shared/passive-memory.ts", "passive-memory.ts"),
        ("supabase/functions/_shared/embed.ts", "embed.ts"),
        ("supabase/functions/_shared/supabase-shim.ts", "supabase-shim.ts"),
    ]

    patterns_lovable = ["LOVABLE_API_KEY", "ai\\.gateway\\.lovable\\.dev", "lovable"]
    patterns_gemini = ["geminiGenerate", "model-fallback", "model-fallback.ts"]

    print("=" * 70)
    print("STEP 2 INVESTIGATION: c1 (root) vs c2 (HEAD)")
    print("=" * 70)

    for fpath, short in files:
        print(f"\n--- {short} ---")
        t1 = cat_file(c1, fpath)
        t2 = cat_file(c2, fpath)

        if t1.startswith("ERROR") or t2.startswith("ERROR"):
            print(f"  cat-file error: {t1} / {t2}")
            continue

        c1_love = grep_count(t1, patterns_lovable)
        c1_gem = grep_count(t1, patterns_gemini)
        c2_love = grep_count(t2, patterns_lovable)
        c2_gem = grep_count(t2, patterns_gemini)

        changed = t1 != t2
        print(f"  c1 (root)  Lovable refs: {c1_love}, Gemini refs: {c1_gem}")
        print(f"  c2 (HEAD)  Lovable refs: {c2_love}, Gemini refs: {c2_gem}")
        print(f"  Changed: {changed}")

        if changed and (len(t1) < 2000 and len(t2) < 2000):
            print("  Diff (first 60 changed lines):")
            show_diff_lines(t1, t2, "c1", "c2")
            if len(t1) >= 2000 or len(t2) >= 2000:
                print(f"    (files too large for full diff: c1={len(t1)}c, c2={len(t2)}c)")
        elif not changed:
            print("  (identical content)")

    print("\n" + "=" * 70)
    print("STEP 1: Trace Lovable→Gemini transition (walk c1 parents)")
    print("=" * 70)

    # Walk c1's ancestry via parent pointers
    def get_parents(commit: str) -> list[str]:
        r = subprocess.run(
            ["git", "cat-file", "-p", commit],
            capture_output=True, text=True,
            cwd="/data/data/com.termux/files/home/projects/aurora/rin-companion-v2"
        )
        parents = []
        for line in r.stdout.splitlines():
            if line.startswith("parent "):
                parents.append(line.split()[1])
        return parents

    def get_commit_subject(commit: str) -> str:
        r = subprocess.run(
            ["git", "cat-file", "-p", commit],
            capture_output=True, text=True,
            cwd="/data/data/com.termux/files/home/projects/aurora/rin-companion-v2"
        )
        for line in r.stdout.splitlines():
            if line.startswith("subject "):
                return line.split(" ", 1)[1]
            if line.startswith("title "):
                return line.split(" ", 1)[1]
        return "(no subject)"
    
    def describe_commit(commit: str):
        r = subprocess.run(
            ["git", "cat-file", "-p", commit],
            capture_output=True, text=True,
            cwd="/data/data/com.termux/files/home/projects/aurora/rin-companion-v2"
        )
        subject = "(unknown)"
        author = ""
        for line in r.stdout.splitlines():
            if line.startswith("author "):
                parts = line.split()
                if len(parts) >= 2:
                    author = parts[1]
            if line.startswith("subject ") or line.startswith("title "):
                subject = line.split(" ", 1)[1]
        return author, subject

    visited = set()
    queue = [c1]
    found_gemini = None
    
    while queue:
        commit = queue.pop(0)
        if commit in visited:
            continue
        visited.add(commit)
        
        parents = get_parents(commit)
        author, subject = describe_commit(commit)
        
        # Check index.ts in this commit
        t = cat_file(commit, "supabase/functions/telegram-webhook/index.ts")
        if not t.startswith("ERROR"):
            love = grep_count(t, patterns_lovable)
            gem = grep_count(t, patterns_gemini)
            is_clean = love == 0
            has_gem = gem > 0
            
            marker = ""
            if is_clean and has_gem:
                marker = " <<< GEMINI-CLEAN (candidate for recovery)"
                if found_gemini is None:
                    found_gemini = commit
            elif is_clean:
                marker = " (clean but no Gemini refs)"
            elif has_gem:
                marker = " (has Gemini refs but also Lovable)"
            else:
                marker = " (Lovable-based)"
            
            print(f"  {commit[:12]}  parent={parents[0][:12] if parents else 'none'}  love={love} gem={gem}  {author}  {subject}{marker}")
        
        # Enqueue parents (reversed for chronological order)
        for p in reversed(parents):
            if p not in visited:
                queue.append(p)
                
        # Safety: shallow repo, don't go too deep
        if len(visited) > 15:
            print("  ... (stopping at 15 commits — shallow boundary)")
            break

    print(f"\n  Most recent Gemini-clean commit: {found_gemini[:12] if found_gemini else 'NONE FOUND'}")
