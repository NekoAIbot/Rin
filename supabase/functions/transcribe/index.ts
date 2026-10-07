// Speech-to-text via the unified AI layer (Gemini inline audio).
// Accepts multipart/form-data with an "audio" file field; returns { text }.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireUser, isAuthResponse, corsHeaders as baseCors } from "./_shared/auth.ts";
import { transcribe as transcribeAudio } from "./_shared/ai.ts";

/** Deno has no Buffer; convert bytes to base64 in chunks to stay under arg limits. */
function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

const corsHeaders = { ...baseCors, "Access-Control-Allow-Methods": "POST, OPTIONS" };

const MAX_BYTES = 24 * 1024 * 1024; // 24 MiB

function extFromMime(mime: string): string {
  const base = (mime || "").split(";")[0].trim().toLowerCase();
  switch (base) {
    case "audio/webm": return "webm";
    case "audio/ogg": return "ogg";
    case "audio/mp4":
    case "audio/x-m4a":
    case "audio/m4a": return "m4a";
    case "audio/mpeg": return "mp3";
    case "audio/wav":
    case "audio/x-wav":
    case "audio/wave": return "wav";
    default: return "webm";
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const auth = await requireUser(req);
  if (isAuthResponse(auth)) return auth;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return new Response(JSON.stringify({ error: "Expected multipart/form-data" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const audio = form.get("audio");
  if (!(audio instanceof File) && !(audio instanceof Blob)) {
    return new Response(JSON.stringify({ error: "Missing 'audio' file field" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (audio.size === 0) {
    return new Response(JSON.stringify({ error: "Empty recording" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (audio.size > MAX_BYTES) {
    return new Response(JSON.stringify({ error: "Recording too large" }), {
      status: 413,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const filename = (audio as File).name || `recording.${extFromMime(audio.type)}`;

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabase = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
      ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
      : null;

    const bytes = new Uint8Array(await audio.arrayBuffer());
    const result = await transcribeAudio(
      toBase64(bytes),
      audio.type || "audio/webm",
      supabase,
      `transcribe:${filename}`,
    );

    // ai.ts returns empty text when Gemini fails — never a guessed transcript.
    if (!result.text) {
      console.error("Transcription failed:", result.attempts);
      return new Response(JSON.stringify({ error: "Transcription failed" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ text: result.text }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Transcription request crashed", e);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
