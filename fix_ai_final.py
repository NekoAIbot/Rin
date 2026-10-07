#!/usr/bin/env python3
"""Fix literal *** markers and brace imbalance in ai.ts"""
path = '/data/data/com.termux/files/home/projects/aurora/rin-companion-v2/supabase/functions/_shared/ai.ts'

with open(path, 'r') as f:
    text = f.read()

print(f"Before: *** count={text.count('***')}, braces={text.count('{')}/{text.count('}')}")

# Fix 1: apiKey: *** in openaiFetch parameter (line 169)
text = text.replace('  apiKey: ***\n  body: GeminiRequest,\n): Promise<{ ok: boolean; status: number; json: Any; snippet: string }> {',
                    '  apiKey: string,\n  body: GeminiRequest,\n): Promise<{ ok: boolean; status: number; json: Any; snippet: string }> {')

# Fix 2: apiKey: *** in tryOpenAI parameter (line 329)
text = text.replace('  apiKey: ***\n  body: GeminiRequest,\n  attempts: AttemptRecord[],\n  provider: string,\n): Promise<{ ok: boolean; text: string }> {',
                    '  apiKey: string,\n  body: GeminiRequest,\n  attempts: AttemptRecord[],\n  provider: string,\n): Promise<{ ok: boolean; text: string }> {')

# Fix 3: Authorization header (line 184)
text = text.replace('        Authorization: *** ${apiKey}`,\n',
                    '        Authorization: `Bearer ${apiKey}`,\n')

# Fix 4: double closing brace before function calling section
text = text.replace('  }\n}\n\n// ---------------------------------------------------------------------------\n// Gemini with function calling',
                    '  }\n\n// ---------------------------------------------------------------------------\n// Gemini with function calling')

with open(path, 'w') as f:
    f.write(text)

print(f"After:  *** count={text.count('***')}, braces={text.count('{')}/{text.count('}')}")

# Verify specific lines
lines = text.split('\n')
for line_num in [169, 170, 184, 329, 330]:
    if line_num <= len(lines):
        print(f"L{line_num}: {lines[line_num-1][:80]}")
