import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireUser, isAuthResponse, corsHeaders } from "./_shared/auth.ts";
import { describeImage, generateImage } from "./_shared/ai.ts";

/** Splits a data: URL into the base64 payload and mime type that ai.ts expects. */
function parseDataUrl(dataUrl: string): { base64: string; mimeType: string } {
  const match = /^data:([^;,]+)?(;base64)?,([\s\S]*)$/.exec(dataUrl || "");
  if (!match) return { base64: dataUrl || "", mimeType: "image/jpeg" };
  return { base64: match[3] || "", mimeType: match[1] || "image/jpeg" };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const auth = await requireUser(req);
    if (isAuthResponse(auth)) return auth;
    const { action, image_data, prompt } = await req.json();

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabase = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
      ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
      : null;

    if (action === "analyze" || action === "ocr") {
      if (!image_data) {
        return new Response(JSON.stringify({ error: "image_data is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const systemPrompt = action === "ocr"
        ? "You are an OCR specialist. Extract ALL text visible in this image. Return the extracted text exactly as it appears, preserving formatting where possible. If no text is found, say 'No text detected in this image.'"
        : "You are an expert image analyst. Provide a detailed, structured analysis of this image including: what you see, key elements, colors, composition, context, and any notable details.";

      const { base64, mimeType } = parseDataUrl(image_data);
      const ai = await describeImage(base64, mimeType, prompt || systemPrompt, supabase, "multimodal-analyze");
      if (ai.provider === "none" || !ai.text) {
        console.error("AI processing failed:", ai.attempts);
        return new Response(JSON.stringify({ error: "AI processing failed" }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ result: ai.text }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "generate") {
      if (!prompt) {
        return new Response(JSON.stringify({ error: "prompt is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const image = await generateImage(prompt);
      if (!image.ok) {
        console.error("Image gen error:", image.snippet);
        return new Response(JSON.stringify({ error: "Image generation failed" }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ image_url: image.imageUrl, text: image.text }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action. Use: analyze, generate, or ocr" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Multimodal error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
