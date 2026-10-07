import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireUser, isAuthResponse, corsHeaders } from "./_shared/auth.ts";
import { embedOne } from "./_shared/embed.ts";

/**
 * POST /memory-search
 * Body: { query: string, limit?: number, includeSensitive?: boolean }
 * Returns the top semantically-similar memories for the authenticated user.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const auth = await requireUser(req);
    if (isAuthResponse(auth)) return auth;

    const { query, limit = 8, includeSensitive = false } = await req.json().catch(() => ({}));
    if (!query || typeof query !== "string" || !query.trim()) {
      return new Response(JSON.stringify({ matches: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Missing service credentials");

    const embedding = await embedOne(query);
    if (!embedding) {
      return new Response(JSON.stringify({ matches: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use service role for the RPC — we've already verified the JWT and scope to auth userId.
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data, error } = await supabase.rpc("match_user_memory", {
      _user_id: auth.userId,
      _query_embedding: embedding,
      _match_count: Math.max(1, Math.min(20, Number(limit) || 8)),
      _include_sensitive: Boolean(includeSensitive),
    });

    if (error) {
      console.error("match_user_memory error:", error);
      return new Response(JSON.stringify({ matches: [], error: error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ matches: data ?? [] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("memory-search error:", e);
    return new Response(JSON.stringify({ matches: [], error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
