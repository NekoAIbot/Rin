#!/usr/bin/env python3
"""Fix ai.ts — replace literal *** markers and fix brace imbalance."""
import sys

path = 'supabase/functions/_shared/ai.ts'
with open(path, 'rb') as f:
    raw = f.read()

text = raw.decode('utf-8')

fixes = [
    # openaiFetch param
    ('apiKey: ***\n  body: GeminiRequest,\n): Promise<{ ok: boolean; status: number; json: Any; snippet: string }> {',
     'apiKey: string,\n  body: GeminiRequest,\n): Promise<{ ok: boolean; status: number; json: Any; snippet: string }> {'),
    # tryOpenAI param
    ('apiKey: ***\n  body: GeminiRequest,\n  attempts: AttemptRecord[],\n  provider: string,\n): Promise<{ ok: boolean; text: string }> {',
     'apiKey: string,\n  body: GeminiRequest,\n  attempts: AttemptRecord[],\n  provider: string,\n): Promise<{ ok: boolean; text: string }> {'),
]

for old, new in fixes:
    if old in text:
        text = text.replace(old, new)
        print(f'FIXED param: {repr(old[:40])}')
    else:
        print(f'MISS param: {repr(old[:40])}')

# Authorization header — search by the unique surrounding context
auth_marker = 'Authorization: *** ${apiKey}`'
if auth_marker in text:
    text = text.replace(auth_marker, 'Authorization: `Bearer ${apiKey}`')
    print('FIXED Authorization header')
else:
    # Try to find it byte-by-byte
    idx = text.find('Authorization:')
    if idx >= 0:
        end = text.find('\n', idx)
        line = text[idx:end]
        print(f'Auth line found: {repr(line)}')
        # The issue: space before backtick. Fix: "Authorization:  `Bearer" -> "Authorization: `Bearer"
        fixed_line = line.replace('Authorization:  `Bearer', 'Authorization: `Bearer')
        if fixed_line != line:
            text = text[:idx] + fixed_line + text[end:]
            print('FIXED Authorization (space before backtick)')
        else:
            print('Auth line OK, no fix needed')

# Fix double closing brace
double_brace = '  }\n}\n\n// ---------------------------------------------------------------------------\n// Gemini with function calling'
if double_brace in text:
    text = text.replace(double_brace, '  }\n\n// ---------------------------------------------------------------------------\n// Gemini with function calling')
    print('FIXED double brace')
else:
    print('Double brace pattern not found')

with open(path, 'w', encoding='utf-8') as f:
    f.write(text)

# Verify
with open(path, 'r') as f:
    lines = f.readlines()

bad = [(i+1, l.rstrip()[:80]) for i, l in enumerate(lines) if '***' in l]
print(f'\n*** markers remaining: {len(bad)}')
for ln, txt in bad:
    print(f'  L{ln}: {txt}')

opens = sum(l.count('{') for l in lines)
closes = sum(l.count('}') for l in lines)
print(f'Braces: {opens}/{closes} (diff={opens-closes})')
print(f'Lines: {len(lines)}')
