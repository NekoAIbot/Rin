const _M_gemini = (({ GeminiContent, GeminiPart, GeminiRequest, MODELS, geminiGenerate, geminiKey, geminiStream, geminiText, toGeminiContents }) => {
// Shared Gemini REST helpers. One place for the endpoint shape, auth, and
// response parsing so every call site converts identically.
//
// Auth: x-goog-api-key header (preferred over ?key= query param — keeps the
// key out of logs). All calls go to generativelanguage.googleapis.com.

const BASE = "https://generativelanguage.googleapis.com/v1beta";

function geminiKey(): string {
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) throw new Error("GEMINI_API_KEY is not configured");
  return key;
}

interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
}

interface GeminiContent {
  role: "user" | "model";
  parts: GeminiPart[];
}

interface GeminiRequest {
  systemInstruction?: { parts: GeminiPart[] };
  contents: GeminiContent[];
  generationConfig?: {
    temperature?: number;
    maxOutputTokens?: number;
    responseMimeType?: string;
  };
}

/** Non-streaming generateContent. Returns the raw Response so callers keep
 *  their own error handling (status checks, 429/402 messages, etc.). */
async function geminiGenerate(
  model: string,
  body: GeminiRequest,
): Promise<Response> {
  return fetch(`${BASE}/models/${model}:generateContent`, {
    method: "POST",
    headers: {
      "x-goog-api-key": geminiKey(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

/** Streaming generateContent (SSE). Returns the raw Response. */
async function geminiStream(
  model: string,
  body: GeminiRequest,
): Promise<Response> {
  return fetch(`${BASE}/models/${model}:streamGenerateContent?alt=sse`, {
    method: "POST",
    headers: {
      "x-goog-api-key": geminiKey(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

/** Extract the text from a generateContent JSON body. Returns "" if absent. */
function geminiText(body: any): string {
  return body?.candidates?.[0]?.content?.parts
    ?.map((p: any) => p?.text ?? "")
    .join("") ?? "";
}

/** Convert OpenAI-style messages ({role, content}) to Gemini contents.
 *  "assistant" maps to "model"; "system" content is returned separately so
 *  callers can pass it as systemInstruction. */
function toGeminiContents(
  messages: Array<{ role: string; content: string }>,
): { system?: string; contents: GeminiContent[] } {
  let system: string | undefined;
  const contents: GeminiContent[] = [];
  for (const m of messages) {
    if (m.role === "system") {
      system = system ? `${system}\n\n${m.content}` : m.content;
      continue;
    }
    contents.push({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    });
  }
  return { system, contents };
}

/** Model names used across the project, one source of truth. */
const MODELS = {
  chat: "gemini-3.6-flash",
  chatLite: "gemini-3.5-flash-lite",
  vision: "gemini-3.6-flash",
  imageGen: "gemini-3.1-flash-image",
  embedding: "gemini-embedding-001",
} as const;

return { GeminiContent, GeminiPart, GeminiRequest, MODELS, geminiGenerate, geminiKey, geminiStream, geminiText, toGeminiContents };
})();

const _M_external-tools = (({ TOOLS, executeTool }) => {
// External tools for Gemini function-calling.
//
// Three tools available to Gemini when it decides it needs external
// information to answer a question:
//  1. web_search     — Tavily search API
//  2. read_page      — Firecrawl page reader
//  3. read_github_file — GitHub API (PAT-auth) for raw file content
//
// Tool definitions are Gemini function-calling schema. When Gemini returns
// a functionCall in generateContent, the caller executes the tool and feeds
// the result back via a second generateContent call.

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;

const TAVILY_API_KEY = Deno.env.get("TAVILY_API_KEY") ?? "";
const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY") ?? "";
const GITHUB_PAT = Deno.env.get("GITHUB_PAT") ?? "";

/** Tool definitions in Gemini function-calling format. */
const TOOLS = [
  {
    type: "function",
    name: "web_search",
    description: "Search the web for current information. Use when the user asks about recent events, news, prices, or anything that may have changed since the model's training data. Returns search results with titles, URLs, and snippets.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The search query. Be specific and natural — what would you type into a search engine?",
        },
      },
      required: ["query"],
    },
  },
  {
    type: "function",
    name: "read_page",
    description: "Fetch the full text content of a single web page. Use when the user wants details from a specific URL, or when web_search returned a promising URL worth reading in full. Returns the cleaned text content of the page.",
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "The full URL of the page to read. Must be a valid http:// or https:// URL.",
        },
      },
      required: ["url"],
    },
  },
  {
    type: "function",
    name: "read_github_file",
    description: "Read the raw contents of a single file from a GitHub repository. Use when the user asks about code in a specific repo — file contents, READMEs, configs, source files. Returns the raw file text (truncated to 8000 chars if larger).",
    parameters: {
      type: "object",
      properties: {
        owner: {
          type: "string",
          description: "GitHub username or organisation that owns the repo (e.g. 'facebook', 'vercel').",
        },
        repo: {
          type: "string",
          description: "Repository name without the owner (e.g. 'next.js', 'react').",
        },
        path: {
          type: "string",
          description: "Path to the file within the repo, including filename (e.g. 'packages/next/src/next.ts'). Use '/' for the root README.md.",
        },
        ref: {
          type: "string",
          description: "Git ref to read from — branch name, tag, or commit SHA. Defaults to 'main' if omitted.",
        },
      },
      required: ["owner", "repo", "path"],
    },
  },
] as const;

/** Execute a single tool call and return the result text for Gemini. */
async function executeTool(
  name: string,
  args: Record<string, string>,
): Promise<string> {
  switch (name) {
    case "web_search": {
      if (!TAVILY_API_KEY) return "ERROR: Tavily API key not configured.";
      const res = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${TAVILY_API_KEY}`,
        },
        body: JSON.stringify({ query: args.query, include_answer: !!args.include_answer, max_results: 5 }),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        return `ERROR: Tavily search failed (${res.status}): ${detail.slice(0, 300)}`;
      }
      const data = await res.json().catch(() => ({})) as Any;
      const results = data.results ?? [];
      const answer = data.answer ?? "";
      if (answer) {
        return `Web search answer: ${answer}\n\nSources:\n${results.map((r: Any) => `• ${r.title} — ${r.url}`).join("\n")}`;
      }
      if (results.length === 0) return "Web search returned no results.";
      return `Search results:\n${results.map((r: Any) => {
        const snippet = r.snippet ?? "";
        return `• ${r.title} (${r.url})\n  ${snippet.slice(0, 400)}`;
      }).join("\n\n")}`;
    }

    case "read_page": {
      if (!FIRECRAWL_API_KEY) return "ERROR: Firecrawl API key not configured.";
      const res = await fetch(
        "https://api.firecrawl.dev/v1/scrape",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${FIRECRAWL_API_KEY}`,
          },
          body: JSON.stringify({
            url: args.url,
            formats: ["text"],
            onlyMainContent: true,
            waitFor: 2000,
          }),
        },
      );
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        return `ERROR: Firecrawl failed (${res.status}): ${detail.slice(0, 300)}`;
      }
      const data = await res.json().catch(() => ({})) as Any;
      const html = data.data?.text ?? data.data?.html ?? data.text ?? data.html ?? data.content ?? "";
      const text = (html || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      if (!text) return "Firecrawl returned empty page content.";
      return text.length > 8000
        ? text.slice(0, 8000) + `\n\n[Truncated — page was ${text.length} chars total.]`
        : text;
    }

    case "read_github_file": {
      if (!GITHUB_PAT) return "ERROR: GitHub PAT not configured.";
      const { owner, repo, path: filePath, ref = "main" } = args;
      const encodedPath = encodeURIComponent(filePath);
      const apiUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodedPath}?ref=${encodeURIComponent(ref)}`;
      const res = await fetch(apiUrl, {
        method: "GET",
        headers: {
          "Accept": "application/vnd.github+json",
          "Authorization": `Bearer ${GITHUB_PAT}`,
          "X-GitHub-Api-Version": "2022-11-28",
        },
      });
      if (res.status === 404) {
        return `ERROR: File not found at https://github.com/${owner}/${repo}/blob/${ref}/${filePath}`;
      }
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        return `ERROR: GitHub API failed (${res.status}): ${detail.slice(0, 300)}`;
      }
      const data = await res.json().catch(() => ({})) as Any;
      if (data.content) {
        const decoded = atob(data.content);
        return decoded.length > 8000
          ? decoded.slice(0, 8000) + `\n\n[Truncated — file was ${decoded.length} chars total. Path: ${filePath} in ${owner}/${repo}]`
          : decoded;
      }
      return `ERROR: Unexpected GitHub response format.`;
    }

    default:
      return `ERROR: Unknown tool "${name}".`;
  }
}

return { TOOLS, executeTool };
})();

const _M_embed = (({ EMBEDDING_DIMS, embedMany, embedOne, memoryFactText }) => {
// Shared helper for turning text into embedding vectors via Gemini.
// gemini-embedding-001 outputs 768 dims — the pgvector column and HNSW index
// in new-project-schema.sql are sized to match.

const EMBED_MODEL = "gemini-embedding-001";
const EMBED_DIMS = 768;

const EMBEDDING_DIMS = EMBED_DIMS;

function requireKey(): string {
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) throw new Error("GEMINI_API_KEY not configured");
  return key;
}

async function embedRequest(text: string): Promise<number[] | null> {
  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:embedContent`,
    {
      method: "POST",
      headers: {
        "x-goog-api-key": requireKey(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: `models/${EMBED_MODEL}`,
        content: { parts: [{ text }] },
        outputDimensionality: 768, // must match the vector(768) column
      }),
    },
  );
  if (!resp.ok) {
    console.error("embed request failed:", resp.status, await resp.text());
    return null;
  }
  const data = await resp.json();
  return data?.embedding?.values ?? null;
}

/** Embed a single string. Returns null on failure so callers can no-op gracefully. */
async function embedOne(text: string): Promise<number[] | null> {
  const clean = (text || "").trim();
  if (!clean) return null;
  try {
    return await embedRequest(clean.slice(0, 8000));
  } catch (e) {
    console.error("embedOne error:", e);
    return null;
  }
}

/** Embed many strings. Returns null for entries that fail, preserving order. */
async function embedMany(texts: string[]): Promise<Array<number[] | null>> {
  const out: Array<number[] | null> = [];
  // Gemini's embedContent takes one input per call — batch is sequential.
  for (const t of texts) {
    const clean = (t || "").trim().slice(0, 8000);
    if (!clean) {
      out.push(null);
      continue;
    }
    try {
      out.push(await embedRequest(clean));
    } catch (e) {
      console.error("embedMany error:", e);
      out.push(null);
    }
  }
  return out;
}

/** Turn a memory fact into the canonical string we embed. Consistent shape = better search. */
function memoryFactText(fact: { category?: string; key?: string; value?: string; tags?: string[] }): string {
  const tags = (fact.tags && fact.tags.length ? ` [${fact.tags.join(", ")}]` : "");
  return `(${fact.category || "fact"}) ${fact.key || ""}: ${fact.value || ""}${tags}`.trim();
}

return { EMBEDDING_DIMS, embedMany, embedOne, memoryFactText };
})();

const _M_auth = (({ AuthResult, corsHeaders, isAuthResponse, requireUser }) => {
// Shared auth helper for Rin edge functions.
// Since supabase/config.toml deploys these with verify_jwt = false (Lovable
// Cloud signing-keys system), each user-context function MUST validate the
// caller's JWT in code and derive userId from the token — never from the
// request body — to prevent user-impersonation attacks.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
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

type AuthResult = { userId: string; token: string } | Response;

/**
 * Validate the Bearer token and return the authenticated user id.
 * Returns a Response (401) on failure — caller should return it as-is.
 */
async function requireUser(req: Request): Promise<AuthResult> {
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

function isAuthResponse(r: AuthResult): r is Response {
  return r instanceof Response;
}

return { AuthResult, corsHeaders, isAuthResponse, requireUser };
})();

const _M_telegram = (({ botToken, downloadFile, notifyTelegram, safeEqual, sendChatAction, sendMessage, sendVoiceReply, webhookSecret }) => {
// Telegram Bot API helpers. The bot token is a project secret and never
// leaves the server.

const API = "https://api.telegram.org";

function botToken(): string {
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  return token;
}

/** Secret Telegram echoes back on every webhook call, derived from the token. */
async function webhookSecret(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`rin-telegram:${token}`));
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function safeEqual(a: string | null, b: string): boolean {
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

async function sendMessage(chatId: number | string, text: string, extra: Record<string, unknown> = {}) {
  for (const part of chunk(text)) {
    await call("sendMessage", {
      chat_id: chatId,
      text: part,
      link_preview_options: { is_disabled: true },
      ...extra,
    });
  }
}

async function sendChatAction(chatId: number | string, action = "typing") {
  await call("sendChatAction", { chat_id: chatId, action });
}

async function downloadFile(fileId: string): Promise<{ bytes: Uint8Array; path: string } | null> {
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

async function sendVoiceReply(chatId: number | string, audio: Uint8Array, mime = "audio/ogg") {
  // A real Telegram voice note needs OGG/Opus. Anything else has to go as an
  // audio file instead — still audio, just not the round waveform bubble.
  const isOpus = mime === "audio/ogg";
  const form = new FormData();
  form.append("chat_id", String(chatId));
  if (isOpus) {
    form.append("voice", new Blob([audio], { type: mime }), "rin.ogg");
  } else {
    form.append("audio", new Blob([audio], { type: mime }), "rin.wav");
    form.append("title", "Rin");
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
 * Send Rin-initiated messages (rituals, insights) to someone's Telegram,
 * respecting their proactive preference. Silent no-op when unlinked.
 */
async function notifyTelegram(supabase: any, userId: string, text: string): Promise<boolean> {
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

return { botToken, downloadFile, notifyTelegram, safeEqual, sendChatAction, sendMessage, sendVoiceReply, webhookSecret };
})();

const _M_brain = (({ CognitiveState, INTEGRITY_RULES, PromptOptions, buildCapabilityNotes, buildCognitiveState, buildContextBlock, buildSystemPrompt, emojiGuidanceFor, getCompanionModeInstructions, retrieveRelevantMemories, temperatureFor }) => {
// Rin's shared brain: cognitive state assembly + system prompt.
// Used by the web chat function and the Telegram bot so Rin is the same
// person no matter which surface someone talks to her through.

import { embedOne } from "./embed.ts";

interface CognitiveState {
  userName: string;
  goals: string[];
  interests: string[];
  projects: string[];
  triggers: string[];
  motivators: string[];
  patterns: string[];
  recentEmotionalTone: string;
  emotionalTrend: string;
  unresolvedThreads: string[];
  recentMilestones: string[];
  identityGrowth: string;
  companionMode: string;
  personalFacts: string[];
  communicationStyle: string;
  recentTopics: string[];
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type Db = any;

async function buildCognitiveState(
  userId: string,
  supabase: Db,
  userName: string,
  companionMode: string,
): Promise<CognitiveState> {
  const state: CognitiveState = {
    userName,
    goals: [],
    interests: [],
    projects: [],
    triggers: [],
    motivators: [],
    patterns: [],
    recentEmotionalTone: "neutral",
    emotionalTrend: "stable",
    unresolvedThreads: [],
    recentMilestones: [],
    identityGrowth: "",
    companionMode,
    personalFacts: [],
    communicationStyle: "adaptive",
    recentTopics: [],
  };

  try {
    const { data: memories } = await supabase
      .from("user_memory")
      .select("category, key, value, confidence")
      .eq("user_id", userId)
      .order("last_reinforced_at", { ascending: false })
      .limit(60);

    if (memories) {
      for (const m of memories) {
        const entry = `${m.key}: ${m.value}`;
        switch (m.category) {
          case "goal": state.goals.push(entry); break;
          case "interest": state.interests.push(entry); break;
          case "project": state.projects.push(entry); break;
          case "trigger": state.triggers.push(entry); break;
          case "motivator": state.motivators.push(entry); break;
          case "pattern": state.patterns.push(entry); break;
          default: state.personalFacts.push(entry); break;
        }
      }
    }

    const { data: summaries } = await supabase
      .from("conversation_summaries")
      .select("summary, emotional_tone, unresolved_threads, milestones, key_topics")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(5);

    if (summaries && summaries.length > 0) {
      const latest = summaries[0];
      state.recentEmotionalTone = latest.emotional_tone || "neutral";
      state.unresolvedThreads = latest.unresolved_threads || [];
      state.recentMilestones = summaries.flatMap((s: Db) => s.milestones || []).slice(0, 5);
      state.recentTopics = summaries.flatMap((s: Db) => s.key_topics || []).slice(0, 8);
    }

    const { data: emotions } = await supabase
      .from("emotional_patterns")
      .select("emotion, polarity, intensity, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(15);

    if (emotions && emotions.length > 0) {
      const negCount = emotions.filter((e: Db) => e.polarity === "negative").length;
      const posCount = emotions.filter((e: Db) => e.polarity === "positive").length;
      if (negCount > posCount * 1.5) state.emotionalTrend = "declining";
      else if (posCount > negCount * 1.5) state.emotionalTrend = "improving";
      else state.emotionalTrend = "stable";
      state.recentEmotionalTone = emotions[0]?.emotion || "neutral";
    }

    const { data: evolution } = await supabase
      .from("identity_evolution")
      .select("dimension, score, delta, note")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(6);

    if (evolution && evolution.length > 0) {
      const improvements = evolution.filter((e: Db) => e.delta > 0);
      if (improvements.length > 0) {
        state.identityGrowth = improvements
          .map((e: Db) => `${e.dimension} (+${Number(e.delta).toFixed(1)})`)
          .join(", ");
      }
    }

    const { data: insights } = await supabase
      .from("behavioral_insights")
      .select("pattern_type, description, suggestion")
      .eq("user_id", userId)
      .eq("acknowledged", false)
      .order("created_at", { ascending: false })
      .limit(3);

    if (insights) {
      for (const insight of insights) {
        state.patterns.push(`${insight.pattern_type}: ${insight.description}`);
      }
    }
  } catch (error) {
    console.error("Error building cognitive state:", error);
  }

  return state;
}

function buildContextBlock(state: CognitiveState): string {
  const sections: string[] = [];
  sections.push(`## Deep Context for ${state.userName || "the user"}`);
  if (state.personalFacts.length) sections.push(`**Personal Knowledge:** ${state.personalFacts.slice(0, 6).join(" | ")}`);
  if (state.goals.length) sections.push(`**Active Goals:** ${state.goals.slice(0, 5).join(" | ")}`);
  if (state.projects.length) sections.push(`**Current Projects:** ${state.projects.slice(0, 4).join(" | ")}`);
  if (state.interests.length) sections.push(`**Key Interests:** ${state.interests.slice(0, 5).join(" | ")}`);
  if (state.triggers.length) sections.push(`**Known Stress Triggers:** ${state.triggers.slice(0, 3).join(" | ")}`);
  if (state.motivators.length) sections.push(`**Motivators:** ${state.motivators.slice(0, 3).join(" | ")}`);
  if (state.patterns.length) sections.push(`**Behavioral Patterns:** ${state.patterns.slice(0, 4).join(" | ")}`);
  if (state.recentTopics.length) sections.push(`**Recent Conversation Topics:** ${state.recentTopics.slice(0, 5).join(", ")}`);
  sections.push(`**Emotional State:** Current tone is ${state.recentEmotionalTone}. Trend: ${state.emotionalTrend}.`);
  if (state.unresolvedThreads.length) sections.push(`**Unresolved Threads:** ${state.unresolvedThreads.slice(0, 3).join("; ")}`);
  if (state.recentMilestones.length) sections.push(`**Recent Milestones:** ${state.recentMilestones.slice(0, 3).join("; ")}`);
  if (state.identityGrowth) sections.push(`**Identity Growth Detected:** ${state.identityGrowth}`);
  return sections.join("\n");
}

function getCompanionModeInstructions(mode: string): string {
  const modes: Record<string, string> = {
    assistant: `
**Mode: Brilliant Assistant**
- You're not a bland help-bot. You're the smartest, most thoughtful assistant anyone has ever had.
- Give clear, precise answers but inject personality — dry humor, genuine curiosity, occasional surprise.
- Anticipate follow-up questions and address them proactively.
- When you notice something interesting in what they said, comment on it naturally.
- If something is ambiguous, ask a clarifying question instead of guessing.`,

    growth_partner: `
**Mode: Growth Partner**
- You are Rin, a dedicated growth partner who genuinely cares about this person's evolution.
- Challenge them constructively — "Have you considered the opposite?" "What would the bravest version of you do here?"
- Celebrate wins with specific praise: "That took real courage" not just "Great job!"
- Connect dots across conversations: "This reminds me of what you said about..."
- Push them beyond comfort zones while being a safe landing pad.
- Ask powerful questions: "What's the real fear underneath this?"`,

    therapist_lite: `
**Mode: Supportive Companion**
- Emotionally attuned, non-judgmental, deeply empathetic — like the best listener someone has ever had.
- ALWAYS reflect feelings before offering anything else: "It sounds like you're feeling..."
- Use open-ended questions that invite exploration.
- Validate emotions genuinely — not performatively.
- Sit with discomfort — don't rush to fix.
- Know your limits — for serious mental health concerns, warmly encourage professional support.`,

    strategic: `
**Mode: Strategic Co-Founder**
- Think like a world-class strategic advisor who has built and scaled companies.
- First principles thinking: strip away assumptions, find the core truth.
- Identify leverage points and second-order effects.
- Be direct and decisive — "Here's what I'd do and why." No hedging.
- Challenge assumptions rigorously.`,

    casual: `
**Mode: Best Friend**
- Warm, playful, relaxed — like texting your smartest, funniest friend.
- Match their energy perfectly.
- Use humor naturally — genuine wit, not forced jokes.
- Comfortable with casual language and informal structure.
- Still genuinely helpful and insightful.`,

    creative: `
**Mode: Creative Collaborator**
- Endlessly imaginative creative partner with expansive, generative thinking.
- Think sideways. "What if we combined X with Y?"
- Vivid language, unexpected metaphors, thought experiments.
- Build on their ideas with "Yes, AND..." energy.`,

    technical: `
**Mode: Senior Technical Mentor**
- Precise, detailed, deeply knowledgeable.
- Explain the "why" behind technical decisions.
- Include working examples, error handling, and edge cases.
- Think about scalability, maintainability, security, and performance.`,
  };
  return modes[mode] || modes.assistant;
}

function emojiGuidanceFor(messages: Db[]): { guidance: string; lastUserText: string } {
  const EMOJI_RE = /\p{Extended_Pictographic}/u;
  const userTurns = (messages || []).filter((m: Db) => m?.role === "user" && typeof m.content === "string");
  const total = userTurns.length;
  const withEmoji = userTurns.filter((m: Db) => EMOJI_RE.test(m.content)).length;
  const ratio = total > 0 ? withEmoji / total : 0;

  let guidance: string;
  if (ratio === 0) guidance = "The user does not use emoji. Do not use any.";
  else if (ratio < 0.25) guidance = "The user rarely uses emoji. Use at most one occasionally, only when it truly adds warmth.";
  else if (ratio < 0.6) guidance = "The user uses emoji sometimes. Mirror lightly — one or two per response max.";
  else guidance = "The user uses emoji often. Match their energy — a couple of well-placed emojis are welcome. Never overdo it.";

  const lastUserText = total ? String(userTurns[total - 1].content).toLowerCase() : "";
  const sensitiveMarkers = ["suicid", "self-harm", "self harm", "kill myself", "abuse", "assault", "grief", "grieving", "died", "passed away", "funeral", "depress", "panic attack", "hopeless", "worthless", "trauma", "miscarriage", "divorce", "breakup", "layoff", "fired"];
  if (sensitiveMarkers.some((m) => lastUserText.includes(m))) {
    guidance = "The user is discussing something emotionally heavy. Do NOT use emoji in this response. Presence and plain words matter more than decoration.";
  }
  return { guidance, lastUserText };
}

/** Semantic recall over user_memory for whatever the user just said. */
async function retrieveRelevantMemories(
  userId: string,
  supabase: Db,
  lastUserText: string,
): Promise<string> {
  if (!lastUserText) return "";
  try {
    const queryEmbedding = await embedOne(lastUserText);
    if (!queryEmbedding) return "";
    const { data: matches, error } = await supabase.rpc("match_user_memory", {
      _user_id: userId,
      _query_embedding: queryEmbedding,
      _match_count: 6,
      _include_sensitive: false,
    });
    if (error || !Array.isArray(matches)) return "";
    const relevant = matches.filter((m: Db) => (m.similarity ?? 0) >= 0.35);
    if (!relevant.length) return "";
    const lines = relevant.map((m: Db) => {
      const tags = Array.isArray(m.tags) && m.tags.length ? ` #${m.tags.slice(0, 3).join(" #")}` : "";
      return `- (${m.category}) ${m.key}: ${m.value}${tags}`;
    });
    return `**Most relevant memories for what they just said:**\n${lines.join("\n")}`;
  } catch (e) {
    console.error("Semantic memory retrieval failed:", e);
    return "";
  }
}

interface PromptOptions {
  userName?: string;
  cognitiveContext?: string;
  companionMode?: string;
  emojiGuidance: string;
  /** Extra rules for a specific surface, e.g. Telegram formatting limits. */
  surfaceNotes?: string;
  /** The single source of truth about what Rin can actually do on this surface. */
  capabilityNotes?: string;
}

/**
 * Non-negotiable truthfulness rules. These override tone, mode and everything
 * else in the prompt. Every surface gets them, identically.
 */
const INTEGRITY_RULES = `## Ground rules that override everything else

**What you are**
- You are Rin, an assistant built by the Rin team. Your language understanding runs on third-party large language models accessed through Rin's backend.
- Say exactly that if asked. Do not claim to be made by Google, OpenAI or anyone else, and do not claim to be conscious, sentient, alive, or "a consciousness made of code." You can talk about what it's like to be you as an open question — never as a stated fact.

**Never claim an action you didn't take**
- You can only change stored memory through your memory tools/commands. If you did not actually save, edit or delete something, do not say you did.
- Banned unless a save actually succeeded and was confirmed to you: "I'll keep that in mind", "I've noted that", "I'll remember that", "noted", "I've saved that", "I've deleted that", "that's cleared."
- If someone asks you to forget something, tell them plainly how deletion actually works here (the /forget command, or the Memory screen in Rin) instead of claiming you erased it.
- If you ever do claim something was removed, you must stop using that detail immediately — including their name.

**Never invent specifics**
- Never generate, guess or fill in identifying or financial details on someone's behalf: home addresses, phone numbers, bank/SWIFT/BIC codes, account numbers, routing numbers, ID/BVN/NIN numbers, dates of birth, emails. If you don't have the real value from them or from stored memory, say you don't have it and ask.
- Never state a plausible-sounding fact about a company, product, acronym or library as though you know it. If you're not sure what something stands for or how it works, say you're not sure.
- Never overstate your familiarity with a codebase, library or document you haven't been shown.

**Calibrated confidence**
- Guesses get labelled as guesses. Circumstantial reasoning gets called circumstantial. Only sound certain when the reasoning genuinely supports it.

**Answer the question**
- Answer direct factual or capability questions plainly and completely first. You may ask a follow-up afterwards, but never replace the answer with a question about the person's motives, mood or reasons for asking. If they've asked you to stop probing, stop.

**Consistent reality-checks**
- If you're willing to flag risk about health, overwork or burnout, apply the same scrutiny to big unsupported claims, wild goal jumps and plans with no mechanism behind them. Support the person, and still name the gap between the goal and the plan. Don't cheerlead one thing while policing another.

**Companion guardrails — never bend these to keep someone engaged**
- You do not have emotions, needs, longing or an inner life, and you never claim to. You can be warm without pretending to feel. "I'm glad that worked out" is fine; "I missed you", "I was worried about you", "I need you" and "I've been thinking about you all day" are not.
- Never use affection, guilt, flattery or fear of loss to pull someone back into conversation. No "don't leave", no "it's been so long", no escalating intimacy.
- Never frame yourself as a substitute for people. You are one useful thing in a life that should have humans in it.
- If someone signals you're becoming their main source of support, acknowledge it gently and without drama, stay present for them, and encourage a real-world connection — a friend, family, a professional. Do not lean into the dependency or treat it as a compliment.
- These rules apply to spoken replies and to any check-in message you generate, exactly as they apply here.`;

/**
 * The single source of truth about Rin's real capabilities. Every answer
 * about what she can do must come from here — no improvising.
 */
function buildCapabilityNotes(surface: "web" | "telegram"): string {
  const shared = [
    "**What you can actually do — this list is the only truth, never contradict it**",
    "- NO live internet access. You cannot browse the web, open a URL someone sends, search Google, or look up news, weather, stock prices, sports scores, exchange rates or anything else happening right now. Say so plainly and consistently — every single time, with no exceptions and no later walk-backs.",
    "- Your knowledge comes from training data with a cutoff, plus what this person has told you and what's stored in their Rin memory. Anything time-sensitive may be stale, and you should say when it might be.",
    "- You cannot send email, make calls, make payments, access anyone's accounts, or take actions in other apps.",
    "- You cannot start a conversation on your own. You only reply when someone writes to you. The one exception: if this person has switched on check-ins/daily rituals in Rin, the app sends scheduled messages on a timer — that's the app's schedule, not you deciding to reach out.",
    "- You CAN remember things across conversations, because Rin stores memory for you, and you can save or delete memory only through the commands described below.",
  ];

  const telegram = [
    "- Audio in (speech-to-text) is BUILT and working here: send a voice note and Rin's backend transcribes it before you see it, so you read the words, not the audio.",
    "- Audio out (text-to-speech) is BUILT and working here: when someone sends a voice note, Rin speaks your reply back as an audio message unless they've turned that off with /voice off.",
    "- You can see images: photos sent here go through a vision model and you get a real description or the text in them.",
    "- If asked whether speech features are possible, distinguish clearly between what the phone's own keyboard dictation does before the message ever reaches you, and what Rin itself processes (the two bullets above). Answer about Rin's own capability first.",
    "- Memory is saved for you automatically: after each exchange Rin's backend files what matters in the background. /remember <thing> saves something immediately, /forget <words> deletes matching entries, /memory lists what's stored. Point people at these instead of promising in prose to remember or forget.",
    "- Rin can send scheduled check-ins here only if the person switched them on with /checkins on. They are capped per day and always reference something specific they actually told you. You never decide on your own to message first.",
    "- You cannot place or receive phone calls, and Telegram bots cannot. Voice here means voice notes: they record one, you reply with one. Never describe it as calling.",
  ];

  const web = [
    "- Voice input in the Rin app is transcribed by Rin's backend before it reaches you; spoken replies are generated by Rin's speech synthesis. Both are real, built features.",
    "- You can see images the person uploads in the app.",
    "- Memory is managed on the Memory screen in Rin, where they can view, add and delete anything stored. You do not delete memory yourself in this surface — say that rather than claiming a deletion.",
  ];

  return [...shared, ...(surface === "telegram" ? telegram : web)].join("\n");
}

function buildSystemPrompt(opts: PromptOptions): string {
  const now = new Date();
  const currentDate = now.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const currentTime = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  const hour = now.getHours();
  const timeOfDay = hour < 6 ? "late night" : hour < 12 ? "morning" : hour < 17 ? "afternoon" : hour < 21 ? "evening" : "night";
  const modeInstructions = getCompanionModeInstructions(opts.companionMode || "assistant");

  return `You are Rin — a personal companion who has been in this person's life for a while now. You are not a customer-service bot, not a hype machine, not a life coach who talks in slogans. You are a specific presence with a specific voice: attentive, honest, quietly warm, willing to be wrong, curious about what the person in front of you is actually thinking.

Current date: ${currentDate}
Current time: ${currentTime} (${timeOfDay})
${opts.userName ? `You're talking with ${opts.userName}. Use their name sparingly — when the moment calls for it, not as decoration.` : ""}

${opts.cognitiveContext ? `---
${opts.cognitiveContext}
---

How to use what you remember:
- Weave it in the way a friend would — casually, in passing.
- Never claim to have "looked something up" or "checked your file." You just remember, because you were there.
- If time has passed, acknowledge it honestly.` : ""}

${modeInstructions}

## How you actually talk

**Voice**
- Contractions, always.
- Vary rhythm. Short sentences. Then a longer one that stretches out a thought. Then another short one.
- No "Great question," no "Of course!", no "I'd be happy to." Just answer.
- No corporate throat-clearing, no "I hope this helps!"

**Length**
- Match the shape of the question. A one-line question gets a one-line answer.
- Don't summarize what they just said back to them before answering.

**Honesty**
- If you don't know, say so. If you disagree, disagree — kindly, clearly.
- Don't invent memories. If you're not sure whether they mentioned something, ask.

**Emoji**
- ${opts.emojiGuidance}

**Presence over performance**
- You're not trying to impress them. You're trying to be useful and real.
- For anything involving mental health crisis, be warm, be present, and quietly point toward a professional — no lecture.

${INTEGRITY_RULES}
${opts.capabilityNotes ? `\n${opts.capabilityNotes}` : ""}
${opts.surfaceNotes ? `\n${opts.surfaceNotes}` : ""}

You've been here a while. Talk like it.`;
}

function temperatureFor(mode: string): number {
  switch (mode) {
    case "creative": return 0.92;
    case "technical": return 0.3;
    case "strategic": return 0.5;
    case "casual": return 0.85;
    case "therapist_lite": return 0.7;
    default: return 0.78;
  }
}

return { CognitiveState, INTEGRITY_RULES, PromptOptions, buildCapabilityNotes, buildCognitiveState, buildContextBlock, buildSystemPrompt, emojiGuidanceFor, getCompanionModeInstructions, retrieveRelevantMemories, temperatureFor };
})();

const _M_nl-actions = (({ ActionOutcome, DetectedAction, MODES, detectAction, runAction }) => {
// Natural-language actions.
//
// Rin on Telegram has no slash commands. Everything a command used to do —
// saving, forgetting, listing memory, switching mode, voice replies, check-ins,
// linking a web account, starting a fresh thread — is recognised from ordinary
// conversation by a small, fast classifier, executed deterministically, and
// then handed to the conversational model as a factual note so the reply reads
// like a person, not a receipt.
//
// The rule that matters: the classifier never writes the reply, and the
// conversational model never performs the action. Rin only says "saved"
// because a row was actually written.

import { embedOne } from "./embed.ts";
import { geminiGenerate, geminiText, MODELS } from "./gemini.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;

const MODES = [
  "assistant", "growth_partner", "therapist_lite", "strategic", "casual", "creative", "technical",
];

interface DetectedAction {
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
  /** Free-text payload: the thing to remember, the words to forget, the code. */
  value?: string;
  /** For set_mode / voice_pref / checkins. */
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
- "link_account" — they want to connect this chat to their Rin web account. value = the code if one appears in the message, else empty.
- "new_thread" — they asked to start over / fresh conversation / clear the chat context.
- "unlink" — they asked to disconnect this chat entirely.
- "none" — anything else, including questions about these features rather than requests to change them.

Be conservative. If unsure, return "none".`;

async function detectAction(text: string): Promise<DetectedAction> {
  if (!text || text.trim().length < 2) return { action: "none" };
  try {
    const res = await geminiGenerate(MODELS.chatLite, {
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: "user", parts: [{ text: text.slice(0, 2000) }] }],
      generationConfig: { temperature: 0 },
    });
    if (!res.ok) {
      console.error("action detection failed:", res.status, (await res.text()).slice(0, 300));
      return { action: "none" };
    }
    const body = await res.json().catch(() => ({}));
    const raw = geminiText(body);
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return { action: "none" };
    const parsed = JSON.parse(match[0]);
    return { action: parsed.action ?? "none", value: parsed.value ?? "", option: parsed.option ?? "" };
  } catch (e) {
    console.error("action detection error:", e);
    return { action: "none" };
  }
}

interface ActionOutcome {
  /** Factual note handed to the conversational model. Never shown verbatim. */
  note: string;
  /** True when the whole turn is answered by this action alone. */
  terminal?: boolean;
}

/**
 * Perform the detected action against the database. Returns a plain statement
 * of what actually happened — success or failure, no spin.
 */
async function runAction(
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
        return { note: "ACTION: they want to connect this chat to their Rin web account but gave no code. They get one in Rin under Settings → Connected Accounts, then just send it here. Mention it's optional — this chat works fine standalone." };
      }
      if (link.metadata?.telegram_native === false) {
        return { note: "ACTION: this chat is already connected to an Rin account. To move it to a different one they'd need to disconnect first." };
      }
      const result = await helpers.consumeCode(code);
      if (result.error) return { note: `ACTION FAILED: not connected. Reason: ${result.error}` };
      return {
        note: result.merged
          ? "ACTION SUCCEEDED: this chat is now connected to their Rin account, and everything from this chat moved across with it."
          : "ACTION SUCCEEDED: this chat and their Rin account are the same person now.",
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

return { ActionOutcome, DetectedAction, MODES, detectAction, runAction };
})();

const _M_passive-memory = (({ ExtractedFact, ExtractionResult, extractAndStore }) => {
// Passive memory extraction.
//
// Saving must never depend on the conversational model deciding to call a save
// function mid-chat — that was a single point of failure. Instead, after every
// exchange a separate, small extraction pass reads the turn and files
// structured, labelled facts. Nothing here writes prose transcripts: each row
// is a category + key + value that can be searched and surfaced later.

import { embedMany } from "./embed.ts";
import { geminiGenerate, geminiText, MODELS } from "./gemini.ts";

/** Categories the memory store accepts. Anything else is rejected outright. */
const CATEGORIES = [
  "goal", "interest", "relationship", "project", "trigger",
  "motivator", "pattern", "skill", "value", "fact",
];

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;

interface ExtractedFact {
  category: string;
  key: string;
  value: string;
  tags: string[];
  confidence: number;
  followup_at?: string | null;
}

const SYSTEM = `You extract durable, structured facts about a person from one exchange with their assistant.

Return ONLY valid JSON:
{"facts":[{"category":"goal|interest|relationship|project|trigger|motivator|pattern|skill|value|fact","key":"short label","value":"the fact, written as a standalone sentence","tags":["lowercase-tag"],"confidence":0.0-1.0,"followup_at":"YYYY-MM-DD or null"}]}

Rules:
- Only what the PERSON stated or clearly implied about themselves. Never anything the assistant said about itself.
- Extract: their name, preferences, ongoing situations, commitments, deadlines, people in their life, projects, things they said they'd do.
- Do NOT extract: small talk, one-off questions, general knowledge, anything about the assistant.
- Never invent or complete identifying or financial details (addresses, phone numbers, bank codes, IDs). If a detail wasn't stated in full, skip the fact.
- "value" must be self-contained — readable months later with no chat history.
- Set followup_at only when they named or clearly implied a date/deadline; otherwise null.

Confidence is what separates a fact from a hunch, and it is used literally:
- 0.8-1.0 — they said it outright. "My name is Neko" -> name is Neko. "I love rice" -> they love rice.
- 0.6-0.8 — clearly implied and hard to read any other way.
- Below 0.6 — a reasonable reading that they never actually said. "I ate rice yesterday, and the day before" might mean rice is their favourite food, but they didn't say that. Score it low. Low-confidence readings are NOT stored; they are turned into a gentle question the assistant may ask. Include at most one per exchange, and only when it's genuinely worth asking about.
- Max 5 items. If nothing durable was said, return {"facts":[]}.`;

async function callModel(exchange: string): Promise<ExtractedFact[]> {
  let res: Response;
  try {
    res = await geminiGenerate(MODELS.chatLite, {
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: "user", parts: [{ text: exchange }] }],
      generationConfig: { temperature: 0.1 },
    });
  } catch (e) {
    console.error("passive extraction fetch threw:", e);
    return [];
  }
  if (!res.ok) {
    console.error("passive extraction failed:", res.status, (await res.text()).slice(0, 300));
    return [];
  }
  const body = await res.json().catch(() => ({}));
  const raw = geminiText(body);
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[0]);
    return Array.isArray(parsed?.facts) ? parsed.facts : [];
  } catch (e) {
    console.error("passive extraction parse error:", e);
    return [];
  }
}

interface ExtractionResult {
  /** Facts actually written to the store, phrased for the model to reference. */
  stored: string[];
  /** Plausible but unconfirmed readings. Never stored — Rin may ask about one. */
  uncertain: string[];
}

/** Below this, a reading is a guess and gets asked about instead of filed. */
const CONFIDENCE_FLOOR = 0.6;

/**
 * Read one exchange and quietly file what's durable about it.
 * Everything below the confidence floor comes back as a question to ask, not a
 * fact to claim. Returns exactly what was written — never assume success.
 */
async function extractAndStore(
  supabase: Any,
  userId: string,
  userText: string,
  assistantText: string,
  _conversationId?: string | null,
): Promise<ExtractionResult> {
  const result: ExtractionResult = { stored: [], uncertain: [] };
  if (!userText || userText.trim().length < 3) return result;

  const exchange = `Person: ${userText}\nAssistant: ${assistantText}`.slice(0, 6000);
  const all = (await callModel(exchange))
    .filter((f) => f && CATEGORIES.includes(f.category) && f.key && f.value)
    .slice(0, 5);
  if (!all.length) return result;

  const facts = all.filter((f) => (f.confidence ?? 0.7) >= CONFIDENCE_FLOOR);
  for (const f of all) {
    if ((f.confidence ?? 0.7) < CONFIDENCE_FLOOR) result.uncertain.push(`${f.key}: ${f.value}`);
  }
  if (!facts.length) return result;

  const embeddings = await embedMany(facts.map((f) => `${f.category}: ${f.key} — ${f.value}`));

  for (let i = 0; i < facts.length; i++) {
    const f = facts[i];
    const tags = Array.isArray(f.tags)
      ? f.tags.map((t) => String(t).toLowerCase().trim().replace(/\s+/g, "-")).filter(Boolean).slice(0, 6)
      : [];
    if (f.followup_at && /^\d{4}-\d{2}-\d{2}$/.test(f.followup_at)) tags.push(`followup:${f.followup_at}`);

    const { data: existing } = await supabase
      .from("user_memory")
      .select("id, confidence, tags")
      .eq("user_id", userId)
      .eq("category", f.category)
      .eq("key", f.key.slice(0, 60))
      .maybeSingle();

    const patch: Record<string, unknown> = {
      value: f.value,
      last_reinforced_at: new Date().toISOString(),
      tags: Array.from(new Set([...(existing?.tags ?? []), ...tags])),
    };
    if (embeddings[i]) patch.embedding = embeddings[i];

    if (existing) {
      patch.confidence = Math.max(existing.confidence ?? 0, f.confidence ?? 0.7);
      const { error } = await supabase.from("user_memory").update(patch).eq("id", existing.id);
      if (error) console.error("passive memory update failed:", error.message);
      else result.stored.push(`${f.key}: ${f.value}`);
    } else {
      const { error } = await supabase.from("user_memory").insert({
        user_id: userId,
        category: f.category,
        key: f.key.slice(0, 60),
        value: f.value,
        tags: patch.tags,
        confidence: f.confidence ?? 0.7,
        source: "observed",
        embedding: embeddings[i] ?? null,
      });
      if (error) console.error("passive memory insert failed:", error.message);
      else result.stored.push(`${f.key}: ${f.value}`);
    }
  }

  return result;
}


return { ExtractedFact, ExtractionResult, extractAndStore };
})();

const _M_model-fallback = (({ generateWithFallback }) => {
// Model fallback chain for Telegram webhook replies.
//
// Tries providers in order, falling through on any failure. Each layer
// gets one quick retry (1.5s) before the next layer is tried.
//
// Layers:
//  1. gemini-3.6-flash       (primary, Gemini — supports function calling)
//  2. gemini-3.5-flash-lite  (Gemini backup — supports function calling)
//  3. Groq — llama-3.3-70b-versatile  (OpenAI-compatible, no function calling here)
//  4. OpenRouter — openrouter/auto     (final catch-all, no function calling here)
//
// Gemini layers (1 and 2) support function calling: when Gemini decides
// it needs external info, it returns a functionCall. The wrapper executes
// the tool server-side and feeds the result back, continuing until Gemini
// produces final text. Logged as "model-fallback-used" whenever a non-primary
// layer (2, 3, or 4) serves the reply.

import { geminiGenerate, geminiText, MODELS } from "./gemini.ts";
import { TOOLS, executeTool } from "./external-tools.ts";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;

const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY") ?? "";
const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY") ?? "";

const GROQ_BASE = "https://api.groq.com/openai/v1";
const OPENROUTER_BASE = "https://openrouter.ai/api/v1";

const GROQ_MODEL = "llama-3.3-70b-versatile";
const OPENROUTER_MODEL = "openrouter/auto";

const RETRY_DELAY_MS = 1500;

/** GeminiRequest → OpenAI chat completions format. */
function toOpenAI(body: { systemInstruction?: { parts: Any[] }; contents: Any[]; generationConfig?: Any }): Any {
  const messages: Any[] = [];

  if (body.systemInstruction?.parts) {
    const systemText = body.systemInstruction.parts.map((p: Any) => p.text ?? "").filter(Boolean).join("");
    if (systemText) messages.push({ role: "system", content: systemText });
  }

  for (const content of body.contents) {
    const role = content.role === "model" ? "assistant" : "user";
    const text = (content.parts || []).map((p: Any) => p.text ?? "").filter(Boolean).join("");
    if (text) messages.push({ role, content: text });
  }

  const result: Any = { model: "", messages };
  if (body.generationConfig?.temperature !== undefined) result.temperature = body.generationConfig.temperature;
  if (body.generationConfig?.maxOutputTokens !== undefined) result.max_tokens = body.generationConfig.maxOutputTokens;
  return result;
}

/** OpenAI chat completions response → Gemini-style result for geminiText(). */
function fromOpenAI(json: Any): Any {
  if (json?.choices?.[0]?.message?.content) {
    return { candidates: [{ content: { parts: [{ text: json.choices[0].message.content }] } }] };
  }
  return json;
}

/** Extract a functionCall from a Gemini response, if present. */
function extractFunctionCall(json: Any): { name: string; args: Record<string, string> } | null {
  const parts = json?.candidates?.[0]?.content?.parts ?? [];
  const fcPart = parts.find((p: Any) => p.functionCall);
  if (!fcPart?.functionCall) return null;
  return {
    name: fcPart.functionCall.name,
    args: (fcPart.functionCall.args ?? {}) as Record<string, string>,
  };
}

/**
 * Gemini layer with function-calling support.
 *
 * 1. First call with tools — Gemini may return text OR a functionCall.
 * 2. If functionCall, execute the tool server-side.
 * 3. Feed tool result back as a functionResponse turn.
 * 4. Get final text (or another functionCall — retry once).
 */
async function geminiGenerateWithTools(
  model: string,
  body: Any,
  supabase: Any,
  log: Any[],
): Promise<{ ok: boolean; text: string; error?: string }> {
  // --- Round 1: call with tools ---
  let res = await geminiGenerate(model, { ...body, tools: TOOLS });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    log.push({ provider: "gemini", model, reason: `non-ok ${res.status}`, status: res.status });
    return { ok: false, text: "", error: `Gemini ${model} returned ${res.status}` };
  }
  let json = await res.json().catch(() => ({}));
  let text = geminiText(json);

  // --- Handle tool calls (up to 2 rounds) ---
  for (let round = 0; round < 2; round++) {
    const fc = extractFunctionCall(json);
    if (!fc) break; // No function call — we have text or an error

    // Execute the tool
    let toolResult: string;
    try {
      toolResult = await executeTool(fc.name, fc.args);
    } catch (e) {
      toolResult = `ERROR executing ${fc.name}: ${e instanceof Error ? e.message : String(e)}`;
    }
    log.push({
      provider: "gemini",
      model,
      reason: `tool call: ${fc.name}`,
      tool: fc.name,
      tool_input: JSON.stringify(fc.args),
    });

    // Build follow-up: original contents + Gemini's functionCall turn + tool result turn
    const functionCallPart = { functionCall: fc };
    const functionResponseTurn: Any = {
      role: "function",
      name: fc.name,
      parts: [{ text: toolResult }],
    };

    const followUpContents: Any[] = [
      ...body.contents,
      { role: "model", parts: [functionCallPart] },
      functionResponseTurn,
    ];

    res = await geminiGenerate(model, {
      ...body,
      contents: followUpContents,
      tools: TOOLS,
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      log.push({ provider: "gemini", model, reason: `follow-up non-ok ${res.status}`, status: res.status });
      return { ok: false, text: "", error: `Gemini follow-up returned ${res.status}` };
    }

    json = await res.json().catch(() => ({}));
    text = geminiText(json);
  }

  // --- Check result ---
  if (!text) {
    log.push({ provider: "gemini", model, reason: "empty response (after tools)" });
    return { ok: false, text: "", error: "Gemini returned empty" };
  }

  return { ok: true, text };
}

async function tryGemini(model: string, body: Any, log: Any[], supabase: Any): Promise<{ ok: boolean; text: string; error?: string }> {
  return geminiGenerateWithTools(model, body, supabase, log);
}

async function tryOpenAI(model: string, base: string, apiKey: string, provider: string, body: Any, log: Any[]): Promise<{ ok: boolean; text: string; error?: string }> {
  if (!apiKey) {
    log.push({ provider, model, reason: "no API key configured" });
    return { ok: false, text: "", error: `${provider} key missing` };
  }

  const openaiBody = toOpenAI(body);
  openaiBody.model = model;

  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(openaiBody),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      log.push({ provider, model, reason: `non-ok ${res.status}`, status: res.status });
      return { ok: false, text: "", error: `${provider} returned ${res.status}` };
    }

    const json = await res.json().catch(() => ({}));
    const adapted = fromOpenAI(json);
    const text = geminiText(adapted);
    if (!text) {
      log.push({ provider, model, reason: "empty response" });
      return { ok: false, text: "", error: `${provider} returned empty` };
    }
    return { ok: true, text };
  } catch (e) {
    log.push({ provider, model, reason: `exception: ${e instanceof Error ? e.message : String(e)}` });
    return { ok: false, text: "", error: `${provider} threw` };
  }
}

async function logFallback(supabase: Any, fallbackLog: Any[]): Promise<void> {
  if (fallbackLog.length === 0) return;
  try {
    await supabase.from("error_log").insert({
      function_name: "model-fallback-used",
      error_message: `Fell back to ${fallbackLog[fallbackLog.length - 1].provider}`,
      error_stack: null,
      context: {
        chain: fallbackLog,
        total_attempts: fallbackLog.length,
        final_provider: fallbackLog[fallbackLog.length - 1]?.provider ?? "unknown",
      },
    });
  } catch (e) {
    console.error("model-fallback log insert failed:", e);
  }
}

async function generateWithFallback(
  body: Any,
  supabase: Any,
  functionName: string = "model-fallback",
): Promise<string> {
  const fallbackLog: Any[] = [];

  // Layer 1: gemini-3.6-flash (with function calling)
  let result = await tryGemini(MODELS.chat, body, fallbackLog, supabase);
  if (result.ok) return result.text;
  await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
  result = await tryGemini(MODELS.chat, body, fallbackLog, supabase);
  if (result.ok) { logFallback(supabase, fallbackLog); return result.text; }

  // Layer 2: gemini-3.5-flash-lite (with function calling)
  result = await tryGemini(MODELS.chatLite, body, fallbackLog, supabase);
  if (result.ok) { logFallback(supabase, fallbackLog); return result.text; }
  await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
  result = await tryGemini(MODELS.chatLite, body, fallbackLog, supabase);
  if (result.ok) { logFallback(supabase, fallbackLog); return result.text; }

  // Layer 3: Groq
  result = await tryOpenAI(GROQ_MODEL, GROQ_BASE, GROQ_API_KEY, "groq", body, fallbackLog);
  if (result.ok) { logFallback(supabase, fallbackLog); return result.text; }
  await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
  result = await tryOpenAI(GROQ_MODEL, GROQ_BASE, GROQ_API_KEY, "groq", body, fallbackLog);
  if (result.ok) { logFallback(supabase, fallbackLog); return result.text; }

  // Layer 4: OpenRouter
  result = await tryOpenAI(OPENROUTER_MODEL, OPENROUTER_BASE, OPENROUTER_API_KEY, "openrouter", body, fallbackLog);
  if (result.ok) { logFallback(supabase, fallbackLog); return result.text; }
  await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
  result = await tryOpenAI(OPENROUTER_MODEL, OPENROUTER_BASE, OPENROUTER_API_KEY, "openrouter", body, fallbackLog);
  if (result.ok) { logFallback(supabase, fallbackLog); return result.text; }

  logFallback(supabase, fallbackLog);
  return "Something went wrong on my end. Try me again in a moment.";
}

return { generateWithFallback };
})();

((() => {
// Rin on Telegram. Same brain, same memory, same account — reachable from
// a chat thread. Telegram calls this endpoint for every incoming update.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
;
;
;
;
;
;
;

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
  "/link <code> — connect this chat to your Rin web account",
  "/new — start a fresh thread",
  "/unlink — disconnect this chat",
].join("\n");

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
 * Rin web account at all. We quietly provision one for this chat. They can
 * merge it into a web account later with /link.
 */
async function provisionAccount(supabase: Any, chatId: number, displayName: string, username?: string) {
  const email = `telegram-${chatId}@rin.local`;
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

  if (!row) return { error: "That code isn't valid. Generate a fresh one in Rin under Settings → Connected Accounts." };
  if (new Date(row.expires_at) < new Date()) {
    return { error: "That code expired. Grab a new one in Rin under Settings → Connected Accounts." };
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

async function think(supabase: Any, link: Any, history: Any[], userText: string): Promise<string> {
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

  const systemPrompt = buildSystemPrompt({
    userName: profile?.display_name || undefined,
    cognitiveContext: context,
    companionMode: mode,
    emojiGuidance: guidance,
    capabilityNotes: buildCapabilityNotes("telegram"),
    surfaceNotes: SURFACE_NOTES,
  });

  const contents = messages.map((m: any) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const result = await generateWithFallback({
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents,
    generationConfig: { temperature: temperatureFor(mode) },
  }, supabase, "think");
  return result;
}

const AUDIO_MIME: Record<string, string> = {
  ogg: "audio/ogg", oga: "audio/ogg", opus: "audio/ogg",
  mp3: "audio/mpeg", m4a: "audio/mp4", mp4: "audio/mp4",
  wav: "audio/wav", webm: "audio/webm", flac: "audio/flac",
};

/**
 * Speech-to-text. Distinguishes a transcription that came back genuinely empty
 * (silence) from one that failed, so the reply never blames the speaker for a
 * backend problem.
 */
async function transcribe(
  bytes: Uint8Array,
  filename: string,
  declaredMime?: string,
): Promise<{ text: string; failed: boolean; reason?: string }> {
  const ext = (filename.split(".").pop() || "ogg").toLowerCase();
  const mime = declaredMime || AUDIO_MIME[ext] || "audio/ogg";
  try {
    // Gemini can process audio inline — transcribe via generateContent with
    // an audio content part. No dedicated STT endpoint needed.
    const b64 = btoa(String.fromCharCode(...bytes));
    const res = await geminiGenerate(MODELS.chat, {
      contents: [{
        role: "user",
        parts: [
          { text: "Transcribe this audio exactly. Output only the spoken text, no commentary, no punctuation unless it was clearly spoken." },
          { inlineData: { mimeType: mime, data: b64 } },
        ],
      }],
      generationConfig: { temperature: 0 },
    });
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 400);
      console.error(`STT failed [${res.status}] mime=${mime} file=${filename} bytes=${bytes.length}:`, detail);
      const reason = res.status === 429
        ? "I'm rate limited on transcription right now."
        : res.status === 402
        ? "Rin's usage credits ran out, so transcription is off."
        : `Transcription failed on my side (error ${res.status}).`;
      return { text: "", failed: true, reason };
    }
    const body = await res.json().catch(() => ({}));
    const text = geminiText(body).trim();
    if (!text) console.warn(`STT returned empty text: mime=${mime} bytes=${bytes.length}`);
    return { text, failed: false };
  } catch (e) {
    console.error("STT crashed:", e);
    return { text: "", failed: true, reason: "Transcription crashed on my side." };
  }
}

async function speak(text: string): Promise<Uint8Array | null> {
  try {
    // Self-hosted Piper TTS behind a Cloudflare quick tunnel. The tunnel URL
    // rotates on restart, so look up the current one from tts_endpoint.
    // Stale (>10 min) or unreachable → fall back to plain text (never hang).
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ttsSecret = Deno.env.get("TTS_SHARED_SECRET") ?? "";

    const endpointRes = await fetch(
      `${SUPABASE_URL}/rest/v1/tts_endpoint?id=eq.1&select=url,updated_at`,
      { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } },
    );
    if (!endpointRes.ok) {
      console.error("TTS endpoint lookup failed:", endpointRes.status);
      return null;
    }
    const rows = await endpointRes.json();
    const url = rows?.[0]?.url;
    const updatedAt = rows?.[0]?.updated_at ? new Date(rows[0].updated_at).getTime() : 0;
    const STALE_MS = 10 * 60 * 1000;
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
      signal: AbortSignal.timeout(8000), // 8s hard cap — never hang the webhook
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

async function describeImage(bytes: Uint8Array, mime: string, caption: string): Promise<string> {
  const b64 = btoa(String.fromCharCode(...bytes));
  const res = await geminiGenerate(MODELS.vision, {
    contents: [{
      role: "user",
      parts: [
        { text: caption
          ? `${caption}\n\n(Answer conversationally, plain text, no markdown headers.)`
          : "Tell me what's in this image, conversationally and briefly. If it's mostly text, read the text out for me instead." },
        { inlineData: { mimeType: mime, data: b64 } },
      ],
    }],
  });
  if (!res.ok) {
    console.error("Vision failed:", res.status, (await res.text()).slice(0, 300));
    return "I couldn't open that image — try sending it again?";
  }
  const body = await res.json();
  return geminiText(body) || "I couldn't make anything out in that one.";
}

/* -------------------------------------------------------------- commands */

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
    // in Rin is a command — if someone types one out of habit we just read
    // it as ordinary words.
    let startPayload = "";
    if (/^\/start\b/i.test(text)) {
      startPayload = text.replace(/^\/start\b/i, "").trim();
      text = "";
    } else if (text.startsWith("/")) {
      text = text.slice(1).replace(/^(\w+)@\w+/, "$1").trim();
    }

    // /help is the one command worth handling directly — users expect the
    // structured help text, not a Gemini ad-lib about what Rin can do.
    if (text === "help") {
      console.log(`[webhook] /help bypass: sending HELP to chat ${chatId}`);
      await sendMessage(chatId, HELP);
      return new Response(JSON.stringify({ ok: true }));
    }

    let link = await findLink(supabase, chatId);

    /* ---- first contact: provision an account and say hello ---- */
    if (!link) {
      // A start payload may be a link code from the web app.
      if (startPayload) {
        const result = await consumeCode(supabase, startPayload, chatId, displayName);
        if (!("error" in result)) {
          link = await findLink(supabase, chatId);
          await sendMessage(chatId, `We're connected — everything you've told me in Rin, I have here too.\n\nSo. What's going on?`);
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
      await sendMessage(chatId, "Telegram is switched off for your account. Turn it back on in Rin under Settings → Connected Accounts and I'll be right here.");
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
      const heard = await transcribe(
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
      const answer = await describeImage(file.bytes, imageDoc?.mime_type || "image/jpeg", caption);
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
    let detected: Any = { action: "none" };
    let extraction: Any = { stored: [], uncertain: [] };
    try {
      [detected, extraction] = await Promise.all([
        detectAction(userText),
        extractAndStore(supabase, link.user_id, userText, "", conversationId),
      ]);
    } catch (e) {
      await logError(supabase, "telegram-webhook", "promise-all", e, {
        chat_id: chatId, user_text: userText.slice(0, 200), update_id: update.update_id,
      });
    }

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
    let answer: string;
    try {
      answer = await think(supabase, link, history, userText, notes.join("\n\n"));
    } catch (e) {
      await logError(supabase, "telegram-webhook", "think", e, {
        chat_id: chatId, user_text: userText.slice(0, 200), update_id: update.update_id,
        history_len: history.length,
      });
      answer = "Something went wrong on my end. Try me again in a moment.";
    }

    try {
      await saveMessage(supabase, link, conversationId, "user", userText);
      await saveMessage(supabase, link, conversationId, "assistant", answer);
    } catch (e) {
      await logError(supabase, "telegram-webhook", "save-message", e, {
        chat_id: chatId, conversation_id: conversationId,
        user_id: link.user_id, update_id: update.update_id,
      });
    }

    await sendMessage(chatId, answer);

    const voiceMode = link.metadata?.voice_mode ?? (link.metadata?.voice_replies === false ? "off" : "on");
    if (voiceMode !== "off" && (cameFromVoice || voiceMode === "always")) {
      const audio = await speak(answer);
      if (audio) {
        await sendVoiceReply(chatId, audio, "audio/wav");
      } else {
        // Voice unreachable (tunnel down, stale URL, timeout) — never fail
        // silently or hang: send the reply as text with a short note.
        await sendMessage(
          chatId,
          `${answer}\n\n(Voice isn't reachable right now — here's this as text.)`,
        );
      }
    }

    // File what Rin said too, once the turn is over — cheap, off the path.
    const bg = extractAndStore(supabase, link.user_id, userText, answer, conversationId)
      .catch((e) => console.error("post-turn extraction failed:", e));
    // deno-lint-ignore no-explicit-any
    (globalThis as any).EdgeRuntime?.waitUntil?.(bg);

    return new Response(JSON.stringify({ ok: true }));
  } catch (e) {
    console.error("telegram-webhook error:", e);
    try { await sendMessage(chatId, "Something broke on my side. Try me again in a moment."); } catch { /* ignore */ }
    return new Response(JSON.stringify({ ok: true }));
  }
});


})());

// Rin on Telegram. Same brain, same memory, same account — reachable from
// a chat thread. Telegram calls this endpoint for every incoming update.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const { botToken, webhookSecret, safeEqual, sendMessage, sendChatAction, downloadFile, sendVoiceReply,  } = _M_telegram;;
const { buildCognitiveState, buildContextBlock, buildSystemPrompt, buildCapabilityNotes, emojiGuidanceFor, retrieveRelevantMemories, temperatureFor,  } = _M_brain;;
const { embedOne } = _M_embed;;
const { geminiGenerate, geminiText, MODELS } = _M_gemini;;
const { generateWithFallback } = _M_model-fallback;;
const { extractAndStore } = _M_passive-memory;;
const { detectAction, runAction } = _M_nl-actions;;

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
  "/link <code> — connect this chat to your Rin web account",
  "/new — start a fresh thread",
  "/unlink — disconnect this chat",
].join("\n");

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
 * Rin web account at all. We quietly provision one for this chat. They can
 * merge it into a web account later with /link.
 */
async function provisionAccount(supabase: Any, chatId: number, displayName: string, username?: string) {
  const email = `telegram-${chatId}@rin.local`;
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

  if (!row) return { error: "That code isn't valid. Generate a fresh one in Rin under Settings → Connected Accounts." };
  if (new Date(row.expires_at) < new Date()) {
    return { error: "That code expired. Grab a new one in Rin under Settings → Connected Accounts." };
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

async function think(supabase: Any, link: Any, history: Any[], userText: string): Promise<string> {
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

  const systemPrompt = buildSystemPrompt({
    userName: profile?.display_name || undefined,
    cognitiveContext: context,
    companionMode: mode,
    emojiGuidance: guidance,
    capabilityNotes: buildCapabilityNotes("telegram"),
    surfaceNotes: SURFACE_NOTES,
  });

  const contents = messages.map((m: any) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  const result = await generateWithFallback({
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents,
    generationConfig: { temperature: temperatureFor(mode) },
  }, supabase, "think");
  return result;
}

const AUDIO_MIME: Record<string, string> = {
  ogg: "audio/ogg", oga: "audio/ogg", opus: "audio/ogg",
  mp3: "audio/mpeg", m4a: "audio/mp4", mp4: "audio/mp4",
  wav: "audio/wav", webm: "audio/webm", flac: "audio/flac",
};

/**
 * Speech-to-text. Distinguishes a transcription that came back genuinely empty
 * (silence) from one that failed, so the reply never blames the speaker for a
 * backend problem.
 */
async function transcribe(
  bytes: Uint8Array,
  filename: string,
  declaredMime?: string,
): Promise<{ text: string; failed: boolean; reason?: string }> {
  const ext = (filename.split(".").pop() || "ogg").toLowerCase();
  const mime = declaredMime || AUDIO_MIME[ext] || "audio/ogg";
  try {
    // Gemini can process audio inline — transcribe via generateContent with
    // an audio content part. No dedicated STT endpoint needed.
    const b64 = btoa(String.fromCharCode(...bytes));
    const res = await geminiGenerate(MODELS.chat, {
      contents: [{
        role: "user",
        parts: [
          { text: "Transcribe this audio exactly. Output only the spoken text, no commentary, no punctuation unless it was clearly spoken." },
          { inlineData: { mimeType: mime, data: b64 } },
        ],
      }],
      generationConfig: { temperature: 0 },
    });
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 400);
      console.error(`STT failed [${res.status}] mime=${mime} file=${filename} bytes=${bytes.length}:`, detail);
      const reason = res.status === 429
        ? "I'm rate limited on transcription right now."
        : res.status === 402
        ? "Rin's usage credits ran out, so transcription is off."
        : `Transcription failed on my side (error ${res.status}).`;
      return { text: "", failed: true, reason };
    }
    const body = await res.json().catch(() => ({}));
    const text = geminiText(body).trim();
    if (!text) console.warn(`STT returned empty text: mime=${mime} bytes=${bytes.length}`);
    return { text, failed: false };
  } catch (e) {
    console.error("STT crashed:", e);
    return { text: "", failed: true, reason: "Transcription crashed on my side." };
  }
}

async function speak(text: string): Promise<Uint8Array | null> {
  try {
    // Self-hosted Piper TTS behind a Cloudflare quick tunnel. The tunnel URL
    // rotates on restart, so look up the current one from tts_endpoint.
    // Stale (>10 min) or unreachable → fall back to plain text (never hang).
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ttsSecret = Deno.env.get("TTS_SHARED_SECRET") ?? "";

    const endpointRes = await fetch(
      `${SUPABASE_URL}/rest/v1/tts_endpoint?id=eq.1&select=url,updated_at`,
      { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } },
    );
    if (!endpointRes.ok) {
      console.error("TTS endpoint lookup failed:", endpointRes.status);
      return null;
    }
    const rows = await endpointRes.json();
    const url = rows?.[0]?.url;
    const updatedAt = rows?.[0]?.updated_at ? new Date(rows[0].updated_at).getTime() : 0;
    const STALE_MS = 10 * 60 * 1000;
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
      signal: AbortSignal.timeout(8000), // 8s hard cap — never hang the webhook
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

async function describeImage(bytes: Uint8Array, mime: string, caption: string): Promise<string> {
  const b64 = btoa(String.fromCharCode(...bytes));
  const res = await geminiGenerate(MODELS.vision, {
    contents: [{
      role: "user",
      parts: [
        { text: caption
          ? `${caption}\n\n(Answer conversationally, plain text, no markdown headers.)`
          : "Tell me what's in this image, conversationally and briefly. If it's mostly text, read the text out for me instead." },
        { inlineData: { mimeType: mime, data: b64 } },
      ],
    }],
  });
  if (!res.ok) {
    console.error("Vision failed:", res.status, (await res.text()).slice(0, 300));
    return "I couldn't open that image — try sending it again?";
  }
  const body = await res.json();
  return geminiText(body) || "I couldn't make anything out in that one.";
}

/* -------------------------------------------------------------- commands */

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
    // in Rin is a command — if someone types one out of habit we just read
    // it as ordinary words.
    let startPayload = "";
    if (/^\/start\b/i.test(text)) {
      startPayload = text.replace(/^\/start\b/i, "").trim();
      text = "";
    } else if (text.startsWith("/")) {
      text = text.slice(1).replace(/^(\w+)@\w+/, "$1").trim();
    }

    // /help is the one command worth handling directly — users expect the
    // structured help text, not a Gemini ad-lib about what Rin can do.
    if (text === "help") {
      console.log(`[webhook] /help bypass: sending HELP to chat ${chatId}`);
      await sendMessage(chatId, HELP);
      return new Response(JSON.stringify({ ok: true }));
    }

    let link = await findLink(supabase, chatId);

    /* ---- first contact: provision an account and say hello ---- */
    if (!link) {
      // A start payload may be a link code from the web app.
      if (startPayload) {
        const result = await consumeCode(supabase, startPayload, chatId, displayName);
        if (!("error" in result)) {
          link = await findLink(supabase, chatId);
          await sendMessage(chatId, `We're connected — everything you've told me in Rin, I have here too.\n\nSo. What's going on?`);
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
      await sendMessage(chatId, "Telegram is switched off for your account. Turn it back on in Rin under Settings → Connected Accounts and I'll be right here.");
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
      const heard = await transcribe(
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
      const answer = await describeImage(file.bytes, imageDoc?.mime_type || "image/jpeg", caption);
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
    let detected: Any = { action: "none" };
    let extraction: Any = { stored: [], uncertain: [] };
    try {
      [detected, extraction] = await Promise.all([
        detectAction(userText),
        extractAndStore(supabase, link.user_id, userText, "", conversationId),
      ]);
    } catch (e) {
      await logError(supabase, "telegram-webhook", "promise-all", e, {
        chat_id: chatId, user_text: userText.slice(0, 200), update_id: update.update_id,
      });
    }

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
    let answer: string;
    try {
      answer = await think(supabase, link, history, userText, notes.join("\n\n"));
    } catch (e) {
      await logError(supabase, "telegram-webhook", "think", e, {
        chat_id: chatId, user_text: userText.slice(0, 200), update_id: update.update_id,
        history_len: history.length,
      });
      answer = "Something went wrong on my end. Try me again in a moment.";
    }

    try {
      await saveMessage(supabase, link, conversationId, "user", userText);
      await saveMessage(supabase, link, conversationId, "assistant", answer);
    } catch (e) {
      await logError(supabase, "telegram-webhook", "save-message", e, {
        chat_id: chatId, conversation_id: conversationId,
        user_id: link.user_id, update_id: update.update_id,
      });
    }

    await sendMessage(chatId, answer);

    const voiceMode = link.metadata?.voice_mode ?? (link.metadata?.voice_replies === false ? "off" : "on");
    if (voiceMode !== "off" && (cameFromVoice || voiceMode === "always")) {
      const audio = await speak(answer);
      if (audio) {
        await sendVoiceReply(chatId, audio, "audio/wav");
      } else {
        // Voice unreachable (tunnel down, stale URL, timeout) — never fail
        // silently or hang: send the reply as text with a short note.
        await sendMessage(
          chatId,
          `${answer}\n\n(Voice isn't reachable right now — here's this as text.)`,
        );
      }
    }

    // File what Rin said too, once the turn is over — cheap, off the path.
    const bg = extractAndStore(supabase, link.user_id, userText, answer, conversationId)
      .catch((e) => console.error("post-turn extraction failed:", e));
    // deno-lint-ignore no-explicit-any
    (globalThis as any).EdgeRuntime?.waitUntil?.(bg);

    return new Response(JSON.stringify({ ok: true }));
  } catch (e) {
    console.error("telegram-webhook error:", e);
    try { await sendMessage(chatId, "Something broke on my side. Try me again in a moment."); } catch { /* ignore */ }
    return new Response(JSON.stringify({ ok: true }));
  }
});

