import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireUser, isAuthResponse, corsHeaders } from "./_shared/auth.ts";
import { generateWithFallback } from "./_shared/ai.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const auth = await requireUser(req);
    if (isAuthResponse(auth)) return auth;
    const userId = auth.userId;

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const insights: Array<{ type: string; title: string; message: string; priority: number }> = [];

    // 1. Check mood decline - last 10 emotional patterns
    const { data: emotions } = await supabase
      .from("emotional_patterns")
      .select("emotion, polarity, intensity, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(10);

    if (emotions && emotions.length >= 5) {
      const recent5 = emotions.slice(0, 5);
      const negCount = recent5.filter((e: any) => e.polarity === "negative").length;
      const avgIntensity = recent5.reduce((s: number, e: any) => s + (e.intensity || 0.5), 0) / 5;

      if (negCount >= 3) {
        insights.push({
          type: "mood_decline",
          title: "I've noticed a shift in your mood",
          message: `Your recent conversations show more ${recent5.map((e: any) => e.emotion).filter((e: string) => ["stress", "anxiety", "sadness", "frustration", "burnout"].includes(e))[0] || "stress"} than usual. Want to talk about what's going on?`,
          priority: 8,
        });
      }

      if (avgIntensity > 0.75) {
        insights.push({
          type: "high_intensity",
          title: "You've been going through a lot",
          message: "Your emotional intensity has been elevated recently. Would a calming exercise or reflection help right now?",
          priority: 7,
        });
      }
    }

    // 2. Check forgotten goals - goals not reinforced in 7+ days
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: staleGoals } = await supabase
      .from("user_memory")
      .select("key, value, last_reinforced_at")
      .eq("user_id", userId)
      .eq("category", "goal")
      .lt("last_reinforced_at", weekAgo)
      .limit(3);

    if (staleGoals && staleGoals.length > 0) {
      const goalNames = staleGoals.map((g: any) => g.key).join(", ");
      insights.push({
        type: "forgotten_goal",
        title: "Let's revisit your goals",
        message: `You mentioned wanting to work on ${goalNames}. It's been a while since we discussed ${staleGoals.length > 1 ? "them" : "it"}. Want to check in on your progress?`,
        priority: 6,
      });
    }

    // 3. Check behavioral patterns - detect from recent summaries
    const { data: recentSummaries } = await supabase
      .from("conversation_summaries")
      .select("summary, key_topics, unresolved_threads, decisions_made, emotional_tone")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(10);

    if (recentSummaries && recentSummaries.length >= 3) {
      const summaryText = recentSummaries.map((s: any) => s.summary).join("\n");
      const unresolvedAll = recentSummaries.flatMap((s: any) => s.unresolved_threads || []);

      // Detect patterns using AI
      try {
        const patternAi = await generateWithFallback(
          {
            systemInstruction: { parts: [{ text: `Analyze these conversation summaries for behavioral patterns. Return ONLY valid JSON:
{
  "patterns": [
    {
      "type": "procrastination|decision_paralysis|overcommitment|energy_fluctuation|avoidance",
      "description": "brief description of the pattern",
      "severity": "mild|moderate|significant",
      "suggestion": "gentle, actionable suggestion"
    }
  ],
  "identity_reinforcement": "A single encouraging sentence about growth you notice, or null if none"
}
Only include clear, evidence-based patterns. Max 3 patterns.` }] },
            contents: [{ role: "user", parts: [{ text: `Summaries:\n${summaryText}\n\nUnresolved threads: ${unresolvedAll.join("; ")}` }] }],
            generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
          },
          supabase,
          "proactive-insights",
        );

        if (patternAi.text) {
          const raw = patternAi.text;
          const jsonMatch = raw.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);

            // Store behavioral insights
            if (parsed.patterns) {
              for (const p of parsed.patterns) {
                // Check if similar pattern already exists (avoid duplicates)
                const { data: existing } = await supabase
                  .from("behavioral_insights")
                  .select("id")
                  .eq("user_id", userId)
                  .eq("pattern_type", p.type)
                  .eq("acknowledged", false)
                  .limit(1);

                if (!existing || existing.length === 0) {
                  await supabase.from("behavioral_insights").insert({
                    user_id: userId,
                    pattern_type: p.type,
                    description: p.description,
                    severity: p.severity,
                    suggestion: p.suggestion,
                    detected_from: "conversation_analysis",
                  });

                  insights.push({
                    type: "pattern_alert",
                    title: `Pattern noticed: ${p.type.replace(/_/g, " ")}`,
                    message: `${p.description} ${p.suggestion}`,
                    priority: p.severity === "significant" ? 8 : p.severity === "moderate" ? 6 : 4,
                  });
                }
              }
            }

            if (parsed.identity_reinforcement) {
              insights.push({
                type: "identity_reinforcement",
                title: "Growth reflection",
                message: parsed.identity_reinforcement,
                priority: 5,
              });
            }
          }
        }
      } catch (e) {
        console.error("Pattern detection failed:", e);
      }
    }

    // 4. Check for unresolved threads across conversations
    if (recentSummaries) {
      const allUnresolved = recentSummaries.flatMap((s: any) => s.unresolved_threads || []);
      const uniqueUnresolved = [...new Set(allUnresolved)].slice(0, 2);
      if (uniqueUnresolved.length > 0) {
        insights.push({
          type: "unresolved_thread",
          title: "Open threads from our conversations",
          message: `We left some things open: ${uniqueUnresolved.join("; ")}. Want to pick any of these up?`,
          priority: 4,
        });
      }
    }

    // Store unsurfaced insights
    for (const insight of insights) {
      const { data: existing } = await supabase
        .from("proactive_insights")
        .select("id")
        .eq("user_id", userId)
        .eq("insight_type", insight.type)
        .eq("is_dismissed", false)
        .eq("is_surfaced", false)
        .limit(1);

      if (!existing || existing.length === 0) {
        await supabase.from("proactive_insights").insert({
          user_id: userId,
          insight_type: insight.type,
          title: insight.title,
          message: insight.message,
          priority: insight.priority,
          expires_at: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days
        });
      }
    }

    // Fetch top unsurfaced insights to return
    const { data: pendingInsights } = await supabase
      .from("proactive_insights")
      .select("*")
      .eq("user_id", userId)
      .eq("is_surfaced", false)
      .eq("is_dismissed", false)
      .order("priority", { ascending: false })
      .limit(3);

    return new Response(JSON.stringify({ insights: pendingInsights || [] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Proactive insights error:", error);
    return new Response(JSON.stringify({ insights: [], error: error instanceof Error ? error.message : "Unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
