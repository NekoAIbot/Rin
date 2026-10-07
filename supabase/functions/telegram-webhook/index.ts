// Aurora on Telegram. Same brain, same memory, same account — reachable from
// a chat thread. Telegram calls this endpoint for every incoming update.
//
// AI layer: unified ai.ts — Gemini + Groq + OpenRouter fallback with visible
// per-provider error logging (attempts recorded in error_log on total failure).
// STT/TTS: Gemini multimodal for transcription, Piper TTS for voice replies.
// Embeddings: gemini-embedding-001 at 768 dimensions.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  botToken, webhookSecret, safeEqual,
  sendMessage, sendChatAction, downloadFile, sendVoiceReply,
} from "./_shared/telegram.ts";
import {
  buildCognitiveState, buildContextBlock, buildSystemPrompt, buildCapabilityNotes,
  emojiGuidanceFor, retrieveRelevantMemories, temperatureFor,
} from "./_shared/brain.ts";
import { embedOne } from "./_shared/embed.ts";
import { detectAction, runAction } from "./_shared/nl-actions.ts";
import { extractAndStore } from "./_shared/passive-memory.ts";
import { generateWithFallback, geminiText, MODELS, transcribe, describeImage } from "./_shared/ai.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;

const MODES = ["assistant", "growth_partner", "therapist_lite", "strategic", "casual", "creative", "technical"];

const SURFACE_NOTES = `**You are talking through Telegram**
- Plain text only. No markdown headers, no tables, no code fences unless sharing actual code.
- Keep replies chat-sized: a few sentences. Long essays don't belong in a messaging thread.
- Bullets are fine sparingly, using "•".`;

function admin() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
}

/**
 * Persist a real error where it can be read back without the dashboard's
 * log explorer. Never throws — logging must not mask the original failure.
 */
async function logError(
  supabase: Any,
  functionName: string,
  stage: string,
  e: unknown,
  context: Record<string, unknown> = {},
) {
  const err = e instanceof Error ? e : new Error(String(e));
  try {
    await supabase.from("error_log").insert({
      function_name: functionName,
      error_message: `[${stage}] ${err.message}`,
      error_stack: err.stack ?? null,
      context,
    });
  } catch (logErr) {
    console.error("error_log insert failed:", logErr);
  }
  console.error(`[${stage}]`, err);
}

const HELP = [
  "Here's what I can do here:",
  "",
  "• Just talk — I remember what matters from our conversations.",
  "• Send a voice note and I'll listen, and answer with one.",
  "• Send a photo and I'll tell you what I see or read the text in it.",
  "",
  "Commands:",
  "/mode — see or change how I show up (e.g. /mode casual)",
  "/remember <something> — save it to your memory",
  "/forget <words> — delete every stored entry that mentions them",
  "/memory — what I currently remember about you",
  "/voice on|off|always — whether I reply with a voice note",
  "/checkins on|off|<number> — whether I can message you first, and how often",
  "/link <code> — connect this chat to your Aurora web account",
  "/new — start a fresh thread",
  "/unlink — disconnect this chat",
].join("\\n");

function GREETING(firstName: string): string {
  const hour = new Date().getHours();
  const timeGreeting = hour < 6 ? "Good evening" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  return `${timeGreeting}, ${firstName}. I'm here — what's going on?`;
}

/* ---------------------------------------------------------------- linking */

async function findLink(supabase: Any, chatId: number) {
  const { data } = await supabase
    .from("bot_channel_links")
    .select("*")
    .eq("platform", "telegram")
    .eq("external_id", String(chatId))
    .maybeSingle();
  return data;
}

/**
 * Telegram is a first-class front door: someone can start talking with no
 * Aurora web account at all. We quietly provision one for this chat. They can
 * merge it into a web account later with /link.
 */
async function provisionAccount(supabase: Any, chatId: number, displayName: string, username?: string) {
  const email = `telegram-${chatId}@aurora.local`;
  const password = crypto.randomUUID() + crypto.randomUUID();

  let userId: string | null = null;
  const { data: created, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: displayName, telegram_chat_id: chatId, telegram_username: username ?? null, source: "telegram" },
  });
  if (created?.user?.id) {
    userId = created.user.id;
  } else {
    // Already provisioned earlier (e.g. the link row was deleted) — reuse it.
    const { data: existingId } = await supabase.rpc("user_id_by_email", { _email: email });
    userId = typeof existingId === "string" ? existingId : null;
    if (!userId) {
      console.error("Account provisioning failed:", error);
      return null;
    }
  }

  await supabase.from("profiles").upsert({ user_id: userId, display_name: displayName }, { onConflict: "user_id" });
  await supabase.from("user_settings").upsert({ user_id: userId }, { onConflict: "user_id" });

  const { data: link, error: linkError } = await supabase.from("bot_channel_links").upsert({
    user_id: userId,
    platform: "telegram",
    external_id: String(chatId),
    display_name: displayName,
    metadata: { voice_replies: true, telegram_native: true },
    last_message_at: new Date().toISOString(),
  }, { onConflict: "platform,external_id" }).select("*").single();
  if (linkError) {
    console.error("Link create failed:", linkError);
    return null;
  }
  return link;
}

async function consumeCode(supabase: Any, code: string, chatId: number, displayName: string, currentLink?: Any) {
  const { data: row } = await supabase
    .from("bot_link_codes")
    .select("*")
    .eq("code", code.trim().toUpperCase())
    .eq("platform", "telegram")
    .is("consumed_at", null)
    .maybeSingle();

  if (!row) return { error: "That code isn't valid. Generate a fresh one in Aurora under Settings → Connected Accounts." };
  if (new Date(row.expires_at) < new Date()) {
    return { error: "That code expired. Grab a new one in Aurora under Settings → Connected Accounts." };
  }

  let merged = 0;
  // If this chat has been talking to a Telegram-only account, carry everything
  // it built up over into the web account rather than stranding it.
  if (currentLink?.user_id && currentLink.user_id !== row.user_id && currentLink.metadata?.telegram_native) {
    const { error: mergeError } = await supabase.rpc("merge_user_data", { _from: currentLink.user_id, _to: row.user_id });
    if (mergeError) {
      console.error("merge_user_data failed:", mergeError);
      return { error: `I couldn't move your Telegram history over, so I haven't connected anything yet. The store said: ${mergeError.message}` };
    }
    merged = 1;
  }

  const { error } = await supabase.from("bot_channel_links").upsert({
    user_id: row.user_id,
    platform: "telegram",
    external_id: String(chatId),
    display_name: displayName,
    conversation_id: null,
    metadata: { ...(currentLink?.metadata || {}), voice_replies: currentLink?.metadata?.voice_replies ?? true, telegram_native: false },
    last_message_at: new Date().toISOString(),
  }, { onConflict: "platform,external_id" });
  if (error) {
    console.error("Link upsert failed:", error);
    return { error: "Something went wrong connecting this chat. Try again in a moment." };
  }

  await supabase.from("bot_link_codes").update({ consumed_at: new Date().toISOString() }).eq("id", row.id);
  return { userId: row.user_id, merged };
}

/* ------------------------------------------------------------ persistence */

async function ensureConversation(supabase: Any, link: Any): Promise<string | null> {
  if (link.conversation_id) return link.conversation_id;
  const { data, error } = await supabase
    .from("conversations")
    .insert({ user_id: link.user_id, title: "Telegram" })
    .select("id")
    .single();
  if (error) {
    console.error("Conversation create failed:", error);
    try { await logError(supabase, "telegram-webhook", "ensureConversation", error, {
      user_id: link.user_id,
      link_id: link.id,
    }); } catch { /* logging must not fail the handler */ }
    return null;
  }
  await supabase.from("bot_channel_links").update({ conversation_id: data.id }).eq("id", link.id);
  link.conversation_id = data.id;
  return data.id;
}

async function loadHistory(supabase: Any, conversationId: string) {
  const { data } = await supabase
    .from("messages")
    .select("role, content")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(20);
  return (data ?? []).reverse().map((m: Any) => ({ role: m.role, content: m.content }));
}

async function saveMessage(supabase: Any, link: Any, conversationId: string, role: string, content: string) {
  await supabase.from("messages").insert({
    conversation_id: conversationId,
    user_id: link.user_id,
    role,
    content,
  });
  await supabase.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId);
}

/* -------------------------------------------------------------------- ai */

async function think(
  supabase: Any,
  link: Any,
  history: Any[],
  userText: string,
  notes: string,
): Promise<string> {
  const { data: profile } = await supabase
    .from("profiles").select("display_name").eq("user_id", link.user_id).maybeSingle();
  const { data: settings } = await supabase
    .from("user_settings").select("companion_mode").eq("user_id", link.user_id).maybeSingle();

  const mode = link.metadata?.companion_mode || settings?.companion_mode || "assistant";
  const messages = [...history, { role: "user", content: userText }];
  const { guidance, lastUserText } = emojiGuidanceFor(messages);

  const state = await buildCognitiveState(link.user_id, supabase, profile?.display_name || "", mode);
  let context = buildContextBlock(state);
  const recalled = await retrieveRelevantMemories(link.user_id, supabase, lastUserText);
  if (recalled) context = `${context}\n\n${recalled}`;

  let systemPrompt = buildSystemPrompt({
    userName: profile?.display_name || undefined,
    cognitiveContext: context,
    companionMode: mode,
    emojiGuidance: guidance,
    capabilityNotes: buildCapabilityNotes("telegram"),
    surfaceNotes: SURFACE_NOTES,
  });

  // Fold the action/extraction notes into the system prompt so the model
  // sees them as factual context, not as something it generated itself.
  if (notes) systemPrompt += `\n\n${notes}`;

  const contents = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  // generateWithFallback resolves to { text, provider, attempts } -- the whole
  // result object, not a string. Returning it directly meant the caller sent the
  // serialized object to Telegram as the message body, and the same JSON landed
  // in the messages table. Hand back only the text.
  const result = await generateWithFallback(
    {
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents,
      generationConfig: { temperature: temperatureFor(mode) },
    },
    supabase,
    "think",
  );
  return result.text;
}

/**
 * Deno has no Buffer; convert bytes to base64 in chunks to stay under the
 * argument limit. Spreading a whole Uint8Array into String.fromCharCode blows
 * the stack somewhere past ~100k elements, so any photo (and any long voice
 * note) threw "Maximum call stack size exceeded" at this line, before the AI
 * call was ever reached. Same helper as transcribe/index.ts.
 */
function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

const AUDIO_MIME: Record<string, string> = {
  ogg: "audio/ogg", oga: "audio/ogg", opus: "audio/ogg",
  mp3: "audio/mpeg", m4a: "audio/mp4", mp4: "audio/mp4",
  wav: "audio/wav", webm: "audio/webm", flac: "audio/flac",
};

/**
 * Speech-to-text via Gemini multimodal (audio-in-prompt).
 * Uses MODELS.chat (gemini-3.6-flash) which supports inlineData audio.
 *
 * Named `transcribeAudio`, not `transcribe`: this is an adapter that base64s
 * raw bytes before delegating to the imported `transcribe` from ai.ts. Sharing
 * that import's name made this function call itself.
 *
 * `supabase` is passed in rather than read from module scope -- there is no
 * module-level client here, only the handler's at the top of the request, so
 * referencing it bare threw a ReferenceError before the delegate was reached.
 */
async function transcribeAudio(
  supabase: Any,
  bytes: Uint8Array,
  filename: string,
  declaredMime?: string,
): Promise<{ text: string; failed: boolean; reason?: string }> {
  const ext = (filename.split(".").pop() || "ogg").toLowerCase();
  const mime = declaredMime || AUDIO_MIME[ext] || "audio/ogg";
  try {
    const b64 = toBase64(bytes);
    const result = await transcribe(b64, mime, supabase, "telegram-stt");
    if (!result.text) {
      const reason = result.attempts.some((a) => a.status === 429)
        ? "I'm rate limited on transcription right now."
        : result.attempts.some((a) => a.status === 402)
        ? "Aurora's usage credits ran out, so transcription is off."
        : `Transcription failed on my side (${result.attempts.map((a) => `${a.provider}:${a.status}`).join(", ")}).`;
      console.error(`STT failed:`, result.attempts);
      return { text: "", failed: true, reason };
    }
    if (!result.text.trim()) console.warn(`STT returned empty: mime=${mime} bytes=${bytes.length}`);
    return { text: result.text.trim(), failed: false };
  } catch (e) {
    console.error("STT crashed:", e);
    return { text: "", failed: true, reason: "Transcription crashed on my side." };
  }
}

/**
 * Text-to-speech via Piper TTS.
 * Looks up the Piper endpoint from the tts_endpoint table, checks staleness,
 * then POSTs the text. Returns null when Piper is unreachable — the caller
 * falls back to text-only.
 */
async function speak(text: string): Promise<Uint8Array | null> {
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const ttsSecret = Deno.env.get("TTS_SHARED_SECRET") ?? "";

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      console.error("TTS: SUPABASE_URL or SERVICE_ROLE_KEY not configured");
      return null;
    }

    // Look up the Piper endpoint from the tts_endpoint table
    const endpointRes = await fetch(
      `${SUPABASE_URL}/rest/v1/tts_endpoint?id=eq.1&select=url,updated_at`,
      {
        headers: {
          "apikey": SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        },
      },
    );
    if (!endpointRes.ok) {
      console.error("TTS endpoint lookup failed:", endpointRes.status);
      return null;
    }
    const rows = await endpointRes.json();
    const url = rows?.[0]?.url;
    const updatedAt = rows?.[0]?.updated_at ? new Date(rows[0].updated_at).getTime() : 0;
    const STALE_MS = 10 * 60 * 1000; // 10 minutes

    if (!url || Date.now() - updatedAt > STALE_MS) {
      console.error("TTS endpoint stale or missing:", url ? "stale" : "missing");
      return null;
    }

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "x-tts-secret": ttsSecret,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text: text.slice(0, 1800) }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.error("TTS failed:", res.status, (await res.text()).slice(0, 300));
      return null;
    }
    const audio = new Uint8Array(await res.arrayBuffer());
    if (audio.length === 0) return null;
    return audio;
  } catch (e) {
    console.error("TTS crashed:", e);
    return null;
  }
}

/**
 * Image description via Gemini multimodal (inlineData).
 * Uses MODELS.vision (gemini-3.6-flash).
 *
 * Renamed from `describeImage` for the same reason as `transcribeAudio` above:
 * it shadowed the ai.ts import it wraps. `supabase` is passed in for the same
 * reason too -- it is not in module scope.
 */
async function describeImageFromBytes(supabase: Any, bytes: Uint8Array, mime: string, caption: string): Promise<string> {
  const b64 = toBase64(bytes);
  const result = await describeImage(b64, mime, caption, supabase, "telegram-vision");
  const text = result.text;
  if (!text || text.startsWith("Something went wrong")) {
    console.error("Vision failed:", result.attempts);
    return "I couldn't open that image — try sending it again?";
  }
  return text;
}

/* -------------------------------------------------------------- commands */

async function handleCommand(supabase: Any, link: Any, chatId: number, text: string): Promise<boolean> {
  const [raw, ...rest] = text.trim().split(/\s+/);
  const cmd = raw.split("@")[0].toLowerCase();
  const arg = rest.join(" ").trim();

  switch (cmd) {
    case "/help":
    case "/start":
      await sendMessage(chatId, HELP);
      return true;

    case "/mode": {
      if (!arg) {
        const current = link.metadata?.companion_mode || "assistant";
        await sendMessage(chatId, `Right now I'm in ${current} mode.\n\nOptions: ${MODES.join(", ")}\nSwitch with e.g. /mode casual`);
        return true;
      }
      const wanted = arg.toLowerCase().replace(/[\s-]/g, "_");
      if (!MODES.includes(wanted)) {
        await sendMessage(chatId, `I don't have a "${arg}" mode. Try: ${MODES.join(", ")}`);
        return true;
      }
      await supabase.from("bot_channel_links")
        .update({ metadata: { ...(link.metadata || {}), companion_mode: wanted } })
        .eq("id", link.id);
      await sendMessage(chatId, `Done — ${wanted} mode from here on.`);
      return true;
    }

    case "/remember": {
      if (!arg) {
        await sendMessage(chatId, "Tell me what to hold onto: /remember I take my coffee black");
        return true;
      }
      const embedding = await embedOne(arg).catch(() => null);
      const { error } = await supabase.from("user_memory").insert({
        user_id: link.user_id,
        category: "fact",
        key: arg.slice(0, 60),
        value: arg,
        source: "explicit",
        confidence: 1,
        embedding,
      });
      if (error) {
        console.error("/remember insert failed:", error);
        await sendMessage(chatId, `I could not save that, so I am not going to pretend I did. The store rejected it: ${error.message}`);
        return true;
      }
      await sendMessage(chatId, "Saved. I checked — it's in your memory now.");
      return true;
    }

    case "/forget": {
      if (!arg) {
        await sendMessage(chatId, "Tell me what to drop: /forget coffee\n\nI'll delete every stored entry that mentions it, and tell you exactly how many went.");
        return true;
      }
      const pattern = `%${arg.replace(/[%_]/g, "")}%`;
      const { data: deleted, error } = await supabase
        .from("user_memory")
        .delete()
        .eq("user_id", link.user_id)
        .or(`key.ilike.${pattern},value.ilike.${pattern}`)
        .select("key");
      if (error) {
        console.error("/forget delete failed:", error);
        await sendMessage(chatId, `I couldn't delete that, so nothing has been removed. The store said: ${error.message}`);
        return true;
      }
      const count = deleted?.length ?? 0;
      if (!count) {
        await sendMessage(chatId, `Nothing stored matches "${arg}", so there was nothing to delete.`);
        return true;
      }
      await sendMessage(chatId, `Deleted ${count} ${count === 1 ? "entry" : "entries"}:\n${deleted.map((d: Any) => `• ${d.key}`).join("\n")}\n\nNote: this clears stored memory. Past messages in this thread still exist — use /new for a clean thread.`);
      return true;
    }

    case "/memory": {
      const { data, error } = await supabase
        .from("user_memory")
        .select("category, key, value")
        .eq("user_id", link.user_id)
        .order("last_reinforced_at", { ascending: false })
        .limit(15);
      if (error) {
        console.error("/memory read failed:", error);
        await sendMessage(chatId, `I couldn't read your memory just now, so I can't tell you what's in it. The store said: ${error.message}`);
        return true;
      }
      if (!data?.length) {
        await sendMessage(chatId, "Your memory store is empty — nothing is saved. If you just tried /remember and got no confirmation, that save did not go through.");
        return true;
      }
      const lines = data.map((m: Any) => `• ${m.key}: ${m.value}`).join("\n");
      await sendMessage(chatId, `Here's what I'm holding:\n\n${lines}\n\nDelete any of it with /forget <words>, or manage it all in the Memory screen in Aurora.`);
      return true;
    }

    case "/voice": {
      const choice = arg.toLowerCase();
      const mode = choice === "off" ? "off" : choice === "always" ? "always" : "on";
      await supabase.from("bot_channel_links")
        .update({ metadata: { ...(link.metadata || {}), voice_replies: mode !== "off", voice_mode: mode } })
        .eq("id", link.id);
      await sendMessage(chatId,
        mode === "off" ? "Text replies only from now on."
        : mode === "always" ? "I'll send a voice note with every reply, however you write to me."
        : "I'll answer your voice notes with a voice note. Text still gets text.");
      return true;
    }

    case "/checkins": {
      const { data: s } = await supabase
        .from("user_settings")
        .select("telegram_checkins_enabled, telegram_checkin_max_per_day")
        .eq("user_id", link.user_id).maybeSingle();
      const choice = arg.toLowerCase().trim();

      if (!choice) {
        await sendMessage(chatId, s?.telegram_checkins_enabled
          ? `Check-ins are on, up to ${s.telegram_checkin_max_per_day ?? 2} a day. I only reach out when there's something specific you told me to come back to — never just to say hi.\n\nTurn them off with /checkins off, or set a daily cap with e.g. /checkins 1.`
          : "Check-ins are off — I only ever reply when you write to me.\n\nTurn them on with /checkins on and I'll follow up on things you've actually told me about, at most twice a day. Off again any time with /checkins off.");
        return true;
      }

      if (/^\d+$/.test(choice)) {
        const cap = Math.max(0, Math.min(5, parseInt(choice, 10)));
        const { error } = await supabase.from("user_settings")
          .update({ telegram_checkin_max_per_day: cap, telegram_checkins_enabled: cap > 0 })
          .eq("user_id", link.user_id);
        if (error) {
          await sendMessage(chatId, `I couldn't change that setting, so nothing has changed. The store said: ${error.message}`);
          return true;
        }
        await sendMessage(chatId, cap === 0 ? "Cap set to zero — that means check-ins are off." : `Done — at most ${cap} check-in${cap === 1 ? "" : "s"} a day.`);
        return true;
      }

      const on = choice === "on";
      if (!on && choice !== "off") {
        await sendMessage(chatId, "Use /checkins on, /checkins off, or a daily cap like /checkins 1.");
        return true;
      }
      const { error } = await supabase.from("user_settings")
        .update({ telegram_checkins_enabled: on, telegram_proactive: on })
        .eq("user_id", link.user_id);
      if (error) {
        await sendMessage(chatId, `I couldn't change that setting, so nothing has changed. The store said: ${error.message}`);
        return true;
      }
      await sendMessage(chatId, on
        ? "Check-ins are on. I'll only reach out about something specific you've told me — a deadline, a plan, something you said you'd do — and no more than twice a day. /checkins off stops it."
        : "Check-ins are off. I won't message you first.");
      return true;
    }

    case "/quiet": {
      const quiet = arg.toLowerCase() !== "off";
      await supabase.from("user_settings")
        .update({ telegram_proactive: !quiet, telegram_checkins_enabled: !quiet })
        .eq("user_id", link.user_id);
      await sendMessage(chatId, quiet ? "I'll keep my check-ins to myself here." : "I'll send my check-ins and rituals here again.");
      return true;
    }

    case "/link": {
      if (!arg) {
        await sendMessage(chatId, "Send it as /link CODE. Get a code in Aurora under Settings → Connected Accounts.\n\nYou don't have to — this chat works fine on its own. Linking just puts everything in one account.");
        return true;
      }
      if (link.metadata?.telegram_native === false) {
        await sendMessage(chatId, "This chat is already connected to your Aurora account. Use /unlink first if you want to connect it to a different one.");
        return true;
      }
      const result = await consumeCode(supabase, arg, chatId, link.display_name || "Telegram user", link);
      if ("error" in result) {
        await sendMessage(chatId, result.error!);
        return true;
      }
      await sendMessage(chatId, result.merged
        ? "Connected. Everything we've talked about here has moved into your Aurora account, and it's all in one place now."
        : "Connected. This chat and your Aurora account are the same person now.");
      return true;
    }

    case "/new":
      await supabase.from("bot_channel_links").update({ conversation_id: null }).eq("id", link.id);
      await sendMessage(chatId, "Fresh thread. What's on your mind?");
      return true;

    case "/unlink":
      await supabase.from("bot_channel_links").delete().eq("id", link.id);
      await sendMessage(chatId, "This chat is disconnected from your Aurora account. Link it again any time from Settings → Connected Accounts.");
      return true;

    default:
      return false;
  }
}

/* ------------------------------------------------------------------ main */

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  let token: string;
  try {
    token = botToken();
  } catch {
    return new Response("Not configured", { status: 503 });
  }

  const expected = await webhookSecret(token);
  if (!safeEqual(req.headers.get("X-Telegram-Bot-Api-Secret-Token"), expected)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const update = await req.json().catch(() => null);
  if (!update || typeof update.update_id !== "number") return new Response(JSON.stringify({ ok: true }));

  const supabase = admin();

  // Telegram retries deliveries — answer each update exactly once.
  const { error: dupeError } = await supabase.from("telegram_updates").insert({ update_id: update.update_id });
  if (dupeError) return new Response(JSON.stringify({ ok: true, duplicate: true }));

  const message = update.message ?? update.edited_message;
  const chatId: number | undefined = message?.chat?.id;
  if (!chatId) return new Response(JSON.stringify({ ok: true }));

  try {
    const displayName = [message.from?.first_name, message.from?.last_name].filter(Boolean).join(" ")
      || message.from?.username || "Telegram user";
    let text: string = (message.text || "").trim();

    // Telegram's own UI sends "/start", sometimes with a payload. Nothing else
    // in Aurora is a command — if someone types one out of habit we just read
    // it as ordinary words.
    let startPayload = "";
    if (/^\/start\b/i.test(text)) {
      startPayload = text.replace(/^\/start\b/i, "").trim();
      text = "";
    } else if (text.startsWith("/")) {
      text = text.slice(1).replace(/^(\w+)@\w+/, "$1").trim();
    }

    let link = await findLink(supabase, chatId);

    /* ---- first contact: provision an account and say hello ---- */
    if (!link) {
      // A start payload may be a link code from the web app.
      if (startPayload) {
        const result = await consumeCode(supabase, startPayload, chatId, displayName);
        if (!("error" in result)) {
          link = await findLink(supabase, chatId);
          await sendMessage(chatId, `We're connected — everything you've told me in Aurora, I have here too.\n\nSo. What's going on?`);
          return new Response(JSON.stringify({ ok: true }));
        }
      }
      link = await provisionAccount(supabase, chatId, displayName, message.from?.username);
      if (!link) {
        await sendMessage(chatId, "I couldn't get set up just now. Try messaging me again in a moment.");
        return new Response(JSON.stringify({ ok: true }));
      }
      await sendMessage(chatId, GREETING(displayName.split(" ")[0]));
      if (!text && !message.voice && !message.audio && !message.photo) {
        return new Response(JSON.stringify({ ok: true }));
      }
    }

    /* ---- respect the master switch ---- */
    const { data: settings } = await supabase
      .from("user_settings").select("telegram_enabled").eq("user_id", link.user_id).maybeSingle();
    if (settings?.telegram_enabled === false) {
      await sendMessage(chatId, "Telegram is switched off for your account. Turn it back on in Aurora under Settings → Connected Accounts and I'll be right here.");
      return new Response(JSON.stringify({ ok: true }));
    }

    await supabase.from("bot_channel_links")
      .update({ last_message_at: new Date().toISOString(), display_name: displayName })
      .eq("id", link.id);

    await sendChatAction(chatId, "typing");

    const conversationId = await ensureConversation(supabase, link);
    if (!conversationId) {
      await sendMessage(chatId, "I couldn't open our thread just now. Try again in a moment.");
      return new Response(JSON.stringify({ ok: true }));
    }

    let userText = text;
    let cameFromVoice = false;

    /* ---- voice notes ---- */
    const voice = message.voice ?? message.audio;
    if (voice?.file_id) {
      const file = await downloadFile(voice.file_id);
      if (!file) {
        await sendMessage(chatId, "That voice note didn't come through on my side. Send it again?");
        return new Response(JSON.stringify({ ok: true }));
      }
      const heard = await transcribeAudio(
        supabase,
        file.bytes,
        file.path.split("/").pop() || "voice.ogg",
        voice.mime_type,
      );
      cameFromVoice = true;
      if (heard.failed) {
        // A backend failure is mine, not theirs — never blame the speaker.
        await sendMessage(chatId, `${heard.reason} That's on my end, not your recording — try again in a moment, or send it as text.`);
        return new Response(JSON.stringify({ ok: true }));
      }
      if (!heard.text) {
        await sendMessage(chatId, "That one came through silent — I got the audio but no words in it. Want to try again?");
        return new Response(JSON.stringify({ ok: true }));
      }
      userText = heard.text;
    }

    /* ---- photos and image documents ---- */
    const photo = Array.isArray(message.photo) ? message.photo[message.photo.length - 1] : null;
    const imageDoc = message.document?.mime_type?.startsWith("image/") ? message.document : null;
    if (photo || imageDoc) {
      const fileId = photo?.file_id ?? imageDoc.file_id;
      const file = await downloadFile(fileId);
      if (!file) {
        await sendMessage(chatId, "That image didn't come through. Try again?");
        return new Response(JSON.stringify({ ok: true }));
      }
      const caption = (message.caption || "").trim();
      const answer = await describeImageFromBytes(supabase, file.bytes, imageDoc?.mime_type || "image/jpeg", caption);
      await saveMessage(supabase, link, conversationId, "user", caption ? `[photo] ${caption}` : "[photo]");
      await saveMessage(supabase, link, conversationId, "assistant", answer);
      await sendMessage(chatId, answer);
      return new Response(JSON.stringify({ ok: true }));
    }

    if (!userText) {
      await sendMessage(chatId, "I can read text, listen to voice notes and look at photos here.");
      return new Response(JSON.stringify({ ok: true }));
    }

    /* ---- natural-language actions + passive memory, in parallel ---- */
    const [detected, extraction] = await Promise.all([
      detectAction(supabase, userText),
      extractAndStore(supabase, link.user_id, userText, "", conversationId),
    ]);

    const notes: string[] = [];

    if (detected.action !== "none") {
      const outcome = await runAction(supabase, link, detected, {
        consumeCode: async (code: string) => await consumeCode(supabase, code, chatId, displayName, link),
      });
      if (outcome) notes.push(outcome.note);
    }

    if (extraction.stored.length) {
      notes.push(
        `MEMORY: these were just filed automatically from what they said — ${extraction.stored.join("; ")}. ` +
        `Don't announce the saving. Only mention it if they ask whether you caught it.`,
      );
    }
    if (extraction.uncertain.length) {
      notes.push(
        `POSSIBLE, NOT STORED: "${extraction.uncertain[0]}". They didn't actually say this — it's your reading. ` +
        `If it fits the flow, check it with them in one light question near the end of your reply (e.g. "is rice your favourite, or did I just catch you on a rice week?"). ` +
        `If they confirm it next turn, it gets stored then. Never state it as something you know.`,
      );
    }

    const history = await loadHistory(supabase, conversationId);
    const answer = await think(supabase, link, history, userText, notes.join("\n\n"));

    await saveMessage(supabase, link, conversationId, "user", userText);
    await saveMessage(supabase, link, conversationId, "assistant", answer);

    await sendMessage(chatId, answer);

    const voiceMode = link.metadata?.voice_mode ?? (link.metadata?.voice_replies === false ? "off" : "on");
    if (voiceMode !== "off" && (cameFromVoice || voiceMode === "always")) {
      const audio = await speak(answer);
      if (audio) await sendVoiceReply(chatId, audio, "audio/mpeg");
    }

    // File what Aurora said too, once the turn is over — cheap, off the path.
    const bg = extractAndStore(supabase, link.user_id, userText, answer, conversationId)
      .catch((e) => console.error("post-turn extraction failed:", e));
    // deno-lint-ignore no-explicit-any
    (globalThis as any).EdgeRuntime?.waitUntil?.(bg);

    return new Response(JSON.stringify({ ok: true }));
  } catch (e) {
    console.error("telegram-webhook error:", e);
    try { await logError(supabase, "telegram-webhook", "handler", e, {
      chat_id: chatId,
    }); } catch { /* logging must not fail the handler */ }
    try { await sendMessage(chatId, "Something broke on my side. Try me again in a moment."); } catch { /* ignore */ }
    return new Response(JSON.stringify({ ok: true }));
  }
});
