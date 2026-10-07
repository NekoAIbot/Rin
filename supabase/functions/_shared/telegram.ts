// Telegram Bot API helpers. The bot token is a project secret and never
// leaves the server.

const API = "https://api.telegram.org";

export function botToken(): string {
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  return token;
}

/** Secret Telegram echoes back on every webhook call, derived from the token. */
export async function webhookSecret(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`rin-telegram:${token}`));
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function safeEqual(a: string | null, b: string): boolean {
  if (!a || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function call(method: string, payload: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(`${API}/bot${botToken()}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.ok === false) {
    console.error(`Telegram ${method} failed [${res.status}]:`, JSON.stringify(body).slice(0, 500));
  }
  return body;
}

/** Telegram hard-caps messages at 4096 chars — split on paragraph boundaries. */
function chunk(text: string, size = 3800): string[] {
  if (text.length <= size) return [text];
  const parts: string[] = [];
  let rest = text;
  while (rest.length > size) {
    let cut = rest.lastIndexOf("\n\n", size);
    if (cut < size * 0.5) cut = rest.lastIndexOf("\n", size);
    if (cut < size * 0.5) cut = rest.lastIndexOf(" ", size);
    if (cut <= 0) cut = size;
    parts.push(rest.slice(0, cut));
    rest = rest.slice(cut).trimStart();
  }
  if (rest) parts.push(rest);
  return parts;
}

export async function sendMessage(chatId: number | string, text: string, extra: Record<string, unknown> = {}) {
  for (const part of chunk(text)) {
    await call("sendMessage", {
      chat_id: chatId,
      text: part,
      link_preview_options: { is_disabled: true },
      ...extra,
    });
  }
}

export async function sendChatAction(chatId: number | string, action = "typing") {
  await call("sendChatAction", { chat_id: chatId, action });
}

export async function downloadFile(fileId: string): Promise<{ bytes: Uint8Array; path: string } | null> {
  const info = await call("getFile", { file_id: fileId }) as { ok?: boolean; result?: { file_path?: string } };
  const path = info?.result?.file_path;
  if (!path) return null;
  const res = await fetch(`${API}/file/bot${botToken()}/${path}`);
  if (!res.ok) {
    console.error("Telegram file download failed:", res.status);
    return null;
  }
  return { bytes: new Uint8Array(await res.arrayBuffer()), path };
}

export async function sendVoiceReply(chatId: number | string, audio: Uint8Array, mime = "audio/ogg") {
  // A real Telegram voice note needs OGG/Opus. Anything else has to go as an
  // audio file instead — still audio, just not the round waveform bubble.
  const isOpus = mime === "audio/ogg";
  const form = new FormData();
  form.append("chat_id", String(chatId));
  if (isOpus) {
    form.append("voice", new Blob([audio], { type: mime }), "aurora.ogg");
  } else {
    form.append("audio", new Blob([audio], { type: mime }), "aurora.mp3");
    form.append("title", "Aurora");
  }
  const res = await fetch(`${API}/bot${botToken()}/${isOpus ? "sendVoice" : "sendAudio"}`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) console.error("Telegram voice send failed:", res.status, (await res.text()).slice(0, 300));
  return res.ok;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Send Aurora-initiated messages (rituals, insights) to someone's Telegram,
 * respecting their proactive preference. Silent no-op when unlinked.
 */
export async function notifyTelegram(supabase: any, userId: string, text: string): Promise<boolean> {
  if (!Deno.env.get("TELEGRAM_BOT_TOKEN")) return false;
  try {
    const { data: link } = await supabase
      .from("bot_channel_links")
      .select("external_id")
      .eq("user_id", userId)
      .eq("platform", "telegram")
      .maybeSingle();
    if (!link?.external_id) return false;

    const { data: settings } = await supabase
      .from("user_settings")
      .select("telegram_enabled, telegram_proactive")
      .eq("user_id", userId)
      .maybeSingle();
    if (settings && (settings.telegram_enabled === false || settings.telegram_proactive === false)) return false;

    await sendMessage(link.external_id, text);
    return true;
  } catch (e) {
    console.error("notifyTelegram failed:", e);
    return false;
  }
}
