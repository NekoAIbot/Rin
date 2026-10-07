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
    const { type = "daily" } = await req.json().catch(() => ({}));
    const userId = auth.userId;

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Determine period
    const now = new Date();
    let periodStart: Date;
    if (type === "weekly") {
      periodStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    } else {
      periodStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }

    // Fetch conversation summaries from the period
    const { data: summaries } = await supabase
      .from("conversation_summaries")
      .select("*")
      .eq("user_id", userId)
      .gte("created_at", periodStart.toISOString())
      .order("created_at", { ascending: true });

    // Fetch emotional patterns from the period
    const { data: emotions } = await supabase
      .from("emotional_patterns")
      .select("*")
      .eq("user_id", userId)
      .gte("created_at", periodStart.toISOString())
      .order("created_at", { ascending: true });

    // Fetch goals
    const { data: goals } = await supabase
      .from("user_memory")
      .select("key, value")
      .eq("user_id", userId)
      .eq("category", "goal")
      .limit(10);

    // Fetch identity evolution
    const { data: identity } = await supabase
      .from("identity_evolution")
      .select("*")
      .eq("user_id", userId)
      .gte("created_at", periodStart.toISOString())
      .order("created_at", { ascending: false });

    // Fetch behavioral insights
    const { data: patterns } = await supabase
      .from("behavioral_insights")
      .select("*")
      .eq("user_id", userId)
      .gte("created_at", periodStart.toISOString());

    // Build context for AI summary
    const summaryTexts = (summaries || []).map((s: any) => s.summary).join("\n");
    const emotionSummary = (emotions || []).map((e: any) => `${e.emotion} (${e.polarity})`).join(", ");
    const goalsList = (goals || []).map((g: any) => `${g.key}: ${g.value}`).join("\n");
    const growthNotes = (identity || []).map((i: any) => `${i.dimension}: ${i.delta > 0 ? "+" : ""}${i.delta} — ${i.note}`).join("\n");
    const patternNotes = (patterns || []).map((p: any) => `${p.pattern_type}: ${p.description}`).join("\n");

    const prompt = type === "weekly"
      ? `Generate a thoughtful Weekly Strategy Reset for the user. Include:
1. A warm opening acknowledging the week
2. Key accomplishments and milestones from conversations
3. Emotional journey summary (highs and lows)
4. Goal progress review
5. Growth highlights (identity evolution)
6. Behavioral patterns noticed
7. Suggested intentions for the coming week
8. An encouraging closing message

Return ONLY valid JSON:
{
  "summary": "The full narrative summary text (use markdown for formatting)",
  "accomplishments": ["list of accomplishments"],
  "goals_reviewed": ["goal status updates"],
  "intentions": ["suggested intentions for next week"],
  "mood_trend": "overall mood description",
  "growth_highlights": ["growth observations"]
}`
      : `Generate a reflective Daily Recap for the user. Include:
1. Brief greeting appropriate for time of day
2. Key themes from today's conversations
3. Emotional check-in summary
4. Any decisions made or progress noted
5. A gentle prompt for reflection
6. Brief encouragement

Return ONLY valid JSON:
{
  "summary": "The full narrative text (use markdown for formatting)",
  "accomplishments": ["today's wins"],
  "goals_reviewed": ["goals touched on today"],
  "intentions": ["optional tomorrow intentions"],
  "mood_trend": "today's mood arc",
  "growth_highlights": ["growth moments"]
}`;

    const ai = await generateWithFallback(
      {
        systemInstruction: { parts: [{ text: prompt }] },
        contents: [
          {
            role: "user",
            parts: [{ text: `Conversation summaries:\n${summaryTexts || "No conversations today"}\n\nEmotions: ${emotionSummary || "None tracked"}\n\nGoals:\n${goalsList || "No goals set"}\n\nGrowth:\n${growthNotes || "No growth data"}\n\nPatterns:\n${patternNotes || "None detected"}` }],
          },
        ],
        generationConfig: { temperature: 0.7, responseMimeType: "application/json" },
      },
      supabase,
      "daily-summary",
    );
    const rawContent = ai.text || "";
    let result: any = null;

    try {
      const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) result = JSON.parse(jsonMatch[0]);
    } catch (e) {
      console.error("Parse error:", e);
    }

    if (!result) {
      result = {
        summary: rawContent || "No summary could be generated for this period.",
        accomplishments: [],
        goals_reviewed: [],
        intentions: [],
        mood_trend: "unknown",
        growth_highlights: [],
      };
    }

    // Store the ritual summary
    await supabase.from("ritual_summaries").insert({
      user_id: userId,
      ritual_type: type === "weekly" ? "weekly_reset" : "daily_recap",
      summary: result.summary,
      goals_reviewed: result.goals_reviewed || [],
      accomplishments: result.accomplishments || [],
      intentions: result.intentions || [],
      mood_trend: result.mood_trend || "",
      growth_highlights: result.growth_highlights || [],
      period_start: periodStart.toISOString(),
      period_end: now.toISOString(),
    });

    return new Response(JSON.stringify({ success: true, ritual: result, type }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Daily summary error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
