// Unified AI layer — single source of truth for all model calls.
// Providers in order: gemini-3.6-flash, gemini-3.5-flash-lite, Groq,
// OpenRouter. Each gets 10s timeout, one retry on 429/5xx, then fall
// through. When all fail, logs attempts to error_log and returns
// a friendly fallback. Never throws on missing keys.

/* eslint-disable @typescript-eslint/no-explicit-any */
type Any = any;

// ---------------------------------------------------------------------------
// Model names
// ---------------------------------------------------------------------------
export const MODELS = {
  chat: "gemini-3.6-flash",
  chatLite: "gemini-3.5-flash-lite",
  vision: "gemini-3.6-flash",
  imageGen: "gemini-3.1-flash-image",
  embedding: "gemini-embedding-001",
} as const;

export type ModelName = keyof typeof MODELS;

// ---------------------------------------------------------------------------
// Provider config
// ---------------------------------------------------------------------------
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
const GROQ_BASE = "https://api.groq.com/openai/v1";
const OPENROUTER_BASE = "https://openrouter.ai/api/v1";

const GROQ_MODEL = "llama-3.3-70b-versatile";
const OPENROUTER_MODEL = "openrouter/auto";
const TIMEOUT_MS = 10_000;
const RETRY_DELAY_MS = 1500;
// Media calls need more than the 10s chat budget: image generation and audio
// transcription routinely exceed it and would otherwise abort mid-flight.
const IMAGE_TIMEOUT_MS = 45_000;
const TRANSCRIBE_TIMEOUT_MS = 60_000;
const MAX_TOOL_ROUNDS = 2;

// ---------------------------------------------------------------------------
// Key access — read from Deno.env, never throw
// ---------------------------------------------------------------------------
// Trim on read: a secret set from a terminal paste routinely carries a trailing
// newline. Left in place it defeats the `!apiKey` guards downstream (a
// whitespace-only string is truthy) and goes onto the wire inside the header,
// where providers reject it in their own words -- Google as "API key not
// valid", Groq as "Invalid API Key", OpenRouter as a missing auth header.
function geminiKey(): string {
  return (Deno.env.get("GEMINI_API_KEY") ?? "").trim();
}
function groqKey(): string {
  return (Deno.env.get("GROQ_API_KEY") ?? "").trim();
}
function openrouterKey(): string {
  return (Deno.env.get("OPENROUTER_API_KEY") ?? "").trim();
}

// ---------------------------------------------------------------------------
// Gemini helpers
// ---------------------------------------------------------------------------
export interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
}

export interface GeminiContent {
  role: "user" | "model";
  parts: GeminiPart[];
}

export interface GeminiRequest {
  systemInstruction?: { parts: GeminiPart[] };
  contents: GeminiContent[];
  generationConfig?: {
    temperature?: number;
    maxOutputTokens?: number;
    responseMimeType?: string;
    responseModalities?: string[];
  };
  tools?: Any[];
}

export function geminiText(body: Any): string {
  return body?.candidates?.[0]?.content?.parts
    ?.map((p: Any) => p?.text ?? "")
    .join("") ?? "";
}

/** Gemini generateContent with timeout. Returns { ok, status, json, snippet }. */
async function geminiFetch(
  model: string,
  body: GeminiRequest,
  timeoutMs: number = TIMEOUT_MS,
): Promise<{ ok: boolean; status: number; json: Any; snippet: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${GEMINI_BASE}/models/${model}:generateContent`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "x-goog-api-key": geminiKey(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const text = await res.text().catch(() => "");
    if (!res.ok) {
      return { ok: false, status: res.status, json: null, snippet: text.slice(0, 200) };
    }
    return { ok: true, status: res.status, json: JSON.parse(text || "{}"), snippet: "" };
  } catch (e) {
    return { ok: false, status: 0, json: null, snippet: e instanceof Error ? e.message.slice(0, 200) : String(e).slice(0, 200) };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Gemini streaming
// ---------------------------------------------------------------------------
export async function geminiStream(
  model: string,
  body: GeminiRequest,
  tools?: Any[],
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    if (tools) body.tools = tools;
    const streamBody: GeminiRequest = { ...body };
    return await fetch(`${GEMINI_BASE}/models/${model}:streamGenerateContent?alt=sse`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "x-goog-api-key": geminiKey(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(streamBody),
    });
  } finally {
    clearTimeout(timer);
  }
}

// Re-emit Gemini's native SSE as OpenAI-style SSE chunks so existing consumers
// (chat, aurora-api) keep the wire format they already parse.
export function geminiStreamAsOpenAI(
  source: ReadableStream<Uint8Array>,
  model: string = MODELS.chat,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const id = `chatcmpl-${crypto.randomUUID()}`;
  const created = Math.floor(Date.now() / 1000);
  let buffer = "";

  const frame = (delta: Any, finish: string | null): Uint8Array =>
    encoder.encode(`data: ${JSON.stringify({
      id,
      object: "chat.completion.chunk",
      created,
      model,
      choices: [{ index: 0, delta, finish_reason: finish }],
    })}\n\n`);

  return source.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        let parsed: Any;
        try {
          parsed = JSON.parse(payload);
        } catch {
          continue;
        }
        const text = geminiText(parsed);
        if (text) controller.enqueue(frame({ content: text }, null));
        const finish = parsed?.candidates?.[0]?.finishReason;
        if (finish) controller.enqueue(frame({}, finish === "STOP" ? "stop" : String(finish).toLowerCase()));
      }
    },
    flush(controller) {
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
    },
  }));
}

// Gemini non-streaming generate (for rin-api and any caller that wants a
// parsed Response body, not a raw Response stream).
export async function geminiGenerate(
  model: string,
  body: GeminiRequest,
  tools?: Any[],
): Promise<{ ok: boolean; status: number; json: Any; snippet: string }> {
  if (tools) body.tools = tools;
  return await geminiFetch(model, body);
}

// ---------------------------------------------------------------------------
// OpenAI-compatible fetch (Groq / OpenRouter)
// ---------------------------------------------------------------------------
function toOpenAI(body: GeminiRequest): Any {
  const messages: Any[] = [];
  if (body.systemInstruction?.parts) {
    const systemText = body.systemInstruction.parts.map((p: Any) => p.text ?? "").filter(Boolean).join("");
    if (systemText) messages.push({ role: "system", content: systemText });
  }
  for (const content of body.contents) {
    const role = content.role === "model" ? "assistant" : "user";
    const parts = content.parts || [];
    // Inline images must survive the fallback: OpenAI-compatible providers take
    // them as image_url data URIs. Audio has no OpenAI-compatible form, so it is
    // dropped here — callers sending audio must stay Gemini-only (see transcribe).
    const imageBlocks = parts
      .filter((p: Any) => p.inlineData && String(p.inlineData.mimeType || "").startsWith("image/"))
      .map((p: Any) => ({
        type: "image_url",
        image_url: { url: `data:${p.inlineData.mimeType};base64,${p.inlineData.data}` },
      }));
    const text = parts.map((p: Any) => p.text ?? "").filter(Boolean).join("");
    if (imageBlocks.length) {
      const blocks: Any[] = [...imageBlocks];
      if (text) blocks.push({ type: "text", text });
      messages.push({ role, content: blocks });
    } else if (text) {
      messages.push({ role, content: text });
    }
  }
  const result: Any = { model: "", messages };
  if (body.generationConfig?.temperature !== undefined) result.temperature = body.generationConfig.temperature;
  if (body.generationConfig?.maxOutputTokens !== undefined) result.max_tokens = body.generationConfig.maxOutputTokens;
  return result;
}

async function openaiFetch(
  model: string,
  base: string,
  apiKey: string,
  body: GeminiRequest,
): Promise<{ ok: boolean; status: number; json: Any; snippet: string }> {
  if (!apiKey) {
    return { ok: false, status: 0, json: null, snippet: "API key not configured" };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const openaiBody = toOpenAI(body);
    openaiBody.model = model;
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(openaiBody),
    });
    const text = await res.text().catch(() => "");
    if (!res.ok) {
      return { ok: false, status: res.status, json: null, snippet: text.slice(0, 200) };
    }
    return { ok: true, status: res.status, json: JSON.parse(text || "{}"), snippet: "" };
  } catch (e) {
    return { ok: false, status: 0, json: null, snippet: e instanceof Error ? e.message.slice(0, 200) : String(e).slice(0, 200) };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Gemini with function calling (tool support, max MAX_TOOL_ROUNDS rounds)
// ---------------------------------------------------------------------------
function extractFunctionCall(json: Any): { name: string; args: Record<string, string> } | null {
  const parts = json?.candidates?.[0]?.content?.parts ?? [];
  const fcPart = parts.find((p: Any) => p.functionCall);
  if (!fcPart?.functionCall) return null;
  return {
    name: fcPart.functionCall.name,
    args: (fcPart.functionCall.args ?? {}) as Record<string, string>,
  };
}

async function geminiWithTools(
  model: string,
  request: GeminiRequest,
  supabase: Any,
): Promise<{ ok: boolean; text: string; attempts: Any[] }> {
  const attempts: Any[] = [];
  let currentRequest = request;
  let lastText = "";

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const fetched = await geminiFetch(model, currentRequest);
    attempts.push({ provider: "gemini", model, round, status: fetched.status, ok: fetched.ok, snippet: fetched.snippet });

    if (!fetched.ok) return { ok: false, text: "", attempts };

    const text = geminiText(fetched.json);
    lastText = text;
    const fc = extractFunctionCall(fetched.json);
    if (!fc) return { ok: true, text, attempts };

    let toolResult: string;
    try {
      const { executeTool } = await import("./external-tools.ts");
      toolResult = await executeTool(fc.name, fc.args);
    } catch (e) {
      toolResult = `ERROR executing ${fc.name}: ${e instanceof Error ? e.message : String(e)}`;
    }

    attempts.push({ provider: "gemini", model, round, tool: fc.name, tool_input: JSON.stringify(fc.args), tool_result_snapshot: toolResult.slice(0, 200) });

    const functionCallPart: Any = { functionCall: fc };
    const functionResponseTurn: Any = { role: "function", name: fc.name, parts: [{ text: toolResult }] };
    currentRequest = {
      ...request,
      contents: [
        ...currentRequest.contents,
        { role: "model", parts: [functionCallPart] },
        functionResponseTurn,
      ],
      tools: request.tools,
    };
  }

  return { ok: true, text: lastText, attempts };
}

// ---------------------------------------------------------------------------
// Attempt record
// ---------------------------------------------------------------------------
export interface AttemptRecord {
  provider: string;
  model?: string;
  round?: number;
  status: number;
  ok: boolean;
  snippet: string;
  tool?: string;
  tool_input?: string;
  tool_result_snapshot?: string;
}

export interface GenerateResult {
  text: string;
  provider: string;
  attempts: AttemptRecord[];
}

// ---------------------------------------------------------------------------
// Main fallback chain
// ---------------------------------------------------------------------------
export async function generateWithFallback(
  body: GeminiRequest,
  supabase: Any,
  functionName: string = "ai-generate",
): Promise<GenerateResult> {
  const attempts: AttemptRecord[] = [];

  let result = await tryGeminiWithTools(body, supabase, attempts, MODELS.chat);
  if (result.ok) return { text: result.text, provider: "gemini-3.6-flash", attempts };
  await sleep(RETRY_DELAY_MS);
  result = await tryGeminiWithTools(body, supabase, attempts, MODELS.chat);
  if (result.ok) return { text: result.text, provider: "gemini-3.6-flash (retry)", attempts };

  result = await tryGeminiWithTools(body, supabase, attempts, MODELS.chatLite);
  if (result.ok) return { text: result.text, provider: "gemini-3.5-flash-lite", attempts };
  await sleep(RETRY_DELAY_MS);
  result = await tryGeminiWithTools(body, supabase, attempts, MODELS.chatLite);
  if (result.ok) return { text: result.text, provider: "gemini-3.5-flash-lite (retry)", attempts };

  let groqResult = await tryOpenAI(GROQ_MODEL, GROQ_BASE, groqKey(), body, attempts, "groq");
  if (groqResult.ok) return { text: groqResult.text, provider: "groq", attempts };
  await sleep(RETRY_DELAY_MS);
  groqResult = await tryOpenAI(GROQ_MODEL, GROQ_BASE, groqKey(), body, attempts, "groq");
  if (groqResult.ok) return { text: groqResult.text, provider: "groq (retry)", attempts };

  let orResult = await tryOpenAI(OPENROUTER_MODEL, OPENROUTER_BASE, openrouterKey(), body, attempts, "openrouter");
  if (orResult.ok) return { text: orResult.text, provider: "openrouter", attempts };
  await sleep(RETRY_DELAY_MS);
  orResult = await tryOpenAI(OPENROUTER_MODEL, OPENROUTER_BASE, openrouterKey(), body, attempts, "openrouter");
  if (orResult.ok) return { text: orResult.text, provider: "openrouter (retry)", attempts };

  await logAllFailed(supabase, functionName, attempts);
  return { text: "Something went wrong on my end. Try me again in a moment.", provider: "none", attempts };
}

async function tryGeminiWithTools(
  body: GeminiRequest,
  supabase: Any,
  attempts: AttemptRecord[],
  model: string,
): Promise<{ ok: boolean; text: string }> {
  const fetched = await geminiWithTools(model, body, supabase);
  for (const a of fetched.attempts) attempts.push(a as AttemptRecord);
  return { ok: fetched.ok, text: fetched.text };
}

async function tryOpenAI(
  model: string,
  base: string,
  apiKey: string,
  body: GeminiRequest,
  attempts: AttemptRecord[],
  provider: string,
): Promise<{ ok: boolean; text: string }> {
  const fetched = await openaiFetch(model, base, apiKey, body);
  attempts.push({ provider, model, status: fetched.status, ok: fetched.ok, snippet: fetched.snippet });
  if (!fetched.ok) return { ok: false, text: "" };
  const json = fetched.json;
  if (json?.choices?.[0]?.message?.content) return { ok: true, text: json.choices[0].message.content };
  return { ok: false, text: "" };
}

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------
async function logAllFailed(supabase: Any, functionName: string, attempts: AttemptRecord[]): Promise<void> {
  try {
    await supabase.from("error_log").insert({
      function_name: "ai-all-failed",
      error_message: `All ${attempts.length} AI providers failed`,
      error_stack: null,
      context: { chain: attempts, total_attempts: attempts.length, providers_tried: [...new Set(attempts.map((a) => a.provider))] },
    });
  } catch (e) {
    console.error("ai-all-failed log insert failed:", e);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// Embedding — returns { ok, values, dimensions, snippet }
// ---------------------------------------------------------------------------
const EMBED_URL = `${GEMINI_BASE}/models/gemini-embedding-001:embedContent`;

export interface EmbedResult {
  ok: boolean;
  values: number[] | null;
  dimensions: number;
  snippet: string;
}

export async function embed(text: string): Promise<EmbedResult> {
  const clean = (text || "").trim();
  if (!clean) return { ok: false, values: null, dimensions: 0, snippet: "empty input" };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(EMBED_URL, {
      method: "POST",
      signal: controller.signal,
      headers: { "x-goog-api-key": geminiKey(), "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "models/gemini-embedding-001",
        content: { parts: [{ text: clean.slice(0, 8000) }] },
        outputDimensionality: 768,
      }),
    });
    const textBody = await res.text().catch(() => "");
    if (!res.ok) return { ok: false, values: null, dimensions: 0, snippet: textBody.slice(0, 200) };
    const data = JSON.parse(textBody || "{}");
    const values = data?.embedding?.values;
    if (!values || !Array.isArray(values)) return { ok: false, values: null, dimensions: 0, snippet: "no embedding in response" };
    return { ok: true, values, dimensions: values.length, snippet: "" };
  } catch (e) {
    return { ok: false, values: null, dimensions: 0, snippet: e instanceof Error ? e.message.slice(0, 200) : String(e).slice(0, 200) };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Image description
// ---------------------------------------------------------------------------
export async function describeImage(
  imageBase64: string,
  mimeType: string,
  prompt: string,
  supabase: Any,
  functionName: string = "ai-describe-image",
): Promise<GenerateResult> {
  const body: GeminiRequest = {
    contents: [{ role: "user", parts: [{ inlineData: { mimeType, data: imageBase64 } }, { text: prompt }] }],
    generationConfig: { temperature: 0.2, maxOutputTokens: 800 },
  };
  return generateWithFallback(body, supabase, functionName);
}

// ---------------------------------------------------------------------------
// Image generation
// ---------------------------------------------------------------------------
export interface ImageGenResult {
  ok: boolean;
  imageUrl: string | null;
  text: string;
  snippet: string;
}

/** Generates an image and returns it as a data URI (callers expect image_url). */
export async function generateImage(prompt: string): Promise<ImageGenResult> {
  const clean = (prompt || "").trim();
  if (!clean) return { ok: false, imageUrl: null, text: "", snippet: "empty prompt" };

  const fetched = await geminiFetch(
    MODELS.imageGen,
    {
      contents: [{ role: "user", parts: [{ text: clean }] }],
      generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
    },
    IMAGE_TIMEOUT_MS,
  );

  if (!fetched.ok) {
    return { ok: false, imageUrl: null, text: "", snippet: fetched.snippet || `status ${fetched.status}` };
  }

  let imageUrl: string | null = null;
  let text = "";
  for (const part of fetched.json?.candidates?.[0]?.content?.parts ?? []) {
    if (part?.inlineData?.data) {
      imageUrl = `data:${part.inlineData.mimeType || "image/png"};base64,${part.inlineData.data}`;
    } else if (part?.text) {
      text += part.text;
    }
  }

  return { ok: Boolean(imageUrl), imageUrl, text, snippet: imageUrl ? "" : "no image in response" };
}

// ---------------------------------------------------------------------------
// Transcription
// ---------------------------------------------------------------------------
export async function transcribe(
  audioBase64: string,
  mimeType: string,
  supabase: Any,
  functionName: string = "ai-transcribe",
): Promise<GenerateResult> {
  const body: GeminiRequest = {
    contents: [
      {
        role: "user",
        parts: [
          { inlineData: { mimeType, data: audioBase64 } },
          { text: "Transcribe the audio in this message exactly, word for word. Return ONLY the spoken text, no commentary." },
        ],
      },
    ],
    generationConfig: { temperature: 0, maxOutputTokens: 4000 },
  };

  // Audio is Gemini-only ON PURPOSE. toOpenAI() cannot represent audio, so the
  // Groq/OpenRouter rungs would receive a request with the audio stripped out and
  // return confident nonsense. Empty text means "failed" — callers must 5xx.
  const attempts: AttemptRecord[] = [];
  const fetched = await geminiFetch(MODELS.chat, body, TRANSCRIBE_TIMEOUT_MS);
  attempts.push({ provider: "gemini", model: MODELS.chat, status: fetched.status, ok: fetched.ok, snippet: fetched.snippet });

  const text = fetched.ok ? geminiText(fetched.json).trim() : "";
  if (text) return { text, provider: MODELS.chat, attempts };

  await logAllFailed(supabase, functionName, attempts);
  return { text: "", provider: "none", attempts };
}
