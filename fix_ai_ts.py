#!/usr/bin/env python3
"""Fix ai.ts — replace *** in apiKey and Authorization, fix double brace."""
path = 'supabase/functions/_shared/ai.ts'
with open(path, 'r') as f:
    text = f.read()

# Count before
print(f"Before: *** count={text.count('***')}, braces={text.count('{')}/{text.count('}')}")

# Replace *** in apiKey parameter (both occurrences)
# Pattern: "apiKey: ***\n" -> "apiKey: string,\n"
text = text.replace('apiKey: ***\n', 'apiKey: string,\n')

# Replace *** in Authorization header
# Pattern: "Authorization: *** ${apiKey}`" -> "Authorization: `Bearer ${apiKey}`"
text = text.replace('Authorization: *** ${apiKey}`', 'Authorization: `Bearer ${apiKey}`')

# Fix double closing brace: "  }\n}\n\n// ---" -> "  }\n\n// ---"
text = text.replace('  }\n}\n\n// ---------------------------------------------------------------------------\n// Gemini with function calling',
                    '  }\n\n// ---------------------------------------------------------------------------\n// Gemini with function calling')

with open(path, 'w') as f:
    f.write(text)

# Count after
print(f"After:  *** count={text.count('***')}, braces={text.count('{')}/{text.count('}')}")

# Verify key lines
for i, line in enumerate(text.split('\n'), 1):
    if i in [169, 170, 184, 329, 330] or '***' in line:
        print(f"  L{i}: {line[:80]}")
