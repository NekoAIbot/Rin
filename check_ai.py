#!/usr/bin/env python3
"""Show exact content of ai.ts lines 169, 184, 330"""
with open('/data/data/com.termux/files/home/projects/aurora/rin-companion-v2/supabase/functions/_shared/ai.ts', 'r') as f:
    lines = f.readlines()

print(f"Total lines: {len(lines)}")
print()

# Show lines around the problem areas
for line_num in [169, 170, 171, 183, 184, 185, 198, 199, 200, 201, 202, 329, 330, 331, 332]:
    if line_num <= len(lines):
        print(f"L{line_num}: {lines[line_num-1].rstrip()!r}")
    else:
        print(f"L{line_num}: (out of range)")

print()
print("Brace scan:")
opens = 0
closes = 0
for i, line in enumerate(lines, 1):
    opens += line.count('{')
    closes += line.count('}')
print(f"Total: {opens} open, {closes} close, diff={opens-closes}")
