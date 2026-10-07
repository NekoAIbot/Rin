// Shared auth helper for Aurora edge functions.
// supabase/config.toml deploys these with verify_jwt = false, so each
// user-context function MUST validate the caller's JWT in code and derive
// userId from the token — never from the request body — to prevent
// user-impersonation attacks.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function unauthorized(msg = "Unauthorized"): Response {
  return new Response(JSON.stringify({ error: msg }), {
    status: 401,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export type AuthResult = { userId: string; token: string } | Response;

/**
 * Validate the Bearer token and return the authenticated user id.
 * Returns a Response (401) on failure — caller should return it as-is.
 */
export async function requireUser(req: Request): Promise<AuthResult> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return unauthorized();

  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) return unauthorized();

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return unauthorized("Server misconfigured");

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  try {
    const { data, error } = await supabase.auth.getClaims(token);
    const sub = data?.claims?.sub as string | undefined;
    if (error || !sub) return unauthorized();
    return { userId: sub, token };
  } catch {
    return unauthorized();
  }
}

export function isAuthResponse(r: AuthResult): r is Response {
  return r instanceof Response;
}
