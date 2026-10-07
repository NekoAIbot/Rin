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
    const { text } = await req.json();

    if (!text) {
      return new Response(JSON.stringify({ emotion: "neutral", intensity: 0.5, polarity: "neutral", responseMode: "default" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabase = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
      ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
      : null;

    const ai = await generateWithFallback(
      {
        systemInstruction: { parts: [{ text: `You are an emotion analysis system. Analyze text and return ONLY valid JSON:
{
  "emotion": "joy|sadness|anger|fear|surprise|stress|pride|shame|burnout|excitement|anxiety|frustration|gratitude|neutral",
  "intensity": 0.0-1.0,
  "polarity": "positive|negative|neutral",
  "responseMode": "analyst|support|motivator|challenger|listener|default",
  "trigger": "brief trigger description or null"
}

responseMode selection:
- support: sadness, shame, burnout, grief, loneliness
- motivator: excitement, goal-sharing, achievement
- challenger: complacency, avoidance, procrastination
- listener: stress, anxiety, overwhelm (high intensity)
- analyst: neutral/technical questions, planning
- default: casual, joy, gratitude` }] },
        contents: [{ role: "user", parts: [{ text }] }],
        generationConfig: { temperature: 0.1, responseMimeType: "application/json" },
      },
      supabase,
      "emotion-analyze",
    );
    const raw = ai.text || "{}";

    let result = { emotion: "neutral", intensity: 0.5, polarity: "neutral", responseMode: "default", trigger: null };
    try {
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = { ...result, ...JSON.parse(jsonMatch[0]) };
      }
    } catch (_) {
      // return defaults
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Emotion analysis error:", error);
    return new Response(JSON.stringify({ emotion: "neutral", intensity: 0.5, polarity: "neutral", responseMode: "default" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
