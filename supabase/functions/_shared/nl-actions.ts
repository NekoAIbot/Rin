// Natural-language actions — classifier on the unified AI layer (ai.ts).
// Temperature 0 for fast, deterministic action classification.

import { generateWithFallback, MODELS, geminiText } from "./ai.ts";
import { embedOne } from "./embed.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;

export const MODES = [
  "assistant", "growth_partner", "therapist_lite", "strategic", "casual", "creative", "technical",
];

export interface DetectedAction {
  action:
    | "none"
    | "save_memory"
    | "forget_memory"
    | "list_memory"
    | "set_mode"
    | "voice_pref"
    | "checkins"
    | "link_account"
    | "new_thread"
    | "unlink";
  value?: string;
  option?: string;
}

const SYSTEM = `You read one message a person sent their assistant and decide whether it is asking the assistant to perform a settings or memory action. Almost always the answer is "none" — people are just talking.

Return ONLY JSON: {"action":"...","value":"...","option":"..."}

Actions:
- "save_memory" — they EXPLICITLY asked it to remember/save/note something. value = the thing to remember, written as a standalone sentence. (Casual mentions of facts are NOT this — background extraction handles those.)
- "forget_memory" — they explicitly asked it to forget/delete/erase something stored. value = the key words to match.
- "list_memory" — they asked what it remembers / knows about them / what's stored.
- "set_mode" — they asked it to behave differently in a lasting way. option = one of: assistant, growth_partner, therapist_lite, strategic, casual, creative, technical.
- "voice_pref" — they asked about how it replies with audio. option = "off" (text only), "on" (voice back only when they send voice), "always" (voice every reply).
- "checkins" — they asked it to message them first, stop messaging first, or change how often. option = "on", "off", or a digit 0-5 for a daily cap.
- "link_account" — they want to connect this chat to their Aurora web account. value = the code if one appears in the message, else empty.
- "new_thread" — they asked to start over / fresh conversation / clear the chat context.
- "unlink" — they asked to disconnect this chat entirely.
- "none" — anything else, including questions about these features rather than requests to change them.

Be conservative. If unsure, return "none".`;

export async function detectAction(
  supabase: Any,
  text: string,
): Promise<DetectedAction> {
  if (!text || text.trim().length < 2) return { action: "none" };
  try {
    const result = await generateWithFallback(
      {
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ role: "user", parts: [{ text: text.slice(0, 2000) }] }],
        generationConfig: { temperature: 0 },
      },
      supabase,
      "nl-actions-detect",
    );
    if (!result.text) {
      console.error("action detection returned empty:", result.attempts);
      return { action: "none" };
    }
    console.error("action detection attempts:", JSON.stringify(result.attempts.map((a) => ({ provider: a.provider, status: a.status, ok: a.ok, snippet: a.snippet })), null, 2).slice(0, 500));
    const raw = result.text;
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return { action: "none" };
    const parsed = JSON.parse(match[0]);
    return { action: parsed.action ?? "none", value: parsed.value ?? "", option: parsed.option ?? "" };
  } catch (e) {
    console.error("action detection error:", e);
    return { action: "none" };
  }
}

export interface ActionOutcome {
  note: string;
  terminal?: boolean;
}

export async function runAction(
  supabase: Any,
  link: Any,
  detected: DetectedAction,
  helpers: {
    consumeCode: (code: string) => Promise<{ userId?: string; merged?: number; error?: string }>;
  },
): Promise<ActionOutcome | null> {
  const { action, value = "", option = "" } = detected;

  switch (action) {
    case "save_memory": {
      const thing = value.trim();
      if (!thing) return { note: "ACTION: they asked you to remember something but it wasn't clear what. Nothing was saved. Ask what exactly to hold onto." };
      const embedding = await embedOne(thing).catch(() => null);
      const { error } = await supabase.from("user_memory").insert({
        user_id: link.user_id,
        category: "fact",
        key: thing.slice(0, 60),
        value: thing,
        source: "explicit",
        confidence: 1,
        embedding,
      });
      if (error) {
        console.error("nl save_memory failed:", error);
        return { note: `ACTION FAILED: the save did NOT go through (${error.message}). Tell them plainly it didn't save and you're not pretending otherwise.` };
      }
      return { note: `ACTION SUCCEEDED: "${thing}" is now stored in their memory. You may confirm it briefly and naturally.` };
    }

    case "forget_memory": {
      const q = value.trim();
      if (!q) return { note: "ACTION: they asked you to forget something but didn't say what. Nothing was deleted. Ask which part." };
      const pattern = `%${q.replace(/[%_]/g, "")}%`;
      const { data: deleted, error } = await supabase
        .from("user_memory")
        .delete()
        .eq("user_id", link.user_id)
        .or(`key.ilike.${pattern},value.ilike.${pattern}`)
        .select("key, value");
      if (error) {
        console.error("nl forget_memory failed:", error);
        return { note: `ACTION FAILED: nothing was deleted (${error.message}). Say so plainly — do not claim anything was removed.` };
      }
      const count = deleted?.length ?? 0;
      if (!count) return { note: `ACTION: nothing stored matches "${q}", so there was nothing to delete. Say that.` };
      return {
        note: `ACTION SUCCEEDED: deleted ${count} stored ${count === 1 ? "entry" : "entries"}: ${deleted.map((d: Any) => d.key).join("; ")}. Confirm it, and stop using those details from now on. Past messages in this thread still exist — mention that only if relevant.`,
      };
    }

    case "list_memory": {
      const { data, error } = await supabase
        .from("user_memory")
        .select("category, key, value")
        .eq("user_id", link.user_id)
        .order("last_reinforced_at", { ascending: false })
        .limit(20);
      if (error) {
        return { note: `ACTION FAILED: couldn't read their memory store (${error.message}). Say you can't see it right now rather than guessing what's in it.` };
      }
      if (!data?.length) return { note: "ACTION: their memory store is genuinely empty. Say so." };
      const lines = data.map((m: Any) => `(${m.category}) ${m.key}: ${m.value}`).join("\n");
      return { note: `ACTION: this is exactly what is stored — recite from this and nothing else:\n${lines}` };
    }

    case "set_mode": {
      const wanted = (option || "").toLowerCase().replace(/[\s-]/g, "_");
      if (!MODES.includes(wanted)) return { note: "ACTION: mode change requested but the mode wasn't clear. Nothing changed." };
      const { error } = await supabase.from("bot_channel_links")
        .update({ metadata: { ...(link.metadata || {}), companion_mode: wanted } })
        .eq("id", link.id);
      if (error) return { note: `ACTION FAILED: mode unchanged (${error.message}).` };
      link.metadata = { ...(link.metadata || {}), companion_mode: wanted };
      return { note: `ACTION SUCCEEDED: your manner is now set to "${wanted}" for this chat, from this reply onward. Shift into it immediately rather than announcing it formally.` };
    }

    case "voice_pref": {
      const mode = option === "off" ? "off" : option === "always" ? "always" : "on";
      const { error } = await supabase.from("bot_channel_links")
        .update({ metadata: { ...(link.metadata || {}), voice_replies: mode !== "off", voice_mode: mode } })
        .eq("id", link.id);
      if (error) return { note: `ACTION FAILED: voice preference unchanged (${error.message}).` };
      link.metadata = { ...(link.metadata || {}), voice_replies: mode !== "off", voice_mode: mode };
      return {
        note: `ACTION SUCCEEDED: voice replies set to "${mode}" — ${
          mode === "off" ? "text only from now on"
          : mode === "always" ? "you'll send a voice note with every reply"
          : "you'll answer voice notes with a voice note, text with text"
        }. Confirm briefly.`,
      };
    }

    case "checkins": {
      const opt = (option || "").toLowerCase().trim();
      if (/^\d+$/.test(opt)) {
        const cap = Math.max(0, Math.min(5, parseInt(opt, 10)));
        const { error } = await supabase.from("user_settings")
          .update({ telegram_checkin_max_per_day: cap, telegram_checkins_enabled: cap > 0, telegram_proactive: cap > 0 })
          .eq("user_id", link.user_id);
        if (error) return { note: `ACTION FAILED: check-in settings unchanged (${error.message}).` };
        return { note: `ACTION SUCCEEDED: check-ins capped at ${cap} a day${cap === 0 ? ", which means they're off" : ""}.` };
      }
      if (opt === "on" || opt === "off") {
        const on = opt === "on";
        const { error } = await supabase.from("user_settings")
          .update({ telegram_checkins_enabled: on, telegram_proactive: on })
          .eq("user_id", link.user_id);
        if (error) return { note: `ACTION FAILED: check-in settings unchanged (${error.message}).` };
        return {
          note: on
            ? "ACTION SUCCEEDED: check-ins are on — at most twice a day, only about something specific they actually told you, never a generic hello. They can switch it off any time just by saying so."
            : "ACTION SUCCEEDED: check-ins are off. You won't message first at all now.",
        };
      }
      const { data: s } = await supabase
        .from("user_settings")
        .select("telegram_checkins_enabled, telegram_checkin_max_per_day")
        .eq("user_id", link.user_id).maybeSingle();
      return {
        note: `ACTION: nothing changed. Current state — check-ins are ${s?.telegram_checkins_enabled ? `on, capped at ${s.telegram_checkin_max_per_day ?? 2} a day` : "off"}. Tell them and ask what they'd like.`,
      };
    }

    case "link_account": {
      const code = (value || "").trim();
      if (!code) {
        return { note: "ACTION: they want to connect this chat to their Aurora web account but gave no code. They get one in Aurora under Settings → Connected Accounts, then just send it here. Mention it's optional — this chat works fine standalone." };
      }
      if (link.metadata?.telegram_native === false) {
        return { note: "ACTION: this chat is already connected to an Aurora account. To move it to a different one they'd need to disconnect first." };
      }
      const result = await helpers.consumeCode(code);
      if (result.error) return { note: `ACTION FAILED: not connected. Reason: ${result.error}` };
      return {
        note: result.merged
          ? "ACTION SUCCEEDED: this chat is now connected to their Aurora account, and everything from this chat moved across with it."
          : "ACTION SUCCEEDED: this chat and their Aurora account are the same person now.",
      };
    }

    case "new_thread": {
      await supabase.from("bot_channel_links").update({ conversation_id: null }).eq("id", link.id);
      return { note: "ACTION SUCCEEDED: fresh thread started — you no longer have this chat's recent messages in view, though their long-term memory is untouched. Say that briefly and invite them in.", terminal: true };
    }

    case "unlink": {
      await supabase.from("bot_channel_links").delete().eq("id", link.id);
      return { note: "ACTION SUCCEEDED: this chat is disconnected. Say goodbye warmly and briefly, and mention they can reconnect any time by messaging again.", terminal: true };
    }

    default:
      return null;
  }
}
