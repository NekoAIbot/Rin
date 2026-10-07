#!/usr/bin/env python3
"""Fix ai.ts — replace *** markers, fix commas, fix brace balance."""
path = 'supabase/functions/_shared/ai.ts'
with open(path, 'r') as f:
    lines = f.readlines()

fixes = 0

# Fix L169 (index 168): "  apiKey: ***" -> "  apiKey: string,"
if '***' in lines[168]:
    lines[168] = '  apiKey: string,\n'
    fixes += 1
    print(f"FIXED L169: apiKey param (openaiFetch)")

# Fix L184 (index 183): Authorization header  
if '***' in lines[183]:
    lines[183] = '        Authorization: `Bearer ${apiKey}`,\n'
    fixes += 1
    print(f"FIXED L184: Authorization header")

# Fix L329 (index 328): apiKey param (tryOpenAI)
if '***' in lines[328]:
    lines[328] = '  apiKey: string,\n'
    fixes += 1
    print(f"FIXED L329: apiKey param (tryOpenAI)")

# Check for double closing brace (line 199-200)
# If L198="}", L199="}", L200="// comment" -> remove L199
if len(lines) >= 200 and lines[197].strip() == '}' and lines[198].strip() == '}' and lines[199].strip().startswith('//'):
    del lines[198]
    fixes += 1
    print(f"FIXED: removed duplicate closing brace at L199")

with open(path, 'w') as f:
    f.writelines(lines)

# Verify
with open(path, 'r') as f:
    text = f.read()

print(f"\nResults ({fixes} fixes):")
print(f"  Braces: {text.count('{')}/{text.count('}')} diff={text.count('{')-text.count('}')}")
print(f"  *** markers: {text.count('***')}")
print(f"  apiKey: string, occurrences: {text.count('apiKey: string,')}")
print(f"  Authorization: `Bearer occurrences: {text.count('Authorization: `Bearer')}")
