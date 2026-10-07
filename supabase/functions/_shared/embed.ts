// Shared helper for turning text into embedding vectors via Gemini.
// Uses gemini-embedding-001 with outputDimensionality 768 to match the
// vector(768) column in user_memory.

import { embed, EmbedResult } from "./ai.ts";

export const EMBEDDING_DIMS = 768;

/** Embed a single string. Returns null on failure so callers can no-op gracefully. */
export async function embedOne(text: string): Promise<number[] | null> {
  const result = await embed(text);
  if (!result.ok || !result.values) {
    console.error("embedOne failed:", result.snippet);
    return null;
  }
  return result.values;
}

/** Embed many strings. Returns array of vectors (or null for failures). */
export async function embedMany(texts: string[]): Promise<Array<number[] | null>> {
  const results: Array<number[] | null> = [];
  for (const t of texts) {
    const clean = (t || "").trim();
    if (!clean) {
      results.push(null);
      continue;
    }
    const result = await embed(clean);
    if (!result.ok || !result.values) {
      results.push(null);
      continue;
    }
    results.push(result.values);
  }
  return results;
}

/** Turn a memory fact into the canonical string we embed. */
export function memoryFactText(fact: { category?: string; key?: string; value?: string; tags?: string[] }): string {
  const tags = (fact.tags && fact.tags.length ? ` [${fact.tags.join(", ")}]` : "");
  return `(${fact.category || "fact"}) ${fact.key || ""}: ${fact.value || ""}${tags}`.trim();
}
