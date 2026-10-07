#!/usr/bin/env python3
"""Fix remaining *** markers in ai.ts"""
with open('supabase/functions/_shared/ai.ts', 'r') as f:
    content = f.read()

# Show what we're dealing with
print("Before fixes:")
print(f"  apiKey: *** count: {content.count('apiKey: ***')}")
print(f"  apiKey: string, count: {content.count('apiKey: string,')}")
print(f"  Authorization: *** count: {content.count('Authorization: ***')}")
print(f"  Authorization: Bearer count: {content.count('Authorization: `Bearer')}")
print(f"  Braces: {content.count('{')}/{content.count('}')} diff={content.count('{')-content.count('}')}")

# Fix 1: openaiFetch parameter - line 169
# The actual file has: "apiKey: ***\n  body: GeminiRequest,\n): Promise..."
old1 = "apiKey: ***\n  body: GeminiRequest,\n): Promise<{ ok: boolean; status: number; json: Any; snippet: string }> {"
new1 = "apiKey: string,\n  body: GeminiRequest,\n): Promise<{ ok: boolean; status: number; json: Any; snippet: string }> {"
if old1 in content:
    content = content.replace(old1, new1)
    print("FIXED openaiFetch param")
else:
    print("MISS openaiFetch param")
    # Find what's actually there
    idx = content.find("apiKey: ***")
    print(f"  Found at position {idx}: {repr(content[idx:idx+100])}")

# Fix 2: tryOpenAI parameter - line 330
old2 = "apiKey: ***\n  body: GeminiRequest,\n  attempts: AttemptRecord[],\n  provider: string,\n): Promise<{ ok: boolean; text: string }> {"
new2 = "apiKey: string,\n  body: GeminiRequest,\n  attempts: AttemptRecord[],\n  provider: string,\n): Promise<{ ok: boolean; text: string }> {"
if old2 in content:
    content = content.replace(old2, new2)
    print("FIXED tryOpenAI param")
else:
    print("MISS tryOpenAI param")
    idx = content.find("apiKey: ***")
    if idx > 100:  # second occurrence
        print(f"  Found at position {idx}: {repr(content[idx:idx+100])}")

# Fix 3: Authorization header - line 184
old3 = "Authorization: *** ${apiKey}`"
new3 = "Authorization: `Bearer ${apiKey}`"
if old3 in content:
    content = content.replace(old3, new3)
    print("FIXED Authorization header")
else:
    print("MISS Authorization header")
    idx = content.find("Authorization: ***")
    print(f"  Found at position {idx}: {repr(content[idx:idx+60])}")

# Fix 4: Double closing brace
old4 = "  }\n}\n\n// ---------------------------------------------------------------------------\n// Gemini with function calling"
new4 = "  }\n\n// ---------------------------------------------------------------------------\n// Gemini with function calling"
if old4 in content:
    content = content.replace(old4, new4)
    print("FIXED double closing brace")
else:
    print("MISS double closing brace")

with open('supabase/functions/_shared/ai.ts', 'w') as f:
    f.write(content)

print("\nAfter fixes:")
print(f"  apiKey: *** count: {content.count('apiKey: ***')}")
print(f"  apiKey: string, count: {content.count('apiKey: string,')}")
print(f"  Authorization: *** count: {content.count('Authorization: ***')}")
print(f"  Authorization: Bearer count: {content.count('Authorization: `Bearer')}")
print(f"  Braces: {content.count('{')}/{content.count('}')} diff={content.count('{')-content.count('}')}")
