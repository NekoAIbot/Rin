// Issues one-time codes that connect a Telegram chat to an Aurora account,
// and reports/removes the current link. Called from the app by a signed-in user.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireUser, isAuthResponse, corsHeaders } from "./_shared/auth.ts";

function admin() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function newCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const auth = await requireUser(req);
  if (isAuthResponse(auth)) return auth;
  const userId = auth.userId;

  let action = "status";
  try {
    const body = await req.json();
    if (typeof body?.action === "string") action = body.action;
  } catch { /* default action */ }

  const supabase = admin();
  const botUsername = Deno.env.get("TELEGRAM_BOT_USERNAME") || null;

  try {
    if (action === "status") {
      const { data: link } = await supabase
        .from("bot_channel_links")
        .select("display_name, created_at, last_message_at")
        .eq("user_id", userId)
        .eq("platform", "telegram")
        .maybeSingle();
      return json({ linked: !!link, link: link ?? null, bot_username: botUsername });
    }

    if (action === "create_code") {
      await supabase.from("bot_link_codes")
        .delete()
        .eq("user_id", userId)
        .eq("platform", "telegram")
        .is("consumed_at", null);

      const code = newCode();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      const { error } = await supabase.from("bot_link_codes").insert({
        user_id: userId,
        platform: "telegram",
        code,
        expires_at: expiresAt,
      });
      if (error) {
        console.error("Failed to create link code:", error);
        return json({ error: "Could not create a code right now" }, 500);
      }
      return json({
        code,
        expires_at: expiresAt,
        bot_username: botUsername,
        deep_link: botUsername ? `https://t.me/${botUsername}?start=${code}` : null,
      });
    }

    if (action === "unlink") {
      const { error } = await supabase
        .from("bot_channel_links")
        .delete()
        .eq("user_id", userId)
        .eq("platform", "telegram");
      if (error) {
        console.error("Unlink failed:", error);
        return json({ error: "Could not unlink" }, 500);
      }
      return json({ linked: false });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    console.error("telegram-link error:", e);
    return json({ error: "Internal error" }, 500);
  }
});
