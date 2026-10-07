#!/usr/bin/env python3
"""Fix remaining issues in ai.ts: *** markers, extra brace."""
path = 'supabase/functions/_shared/ai.ts'
with open(path, 'r') as f:
    text = f.read()

# Fix parameter declarations
text = text.replace('  apiKey: ***\n  body: GeminiRequest,\n): Promise<{ ok: boolean; status: number; json: Any; snippet: string }> {',
                     '  apiKey: string,\n  body: GeminiRequest,\n): Promise<{ ok: boolean; status: number; json: Any; snippet: string }> {')
text = text.replace('  apiKey: ***\n  body: GeminiRequest,\n  attempts: AttemptRecord[],\n  provider: string,\n): Promise<{ ok: boolean; text: string }> {',
                     '  apiKey: string,\n  body: GeminiRequest,\n  attempts: AttemptRecord[],\n  provider: string,\n): Promise<{ ok: boolean; text: string }> {')

# Fix Authorization header
text = text.replace('Authorization: *** ${apiKey}`', 'Authorization: `Bearer ${apiKey}`')

# Fix double closing brace (line 199 area)
text = text.replace('  }\n}\n\n// ---------------------------------------------------------------------------\n// Gemini with function calling',
                     '  }\n\n// ---------------------------------------------------------------------------\n// Gemini with function calling')

with open(path, 'w') as f:
    f.write(text)

# Verify
with open(path, 'r') as f:
    lines = f.readlines()

for i, line in enumerate(lines, 1):
    if '***' in line:
        print(f'STILL BAD line {i}: {line.rstrip()[:80]}')

opens = sum(l.count('{') for l in lines)
closes = sum(l.count('}') for l in lines)
print(f'Braces OK: {opens}/{closes} (diff={opens-closes})')
print(f'Lines: {len(lines)}')
