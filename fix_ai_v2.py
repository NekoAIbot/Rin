#!/usr/bin/env python3
"""Fix ai.ts — replace *** markers, fix commas, fix brace balance."""
path = '/data/data/com.termux/files/home/projects/aurora/rin-companion-v2/supabase/functions/_shared/ai.ts'
with open(path, 'rb') as f:
    raw = f.read()

# 1. Fix L169: "  apiKey: ***\n" -> "  apiKey: string,\n"
#    The *** in display is redaction; actual bytes are fine minus the comma
#    hex: 20206170694b65793a20737472696e672c = "  apiKey: ***"
#    We need: 20206170694b65793a20737472696e672c = "  apiKey: string,"
raw = raw.replace(
    b'  apiKey: ***\n',
    b'  apiKey: string,\n'
)

# 2. Fix L185: Authorization header - replace literal *** with Backtick Bearer
#    hex: 2020...417574686f72697a6174696f6e3a2060426561726572...
#    Current: "        Authorization: *** ${apiKey}`"
#    Target:  "        Authorization: `Bearer ${apiKey}`"
raw = raw.replace(
    b'Authorization: *** ${apiKey}`',
    b'Authorization: `Bearer ${apiKey}`'
)

# 3. Fix L170 (empty line between apiKey and body params)
#    Remove the blank line so params are contiguous
raw = raw.replace(
    b'  apiKey: string,\n\n  body: GeminiRequest,\n',
    b'  apiKey: string,\n  body: GeminiRequest,\n'
)

# 4. Fix L331: tryOpenAI also has apiKey param
raw = raw.replace(
    b'  apiKey: ***\n',
    b'  apiKey: string,\n'
)

# 5. Fix brace balance: remove the duplicate closing brace before "// Gemini with function calling"
#    Currently: "  }\n}\n\n// Gemini with function calling"
#    Should be: "  }\n\n// Gemini with function calling"
raw = raw.replace(
    b'  }\n}\n\n// Gemini with function calling',
    b'  }\n\n// Gemini with function calling'
)

with open(path, 'wb') as f:
    f.write(raw)

# Verify
with open(path, 'rb') as f:
    v = f.read()

opens = v.count(b'{')
closes = v.count(b'}')
print(f"Braces: {opens}/{closes} diff={opens-closes}")
print(f"File size: {len(v)} bytes")

# Check for remaining ***
if b'\x2a\x2a\x2a' in v:
    print("WARNING: Literal *** still present!")
    for i, line in enumerate(v.split(b'\n')):
        if b'\x2a\x2a\x2a' in line:
            print(f"  L{i+1}: {line!r}")
else:
    print("No literal *** markers found")

# Show key lines
lines = v.split(b'\n')
for line_num in [167, 168, 169, 170, 171, 172, 184, 185, 329, 330, 331, 332]:
    if line_num <= len(lines):
        printable = b''.join(bytes([b]) if 0x20 <= b <= 0x7e else b'?' for b in lines[line_num-1])
        print(f"L{line_num}: {printable.decode('utf-8', errors='replace')}")
