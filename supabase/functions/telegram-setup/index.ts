// One-shot bot configuration: registers the webhook and publishes Aurora's
// name, description and command list to Telegram. Safe to re-run.

import { botToken, webhookSecret } from "./_shared/telegram.ts";
import { corsHeaders } from "./_shared/auth.ts";

const API = "https://api.telegram.org";

const NAME = "Aurora";
const SHORT_DESCRIPTION = "Aurora — your AI companion that actually remembers you.";
const DESCRIPTION = [
  "Aurora is a personal AI companion with real memory.",
  "",
  "Talk to her here the same way you do in the app — she remembers your goals, projects and the way you like to be spoken to.",
  "Send a voice note and she listens and answers out loud. Send a photo and she reads it.",
  "",
  "Link your account with the code from Aurora → Settings → Connected Accounts.",
].join("\n");

const COMMANDS = [
  { command: "help", description: "What Aurora can do here" },
  { command: "mode", description: "See or change how Aurora shows up" },
  { command: "remember", description: "Save something to your memory" },
  { command: "memory", description: "What Aurora remembers about you" },
  { command: "voice", description: "Turn spoken replies on or off" },
  { command: "quiet", description: "Mute or unmute check-ins here" },
  { command: "new", description: "Start a fresh thread" },
  { command: "unlink", description: "Disconnect this chat" },
];

async function call(token: string, method: string, payload: Record<string, unknown> = {}) {
  const res = await fetch(`${API}/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.ok === false) {
    console.error(`Telegram ${method} failed [${res.status}]:`, JSON.stringify(body).slice(0, 400));
  }
  return body;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let token: string;
  try {
    token = botToken();
  } catch {
    return new Response(JSON.stringify({ error: "TELEGRAM_BOT_TOKEN is not configured" }), {
      status: 503,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const webhookUrl = `${supabaseUrl}/functions/v1/telegram-webhook`;

  const me = await call(token, "getMe");
  const results: Record<string, unknown> = { username: me?.result?.username ?? null };

  results.webhook = await call(token, "setWebhook", {
    url: webhookUrl,
    secret_token: await webhookSecret(token),
    allowed_updates: ["message", "edited_message"],
    drop_pending_updates: true,
  });
  results.name = await call(token, "setMyName", { name: NAME });
  results.short_description = await call(token, "setMyShortDescription", { short_description: SHORT_DESCRIPTION });
  results.description = await call(token, "setMyDescription", { description: DESCRIPTION });
  results.commands = await call(token, "setMyCommands", { commands: COMMANDS });
  results.info = await call(token, "getWebhookInfo");

  return new Response(JSON.stringify({ ok: true, webhookUrl, ...results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
