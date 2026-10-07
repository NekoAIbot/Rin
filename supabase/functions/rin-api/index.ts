import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { geminiStream, geminiGenerate, geminiText, MODELS } from "./_shared/ai.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-rin-api-key",
};

const TIER_LIMITS: Record<string, number> = {
  free: 100,
  pro: 10000,
  enterprise: 100000,
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ error: "Server misconfigured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    // Extract API key from header
    const apiKey = req.headers.get("x-rin-api-key") || req.headers.get("authorization")?.replace("Bearer ", "");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Missing API key. Include x-rin-api-key header." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Hash the key for lookup
    const encoder = new TextEncoder();
    const data = encoder.encode(apiKey);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const keyHash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");

    // Look up the API key
    const { data: keyRecord, error: keyError } = await supabase
      .from("api_keys")
      .select("*")
      .eq("key_hash", keyHash)
      .eq("is_active", true)
      .single();

    if (keyError || !keyRecord) {
      return new Response(JSON.stringify({ error: "Invalid or inactive API key" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check expiry
    if (keyRecord.expires_at && new Date(keyRecord.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: "API key has expired" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check monthly usage
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const { count: usageCount } = await supabase
      .from("api_usage")
      .select("*", { count: "exact", head: true })
      .eq("api_key_id", keyRecord.id)
      .gte("created_at", startOfMonth.toISOString());

    const limit = keyRecord.monthly_limit || TIER_LIMITS[keyRecord.tier] || 100;
    if ((usageCount || 0) >= limit) {
      return new Response(JSON.stringify({
        error: "Monthly usage limit exceeded",
        usage: usageCount,
        limit,
        tier: keyRecord.tier,
        upgrade_message: keyRecord.tier === "free" ? "Upgrade to Pro for 10,000 requests/month" : undefined,
      }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse request
    const body = await req.json();
    const { messages, stream = false, model, system_prompt, temperature = 0.7 } = body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: "messages array is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build system prompt
    const defaultSystem = "You are Rin, an intelligent AI assistant. Be helpful, concise, and professional.";
    const systemPrompt = system_prompt || defaultSystem;

    // Convert OpenAI-shaped messages to Gemini contents
    const geminiContents = messages.map((m: any) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const selectedModel = model || MODELS.chat;

    // Call Gemini
    const aiResponse = stream
      ? await geminiStream(selectedModel, {
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: geminiContents,
          generationConfig: { temperature },
        })
      : await geminiGenerate(selectedModel, {
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: geminiContents,
          generationConfig: { temperature },
        });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("Gemini API error:", aiResponse.status, errText);

      // Log failed usage
      await supabase.from("api_usage").insert({
        api_key_id: keyRecord.id,
        user_id: keyRecord.user_id,
        endpoint: "chat",
        status_code: aiResponse.status,
      });

      return new Response(JSON.stringify({ error: "AI service error" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Log successful usage
    await supabase.from("api_usage").insert({
      api_key_id: keyRecord.id,
      user_id: keyRecord.user_id,
      endpoint: "chat",
      status_code: 200,
    });

    // Update last_used_at
    await supabase.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", keyRecord.id);

    if (stream) {
      return new Response(aiResponse.body, {
        headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
      });
    }

    const aiData = await aiResponse.json();
    const text = geminiText(aiData);
    return new Response(JSON.stringify({
      choices: [{ message: { role: "assistant", content: text } }],
      usage_info: {
        requests_used: (usageCount || 0) + 1,
        requests_limit: limit,
        tier: keyRecord.tier,
      },
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Rin API error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
