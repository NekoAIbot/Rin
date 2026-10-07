import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireUser, isAuthResponse, corsHeaders } from "./_shared/auth.ts";
import { embedMany, memoryFactText } from "./_shared/embed.ts";
import { generateWithFallback } from "./_shared/ai.ts";


serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const auth = await requireUser(req);
    if (isAuthResponse(auth)) return auth;
    const { conversation, conversationId } = await req.json();
    const userId = auth.userId;

    if (!conversation || conversation.length === 0) {
      return new Response(JSON.stringify({ success: false, error: "Missing conversation" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Missing required environment variables");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Format conversation for analysis
    const conversationText = conversation
      .map((m: any) => `${m.role === "user" ? "User" : "Aurora"}: ${m.content}`)
      .join("\n");

    // Extract semantic memory facts AND generate episodic summary in one call
    const extraction = await generateWithFallback(
      {
        systemInstruction: { parts: [{ text: `You are a cognitive memory extraction system. Analyze conversations and extract structured information about the user.

Return ONLY valid JSON matching this exact schema:
{
  "memory_facts": [
    {
      "category": "goal|interest|relationship|project|trigger|motivator|pattern|skill|value|fact",
      "key": "short label",
      "value": "the actual insight",
      "tags": ["short-tag", "another-tag"],
      "confidence": 0.0-1.0,
      "source": "explicit|inferred|observed"
    }
  ],
  "summary": {
    "text": "2-3 sentence narrative summary of the conversation",
    "emotional_tone": "joy|sadness|stress|excitement|anxiety|neutral|pride|burnout|anger|fear",
    "key_topics": ["topic1", "topic2"],
    "decisions_made": ["decision1"],
    "unresolved_threads": ["thread1"],
    "milestones": ["milestone1"]
  },
  "emotional_events": [
    {
      "emotion": "emotion_name",
      "intensity": 0.0-1.0,
      "polarity": "positive|negative|neutral",
      "context": "brief context"
    }
  ],
  "identity_signals": [
    {
      "dimension": "confidence|discipline|emotional_stability|resilience|focus|growth_mindset",
      "score_delta": -1.0 to 1.0,
      "evidence": "what showed this"
    }
  ]
}

Rules:
- Only extract what is clearly evidenced in the conversation
- Be conservative with confidence scores
- Focus on durable, long-term relevant facts (not ephemeral details)
- Max 8 memory_facts per call
- Tags: 1-4 short lowercase tokens per fact (e.g. "career", "family", "health", "python", "anxiety"). No spaces — use dashes.
- Keep summary.text concise and humanizing
- Skip categories with no evidence` }] },
        contents: [{ role: "user", parts: [{ text: `Extract memory and generate summary from this conversation:\n\n${conversationText}` }] }],
        generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
      },
      supabase,
      "memory-extract",
    );

    const rawContent = extraction.text || "";

    // Parse JSON from response
    let extracted: any = null;
    try {
      const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        extracted = JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.error("Failed to parse extraction JSON:", e, rawContent);
      return new Response(JSON.stringify({ success: false, error: "Parse error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!extracted) {
      return new Response(JSON.stringify({ success: false, error: "No data extracted" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: any = { memory_facts: 0, summary: false, emotional_patterns: 0, identity_signals: 0 };

    // Store memory facts (upsert by key+category) + embed each for semantic retrieval
    if (extracted.memory_facts && extracted.memory_facts.length > 0) {
      const validFacts = extracted.memory_facts.filter(
        (f: any) => f && f.category && f.key && f.value
      );

      // Batch-embed everything in a single request so retrieval works immediately.
      const factTexts = validFacts.map((f: any) => memoryFactText({
        category: f.category, key: f.key, value: f.value,
        tags: Array.isArray(f.tags) ? f.tags : [],
      }));
      const embeddings = await embedMany(factTexts);

      for (let i = 0; i < validFacts.length; i++) {
        const fact = validFacts[i];
        const embedding = embeddings[i];
        const tags = Array.isArray(fact.tags)
          ? fact.tags.map((t: any) => String(t).toLowerCase().trim().replace(/\s+/g, "-")).filter(Boolean).slice(0, 6)
          : [];

        const { data: existing } = await supabase
          .from("user_memory")
          .select("id, confidence, tags")
          .eq("user_id", userId)
          .eq("category", fact.category)
          .eq("key", fact.key)
          .maybeSingle();

        const patch: Record<string, unknown> = {
          value: fact.value,
          last_reinforced_at: new Date().toISOString(),
        };
        // Merge tags rather than overwriting — reinforcement adds context, not replaces.
        const mergedTags = Array.from(new Set([...(existing?.tags ?? []), ...tags]));
        if (mergedTags.length) patch.tags = mergedTags;
        if (embedding) patch.embedding = embedding;

        if (existing) {
          patch.confidence = Math.max(existing.confidence ?? 0, fact.confidence || 0.8);
          await supabase.from("user_memory").update(patch).eq("id", existing.id);
        } else {
          await supabase.from("user_memory").insert({
            user_id: userId,
            category: fact.category,
            key: fact.key,
            value: fact.value,
            tags: mergedTags,
            confidence: fact.confidence || 0.8,
            source: fact.source || "inferred",
            embedding: embedding ?? null,
          });
        }
        results.memory_facts++;
      }
    }


    // Store conversation summary
    if (extracted.summary?.text) {
      const { error: summaryError } = await supabase.from("conversation_summaries").insert({
        user_id: userId,
        conversation_id: conversationId || null,
        summary: extracted.summary.text,
        emotional_tone: extracted.summary.emotional_tone || "neutral",
        key_topics: extracted.summary.key_topics || [],
        decisions_made: extracted.summary.decisions_made || [],
        unresolved_threads: extracted.summary.unresolved_threads || [],
        milestones: extracted.summary.milestones || [],
        period_type: "conversation",
      });

      if (!summaryError) results.summary = true;
    }

    // Store emotional patterns
    if (extracted.emotional_events && extracted.emotional_events.length > 0) {
      for (const event of extracted.emotional_events) {
        if (!event.emotion) continue;
        await supabase.from("emotional_patterns").insert({
          user_id: userId,
          emotion: event.emotion,
          intensity: event.intensity || 0.5,
          polarity: event.polarity || "neutral",
          context: event.context || "",
          conversation_id: conversationId || null,
        });
        results.emotional_patterns++;
      }
    }

    // Store identity signals
    if (extracted.identity_signals && extracted.identity_signals.length > 0) {
      for (const signal of extracted.identity_signals) {
        if (!signal.dimension || signal.score_delta === undefined) continue;

        // Get last score for this dimension
        const { data: lastScore } = await supabase
          .from("identity_evolution")
          .select("score")
          .eq("user_id", userId)
          .eq("dimension", signal.dimension)
          .order("created_at", { ascending: false })
          .limit(1)
          .single();

        const baseScore = lastScore?.score || 5.0;
        const newScore = Math.max(0, Math.min(10, baseScore + signal.score_delta));

        await supabase.from("identity_evolution").insert({
          user_id: userId,
          dimension: signal.dimension,
          score: newScore,
          delta: signal.score_delta,
          note: signal.evidence || "",
          evidence: signal.evidence || "",
        });
        results.identity_signals++;
      }
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Memory extract error:", error);
    return new Response(JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
