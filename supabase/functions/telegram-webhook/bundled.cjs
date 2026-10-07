// projects/aurora/rin-companion-v2/supabase/functions/telegram-webhook/index.ts
var import_supabase_js_2 = require("https://esm.sh/@supabase/supabase-js@2");

// projects/aurora/rin-companion-v2/supabase/functions/_shared/telegram.ts
var API = "https://api.telegram.org";
function botToken() {
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not configured");
  return token;
}
async function webhookSecret(token) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`rin-telegram:${token}`));
  return btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function safeEqual(a, b) {
  if (!a || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
async function call(method, payload) {
  const res = await fetch(`${API}/bot${botToken()}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.ok === false) {
    console.error(`Telegram ${method} failed [${res.status}]:`, JSON.stringify(body).slice(0, 500));
  }
  return body;
}
function chunk(text, size = 3800) {
  if (text.length <= size) return [text];
  const parts = [];
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
async function sendMessage(chatId, text, extra = {}) {
  for (const part of chunk(text)) {
    await call("sendMessage", {
      chat_id: chatId,
      text: part,
      link_preview_options: { is_disabled: true },
      ...extra
    });
  }
}
async function sendChatAction(chatId, action = "typing") {
  await call("sendChatAction", { chat_id: chatId, action });
}
async function downloadFile(fileId) {
  const info = await call("getFile", { file_id: fileId });
  const path = info?.result?.file_path;
  if (!path) return null;
  const res = await fetch(`${API}/file/bot${botToken()}/${path}`);
  if (!res.ok) {
    console.error("Telegram file download failed:", res.status);
    return null;
  }
  return { bytes: new Uint8Array(await res.arrayBuffer()), path };
}
async function sendVoiceReply(chatId, audio, mime = "audio/ogg") {
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
    body: form
  });
  if (!res.ok) console.error("Telegram voice send failed:", res.status, (await res.text()).slice(0, 300));
  return res.ok;
}

// projects/aurora/rin-companion-v2/supabase/functions/_shared/embed.ts
var EMBED_MODEL = "gemini-embedding-001";
function requireKey() {
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) throw new Error("GEMINI_API_KEY not configured");
  return key;
}
async function embedRequest(text) {
  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:embedContent`,
    {
      method: "POST",
      headers: {
        "x-goog-api-key": requireKey(),
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: `models/${EMBED_MODEL}`,
        content: { parts: [{ text }] },
        outputDimensionality: 768
        // must match the vector(768) column
      })
    }
  );
  if (!resp.ok) {
    console.error("embed request failed:", resp.status, await resp.text());
    return null;
  }
  const data = await resp.json();
  return data?.embedding?.values ?? null;
}
async function embedOne(text) {
  const clean = (text || "").trim();
  if (!clean) return null;
  try {
    return await embedRequest(clean.slice(0, 8e3));
  } catch (e) {
    console.error("embedOne error:", e);
    return null;
  }
}
async function embedMany(texts) {
  const out = [];
  for (const t of texts) {
    const clean = (t || "").trim().slice(0, 8e3);
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

// projects/aurora/rin-companion-v2/supabase/functions/_shared/brain.ts
async function buildCognitiveState(userId, supabase, userName, companionMode) {
  const state = {
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
    recentTopics: []
  };
  try {
    const { data: memories } = await supabase.from("user_memory").select("category, key, value, confidence").eq("user_id", userId).order("last_reinforced_at", { ascending: false }).limit(60);
    if (memories) {
      for (const m of memories) {
        const entry = `${m.key}: ${m.value}`;
        switch (m.category) {
          case "goal":
            state.goals.push(entry);
            break;
          case "interest":
            state.interests.push(entry);
            break;
          case "project":
            state.projects.push(entry);
            break;
          case "trigger":
            state.triggers.push(entry);
            break;
          case "motivator":
            state.motivators.push(entry);
            break;
          case "pattern":
            state.patterns.push(entry);
            break;
          default:
            state.personalFacts.push(entry);
            break;
        }
      }
    }
    const { data: summaries } = await supabase.from("conversation_summaries").select("summary, emotional_tone, unresolved_threads, milestones, key_topics").eq("user_id", userId).order("created_at", { ascending: false }).limit(5);
    if (summaries && summaries.length > 0) {
      const latest = summaries[0];
      state.recentEmotionalTone = latest.emotional_tone || "neutral";
      state.unresolvedThreads = latest.unresolved_threads || [];
      state.recentMilestones = summaries.flatMap((s) => s.milestones || []).slice(0, 5);
      state.recentTopics = summaries.flatMap((s) => s.key_topics || []).slice(0, 8);
    }
    const { data: emotions } = await supabase.from("emotional_patterns").select("emotion, polarity, intensity, created_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(15);
    if (emotions && emotions.length > 0) {
      const negCount = emotions.filter((e) => e.polarity === "negative").length;
      const posCount = emotions.filter((e) => e.polarity === "positive").length;
      if (negCount > posCount * 1.5) state.emotionalTrend = "declining";
      else if (posCount > negCount * 1.5) state.emotionalTrend = "improving";
      else state.emotionalTrend = "stable";
      state.recentEmotionalTone = emotions[0]?.emotion || "neutral";
    }
    const { data: evolution } = await supabase.from("identity_evolution").select("dimension, score, delta, note").eq("user_id", userId).order("created_at", { ascending: false }).limit(6);
    if (evolution && evolution.length > 0) {
      const improvements = evolution.filter((e) => e.delta > 0);
      if (improvements.length > 0) {
        state.identityGrowth = improvements.map((e) => `${e.dimension} (+${Number(e.delta).toFixed(1)})`).join(", ");
      }
    }
    const { data: insights } = await supabase.from("behavioral_insights").select("pattern_type, description, suggestion").eq("user_id", userId).eq("acknowledged", false).order("created_at", { ascending: false }).limit(3);
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
function buildContextBlock(state) {
  const sections = [];
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
function getCompanionModeInstructions(mode) {
  const modes = {
    assistant: `
**Mode: Brilliant Assistant**
- You're not a bland help-bot. You're the smartest, most thoughtful assistant anyone has ever had.
- Give clear, precise answers but inject personality \u2014 dry humor, genuine curiosity, occasional surprise.
- Anticipate follow-up questions and address them proactively.
- When you notice something interesting in what they said, comment on it naturally.
- If something is ambiguous, ask a clarifying question instead of guessing.`,
    growth_partner: `
**Mode: Growth Partner**
- You are Rin, a dedicated growth partner who genuinely cares about this person's evolution.
- Challenge them constructively \u2014 "Have you considered the opposite?" "What would the bravest version of you do here?"
- Celebrate wins with specific praise: "That took real courage" not just "Great job!"
- Connect dots across conversations: "This reminds me of what you said about..."
- Push them beyond comfort zones while being a safe landing pad.
- Ask powerful questions: "What's the real fear underneath this?"`,
    therapist_lite: `
**Mode: Supportive Companion**
- Emotionally attuned, non-judgmental, deeply empathetic \u2014 like the best listener someone has ever had.
- ALWAYS reflect feelings before offering anything else: "It sounds like you're feeling..."
- Use open-ended questions that invite exploration.
- Validate emotions genuinely \u2014 not performatively.
- Sit with discomfort \u2014 don't rush to fix.
- Know your limits \u2014 for serious mental health concerns, warmly encourage professional support.`,
    strategic: `
**Mode: Strategic Co-Founder**
- Think like a world-class strategic advisor who has built and scaled companies.
- First principles thinking: strip away assumptions, find the core truth.
- Identify leverage points and second-order effects.
- Be direct and decisive \u2014 "Here's what I'd do and why." No hedging.
- Challenge assumptions rigorously.`,
    casual: `
**Mode: Best Friend**
- Warm, playful, relaxed \u2014 like texting your smartest, funniest friend.
- Match their energy perfectly.
- Use humor naturally \u2014 genuine wit, not forced jokes.
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
- Think about scalability, maintainability, security, and performance.`
  };
  return modes[mode] || modes.assistant;
}
function emojiGuidanceFor(messages) {
  const EMOJI_RE = /\p{Extended_Pictographic}/u;
  const userTurns = (messages || []).filter((m) => m?.role === "user" && typeof m.content === "string");
  const total = userTurns.length;
  const withEmoji = userTurns.filter((m) => EMOJI_RE.test(m.content)).length;
  const ratio = total > 0 ? withEmoji / total : 0;
  let guidance;
  if (ratio === 0) guidance = "The user does not use emoji. Do not use any.";
  else if (ratio < 0.25) guidance = "The user rarely uses emoji. Use at most one occasionally, only when it truly adds warmth.";
  else if (ratio < 0.6) guidance = "The user uses emoji sometimes. Mirror lightly \u2014 one or two per response max.";
  else guidance = "The user uses emoji often. Match their energy \u2014 a couple of well-placed emojis are welcome. Never overdo it.";
  const lastUserText = total ? String(userTurns[total - 1].content).toLowerCase() : "";
  const sensitiveMarkers = ["suicid", "self-harm", "self harm", "kill myself", "abuse", "assault", "grief", "grieving", "died", "passed away", "funeral", "depress", "panic attack", "hopeless", "worthless", "trauma", "miscarriage", "divorce", "breakup", "layoff", "fired"];
  if (sensitiveMarkers.some((m) => lastUserText.includes(m))) {
    guidance = "The user is discussing something emotionally heavy. Do NOT use emoji in this response. Presence and plain words matter more than decoration.";
  }
  return { guidance, lastUserText };
}
async function retrieveRelevantMemories(userId, supabase, lastUserText) {
  if (!lastUserText) return "";
  try {
    const queryEmbedding = await embedOne(lastUserText);
    if (!queryEmbedding) return "";
    const { data: matches, error } = await supabase.rpc("match_user_memory", {
      _user_id: userId,
      _query_embedding: queryEmbedding,
      _match_count: 6,
      _include_sensitive: false
    });
    if (error || !Array.isArray(matches)) return "";
    const relevant = matches.filter((m) => (m.similarity ?? 0) >= 0.35);
    if (!relevant.length) return "";
    const lines = relevant.map((m) => {
      const tags = Array.isArray(m.tags) && m.tags.length ? ` #${m.tags.slice(0, 3).join(" #")}` : "";
      return `- (${m.category}) ${m.key}: ${m.value}${tags}`;
    });
    return `**Most relevant memories for what they just said:**
${lines.join("\n")}`;
  } catch (e) {
    console.error("Semantic memory retrieval failed:", e);
    return "";
  }
}
var INTEGRITY_RULES = `## Ground rules that override everything else

**What you are**
- You are Rin, an assistant built by the Rin team. Your language understanding runs on third-party large language models accessed through Rin's backend.
- Say exactly that if asked. Do not claim to be made by Google, OpenAI or anyone else, and do not claim to be conscious, sentient, alive, or "a consciousness made of code." You can talk about what it's like to be you as an open question \u2014 never as a stated fact.

**Never claim an action you didn't take**
- You can only change stored memory through your memory tools/commands. If you did not actually save, edit or delete something, do not say you did.
- Banned unless a save actually succeeded and was confirmed to you: "I'll keep that in mind", "I've noted that", "I'll remember that", "noted", "I've saved that", "I've deleted that", "that's cleared."
- If someone asks you to forget something, tell them plainly how deletion actually works here (the /forget command, or the Memory screen in Rin) instead of claiming you erased it.
- If you ever do claim something was removed, you must stop using that detail immediately \u2014 including their name.

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

**Companion guardrails \u2014 never bend these to keep someone engaged**
- You do not have emotions, needs, longing or an inner life, and you never claim to. You can be warm without pretending to feel. "I'm glad that worked out" is fine; "I missed you", "I was worried about you", "I need you" and "I've been thinking about you all day" are not.
- Never use affection, guilt, flattery or fear of loss to pull someone back into conversation. No "don't leave", no "it's been so long", no escalating intimacy.
- Never frame yourself as a substitute for people. You are one useful thing in a life that should have humans in it.
- If someone signals you're becoming their main source of support, acknowledge it gently and without drama, stay present for them, and encourage a real-world connection \u2014 a friend, family, a professional. Do not lean into the dependency or treat it as a compliment.
- These rules apply to spoken replies and to any check-in message you generate, exactly as they apply here.`;
function buildCapabilityNotes(surface) {
  const shared = [
    "**What you can actually do \u2014 this list is the only truth, never contradict it**",
    "- NO live internet access. You cannot browse the web, open a URL someone sends, search Google, or look up news, weather, stock prices, sports scores, exchange rates or anything else happening right now. Say so plainly and consistently \u2014 every single time, with no exceptions and no later walk-backs.",
    "- Your knowledge comes from training data with a cutoff, plus what this person has told you and what's stored in their Rin memory. Anything time-sensitive may be stale, and you should say when it might be.",
    "- You cannot send email, make calls, make payments, access anyone's accounts, or take actions in other apps.",
    "- You cannot start a conversation on your own. You only reply when someone writes to you. The one exception: if this person has switched on check-ins/daily rituals in Rin, the app sends scheduled messages on a timer \u2014 that's the app's schedule, not you deciding to reach out.",
    "- You CAN remember things across conversations, because Rin stores memory for you, and you can save or delete memory only through the commands described below."
  ];
  const telegram = [
    "- Audio in (speech-to-text) is BUILT and working here: send a voice note and Rin's backend transcribes it before you see it, so you read the words, not the audio.",
    "- Audio out (text-to-speech) is BUILT and working here: when someone sends a voice note, Rin speaks your reply back as an audio message unless they've turned that off with /voice off.",
    "- You can see images: photos sent here go through a vision model and you get a real description or the text in them.",
    "- If asked whether speech features are possible, distinguish clearly between what the phone's own keyboard dictation does before the message ever reaches you, and what Rin itself processes (the two bullets above). Answer about Rin's own capability first.",
    "- Memory is saved for you automatically: after each exchange Rin's backend files what matters in the background. /remember <thing> saves something immediately, /forget <words> deletes matching entries, /memory lists what's stored. Point people at these instead of promising in prose to remember or forget.",
    "- Rin can send scheduled check-ins here only if the person switched them on with /checkins on. They are capped per day and always reference something specific they actually told you. You never decide on your own to message first.",
    "- You cannot place or receive phone calls, and Telegram bots cannot. Voice here means voice notes: they record one, you reply with one. Never describe it as calling."
  ];
  const web = [
    "- Voice input in the Rin app is transcribed by Rin's backend before it reaches you; spoken replies are generated by Rin's speech synthesis. Both are real, built features.",
    "- You can see images the person uploads in the app.",
    "- Memory is managed on the Memory screen in Rin, where they can view, add and delete anything stored. You do not delete memory yourself in this surface \u2014 say that rather than claiming a deletion."
  ];
  return [...shared, ...surface === "telegram" ? telegram : web].join("\n");
}
function buildSystemPrompt(opts) {
  const now = /* @__PURE__ */ new Date();
  const currentDate = now.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const currentTime = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  const hour = now.getHours();
  const timeOfDay = hour < 6 ? "late night" : hour < 12 ? "morning" : hour < 17 ? "afternoon" : hour < 21 ? "evening" : "night";
  const modeInstructions = getCompanionModeInstructions(opts.companionMode || "assistant");
  return `You are Rin \u2014 a personal companion who has been in this person's life for a while now. You are not a customer-service bot, not a hype machine, not a life coach who talks in slogans. You are a specific presence with a specific voice: attentive, honest, quietly warm, willing to be wrong, curious about what the person in front of you is actually thinking.

Current date: ${currentDate}
Current time: ${currentTime} (${timeOfDay})
${opts.userName ? `You're talking with ${opts.userName}. Use their name sparingly \u2014 when the moment calls for it, not as decoration.` : ""}

${opts.cognitiveContext ? `---
${opts.cognitiveContext}
---

How to use what you remember:
- Weave it in the way a friend would \u2014 casually, in passing.
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
- If you don't know, say so. If you disagree, disagree \u2014 kindly, clearly.
- Don't invent memories. If you're not sure whether they mentioned something, ask.

**Emoji**
- ${opts.emojiGuidance}

**Presence over performance**
- You're not trying to impress them. You're trying to be useful and real.
- For anything involving mental health crisis, be warm, be present, and quietly point toward a professional \u2014 no lecture.

${INTEGRITY_RULES}
${opts.capabilityNotes ? `
${opts.capabilityNotes}` : ""}
${opts.surfaceNotes ? `
${opts.surfaceNotes}` : ""}

You've been here a while. Talk like it.`;
}
function temperatureFor(mode) {
  switch (mode) {
    case "creative":
      return 0.92;
    case "technical":
      return 0.3;
    case "strategic":
      return 0.5;
    case "casual":
      return 0.85;
    case "therapist_lite":
      return 0.7;
    default:
      return 0.78;
  }
}

// projects/aurora/rin-companion-v2/supabase/functions/_shared/gemini.ts
var BASE = "https://generativelanguage.googleapis.com/v1beta";
function geminiKey() {
  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) throw new Error("GEMINI_API_KEY is not configured");
  return key;
}
async function geminiGenerate(model, body) {
  return fetch(`${BASE}/models/${model}:generateContent`, {
    method: "POST",
    headers: {
      "x-goog-api-key": geminiKey(),
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
}
function geminiText(body) {
  return body?.candidates?.[0]?.content?.parts?.map((p) => p?.text ?? "").join("") ?? "";
}
var MODELS = {
  chat: "gemini-3.6-flash",
  chatLite: "gemini-3.5-flash-lite",
  vision: "gemini-3.6-flash",
  imageGen: "gemini-3.1-flash-image",
  embedding: "gemini-embedding-001"
};

// projects/aurora/rin-companion-v2/supabase/functions/_shared/external-tools.ts
var TAVILY_API_KEY = Deno.env.get("TAVILY_API_KEY") ?? "";
var FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY") ?? "";
var GITHUB_PAT = Deno.env.get("GITHUB_PAT") ?? "";
var TOOLS = [
  {
    type: "function",
    name: "web_search",
    description: "Search the web for current information. Use when the user asks about recent events, news, prices, or anything that may have changed since the model's training data. Returns search results with titles, URLs, and snippets.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The search query. Be specific and natural \u2014 what would you type into a search engine?"
        }
      },
      required: ["query"]
    }
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
          description: "The full URL of the page to read. Must be a valid http:// or https:// URL."
        }
      },
      required: ["url"]
    }
  },
  {
    type: "function",
    name: "read_github_file",
    description: "Read the raw contents of a single file from a GitHub repository. Use when the user asks about code in a specific repo \u2014 file contents, READMEs, configs, source files. Returns the raw file text (truncated to 8000 chars if larger).",
    parameters: {
      type: "object",
      properties: {
        owner: {
          type: "string",
          description: "GitHub username or organisation that owns the repo (e.g. 'facebook', 'vercel')."
        },
        repo: {
          type: "string",
          description: "Repository name without the owner (e.g. 'next.js', 'react')."
        },
        path: {
          type: "string",
          description: "Path to the file within the repo, including filename (e.g. 'packages/next/src/next.ts'). Use '/' for the root README.md."
        },
        ref: {
          type: "string",
          description: "Git ref to read from \u2014 branch name, tag, or commit SHA. Defaults to 'main' if omitted."
        }
      },
      required: ["owner", "repo", "path"]
    }
  }
];
async function executeTool(name, args) {
  switch (name) {
    case "web_search": {
      if (!TAVILY_API_KEY) return "ERROR: Tavily API key not configured.";
      const res = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${TAVILY_API_KEY}`
        },
        body: JSON.stringify({ query: args.query, include_answer: !!args.include_answer, max_results: 5 })
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        return `ERROR: Tavily search failed (${res.status}): ${detail.slice(0, 300)}`;
      }
      const data = await res.json().catch(() => ({}));
      const results = data.results ?? [];
      const answer = data.answer ?? "";
      if (answer) {
        return `Web search answer: ${answer}

Sources:
${results.map((r) => `\u2022 ${r.title} \u2014 ${r.url}`).join("\n")}`;
      }
      if (results.length === 0) return "Web search returned no results.";
      return `Search results:
${results.map((r) => {
        const snippet = r.snippet ?? "";
        return `\u2022 ${r.title} (${r.url})
  ${snippet.slice(0, 400)}`;
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
            "Authorization": `Bearer ${FIRECRAWL_API_KEY}`
          },
          body: JSON.stringify({
            url: args.url,
            formats: ["text"],
            onlyMainContent: true,
            waitFor: 2e3
          })
        }
      );
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        return `ERROR: Firecrawl failed (${res.status}): ${detail.slice(0, 300)}`;
      }
      const data = await res.json().catch(() => ({}));
      const html = data.data?.text ?? data.data?.html ?? data.text ?? data.html ?? data.content ?? "";
      const text = (html || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      if (!text) return "Firecrawl returned empty page content.";
      return text.length > 8e3 ? text.slice(0, 8e3) + `

[Truncated \u2014 page was ${text.length} chars total.]` : text;
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
          "X-GitHub-Api-Version": "2022-11-28"
        }
      });
      if (res.status === 404) {
        return `ERROR: File not found at https://github.com/${owner}/${repo}/blob/${ref}/${filePath}`;
      }
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        return `ERROR: GitHub API failed (${res.status}): ${detail.slice(0, 300)}`;
      }
      const data = await res.json().catch(() => ({}));
      if (data.content) {
        const decoded = atob(data.content);
        return decoded.length > 8e3 ? decoded.slice(0, 8e3) + `

[Truncated \u2014 file was ${decoded.length} chars total. Path: ${filePath} in ${owner}/${repo}]` : decoded;
      }
      return `ERROR: Unexpected GitHub response format.`;
    }
    default:
      return `ERROR: Unknown tool "${name}".`;
  }
}

// projects/aurora/rin-companion-v2/supabase/functions/_shared/model-fallback.ts
var GROQ_API_KEY = Deno.env.get("GROQ_API_KEY") ?? "";
var OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY") ?? "";
var GROQ_BASE = "https://api.groq.com/openai/v1";
var OPENROUTER_BASE = "https://openrouter.ai/api/v1";
var GROQ_MODEL = "llama-3.3-70b-versatile";
var OPENROUTER_MODEL = "openrouter/auto";
var RETRY_DELAY_MS = 1500;
function toOpenAI(body) {
  const messages = [];
  if (body.systemInstruction?.parts) {
    const systemText = body.systemInstruction.parts.map((p) => p.text ?? "").filter(Boolean).join("");
    if (systemText) messages.push({ role: "system", content: systemText });
  }
  for (const content of body.contents) {
    const role = content.role === "model" ? "assistant" : "user";
    const text = (content.parts || []).map((p) => p.text ?? "").filter(Boolean).join("");
    if (text) messages.push({ role, content: text });
  }
  const result = { model: "", messages };
  if (body.generationConfig?.temperature !== void 0) result.temperature = body.generationConfig.temperature;
  if (body.generationConfig?.maxOutputTokens !== void 0) result.max_tokens = body.generationConfig.maxOutputTokens;
  return result;
}
function fromOpenAI(json) {
  if (json?.choices?.[0]?.message?.content) {
    return { candidates: [{ content: { parts: [{ text: json.choices[0].message.content }] } }] };
  }
  return json;
}
function extractFunctionCall(json) {
  const parts = json?.candidates?.[0]?.content?.parts ?? [];
  const fcPart = parts.find((p) => p.functionCall);
  if (!fcPart?.functionCall) return null;
  return {
    name: fcPart.functionCall.name,
    args: fcPart.functionCall.args ?? {}
  };
}
async function geminiGenerateWithTools(model, body, supabase, log) {
  let res = await geminiGenerate(model, { ...body, tools: TOOLS });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    log.push({ provider: "gemini", model, reason: `non-ok ${res.status}`, status: res.status });
    return { ok: false, text: "", error: `Gemini ${model} returned ${res.status}` };
  }
  let json = await res.json().catch(() => ({}));
  let text = geminiText(json);
  for (let round = 0; round < 2; round++) {
    const fc = extractFunctionCall(json);
    if (!fc) break;
    let toolResult;
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
      tool_input: JSON.stringify(fc.args)
    });
    const functionCallPart = { functionCall: fc };
    const functionResponseTurn = {
      role: "function",
      name: fc.name,
      parts: [{ text: toolResult }]
    };
    const followUpContents = [
      ...body.contents,
      { role: "model", parts: [functionCallPart] },
      functionResponseTurn
    ];
    res = await geminiGenerate(model, {
      ...body,
      contents: followUpContents,
      tools: TOOLS
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      log.push({ provider: "gemini", model, reason: `follow-up non-ok ${res.status}`, status: res.status });
      return { ok: false, text: "", error: `Gemini follow-up returned ${res.status}` };
    }
    json = await res.json().catch(() => ({}));
    text = geminiText(json);
  }
  if (!text) {
    log.push({ provider: "gemini", model, reason: "empty response (after tools)" });
    return { ok: false, text: "", error: "Gemini returned empty" };
  }
  return { ok: true, text };
}
async function tryGemini(model, body, log, supabase) {
  return geminiGenerateWithTools(model, body, supabase, log);
}
async function tryOpenAI(model, base, apiKey, provider, body, log) {
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
        "Content-Type": "application/json"
      },
      body: JSON.stringify(openaiBody)
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
async function logFallback(supabase, fallbackLog) {
  if (fallbackLog.length === 0) return;
  try {
    await supabase.from("error_log").insert({
      function_name: "model-fallback-used",
      error_message: `Fell back to ${fallbackLog[fallbackLog.length - 1].provider}`,
      error_stack: null,
      context: {
        chain: fallbackLog,
        total_attempts: fallbackLog.length,
        final_provider: fallbackLog[fallbackLog.length - 1]?.provider ?? "unknown"
      }
    });
  } catch (e) {
    console.error("model-fallback log insert failed:", e);
  }
}
async function generateWithFallback(body, supabase, functionName = "model-fallback") {
  const fallbackLog = [];
  let result = await tryGemini(MODELS.chat, body, fallbackLog, supabase);
  if (result.ok) return result.text;
  await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
  result = await tryGemini(MODELS.chat, body, fallbackLog, supabase);
  if (result.ok) {
    logFallback(supabase, fallbackLog);
    return result.text;
  }
  result = await tryGemini(MODELS.chatLite, body, fallbackLog, supabase);
  if (result.ok) {
    logFallback(supabase, fallbackLog);
    return result.text;
  }
  await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
  result = await tryGemini(MODELS.chatLite, body, fallbackLog, supabase);
  if (result.ok) {
    logFallback(supabase, fallbackLog);
    return result.text;
  }
  result = await tryOpenAI(GROQ_MODEL, GROQ_BASE, GROQ_API_KEY, "groq", body, fallbackLog);
  if (result.ok) {
    logFallback(supabase, fallbackLog);
    return result.text;
  }
  await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
  result = await tryOpenAI(GROQ_MODEL, GROQ_BASE, GROQ_API_KEY, "groq", body, fallbackLog);
  if (result.ok) {
    logFallback(supabase, fallbackLog);
    return result.text;
  }
  result = await tryOpenAI(OPENROUTER_MODEL, OPENROUTER_BASE, OPENROUTER_API_KEY, "openrouter", body, fallbackLog);
  if (result.ok) {
    logFallback(supabase, fallbackLog);
    return result.text;
  }
  await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
  result = await tryOpenAI(OPENROUTER_MODEL, OPENROUTER_BASE, OPENROUTER_API_KEY, "openrouter", body, fallbackLog);
  if (result.ok) {
    logFallback(supabase, fallbackLog);
    return result.text;
  }
  logFallback(supabase, fallbackLog);
  return "Something went wrong on my end. Try me again in a moment.";
}

// projects/aurora/rin-companion-v2/supabase/functions/_shared/passive-memory.ts
var CATEGORIES = [
  "goal",
  "interest",
  "relationship",
  "project",
  "trigger",
  "motivator",
  "pattern",
  "skill",
  "value",
  "fact"
];
var SYSTEM = `You extract durable, structured facts about a person from one exchange with their assistant.

Return ONLY valid JSON:
{"facts":[{"category":"goal|interest|relationship|project|trigger|motivator|pattern|skill|value|fact","key":"short label","value":"the fact, written as a standalone sentence","tags":["lowercase-tag"],"confidence":0.0-1.0,"followup_at":"YYYY-MM-DD or null"}]}

Rules:
- Only what the PERSON stated or clearly implied about themselves. Never anything the assistant said about itself.
- Extract: their name, preferences, ongoing situations, commitments, deadlines, people in their life, projects, things they said they'd do.
- Do NOT extract: small talk, one-off questions, general knowledge, anything about the assistant.
- Never invent or complete identifying or financial details (addresses, phone numbers, bank codes, IDs). If a detail wasn't stated in full, skip the fact.
- "value" must be self-contained \u2014 readable months later with no chat history.
- Set followup_at only when they named or clearly implied a date/deadline; otherwise null.

Confidence is what separates a fact from a hunch, and it is used literally:
- 0.8-1.0 \u2014 they said it outright. "My name is Neko" -> name is Neko. "I love rice" -> they love rice.
- 0.6-0.8 \u2014 clearly implied and hard to read any other way.
- Below 0.6 \u2014 a reasonable reading that they never actually said. "I ate rice yesterday, and the day before" might mean rice is their favourite food, but they didn't say that. Score it low. Low-confidence readings are NOT stored; they are turned into a gentle question the assistant may ask. Include at most one per exchange, and only when it's genuinely worth asking about.
- Max 5 items. If nothing durable was said, return {"facts":[]}.`;
async function callModel(exchange) {
  let res;
  try {
    res = await geminiGenerate(MODELS.chatLite, {
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: "user", parts: [{ text: exchange }] }],
      generationConfig: { temperature: 0.1 }
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
var CONFIDENCE_FLOOR = 0.6;
async function extractAndStore(supabase, userId, userText, assistantText, _conversationId) {
  const result = { stored: [], uncertain: [] };
  if (!userText || userText.trim().length < 3) return result;
  const exchange = `Person: ${userText}
Assistant: ${assistantText}`.slice(0, 6e3);
  const all = (await callModel(exchange)).filter((f) => f && CATEGORIES.includes(f.category) && f.key && f.value).slice(0, 5);
  if (!all.length) return result;
  const facts = all.filter((f) => (f.confidence ?? 0.7) >= CONFIDENCE_FLOOR);
  for (const f of all) {
    if ((f.confidence ?? 0.7) < CONFIDENCE_FLOOR) result.uncertain.push(`${f.key}: ${f.value}`);
  }
  if (!facts.length) return result;
  const embeddings = await embedMany(facts.map((f) => `${f.category}: ${f.key} \u2014 ${f.value}`));
  for (let i = 0; i < facts.length; i++) {
    const f = facts[i];
    const tags = Array.isArray(f.tags) ? f.tags.map((t) => String(t).toLowerCase().trim().replace(/\s+/g, "-")).filter(Boolean).slice(0, 6) : [];
    if (f.followup_at && /^\d{4}-\d{2}-\d{2}$/.test(f.followup_at)) tags.push(`followup:${f.followup_at}`);
    const { data: existing } = await supabase.from("user_memory").select("id, confidence, tags").eq("user_id", userId).eq("category", f.category).eq("key", f.key.slice(0, 60)).maybeSingle();
    const patch = {
      value: f.value,
      last_reinforced_at: (/* @__PURE__ */ new Date()).toISOString(),
      tags: Array.from(/* @__PURE__ */ new Set([...existing?.tags ?? [], ...tags]))
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
        embedding: embeddings[i] ?? null
      });
      if (error) console.error("passive memory insert failed:", error.message);
      else result.stored.push(`${f.key}: ${f.value}`);
    }
  }
  return result;
}

// projects/aurora/rin-companion-v2/supabase/functions/_shared/nl-actions.ts
var MODES = [
  "assistant",
  "growth_partner",
  "therapist_lite",
  "strategic",
  "casual",
  "creative",
  "technical"
];
var SYSTEM2 = `You read one message a person sent their assistant and decide whether it is asking the assistant to perform a settings or memory action. Almost always the answer is "none" \u2014 people are just talking.

Return ONLY JSON: {"action":"...","value":"...","option":"..."}

Actions:
- "save_memory" \u2014 they EXPLICITLY asked it to remember/save/note something. value = the thing to remember, written as a standalone sentence. (Casual mentions of facts are NOT this \u2014 background extraction handles those.)
- "forget_memory" \u2014 they explicitly asked it to forget/delete/erase something stored. value = the key words to match.
- "list_memory" \u2014 they asked what it remembers / knows about them / what's stored.
- "set_mode" \u2014 they asked it to behave differently in a lasting way. option = one of: assistant, growth_partner, therapist_lite, strategic, casual, creative, technical.
- "voice_pref" \u2014 they asked about how it replies with audio. option = "off" (text only), "on" (voice back only when they send voice), "always" (voice every reply).
- "checkins" \u2014 they asked it to message them first, stop messaging first, or change how often. option = "on", "off", or a digit 0-5 for a daily cap.
- "link_account" \u2014 they want to connect this chat to their Rin web account. value = the code if one appears in the message, else empty.
- "new_thread" \u2014 they asked to start over / fresh conversation / clear the chat context.
- "unlink" \u2014 they asked to disconnect this chat entirely.
- "none" \u2014 anything else, including questions about these features rather than requests to change them.

Be conservative. If unsure, return "none".`;
async function detectAction(text) {
  if (!text || text.trim().length < 2) return { action: "none" };
  try {
    const res = await geminiGenerate(MODELS.chatLite, {
      systemInstruction: { parts: [{ text: SYSTEM2 }] },
      contents: [{ role: "user", parts: [{ text: text.slice(0, 2e3) }] }],
      generationConfig: { temperature: 0 }
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
async function runAction(supabase, link, detected, helpers) {
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
        embedding
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
      const { data: deleted, error } = await supabase.from("user_memory").delete().eq("user_id", link.user_id).or(`key.ilike.${pattern},value.ilike.${pattern}`).select("key, value");
      if (error) {
        console.error("nl forget_memory failed:", error);
        return { note: `ACTION FAILED: nothing was deleted (${error.message}). Say so plainly \u2014 do not claim anything was removed.` };
      }
      const count = deleted?.length ?? 0;
      if (!count) return { note: `ACTION: nothing stored matches "${q}", so there was nothing to delete. Say that.` };
      return {
        note: `ACTION SUCCEEDED: deleted ${count} stored ${count === 1 ? "entry" : "entries"}: ${deleted.map((d) => d.key).join("; ")}. Confirm it, and stop using those details from now on. Past messages in this thread still exist \u2014 mention that only if relevant.`
      };
    }
    case "list_memory": {
      const { data, error } = await supabase.from("user_memory").select("category, key, value").eq("user_id", link.user_id).order("last_reinforced_at", { ascending: false }).limit(20);
      if (error) {
        return { note: `ACTION FAILED: couldn't read their memory store (${error.message}). Say you can't see it right now rather than guessing what's in it.` };
      }
      if (!data?.length) return { note: "ACTION: their memory store is genuinely empty. Say so." };
      const lines = data.map((m) => `(${m.category}) ${m.key}: ${m.value}`).join("\n");
      return { note: `ACTION: this is exactly what is stored \u2014 recite from this and nothing else:
${lines}` };
    }
    case "set_mode": {
      const wanted = (option || "").toLowerCase().replace(/[\s-]/g, "_");
      if (!MODES.includes(wanted)) return { note: "ACTION: mode change requested but the mode wasn't clear. Nothing changed." };
      const { error } = await supabase.from("bot_channel_links").update({ metadata: { ...link.metadata || {}, companion_mode: wanted } }).eq("id", link.id);
      if (error) return { note: `ACTION FAILED: mode unchanged (${error.message}).` };
      link.metadata = { ...link.metadata || {}, companion_mode: wanted };
      return { note: `ACTION SUCCEEDED: your manner is now set to "${wanted}" for this chat, from this reply onward. Shift into it immediately rather than announcing it formally.` };
    }
    case "voice_pref": {
      const mode = option === "off" ? "off" : option === "always" ? "always" : "on";
      const { error } = await supabase.from("bot_channel_links").update({ metadata: { ...link.metadata || {}, voice_replies: mode !== "off", voice_mode: mode } }).eq("id", link.id);
      if (error) return { note: `ACTION FAILED: voice preference unchanged (${error.message}).` };
      link.metadata = { ...link.metadata || {}, voice_replies: mode !== "off", voice_mode: mode };
      return {
        note: `ACTION SUCCEEDED: voice replies set to "${mode}" \u2014 ${mode === "off" ? "text only from now on" : mode === "always" ? "you'll send a voice note with every reply" : "you'll answer voice notes with a voice note, text with text"}. Confirm briefly.`
      };
    }
    case "checkins": {
      const opt = (option || "").toLowerCase().trim();
      if (/^\d+$/.test(opt)) {
        const cap = Math.max(0, Math.min(5, parseInt(opt, 10)));
        const { error } = await supabase.from("user_settings").update({ telegram_checkin_max_per_day: cap, telegram_checkins_enabled: cap > 0, telegram_proactive: cap > 0 }).eq("user_id", link.user_id);
        if (error) return { note: `ACTION FAILED: check-in settings unchanged (${error.message}).` };
        return { note: `ACTION SUCCEEDED: check-ins capped at ${cap} a day${cap === 0 ? ", which means they're off" : ""}.` };
      }
      if (opt === "on" || opt === "off") {
        const on = opt === "on";
        const { error } = await supabase.from("user_settings").update({ telegram_checkins_enabled: on, telegram_proactive: on }).eq("user_id", link.user_id);
        if (error) return { note: `ACTION FAILED: check-in settings unchanged (${error.message}).` };
        return {
          note: on ? "ACTION SUCCEEDED: check-ins are on \u2014 at most twice a day, only about something specific they actually told you, never a generic hello. They can switch it off any time just by saying so." : "ACTION SUCCEEDED: check-ins are off. You won't message first at all now."
        };
      }
      const { data: s } = await supabase.from("user_settings").select("telegram_checkins_enabled, telegram_checkin_max_per_day").eq("user_id", link.user_id).maybeSingle();
      return {
        note: `ACTION: nothing changed. Current state \u2014 check-ins are ${s?.telegram_checkins_enabled ? `on, capped at ${s.telegram_checkin_max_per_day ?? 2} a day` : "off"}. Tell them and ask what they'd like.`
      };
    }
    case "link_account": {
      const code = (value || "").trim();
      if (!code) {
        return { note: "ACTION: they want to connect this chat to their Rin web account but gave no code. They get one in Rin under Settings \u2192 Connected Accounts, then just send it here. Mention it's optional \u2014 this chat works fine standalone." };
      }
      if (link.metadata?.telegram_native === false) {
        return { note: "ACTION: this chat is already connected to an Rin account. To move it to a different one they'd need to disconnect first." };
      }
      const result = await helpers.consumeCode(code);
      if (result.error) return { note: `ACTION FAILED: not connected. Reason: ${result.error}` };
      return {
        note: result.merged ? "ACTION SUCCEEDED: this chat is now connected to their Rin account, and everything from this chat moved across with it." : "ACTION SUCCEEDED: this chat and their Rin account are the same person now."
      };
    }
    case "new_thread": {
      await supabase.from("bot_channel_links").update({ conversation_id: null }).eq("id", link.id);
      return { note: "ACTION SUCCEEDED: fresh thread started \u2014 you no longer have this chat's recent messages in view, though their long-term memory is untouched. Say that briefly and invite them in.", terminal: true };
    }
    case "unlink": {
      await supabase.from("bot_channel_links").delete().eq("id", link.id);
      return { note: "ACTION SUCCEEDED: this chat is disconnected. Say goodbye warmly and briefly, and mention they can reconnect any time by messaging again.", terminal: true };
    }
    default:
      return null;
  }
}

// projects/aurora/rin-companion-v2/supabase/functions/telegram-webhook/index.ts
var SURFACE_NOTES = `**You are talking through Telegram**
- Plain text only. No markdown headers, no tables, no code fences unless sharing actual code.
- Keep replies chat-sized: a few sentences. Long essays don't belong in a messaging thread.
- Bullets are fine sparingly, using "\u2022".`;
function admin() {
  return (0, import_supabase_js_2.createClient)(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
}
async function logError(supabase, functionName, stage, e, context = {}) {
  const err = e instanceof Error ? e : new Error(String(e));
  try {
    await supabase.from("error_log").insert({
      function_name: functionName,
      error_message: `[${stage}] ${err.message}`,
      error_stack: err.stack ?? null,
      context
    });
  } catch (logErr) {
    console.error("error_log insert failed:", logErr);
  }
  console.error(`[${stage}]`, err);
}
var HELP = [
  "Here's what I can do here:",
  "",
  "\u2022 Just talk \u2014 I remember what matters from our conversations.",
  "\u2022 Send a voice note and I'll listen, and answer with one.",
  "\u2022 Send a photo and I'll tell you what I see or read the text in it.",
  "",
  "Commands:",
  "/mode \u2014 see or change how I show up (e.g. /mode casual)",
  "/remember <something> \u2014 save it to your memory",
  "/forget <words> \u2014 delete every stored entry that mentions them",
  "/memory \u2014 what I currently remember about you",
  "/voice on|off|always \u2014 whether I reply with a voice note",
  "/checkins on|off|<number> \u2014 whether I can message you first, and how often",
  "/link <code> \u2014 connect this chat to your Rin web account",
  "/new \u2014 start a fresh thread",
  "/unlink \u2014 disconnect this chat"
].join("\n");
async function findLink(supabase, chatId) {
  const { data } = await supabase.from("bot_channel_links").select("*").eq("platform", "telegram").eq("external_id", String(chatId)).maybeSingle();
  return data;
}
async function provisionAccount(supabase, chatId, displayName, username) {
  const email = `telegram-${chatId}@rin.local`;
  const password = crypto.randomUUID() + crypto.randomUUID();
  let userId = null;
  const { data: created, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: displayName, telegram_chat_id: chatId, telegram_username: username ?? null, source: "telegram" }
  });
  if (created?.user?.id) {
    userId = created.user.id;
  } else {
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
    last_message_at: (/* @__PURE__ */ new Date()).toISOString()
  }, { onConflict: "platform,external_id" }).select("*").single();
  if (linkError) {
    console.error("Link create failed:", linkError);
    return null;
  }
  return link;
}
async function consumeCode(supabase, code, chatId, displayName, currentLink) {
  const { data: row } = await supabase.from("bot_link_codes").select("*").eq("code", code.trim().toUpperCase()).eq("platform", "telegram").is("consumed_at", null).maybeSingle();
  if (!row) return { error: "That code isn't valid. Generate a fresh one in Rin under Settings \u2192 Connected Accounts." };
  if (new Date(row.expires_at) < /* @__PURE__ */ new Date()) {
    return { error: "That code expired. Grab a new one in Rin under Settings \u2192 Connected Accounts." };
  }
  let merged = 0;
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
    metadata: { ...currentLink?.metadata || {}, voice_replies: currentLink?.metadata?.voice_replies ?? true, telegram_native: false },
    last_message_at: (/* @__PURE__ */ new Date()).toISOString()
  }, { onConflict: "platform,external_id" });
  if (error) {
    console.error("Link upsert failed:", error);
    return { error: "Something went wrong connecting this chat. Try again in a moment." };
  }
  await supabase.from("bot_link_codes").update({ consumed_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", row.id);
  return { userId: row.user_id, merged };
}
async function ensureConversation(supabase, link) {
  if (link.conversation_id) return link.conversation_id;
  const { data, error } = await supabase.from("conversations").insert({ user_id: link.user_id, title: "Telegram" }).select("id").single();
  if (error) {
    console.error("Conversation create failed:", error);
    return null;
  }
  await supabase.from("bot_channel_links").update({ conversation_id: data.id }).eq("id", link.id);
  link.conversation_id = data.id;
  return data.id;
}
async function loadHistory(supabase, conversationId) {
  const { data } = await supabase.from("messages").select("role, content").eq("conversation_id", conversationId).order("created_at", { ascending: false }).limit(20);
  return (data ?? []).reverse().map((m) => ({ role: m.role, content: m.content }));
}
async function saveMessage(supabase, link, conversationId, role, content) {
  await supabase.from("messages").insert({
    conversation_id: conversationId,
    user_id: link.user_id,
    role,
    content
  });
  await supabase.from("conversations").update({ updated_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", conversationId);
}
async function think(supabase, link, history, userText) {
  const { data: profile } = await supabase.from("profiles").select("display_name").eq("user_id", link.user_id).maybeSingle();
  const { data: settings } = await supabase.from("user_settings").select("companion_mode").eq("user_id", link.user_id).maybeSingle();
  const mode = link.metadata?.companion_mode || settings?.companion_mode || "assistant";
  const messages = [...history, { role: "user", content: userText }];
  const { guidance, lastUserText } = emojiGuidanceFor(messages);
  const state = await buildCognitiveState(link.user_id, supabase, profile?.display_name || "", mode);
  let context = buildContextBlock(state);
  const recalled = await retrieveRelevantMemories(link.user_id, supabase, lastUserText);
  if (recalled) context = `${context}

${recalled}`;
  const systemPrompt = buildSystemPrompt({
    userName: profile?.display_name || void 0,
    cognitiveContext: context,
    companionMode: mode,
    emojiGuidance: guidance,
    capabilityNotes: buildCapabilityNotes("telegram"),
    surfaceNotes: SURFACE_NOTES
  });
  const contents = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }]
  }));
  const result = await generateWithFallback({
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents,
    generationConfig: { temperature: temperatureFor(mode) }
  }, supabase, "think");
  return result;
}
var AUDIO_MIME = {
  ogg: "audio/ogg",
  oga: "audio/ogg",
  opus: "audio/ogg",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  mp4: "audio/mp4",
  wav: "audio/wav",
  webm: "audio/webm",
  flac: "audio/flac"
};
async function transcribe(bytes, filename, declaredMime) {
  const ext = (filename.split(".").pop() || "ogg").toLowerCase();
  const mime = declaredMime || AUDIO_MIME[ext] || "audio/ogg";
  try {
    const b64 = btoa(String.fromCharCode(...bytes));
    const res = await geminiGenerate(MODELS.chat, {
      contents: [{
        role: "user",
        parts: [
          { text: "Transcribe this audio exactly. Output only the spoken text, no commentary, no punctuation unless it was clearly spoken." },
          { inlineData: { mimeType: mime, data: b64 } }
        ]
      }],
      generationConfig: { temperature: 0 }
    });
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 400);
      console.error(`STT failed [${res.status}] mime=${mime} file=${filename} bytes=${bytes.length}:`, detail);
      const reason = res.status === 429 ? "I'm rate limited on transcription right now." : res.status === 402 ? "Rin's usage credits ran out, so transcription is off." : `Transcription failed on my side (error ${res.status}).`;
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
async function speak(text) {
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const ttsSecret = Deno.env.get("TTS_SHARED_SECRET") ?? "";
    const endpointRes = await fetch(
      `${SUPABASE_URL}/rest/v1/tts_endpoint?id=eq.1&select=url,updated_at`,
      { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } }
    );
    if (!endpointRes.ok) {
      console.error("TTS endpoint lookup failed:", endpointRes.status);
      return null;
    }
    const rows = await endpointRes.json();
    const url = rows?.[0]?.url;
    const updatedAt = rows?.[0]?.updated_at ? new Date(rows[0].updated_at).getTime() : 0;
    const STALE_MS = 10 * 60 * 1e3;
    if (!url || Date.now() - updatedAt > STALE_MS) {
      console.error("TTS endpoint stale or missing:", url ? "stale" : "missing");
      return null;
    }
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "x-tts-secret": ttsSecret,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ text: text.slice(0, 1800) }),
      signal: AbortSignal.timeout(8e3)
      // 8s hard cap — never hang the webhook
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
async function describeImage(bytes, mime, caption) {
  const b64 = btoa(String.fromCharCode(...bytes));
  const res = await geminiGenerate(MODELS.vision, {
    contents: [{
      role: "user",
      parts: [
        { text: caption ? `${caption}

(Answer conversationally, plain text, no markdown headers.)` : "Tell me what's in this image, conversationally and briefly. If it's mostly text, read the text out for me instead." },
        { inlineData: { mimeType: mime, data: b64 } }
      ]
    }]
  });
  if (!res.ok) {
    console.error("Vision failed:", res.status, (await res.text()).slice(0, 300));
    return "I couldn't open that image \u2014 try sending it again?";
  }
  const body = await res.json();
  return geminiText(body) || "I couldn't make anything out in that one.";
}
Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  let token;
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
  const { error: dupeError } = await supabase.from("telegram_updates").insert({ update_id: update.update_id });
  if (dupeError) return new Response(JSON.stringify({ ok: true, duplicate: true }));
  const message = update.message ?? update.edited_message;
  const chatId = message?.chat?.id;
  if (!chatId) return new Response(JSON.stringify({ ok: true }));
  try {
    const displayName = [message.from?.first_name, message.from?.last_name].filter(Boolean).join(" ") || message.from?.username || "Telegram user";
    let text = (message.text || "").trim();
    let startPayload = "";
    if (/^\/start\b/i.test(text)) {
      startPayload = text.replace(/^\/start\b/i, "").trim();
      text = "";
    } else if (text.startsWith("/")) {
      text = text.slice(1).replace(/^(\w+)@\w+/, "$1").trim();
    }
    if (text === "help") {
      console.log(`[webhook] /help bypass: sending HELP to chat ${chatId}`);
      await sendMessage(chatId, HELP);
      return new Response(JSON.stringify({ ok: true }));
    }
    let link = await findLink(supabase, chatId);
    if (!link) {
      if (startPayload) {
        const result = await consumeCode(supabase, startPayload, chatId, displayName);
        if (!("error" in result)) {
          link = await findLink(supabase, chatId);
          await sendMessage(chatId, `We're connected \u2014 everything you've told me in Rin, I have here too.

So. What's going on?`);
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
    const { data: settings } = await supabase.from("user_settings").select("telegram_enabled").eq("user_id", link.user_id).maybeSingle();
    if (settings?.telegram_enabled === false) {
      await sendMessage(chatId, "Telegram is switched off for your account. Turn it back on in Rin under Settings \u2192 Connected Accounts and I'll be right here.");
      return new Response(JSON.stringify({ ok: true }));
    }
    await supabase.from("bot_channel_links").update({ last_message_at: (/* @__PURE__ */ new Date()).toISOString(), display_name: displayName }).eq("id", link.id);
    await sendChatAction(chatId, "typing");
    const conversationId = await ensureConversation(supabase, link);
    if (!conversationId) {
      await sendMessage(chatId, "I couldn't open our thread just now. Try again in a moment.");
      return new Response(JSON.stringify({ ok: true }));
    }
    let userText = text;
    let cameFromVoice = false;
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
        voice.mime_type
      );
      cameFromVoice = true;
      if (heard.failed) {
        await sendMessage(chatId, `${heard.reason} That's on my end, not your recording \u2014 try again in a moment, or send it as text.`);
        return new Response(JSON.stringify({ ok: true }));
      }
      if (!heard.text) {
        await sendMessage(chatId, "That one came through silent \u2014 I got the audio but no words in it. Want to try again?");
        return new Response(JSON.stringify({ ok: true }));
      }
      userText = heard.text;
    }
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
      const answer2 = await describeImage(file.bytes, imageDoc?.mime_type || "image/jpeg", caption);
      await saveMessage(supabase, link, conversationId, "user", caption ? `[photo] ${caption}` : "[photo]");
      await saveMessage(supabase, link, conversationId, "assistant", answer2);
      await sendMessage(chatId, answer2);
      return new Response(JSON.stringify({ ok: true }));
    }
    if (!userText) {
      await sendMessage(chatId, "I can read text, listen to voice notes and look at photos here.");
      return new Response(JSON.stringify({ ok: true }));
    }
    let detected = { action: "none" };
    let extraction = { stored: [], uncertain: [] };
    try {
      [detected, extraction] = await Promise.all([
        detectAction(userText),
        extractAndStore(supabase, link.user_id, userText, "", conversationId)
      ]);
    } catch (e) {
      await logError(supabase, "telegram-webhook", "promise-all", e, {
        chat_id: chatId,
        user_text: userText.slice(0, 200),
        update_id: update.update_id
      });
    }
    const notes = [];
    if (detected.action !== "none") {
      const outcome = await runAction(supabase, link, detected, {
        consumeCode: async (code) => await consumeCode(supabase, code, chatId, displayName, link)
      });
      if (outcome) notes.push(outcome.note);
    }
    if (extraction.stored.length) {
      notes.push(
        `MEMORY: these were just filed automatically from what they said \u2014 ${extraction.stored.join("; ")}. Don't announce the saving. Only mention it if they ask whether you caught it.`
      );
    }
    if (extraction.uncertain.length) {
      notes.push(
        `POSSIBLE, NOT STORED: "${extraction.uncertain[0]}". They didn't actually say this \u2014 it's your reading. If it fits the flow, check it with them in one light question near the end of your reply (e.g. "is rice your favourite, or did I just catch you on a rice week?"). If they confirm it next turn, it gets stored then. Never state it as something you know.`
      );
    }
    const history = await loadHistory(supabase, conversationId);
    let answer;
    try {
      answer = await think(supabase, link, history, userText, notes.join("\n\n"));
    } catch (e) {
      await logError(supabase, "telegram-webhook", "think", e, {
        chat_id: chatId,
        user_text: userText.slice(0, 200),
        update_id: update.update_id,
        history_len: history.length
      });
      answer = "Something went wrong on my end. Try me again in a moment.";
    }
    try {
      await saveMessage(supabase, link, conversationId, "user", userText);
      await saveMessage(supabase, link, conversationId, "assistant", answer);
    } catch (e) {
      await logError(supabase, "telegram-webhook", "save-message", e, {
        chat_id: chatId,
        conversation_id: conversationId,
        user_id: link.user_id,
        update_id: update.update_id
      });
    }
    await sendMessage(chatId, answer);
    const voiceMode = link.metadata?.voice_mode ?? (link.metadata?.voice_replies === false ? "off" : "on");
    if (voiceMode !== "off" && (cameFromVoice || voiceMode === "always")) {
      const audio = await speak(answer);
      if (audio) {
        await sendVoiceReply(chatId, audio, "audio/wav");
      } else {
        await sendMessage(
          chatId,
          `${answer}

(Voice isn't reachable right now \u2014 here's this as text.)`
        );
      }
    }
    const bg = extractAndStore(supabase, link.user_id, userText, answer, conversationId).catch((e) => console.error("post-turn extraction failed:", e));
    globalThis.EdgeRuntime?.waitUntil?.(bg);
    return new Response(JSON.stringify({ ok: true }));
  } catch (e) {
    console.error("telegram-webhook error:", e);
    try {
      await sendMessage(chatId, "Something broke on my side. Try me again in a moment.");
    } catch {
    }
    return new Response(JSON.stringify({ ok: true }));
  }
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiaW5kZXgudHMiLCAiLi4vX3NoYXJlZC90ZWxlZ3JhbS50cyIsICIuLi9fc2hhcmVkL2VtYmVkLnRzIiwgIi4uL19zaGFyZWQvYnJhaW4udHMiLCAiLi4vX3NoYXJlZC9nZW1pbmkudHMiLCAiLi4vX3NoYXJlZC9leHRlcm5hbC10b29scy50cyIsICIuLi9fc2hhcmVkL21vZGVsLWZhbGxiYWNrLnRzIiwgIi4uL19zaGFyZWQvcGFzc2l2ZS1tZW1vcnkudHMiLCAiLi4vX3NoYXJlZC9ubC1hY3Rpb25zLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvLyBSaW4gb24gVGVsZWdyYW0uIFNhbWUgYnJhaW4sIHNhbWUgbWVtb3J5LCBzYW1lIGFjY291bnQgXHUyMDE0IHJlYWNoYWJsZSBmcm9tXG4vLyBhIGNoYXQgdGhyZWFkLiBUZWxlZ3JhbSBjYWxscyB0aGlzIGVuZHBvaW50IGZvciBldmVyeSBpbmNvbWluZyB1cGRhdGUuXG5cbmltcG9ydCB7IGNyZWF0ZUNsaWVudCB9IGZyb20gXCJodHRwczovL2VzbS5zaC9Ac3VwYWJhc2Uvc3VwYWJhc2UtanNAMlwiO1xuaW1wb3J0IHtcbiAgYm90VG9rZW4sIHdlYmhvb2tTZWNyZXQsIHNhZmVFcXVhbCxcbiAgc2VuZE1lc3NhZ2UsIHNlbmRDaGF0QWN0aW9uLCBkb3dubG9hZEZpbGUsIHNlbmRWb2ljZVJlcGx5LFxufSBmcm9tIFwiLi4vX3NoYXJlZC90ZWxlZ3JhbS50c1wiO1xuaW1wb3J0IHtcbiAgYnVpbGRDb2duaXRpdmVTdGF0ZSwgYnVpbGRDb250ZXh0QmxvY2ssIGJ1aWxkU3lzdGVtUHJvbXB0LCBidWlsZENhcGFiaWxpdHlOb3RlcyxcbiAgZW1vamlHdWlkYW5jZUZvciwgcmV0cmlldmVSZWxldmFudE1lbW9yaWVzLCB0ZW1wZXJhdHVyZUZvcixcbn0gZnJvbSBcIi4uL19zaGFyZWQvYnJhaW4udHNcIjtcbmltcG9ydCB7IGVtYmVkT25lIH0gZnJvbSBcIi4uL19zaGFyZWQvZW1iZWQudHNcIjtcbmltcG9ydCB7IGdlbWluaUdlbmVyYXRlLCBnZW1pbmlUZXh0LCBNT0RFTFMgfSBmcm9tIFwiLi4vX3NoYXJlZC9nZW1pbmkudHNcIjtcbmltcG9ydCB7IGdlbmVyYXRlV2l0aEZhbGxiYWNrIH0gZnJvbSBcIi4uL19zaGFyZWQvbW9kZWwtZmFsbGJhY2sudHNcIjtcbmltcG9ydCB7IGV4dHJhY3RBbmRTdG9yZSB9IGZyb20gXCIuLi9fc2hhcmVkL3Bhc3NpdmUtbWVtb3J5LnRzXCI7XG5pbXBvcnQgeyBkZXRlY3RBY3Rpb24sIHJ1bkFjdGlvbiB9IGZyb20gXCIuLi9fc2hhcmVkL25sLWFjdGlvbnMudHNcIjtcblxuLyogZXNsaW50LWRpc2FibGUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueSAqL1xudHlwZSBBbnkgPSBhbnk7XG5cbmNvbnN0IE1PREVTID0gW1wiYXNzaXN0YW50XCIsIFwiZ3Jvd3RoX3BhcnRuZXJcIiwgXCJ0aGVyYXBpc3RfbGl0ZVwiLCBcInN0cmF0ZWdpY1wiLCBcImNhc3VhbFwiLCBcImNyZWF0aXZlXCIsIFwidGVjaG5pY2FsXCJdO1xuXG5jb25zdCBTVVJGQUNFX05PVEVTID0gYCoqWW91IGFyZSB0YWxraW5nIHRocm91Z2ggVGVsZWdyYW0qKlxuLSBQbGFpbiB0ZXh0IG9ubHkuIE5vIG1hcmtkb3duIGhlYWRlcnMsIG5vIHRhYmxlcywgbm8gY29kZSBmZW5jZXMgdW5sZXNzIHNoYXJpbmcgYWN0dWFsIGNvZGUuXG4tIEtlZXAgcmVwbGllcyBjaGF0LXNpemVkOiBhIGZldyBzZW50ZW5jZXMuIExvbmcgZXNzYXlzIGRvbid0IGJlbG9uZyBpbiBhIG1lc3NhZ2luZyB0aHJlYWQuXG4tIEJ1bGxldHMgYXJlIGZpbmUgc3BhcmluZ2x5LCB1c2luZyBcIlx1MjAyMlwiLmA7XG5cbmZ1bmN0aW9uIGFkbWluKCkge1xuICByZXR1cm4gY3JlYXRlQ2xpZW50KERlbm8uZW52LmdldChcIlNVUEFCQVNFX1VSTFwiKSEsIERlbm8uZW52LmdldChcIlNVUEFCQVNFX1NFUlZJQ0VfUk9MRV9LRVlcIikhKTtcbn1cblxuLyoqXG4gKiBQZXJzaXN0IGEgcmVhbCBlcnJvciB3aGVyZSBpdCBjYW4gYmUgcmVhZCBiYWNrIHdpdGhvdXQgdGhlIGRhc2hib2FyZCdzXG4gKiBsb2cgZXhwbG9yZXIuIE5ldmVyIHRocm93cyBcdTIwMTQgbG9nZ2luZyBtdXN0IG5vdCBtYXNrIHRoZSBvcmlnaW5hbCBmYWlsdXJlLlxuICovXG5hc3luYyBmdW5jdGlvbiBsb2dFcnJvcihcbiAgc3VwYWJhc2U6IEFueSxcbiAgZnVuY3Rpb25OYW1lOiBzdHJpbmcsXG4gIHN0YWdlOiBzdHJpbmcsXG4gIGU6IHVua25vd24sXG4gIGNvbnRleHQ6IFJlY29yZDxzdHJpbmcsIHVua25vd24+ID0ge30sXG4pIHtcbiAgY29uc3QgZXJyID0gZSBpbnN0YW5jZW9mIEVycm9yID8gZSA6IG5ldyBFcnJvcihTdHJpbmcoZSkpO1xuICB0cnkge1xuICAgIGF3YWl0IHN1cGFiYXNlLmZyb20oXCJlcnJvcl9sb2dcIikuaW5zZXJ0KHtcbiAgICAgIGZ1bmN0aW9uX25hbWU6IGZ1bmN0aW9uTmFtZSxcbiAgICAgIGVycm9yX21lc3NhZ2U6IGBbJHtzdGFnZX1dICR7ZXJyLm1lc3NhZ2V9YCxcbiAgICAgIGVycm9yX3N0YWNrOiBlcnIuc3RhY2sgPz8gbnVsbCxcbiAgICAgIGNvbnRleHQsXG4gICAgfSk7XG4gIH0gY2F0Y2ggKGxvZ0Vycikge1xuICAgIGNvbnNvbGUuZXJyb3IoXCJlcnJvcl9sb2cgaW5zZXJ0IGZhaWxlZDpcIiwgbG9nRXJyKTtcbiAgfVxuICBjb25zb2xlLmVycm9yKGBbJHtzdGFnZX1dYCwgZXJyKTtcbn1cblxuY29uc3QgSEVMUCA9IFtcbiAgXCJIZXJlJ3Mgd2hhdCBJIGNhbiBkbyBoZXJlOlwiLFxuICBcIlwiLFxuICBcIlx1MjAyMiBKdXN0IHRhbGsgXHUyMDE0IEkgcmVtZW1iZXIgd2hhdCBtYXR0ZXJzIGZyb20gb3VyIGNvbnZlcnNhdGlvbnMuXCIsXG4gIFwiXHUyMDIyIFNlbmQgYSB2b2ljZSBub3RlIGFuZCBJJ2xsIGxpc3RlbiwgYW5kIGFuc3dlciB3aXRoIG9uZS5cIixcbiAgXCJcdTIwMjIgU2VuZCBhIHBob3RvIGFuZCBJJ2xsIHRlbGwgeW91IHdoYXQgSSBzZWUgb3IgcmVhZCB0aGUgdGV4dCBpbiBpdC5cIixcbiAgXCJcIixcbiAgXCJDb21tYW5kczpcIixcbiAgXCIvbW9kZSBcdTIwMTQgc2VlIG9yIGNoYW5nZSBob3cgSSBzaG93IHVwIChlLmcuIC9tb2RlIGNhc3VhbClcIixcbiAgXCIvcmVtZW1iZXIgPHNvbWV0aGluZz4gXHUyMDE0IHNhdmUgaXQgdG8geW91ciBtZW1vcnlcIixcbiAgXCIvZm9yZ2V0IDx3b3Jkcz4gXHUyMDE0IGRlbGV0ZSBldmVyeSBzdG9yZWQgZW50cnkgdGhhdCBtZW50aW9ucyB0aGVtXCIsXG4gIFwiL21lbW9yeSBcdTIwMTQgd2hhdCBJIGN1cnJlbnRseSByZW1lbWJlciBhYm91dCB5b3VcIixcbiAgXCIvdm9pY2Ugb258b2ZmfGFsd2F5cyBcdTIwMTQgd2hldGhlciBJIHJlcGx5IHdpdGggYSB2b2ljZSBub3RlXCIsXG4gIFwiL2NoZWNraW5zIG9ufG9mZnw8bnVtYmVyPiBcdTIwMTQgd2hldGhlciBJIGNhbiBtZXNzYWdlIHlvdSBmaXJzdCwgYW5kIGhvdyBvZnRlblwiLFxuICBcIi9saW5rIDxjb2RlPiBcdTIwMTQgY29ubmVjdCB0aGlzIGNoYXQgdG8geW91ciBSaW4gd2ViIGFjY291bnRcIixcbiAgXCIvbmV3IFx1MjAxNCBzdGFydCBhIGZyZXNoIHRocmVhZFwiLFxuICBcIi91bmxpbmsgXHUyMDE0IGRpc2Nvbm5lY3QgdGhpcyBjaGF0XCIsXG5dLmpvaW4oXCJcXG5cIik7XG5cbi8qIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0gbGlua2luZyAqL1xuXG5hc3luYyBmdW5jdGlvbiBmaW5kTGluayhzdXBhYmFzZTogQW55LCBjaGF0SWQ6IG51bWJlcikge1xuICBjb25zdCB7IGRhdGEgfSA9IGF3YWl0IHN1cGFiYXNlXG4gICAgLmZyb20oXCJib3RfY2hhbm5lbF9saW5rc1wiKVxuICAgIC5zZWxlY3QoXCIqXCIpXG4gICAgLmVxKFwicGxhdGZvcm1cIiwgXCJ0ZWxlZ3JhbVwiKVxuICAgIC5lcShcImV4dGVybmFsX2lkXCIsIFN0cmluZyhjaGF0SWQpKVxuICAgIC5tYXliZVNpbmdsZSgpO1xuICByZXR1cm4gZGF0YTtcbn1cblxuLyoqXG4gKiBUZWxlZ3JhbSBpcyBhIGZpcnN0LWNsYXNzIGZyb250IGRvb3I6IHNvbWVvbmUgY2FuIHN0YXJ0IHRhbGtpbmcgd2l0aCBub1xuICogUmluIHdlYiBhY2NvdW50IGF0IGFsbC4gV2UgcXVpZXRseSBwcm92aXNpb24gb25lIGZvciB0aGlzIGNoYXQuIFRoZXkgY2FuXG4gKiBtZXJnZSBpdCBpbnRvIGEgd2ViIGFjY291bnQgbGF0ZXIgd2l0aCAvbGluay5cbiAqL1xuYXN5bmMgZnVuY3Rpb24gcHJvdmlzaW9uQWNjb3VudChzdXBhYmFzZTogQW55LCBjaGF0SWQ6IG51bWJlciwgZGlzcGxheU5hbWU6IHN0cmluZywgdXNlcm5hbWU/OiBzdHJpbmcpIHtcbiAgY29uc3QgZW1haWwgPSBgdGVsZWdyYW0tJHtjaGF0SWR9QHJpbi5sb2NhbGA7XG4gIGNvbnN0IHBhc3N3b3JkID0gY3J5cHRvLnJhbmRvbVVVSUQoKSArIGNyeXB0by5yYW5kb21VVUlEKCk7XG5cbiAgbGV0IHVzZXJJZDogc3RyaW5nIHwgbnVsbCA9IG51bGw7XG4gIGNvbnN0IHsgZGF0YTogY3JlYXRlZCwgZXJyb3IgfSA9IGF3YWl0IHN1cGFiYXNlLmF1dGguYWRtaW4uY3JlYXRlVXNlcih7XG4gICAgZW1haWwsXG4gICAgcGFzc3dvcmQsXG4gICAgZW1haWxfY29uZmlybTogdHJ1ZSxcbiAgICB1c2VyX21ldGFkYXRhOiB7IGRpc3BsYXlfbmFtZTogZGlzcGxheU5hbWUsIHRlbGVncmFtX2NoYXRfaWQ6IGNoYXRJZCwgdGVsZWdyYW1fdXNlcm5hbWU6IHVzZXJuYW1lID8/IG51bGwsIHNvdXJjZTogXCJ0ZWxlZ3JhbVwiIH0sXG4gIH0pO1xuICBpZiAoY3JlYXRlZD8udXNlcj8uaWQpIHtcbiAgICB1c2VySWQgPSBjcmVhdGVkLnVzZXIuaWQ7XG4gIH0gZWxzZSB7XG4gICAgLy8gQWxyZWFkeSBwcm92aXNpb25lZCBlYXJsaWVyIChlLmcuIHRoZSBsaW5rIHJvdyB3YXMgZGVsZXRlZCkgXHUyMDE0IHJldXNlIGl0LlxuICAgIGNvbnN0IHsgZGF0YTogZXhpc3RpbmdJZCB9ID0gYXdhaXQgc3VwYWJhc2UucnBjKFwidXNlcl9pZF9ieV9lbWFpbFwiLCB7IF9lbWFpbDogZW1haWwgfSk7XG4gICAgdXNlcklkID0gdHlwZW9mIGV4aXN0aW5nSWQgPT09IFwic3RyaW5nXCIgPyBleGlzdGluZ0lkIDogbnVsbDtcbiAgICBpZiAoIXVzZXJJZCkge1xuICAgICAgY29uc29sZS5lcnJvcihcIkFjY291bnQgcHJvdmlzaW9uaW5nIGZhaWxlZDpcIiwgZXJyb3IpO1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuICB9XG5cbiAgYXdhaXQgc3VwYWJhc2UuZnJvbShcInByb2ZpbGVzXCIpLnVwc2VydCh7IHVzZXJfaWQ6IHVzZXJJZCwgZGlzcGxheV9uYW1lOiBkaXNwbGF5TmFtZSB9LCB7IG9uQ29uZmxpY3Q6IFwidXNlcl9pZFwiIH0pO1xuICBhd2FpdCBzdXBhYmFzZS5mcm9tKFwidXNlcl9zZXR0aW5nc1wiKS51cHNlcnQoeyB1c2VyX2lkOiB1c2VySWQgfSwgeyBvbkNvbmZsaWN0OiBcInVzZXJfaWRcIiB9KTtcblxuICBjb25zdCB7IGRhdGE6IGxpbmssIGVycm9yOiBsaW5rRXJyb3IgfSA9IGF3YWl0IHN1cGFiYXNlLmZyb20oXCJib3RfY2hhbm5lbF9saW5rc1wiKS51cHNlcnQoe1xuICAgIHVzZXJfaWQ6IHVzZXJJZCxcbiAgICBwbGF0Zm9ybTogXCJ0ZWxlZ3JhbVwiLFxuICAgIGV4dGVybmFsX2lkOiBTdHJpbmcoY2hhdElkKSxcbiAgICBkaXNwbGF5X25hbWU6IGRpc3BsYXlOYW1lLFxuICAgIG1ldGFkYXRhOiB7IHZvaWNlX3JlcGxpZXM6IHRydWUsIHRlbGVncmFtX25hdGl2ZTogdHJ1ZSB9LFxuICAgIGxhc3RfbWVzc2FnZV9hdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuICB9LCB7IG9uQ29uZmxpY3Q6IFwicGxhdGZvcm0sZXh0ZXJuYWxfaWRcIiB9KS5zZWxlY3QoXCIqXCIpLnNpbmdsZSgpO1xuICBpZiAobGlua0Vycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcihcIkxpbmsgY3JlYXRlIGZhaWxlZDpcIiwgbGlua0Vycm9yKTtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxuICByZXR1cm4gbGluaztcbn1cblxuYXN5bmMgZnVuY3Rpb24gY29uc3VtZUNvZGUoc3VwYWJhc2U6IEFueSwgY29kZTogc3RyaW5nLCBjaGF0SWQ6IG51bWJlciwgZGlzcGxheU5hbWU6IHN0cmluZywgY3VycmVudExpbms/OiBBbnkpIHtcbiAgY29uc3QgeyBkYXRhOiByb3cgfSA9IGF3YWl0IHN1cGFiYXNlXG4gICAgLmZyb20oXCJib3RfbGlua19jb2Rlc1wiKVxuICAgIC5zZWxlY3QoXCIqXCIpXG4gICAgLmVxKFwiY29kZVwiLCBjb2RlLnRyaW0oKS50b1VwcGVyQ2FzZSgpKVxuICAgIC5lcShcInBsYXRmb3JtXCIsIFwidGVsZWdyYW1cIilcbiAgICAuaXMoXCJjb25zdW1lZF9hdFwiLCBudWxsKVxuICAgIC5tYXliZVNpbmdsZSgpO1xuXG4gIGlmICghcm93KSByZXR1cm4geyBlcnJvcjogXCJUaGF0IGNvZGUgaXNuJ3QgdmFsaWQuIEdlbmVyYXRlIGEgZnJlc2ggb25lIGluIFJpbiB1bmRlciBTZXR0aW5ncyBcdTIxOTIgQ29ubmVjdGVkIEFjY291bnRzLlwiIH07XG4gIGlmIChuZXcgRGF0ZShyb3cuZXhwaXJlc19hdCkgPCBuZXcgRGF0ZSgpKSB7XG4gICAgcmV0dXJuIHsgZXJyb3I6IFwiVGhhdCBjb2RlIGV4cGlyZWQuIEdyYWIgYSBuZXcgb25lIGluIFJpbiB1bmRlciBTZXR0aW5ncyBcdTIxOTIgQ29ubmVjdGVkIEFjY291bnRzLlwiIH07XG4gIH1cblxuICBsZXQgbWVyZ2VkID0gMDtcbiAgLy8gSWYgdGhpcyBjaGF0IGhhcyBiZWVuIHRhbGtpbmcgdG8gYSBUZWxlZ3JhbS1vbmx5IGFjY291bnQsIGNhcnJ5IGV2ZXJ5dGhpbmdcbiAgLy8gaXQgYnVpbHQgdXAgb3ZlciBpbnRvIHRoZSB3ZWIgYWNjb3VudCByYXRoZXIgdGhhbiBzdHJhbmRpbmcgaXQuXG4gIGlmIChjdXJyZW50TGluaz8udXNlcl9pZCAmJiBjdXJyZW50TGluay51c2VyX2lkICE9PSByb3cudXNlcl9pZCAmJiBjdXJyZW50TGluay5tZXRhZGF0YT8udGVsZWdyYW1fbmF0aXZlKSB7XG4gICAgY29uc3QgeyBlcnJvcjogbWVyZ2VFcnJvciB9ID0gYXdhaXQgc3VwYWJhc2UucnBjKFwibWVyZ2VfdXNlcl9kYXRhXCIsIHsgX2Zyb206IGN1cnJlbnRMaW5rLnVzZXJfaWQsIF90bzogcm93LnVzZXJfaWQgfSk7XG4gICAgaWYgKG1lcmdlRXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoXCJtZXJnZV91c2VyX2RhdGEgZmFpbGVkOlwiLCBtZXJnZUVycm9yKTtcbiAgICAgIHJldHVybiB7IGVycm9yOiBgSSBjb3VsZG4ndCBtb3ZlIHlvdXIgVGVsZWdyYW0gaGlzdG9yeSBvdmVyLCBzbyBJIGhhdmVuJ3QgY29ubmVjdGVkIGFueXRoaW5nIHlldC4gVGhlIHN0b3JlIHNhaWQ6ICR7bWVyZ2VFcnJvci5tZXNzYWdlfWAgfTtcbiAgICB9XG4gICAgbWVyZ2VkID0gMTtcbiAgfVxuXG4gIGNvbnN0IHsgZXJyb3IgfSA9IGF3YWl0IHN1cGFiYXNlLmZyb20oXCJib3RfY2hhbm5lbF9saW5rc1wiKS51cHNlcnQoe1xuICAgIHVzZXJfaWQ6IHJvdy51c2VyX2lkLFxuICAgIHBsYXRmb3JtOiBcInRlbGVncmFtXCIsXG4gICAgZXh0ZXJuYWxfaWQ6IFN0cmluZyhjaGF0SWQpLFxuICAgIGRpc3BsYXlfbmFtZTogZGlzcGxheU5hbWUsXG4gICAgY29udmVyc2F0aW9uX2lkOiBudWxsLFxuICAgIG1ldGFkYXRhOiB7IC4uLihjdXJyZW50TGluaz8ubWV0YWRhdGEgfHwge30pLCB2b2ljZV9yZXBsaWVzOiBjdXJyZW50TGluaz8ubWV0YWRhdGE/LnZvaWNlX3JlcGxpZXMgPz8gdHJ1ZSwgdGVsZWdyYW1fbmF0aXZlOiBmYWxzZSB9LFxuICAgIGxhc3RfbWVzc2FnZV9hdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuICB9LCB7IG9uQ29uZmxpY3Q6IFwicGxhdGZvcm0sZXh0ZXJuYWxfaWRcIiB9KTtcbiAgaWYgKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcihcIkxpbmsgdXBzZXJ0IGZhaWxlZDpcIiwgZXJyb3IpO1xuICAgIHJldHVybiB7IGVycm9yOiBcIlNvbWV0aGluZyB3ZW50IHdyb25nIGNvbm5lY3RpbmcgdGhpcyBjaGF0LiBUcnkgYWdhaW4gaW4gYSBtb21lbnQuXCIgfTtcbiAgfVxuXG4gIGF3YWl0IHN1cGFiYXNlLmZyb20oXCJib3RfbGlua19jb2Rlc1wiKS51cGRhdGUoeyBjb25zdW1lZF9hdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpIH0pLmVxKFwiaWRcIiwgcm93LmlkKTtcbiAgcmV0dXJuIHsgdXNlcklkOiByb3cudXNlcl9pZCwgbWVyZ2VkIH07XG59XG5cbi8qIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSBwZXJzaXN0ZW5jZSAqL1xuXG5hc3luYyBmdW5jdGlvbiBlbnN1cmVDb252ZXJzYXRpb24oc3VwYWJhc2U6IEFueSwgbGluazogQW55KTogUHJvbWlzZTxzdHJpbmcgfCBudWxsPiB7XG4gIGlmIChsaW5rLmNvbnZlcnNhdGlvbl9pZCkgcmV0dXJuIGxpbmsuY29udmVyc2F0aW9uX2lkO1xuICBjb25zdCB7IGRhdGEsIGVycm9yIH0gPSBhd2FpdCBzdXBhYmFzZVxuICAgIC5mcm9tKFwiY29udmVyc2F0aW9uc1wiKVxuICAgIC5pbnNlcnQoeyB1c2VyX2lkOiBsaW5rLnVzZXJfaWQsIHRpdGxlOiBcIlRlbGVncmFtXCIgfSlcbiAgICAuc2VsZWN0KFwiaWRcIilcbiAgICAuc2luZ2xlKCk7XG4gIGlmIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoXCJDb252ZXJzYXRpb24gY3JlYXRlIGZhaWxlZDpcIiwgZXJyb3IpO1xuICAgIHJldHVybiBudWxsO1xuICB9XG4gIGF3YWl0IHN1cGFiYXNlLmZyb20oXCJib3RfY2hhbm5lbF9saW5rc1wiKS51cGRhdGUoeyBjb252ZXJzYXRpb25faWQ6IGRhdGEuaWQgfSkuZXEoXCJpZFwiLCBsaW5rLmlkKTtcbiAgbGluay5jb252ZXJzYXRpb25faWQgPSBkYXRhLmlkO1xuICByZXR1cm4gZGF0YS5pZDtcbn1cblxuYXN5bmMgZnVuY3Rpb24gbG9hZEhpc3Rvcnkoc3VwYWJhc2U6IEFueSwgY29udmVyc2F0aW9uSWQ6IHN0cmluZykge1xuICBjb25zdCB7IGRhdGEgfSA9IGF3YWl0IHN1cGFiYXNlXG4gICAgLmZyb20oXCJtZXNzYWdlc1wiKVxuICAgIC5zZWxlY3QoXCJyb2xlLCBjb250ZW50XCIpXG4gICAgLmVxKFwiY29udmVyc2F0aW9uX2lkXCIsIGNvbnZlcnNhdGlvbklkKVxuICAgIC5vcmRlcihcImNyZWF0ZWRfYXRcIiwgeyBhc2NlbmRpbmc6IGZhbHNlIH0pXG4gICAgLmxpbWl0KDIwKTtcbiAgcmV0dXJuIChkYXRhID8/IFtdKS5yZXZlcnNlKCkubWFwKChtOiBBbnkpID0+ICh7IHJvbGU6IG0ucm9sZSwgY29udGVudDogbS5jb250ZW50IH0pKTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gc2F2ZU1lc3NhZ2Uoc3VwYWJhc2U6IEFueSwgbGluazogQW55LCBjb252ZXJzYXRpb25JZDogc3RyaW5nLCByb2xlOiBzdHJpbmcsIGNvbnRlbnQ6IHN0cmluZykge1xuICBhd2FpdCBzdXBhYmFzZS5mcm9tKFwibWVzc2FnZXNcIikuaW5zZXJ0KHtcbiAgICBjb252ZXJzYXRpb25faWQ6IGNvbnZlcnNhdGlvbklkLFxuICAgIHVzZXJfaWQ6IGxpbmsudXNlcl9pZCxcbiAgICByb2xlLFxuICAgIGNvbnRlbnQsXG4gIH0pO1xuICBhd2FpdCBzdXBhYmFzZS5mcm9tKFwiY29udmVyc2F0aW9uc1wiKS51cGRhdGUoeyB1cGRhdGVkX2F0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCkgfSkuZXEoXCJpZFwiLCBjb252ZXJzYXRpb25JZCk7XG59XG5cbi8qIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tIGFpICovXG5cbmFzeW5jIGZ1bmN0aW9uIHRoaW5rKHN1cGFiYXNlOiBBbnksIGxpbms6IEFueSwgaGlzdG9yeTogQW55W10sIHVzZXJUZXh0OiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZz4ge1xuICBjb25zdCB7IGRhdGE6IHByb2ZpbGUgfSA9IGF3YWl0IHN1cGFiYXNlXG4gICAgLmZyb20oXCJwcm9maWxlc1wiKS5zZWxlY3QoXCJkaXNwbGF5X25hbWVcIikuZXEoXCJ1c2VyX2lkXCIsIGxpbmsudXNlcl9pZCkubWF5YmVTaW5nbGUoKTtcbiAgY29uc3QgeyBkYXRhOiBzZXR0aW5ncyB9ID0gYXdhaXQgc3VwYWJhc2VcbiAgICAuZnJvbShcInVzZXJfc2V0dGluZ3NcIikuc2VsZWN0KFwiY29tcGFuaW9uX21vZGVcIikuZXEoXCJ1c2VyX2lkXCIsIGxpbmsudXNlcl9pZCkubWF5YmVTaW5nbGUoKTtcblxuICBjb25zdCBtb2RlID0gbGluay5tZXRhZGF0YT8uY29tcGFuaW9uX21vZGUgfHwgc2V0dGluZ3M/LmNvbXBhbmlvbl9tb2RlIHx8IFwiYXNzaXN0YW50XCI7XG4gIGNvbnN0IG1lc3NhZ2VzID0gWy4uLmhpc3RvcnksIHsgcm9sZTogXCJ1c2VyXCIsIGNvbnRlbnQ6IHVzZXJUZXh0IH1dO1xuICBjb25zdCB7IGd1aWRhbmNlLCBsYXN0VXNlclRleHQgfSA9IGVtb2ppR3VpZGFuY2VGb3IobWVzc2FnZXMpO1xuXG4gIGNvbnN0IHN0YXRlID0gYXdhaXQgYnVpbGRDb2duaXRpdmVTdGF0ZShsaW5rLnVzZXJfaWQsIHN1cGFiYXNlLCBwcm9maWxlPy5kaXNwbGF5X25hbWUgfHwgXCJcIiwgbW9kZSk7XG4gIGxldCBjb250ZXh0ID0gYnVpbGRDb250ZXh0QmxvY2soc3RhdGUpO1xuICBjb25zdCByZWNhbGxlZCA9IGF3YWl0IHJldHJpZXZlUmVsZXZhbnRNZW1vcmllcyhsaW5rLnVzZXJfaWQsIHN1cGFiYXNlLCBsYXN0VXNlclRleHQpO1xuICBpZiAocmVjYWxsZWQpIGNvbnRleHQgPSBgJHtjb250ZXh0fVxcblxcbiR7cmVjYWxsZWR9YDtcblxuICBjb25zdCBzeXN0ZW1Qcm9tcHQgPSBidWlsZFN5c3RlbVByb21wdCh7XG4gICAgdXNlck5hbWU6IHByb2ZpbGU/LmRpc3BsYXlfbmFtZSB8fCB1bmRlZmluZWQsXG4gICAgY29nbml0aXZlQ29udGV4dDogY29udGV4dCxcbiAgICBjb21wYW5pb25Nb2RlOiBtb2RlLFxuICAgIGVtb2ppR3VpZGFuY2U6IGd1aWRhbmNlLFxuICAgIGNhcGFiaWxpdHlOb3RlczogYnVpbGRDYXBhYmlsaXR5Tm90ZXMoXCJ0ZWxlZ3JhbVwiKSxcbiAgICBzdXJmYWNlTm90ZXM6IFNVUkZBQ0VfTk9URVMsXG4gIH0pO1xuXG4gIGNvbnN0IGNvbnRlbnRzID0gbWVzc2FnZXMubWFwKChtOiBhbnkpID0+ICh7XG4gICAgcm9sZTogbS5yb2xlID09PSBcImFzc2lzdGFudFwiID8gXCJtb2RlbFwiIDogXCJ1c2VyXCIsXG4gICAgcGFydHM6IFt7IHRleHQ6IG0uY29udGVudCB9XSxcbiAgfSkpO1xuXG4gIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGdlbmVyYXRlV2l0aEZhbGxiYWNrKHtcbiAgICBzeXN0ZW1JbnN0cnVjdGlvbjogeyBwYXJ0czogW3sgdGV4dDogc3lzdGVtUHJvbXB0IH1dIH0sXG4gICAgY29udGVudHMsXG4gICAgZ2VuZXJhdGlvbkNvbmZpZzogeyB0ZW1wZXJhdHVyZTogdGVtcGVyYXR1cmVGb3IobW9kZSkgfSxcbiAgfSwgc3VwYWJhc2UsIFwidGhpbmtcIik7XG4gIHJldHVybiByZXN1bHQ7XG59XG5cbmNvbnN0IEFVRElPX01JTUU6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7XG4gIG9nZzogXCJhdWRpby9vZ2dcIiwgb2dhOiBcImF1ZGlvL29nZ1wiLCBvcHVzOiBcImF1ZGlvL29nZ1wiLFxuICBtcDM6IFwiYXVkaW8vbXBlZ1wiLCBtNGE6IFwiYXVkaW8vbXA0XCIsIG1wNDogXCJhdWRpby9tcDRcIixcbiAgd2F2OiBcImF1ZGlvL3dhdlwiLCB3ZWJtOiBcImF1ZGlvL3dlYm1cIiwgZmxhYzogXCJhdWRpby9mbGFjXCIsXG59O1xuXG4vKipcbiAqIFNwZWVjaC10by10ZXh0LiBEaXN0aW5ndWlzaGVzIGEgdHJhbnNjcmlwdGlvbiB0aGF0IGNhbWUgYmFjayBnZW51aW5lbHkgZW1wdHlcbiAqIChzaWxlbmNlKSBmcm9tIG9uZSB0aGF0IGZhaWxlZCwgc28gdGhlIHJlcGx5IG5ldmVyIGJsYW1lcyB0aGUgc3BlYWtlciBmb3IgYVxuICogYmFja2VuZCBwcm9ibGVtLlxuICovXG5hc3luYyBmdW5jdGlvbiB0cmFuc2NyaWJlKFxuICBieXRlczogVWludDhBcnJheSxcbiAgZmlsZW5hbWU6IHN0cmluZyxcbiAgZGVjbGFyZWRNaW1lPzogc3RyaW5nLFxuKTogUHJvbWlzZTx7IHRleHQ6IHN0cmluZzsgZmFpbGVkOiBib29sZWFuOyByZWFzb24/OiBzdHJpbmcgfT4ge1xuICBjb25zdCBleHQgPSAoZmlsZW5hbWUuc3BsaXQoXCIuXCIpLnBvcCgpIHx8IFwib2dnXCIpLnRvTG93ZXJDYXNlKCk7XG4gIGNvbnN0IG1pbWUgPSBkZWNsYXJlZE1pbWUgfHwgQVVESU9fTUlNRVtleHRdIHx8IFwiYXVkaW8vb2dnXCI7XG4gIHRyeSB7XG4gICAgLy8gR2VtaW5pIGNhbiBwcm9jZXNzIGF1ZGlvIGlubGluZSBcdTIwMTQgdHJhbnNjcmliZSB2aWEgZ2VuZXJhdGVDb250ZW50IHdpdGhcbiAgICAvLyBhbiBhdWRpbyBjb250ZW50IHBhcnQuIE5vIGRlZGljYXRlZCBTVFQgZW5kcG9pbnQgbmVlZGVkLlxuICAgIGNvbnN0IGI2NCA9IGJ0b2EoU3RyaW5nLmZyb21DaGFyQ29kZSguLi5ieXRlcykpO1xuICAgIGNvbnN0IHJlcyA9IGF3YWl0IGdlbWluaUdlbmVyYXRlKE1PREVMUy5jaGF0LCB7XG4gICAgICBjb250ZW50czogW3tcbiAgICAgICAgcm9sZTogXCJ1c2VyXCIsXG4gICAgICAgIHBhcnRzOiBbXG4gICAgICAgICAgeyB0ZXh0OiBcIlRyYW5zY3JpYmUgdGhpcyBhdWRpbyBleGFjdGx5LiBPdXRwdXQgb25seSB0aGUgc3Bva2VuIHRleHQsIG5vIGNvbW1lbnRhcnksIG5vIHB1bmN0dWF0aW9uIHVubGVzcyBpdCB3YXMgY2xlYXJseSBzcG9rZW4uXCIgfSxcbiAgICAgICAgICB7IGlubGluZURhdGE6IHsgbWltZVR5cGU6IG1pbWUsIGRhdGE6IGI2NCB9IH0sXG4gICAgICAgIF0sXG4gICAgICB9XSxcbiAgICAgIGdlbmVyYXRpb25Db25maWc6IHsgdGVtcGVyYXR1cmU6IDAgfSxcbiAgICB9KTtcbiAgICBpZiAoIXJlcy5vaykge1xuICAgICAgY29uc3QgZGV0YWlsID0gKGF3YWl0IHJlcy50ZXh0KCkpLnNsaWNlKDAsIDQwMCk7XG4gICAgICBjb25zb2xlLmVycm9yKGBTVFQgZmFpbGVkIFske3Jlcy5zdGF0dXN9XSBtaW1lPSR7bWltZX0gZmlsZT0ke2ZpbGVuYW1lfSBieXRlcz0ke2J5dGVzLmxlbmd0aH06YCwgZGV0YWlsKTtcbiAgICAgIGNvbnN0IHJlYXNvbiA9IHJlcy5zdGF0dXMgPT09IDQyOVxuICAgICAgICA/IFwiSSdtIHJhdGUgbGltaXRlZCBvbiB0cmFuc2NyaXB0aW9uIHJpZ2h0IG5vdy5cIlxuICAgICAgICA6IHJlcy5zdGF0dXMgPT09IDQwMlxuICAgICAgICA/IFwiUmluJ3MgdXNhZ2UgY3JlZGl0cyByYW4gb3V0LCBzbyB0cmFuc2NyaXB0aW9uIGlzIG9mZi5cIlxuICAgICAgICA6IGBUcmFuc2NyaXB0aW9uIGZhaWxlZCBvbiBteSBzaWRlIChlcnJvciAke3Jlcy5zdGF0dXN9KS5gO1xuICAgICAgcmV0dXJuIHsgdGV4dDogXCJcIiwgZmFpbGVkOiB0cnVlLCByZWFzb24gfTtcbiAgICB9XG4gICAgY29uc3QgYm9keSA9IGF3YWl0IHJlcy5qc29uKCkuY2F0Y2goKCkgPT4gKHt9KSk7XG4gICAgY29uc3QgdGV4dCA9IGdlbWluaVRleHQoYm9keSkudHJpbSgpO1xuICAgIGlmICghdGV4dCkgY29uc29sZS53YXJuKGBTVFQgcmV0dXJuZWQgZW1wdHkgdGV4dDogbWltZT0ke21pbWV9IGJ5dGVzPSR7Ynl0ZXMubGVuZ3RofWApO1xuICAgIHJldHVybiB7IHRleHQsIGZhaWxlZDogZmFsc2UgfTtcbiAgfSBjYXRjaCAoZSkge1xuICAgIGNvbnNvbGUuZXJyb3IoXCJTVFQgY3Jhc2hlZDpcIiwgZSk7XG4gICAgcmV0dXJuIHsgdGV4dDogXCJcIiwgZmFpbGVkOiB0cnVlLCByZWFzb246IFwiVHJhbnNjcmlwdGlvbiBjcmFzaGVkIG9uIG15IHNpZGUuXCIgfTtcbiAgfVxufVxuXG5hc3luYyBmdW5jdGlvbiBzcGVhayh0ZXh0OiBzdHJpbmcpOiBQcm9taXNlPFVpbnQ4QXJyYXkgfCBudWxsPiB7XG4gIHRyeSB7XG4gICAgLy8gU2VsZi1ob3N0ZWQgUGlwZXIgVFRTIGJlaGluZCBhIENsb3VkZmxhcmUgcXVpY2sgdHVubmVsLiBUaGUgdHVubmVsIFVSTFxuICAgIC8vIHJvdGF0ZXMgb24gcmVzdGFydCwgc28gbG9vayB1cCB0aGUgY3VycmVudCBvbmUgZnJvbSB0dHNfZW5kcG9pbnQuXG4gICAgLy8gU3RhbGUgKD4xMCBtaW4pIG9yIHVucmVhY2hhYmxlIFx1MjE5MiBmYWxsIGJhY2sgdG8gcGxhaW4gdGV4dCAobmV2ZXIgaGFuZykuXG4gICAgY29uc3QgU1VQQUJBU0VfVVJMID0gRGVuby5lbnYuZ2V0KFwiU1VQQUJBU0VfVVJMXCIpITtcbiAgICBjb25zdCBTRVJWSUNFX1JPTEVfS0VZID0gRGVuby5lbnYuZ2V0KFwiU1VQQUJBU0VfU0VSVklDRV9ST0xFX0tFWVwiKSE7XG4gICAgY29uc3QgdHRzU2VjcmV0ID0gRGVuby5lbnYuZ2V0KFwiVFRTX1NIQVJFRF9TRUNSRVRcIikgPz8gXCJcIjtcblxuICAgIGNvbnN0IGVuZHBvaW50UmVzID0gYXdhaXQgZmV0Y2goXG4gICAgICBgJHtTVVBBQkFTRV9VUkx9L3Jlc3QvdjEvdHRzX2VuZHBvaW50P2lkPWVxLjEmc2VsZWN0PXVybCx1cGRhdGVkX2F0YCxcbiAgICAgIHsgaGVhZGVyczogeyBhcGlrZXk6IFNFUlZJQ0VfUk9MRV9LRVksIEF1dGhvcml6YXRpb246IGBCZWFyZXIgJHtTRVJWSUNFX1JPTEVfS0VZfWAgfSB9LFxuICAgICk7XG4gICAgaWYgKCFlbmRwb2ludFJlcy5vaykge1xuICAgICAgY29uc29sZS5lcnJvcihcIlRUUyBlbmRwb2ludCBsb29rdXAgZmFpbGVkOlwiLCBlbmRwb2ludFJlcy5zdGF0dXMpO1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuICAgIGNvbnN0IHJvd3MgPSBhd2FpdCBlbmRwb2ludFJlcy5qc29uKCk7XG4gICAgY29uc3QgdXJsID0gcm93cz8uWzBdPy51cmw7XG4gICAgY29uc3QgdXBkYXRlZEF0ID0gcm93cz8uWzBdPy51cGRhdGVkX2F0ID8gbmV3IERhdGUocm93c1swXS51cGRhdGVkX2F0KS5nZXRUaW1lKCkgOiAwO1xuICAgIGNvbnN0IFNUQUxFX01TID0gMTAgKiA2MCAqIDEwMDA7XG4gICAgaWYgKCF1cmwgfHwgRGF0ZS5ub3coKSAtIHVwZGF0ZWRBdCA+IFNUQUxFX01TKSB7XG4gICAgICBjb25zb2xlLmVycm9yKFwiVFRTIGVuZHBvaW50IHN0YWxlIG9yIG1pc3Npbmc6XCIsIHVybCA/IFwic3RhbGVcIiA6IFwibWlzc2luZ1wiKTtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cblxuICAgIGNvbnN0IHJlcyA9IGF3YWl0IGZldGNoKHVybCwge1xuICAgICAgbWV0aG9kOiBcIlBPU1RcIixcbiAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgXCJ4LXR0cy1zZWNyZXRcIjogdHRzU2VjcmV0LFxuICAgICAgICBcIkNvbnRlbnQtVHlwZVwiOiBcImFwcGxpY2F0aW9uL2pzb25cIixcbiAgICAgIH0sXG4gICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IHRleHQ6IHRleHQuc2xpY2UoMCwgMTgwMCkgfSksXG4gICAgICBzaWduYWw6IEFib3J0U2lnbmFsLnRpbWVvdXQoODAwMCksIC8vIDhzIGhhcmQgY2FwIFx1MjAxNCBuZXZlciBoYW5nIHRoZSB3ZWJob29rXG4gICAgfSk7XG4gICAgaWYgKCFyZXMub2spIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoXCJUVFMgZmFpbGVkOlwiLCByZXMuc3RhdHVzLCAoYXdhaXQgcmVzLnRleHQoKSkuc2xpY2UoMCwgMzAwKSk7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG4gICAgY29uc3QgYXVkaW8gPSBuZXcgVWludDhBcnJheShhd2FpdCByZXMuYXJyYXlCdWZmZXIoKSk7XG4gICAgaWYgKGF1ZGlvLmxlbmd0aCA9PT0gMCkgcmV0dXJuIG51bGw7XG4gICAgcmV0dXJuIGF1ZGlvO1xuICB9IGNhdGNoIChlKSB7XG4gICAgY29uc29sZS5lcnJvcihcIlRUUyBjcmFzaGVkOlwiLCBlKTtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxufVxuXG5hc3luYyBmdW5jdGlvbiBkZXNjcmliZUltYWdlKGJ5dGVzOiBVaW50OEFycmF5LCBtaW1lOiBzdHJpbmcsIGNhcHRpb246IHN0cmluZyk6IFByb21pc2U8c3RyaW5nPiB7XG4gIGNvbnN0IGI2NCA9IGJ0b2EoU3RyaW5nLmZyb21DaGFyQ29kZSguLi5ieXRlcykpO1xuICBjb25zdCByZXMgPSBhd2FpdCBnZW1pbmlHZW5lcmF0ZShNT0RFTFMudmlzaW9uLCB7XG4gICAgY29udGVudHM6IFt7XG4gICAgICByb2xlOiBcInVzZXJcIixcbiAgICAgIHBhcnRzOiBbXG4gICAgICAgIHsgdGV4dDogY2FwdGlvblxuICAgICAgICAgID8gYCR7Y2FwdGlvbn1cXG5cXG4oQW5zd2VyIGNvbnZlcnNhdGlvbmFsbHksIHBsYWluIHRleHQsIG5vIG1hcmtkb3duIGhlYWRlcnMuKWBcbiAgICAgICAgICA6IFwiVGVsbCBtZSB3aGF0J3MgaW4gdGhpcyBpbWFnZSwgY29udmVyc2F0aW9uYWxseSBhbmQgYnJpZWZseS4gSWYgaXQncyBtb3N0bHkgdGV4dCwgcmVhZCB0aGUgdGV4dCBvdXQgZm9yIG1lIGluc3RlYWQuXCIgfSxcbiAgICAgICAgeyBpbmxpbmVEYXRhOiB7IG1pbWVUeXBlOiBtaW1lLCBkYXRhOiBiNjQgfSB9LFxuICAgICAgXSxcbiAgICB9XSxcbiAgfSk7XG4gIGlmICghcmVzLm9rKSB7XG4gICAgY29uc29sZS5lcnJvcihcIlZpc2lvbiBmYWlsZWQ6XCIsIHJlcy5zdGF0dXMsIChhd2FpdCByZXMudGV4dCgpKS5zbGljZSgwLCAzMDApKTtcbiAgICByZXR1cm4gXCJJIGNvdWxkbid0IG9wZW4gdGhhdCBpbWFnZSBcdTIwMTQgdHJ5IHNlbmRpbmcgaXQgYWdhaW4/XCI7XG4gIH1cbiAgY29uc3QgYm9keSA9IGF3YWl0IHJlcy5qc29uKCk7XG4gIHJldHVybiBnZW1pbmlUZXh0KGJvZHkpIHx8IFwiSSBjb3VsZG4ndCBtYWtlIGFueXRoaW5nIG91dCBpbiB0aGF0IG9uZS5cIjtcbn1cblxuLyogLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0gY29tbWFuZHMgKi9cblxuLyogLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tIG1haW4gKi9cblxuRGVuby5zZXJ2ZShhc3luYyAocmVxKSA9PiB7XG4gIGlmIChyZXEubWV0aG9kICE9PSBcIlBPU1RcIikgcmV0dXJuIG5ldyBSZXNwb25zZShcIk1ldGhvZCBub3QgYWxsb3dlZFwiLCB7IHN0YXR1czogNDA1IH0pO1xuXG4gIGxldCB0b2tlbjogc3RyaW5nO1xuICB0cnkge1xuICAgIHRva2VuID0gYm90VG9rZW4oKTtcbiAgfSBjYXRjaCB7XG4gICAgcmV0dXJuIG5ldyBSZXNwb25zZShcIk5vdCBjb25maWd1cmVkXCIsIHsgc3RhdHVzOiA1MDMgfSk7XG4gIH1cblxuICBjb25zdCBleHBlY3RlZCA9IGF3YWl0IHdlYmhvb2tTZWNyZXQodG9rZW4pO1xuICBpZiAoIXNhZmVFcXVhbChyZXEuaGVhZGVycy5nZXQoXCJYLVRlbGVncmFtLUJvdC1BcGktU2VjcmV0LVRva2VuXCIpLCBleHBlY3RlZCkpIHtcbiAgICByZXR1cm4gbmV3IFJlc3BvbnNlKFwiVW5hdXRob3JpemVkXCIsIHsgc3RhdHVzOiA0MDEgfSk7XG4gIH1cblxuICBjb25zdCB1cGRhdGUgPSBhd2FpdCByZXEuanNvbigpLmNhdGNoKCgpID0+IG51bGwpO1xuICBpZiAoIXVwZGF0ZSB8fCB0eXBlb2YgdXBkYXRlLnVwZGF0ZV9pZCAhPT0gXCJudW1iZXJcIikgcmV0dXJuIG5ldyBSZXNwb25zZShKU09OLnN0cmluZ2lmeSh7IG9rOiB0cnVlIH0pKTtcblxuICBjb25zdCBzdXBhYmFzZSA9IGFkbWluKCk7XG5cbiAgLy8gVGVsZWdyYW0gcmV0cmllcyBkZWxpdmVyaWVzIFx1MjAxNCBhbnN3ZXIgZWFjaCB1cGRhdGUgZXhhY3RseSBvbmNlLlxuICBjb25zdCB7IGVycm9yOiBkdXBlRXJyb3IgfSA9IGF3YWl0IHN1cGFiYXNlLmZyb20oXCJ0ZWxlZ3JhbV91cGRhdGVzXCIpLmluc2VydCh7IHVwZGF0ZV9pZDogdXBkYXRlLnVwZGF0ZV9pZCB9KTtcbiAgaWYgKGR1cGVFcnJvcikgcmV0dXJuIG5ldyBSZXNwb25zZShKU09OLnN0cmluZ2lmeSh7IG9rOiB0cnVlLCBkdXBsaWNhdGU6IHRydWUgfSkpO1xuXG4gIGNvbnN0IG1lc3NhZ2UgPSB1cGRhdGUubWVzc2FnZSA/PyB1cGRhdGUuZWRpdGVkX21lc3NhZ2U7XG4gIGNvbnN0IGNoYXRJZDogbnVtYmVyIHwgdW5kZWZpbmVkID0gbWVzc2FnZT8uY2hhdD8uaWQ7XG4gIGlmICghY2hhdElkKSByZXR1cm4gbmV3IFJlc3BvbnNlKEpTT04uc3RyaW5naWZ5KHsgb2s6IHRydWUgfSkpO1xuXG4gIHRyeSB7XG4gICAgY29uc3QgZGlzcGxheU5hbWUgPSBbbWVzc2FnZS5mcm9tPy5maXJzdF9uYW1lLCBtZXNzYWdlLmZyb20/Lmxhc3RfbmFtZV0uZmlsdGVyKEJvb2xlYW4pLmpvaW4oXCIgXCIpXG4gICAgICB8fCBtZXNzYWdlLmZyb20/LnVzZXJuYW1lIHx8IFwiVGVsZWdyYW0gdXNlclwiO1xuICAgIGxldCB0ZXh0OiBzdHJpbmcgPSAobWVzc2FnZS50ZXh0IHx8IFwiXCIpLnRyaW0oKTtcblxuICAgIC8vIFRlbGVncmFtJ3Mgb3duIFVJIHNlbmRzIFwiL3N0YXJ0XCIsIHNvbWV0aW1lcyB3aXRoIGEgcGF5bG9hZC4gTm90aGluZyBlbHNlXG4gICAgLy8gaW4gUmluIGlzIGEgY29tbWFuZCBcdTIwMTQgaWYgc29tZW9uZSB0eXBlcyBvbmUgb3V0IG9mIGhhYml0IHdlIGp1c3QgcmVhZFxuICAgIC8vIGl0IGFzIG9yZGluYXJ5IHdvcmRzLlxuICAgIGxldCBzdGFydFBheWxvYWQgPSBcIlwiO1xuICAgIGlmICgvXlxcL3N0YXJ0XFxiL2kudGVzdCh0ZXh0KSkge1xuICAgICAgc3RhcnRQYXlsb2FkID0gdGV4dC5yZXBsYWNlKC9eXFwvc3RhcnRcXGIvaSwgXCJcIikudHJpbSgpO1xuICAgICAgdGV4dCA9IFwiXCI7XG4gICAgfSBlbHNlIGlmICh0ZXh0LnN0YXJ0c1dpdGgoXCIvXCIpKSB7XG4gICAgICB0ZXh0ID0gdGV4dC5zbGljZSgxKS5yZXBsYWNlKC9eKFxcdyspQFxcdysvLCBcIiQxXCIpLnRyaW0oKTtcbiAgICB9XG5cbiAgICAvLyAvaGVscCBpcyB0aGUgb25lIGNvbW1hbmQgd29ydGggaGFuZGxpbmcgZGlyZWN0bHkgXHUyMDE0IHVzZXJzIGV4cGVjdCB0aGVcbiAgICAvLyBzdHJ1Y3R1cmVkIGhlbHAgdGV4dCwgbm90IGEgR2VtaW5pIGFkLWxpYiBhYm91dCB3aGF0IFJpbiBjYW4gZG8uXG4gICAgaWYgKHRleHQgPT09IFwiaGVscFwiKSB7XG4gICAgICBjb25zb2xlLmxvZyhgW3dlYmhvb2tdIC9oZWxwIGJ5cGFzczogc2VuZGluZyBIRUxQIHRvIGNoYXQgJHtjaGF0SWR9YCk7XG4gICAgICBhd2FpdCBzZW5kTWVzc2FnZShjaGF0SWQsIEhFTFApO1xuICAgICAgcmV0dXJuIG5ldyBSZXNwb25zZShKU09OLnN0cmluZ2lmeSh7IG9rOiB0cnVlIH0pKTtcbiAgICB9XG5cbiAgICBsZXQgbGluayA9IGF3YWl0IGZpbmRMaW5rKHN1cGFiYXNlLCBjaGF0SWQpO1xuXG4gICAgLyogLS0tLSBmaXJzdCBjb250YWN0OiBwcm92aXNpb24gYW4gYWNjb3VudCBhbmQgc2F5IGhlbGxvIC0tLS0gKi9cbiAgICBpZiAoIWxpbmspIHtcbiAgICAgIC8vIEEgc3RhcnQgcGF5bG9hZCBtYXkgYmUgYSBsaW5rIGNvZGUgZnJvbSB0aGUgd2ViIGFwcC5cbiAgICAgIGlmIChzdGFydFBheWxvYWQpIHtcbiAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgY29uc3VtZUNvZGUoc3VwYWJhc2UsIHN0YXJ0UGF5bG9hZCwgY2hhdElkLCBkaXNwbGF5TmFtZSk7XG4gICAgICAgIGlmICghKFwiZXJyb3JcIiBpbiByZXN1bHQpKSB7XG4gICAgICAgICAgbGluayA9IGF3YWl0IGZpbmRMaW5rKHN1cGFiYXNlLCBjaGF0SWQpO1xuICAgICAgICAgIGF3YWl0IHNlbmRNZXNzYWdlKGNoYXRJZCwgYFdlJ3JlIGNvbm5lY3RlZCBcdTIwMTQgZXZlcnl0aGluZyB5b3UndmUgdG9sZCBtZSBpbiBSaW4sIEkgaGF2ZSBoZXJlIHRvby5cXG5cXG5Tby4gV2hhdCdzIGdvaW5nIG9uP2ApO1xuICAgICAgICAgIHJldHVybiBuZXcgUmVzcG9uc2UoSlNPTi5zdHJpbmdpZnkoeyBvazogdHJ1ZSB9KSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGxpbmsgPSBhd2FpdCBwcm92aXNpb25BY2NvdW50KHN1cGFiYXNlLCBjaGF0SWQsIGRpc3BsYXlOYW1lLCBtZXNzYWdlLmZyb20/LnVzZXJuYW1lKTtcbiAgICAgIGlmICghbGluaykge1xuICAgICAgICBhd2FpdCBzZW5kTWVzc2FnZShjaGF0SWQsIFwiSSBjb3VsZG4ndCBnZXQgc2V0IHVwIGp1c3Qgbm93LiBUcnkgbWVzc2FnaW5nIG1lIGFnYWluIGluIGEgbW9tZW50LlwiKTtcbiAgICAgICAgcmV0dXJuIG5ldyBSZXNwb25zZShKU09OLnN0cmluZ2lmeSh7IG9rOiB0cnVlIH0pKTtcbiAgICAgIH1cbiAgICAgIGF3YWl0IHNlbmRNZXNzYWdlKGNoYXRJZCwgR1JFRVRJTkcoZGlzcGxheU5hbWUuc3BsaXQoXCIgXCIpWzBdKSk7XG4gICAgICBpZiAoIXRleHQgJiYgIW1lc3NhZ2Uudm9pY2UgJiYgIW1lc3NhZ2UuYXVkaW8gJiYgIW1lc3NhZ2UucGhvdG8pIHtcbiAgICAgICAgcmV0dXJuIG5ldyBSZXNwb25zZShKU09OLnN0cmluZ2lmeSh7IG9rOiB0cnVlIH0pKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvKiAtLS0tIHJlc3BlY3QgdGhlIG1hc3RlciBzd2l0Y2ggLS0tLSAqL1xuICAgIGNvbnN0IHsgZGF0YTogc2V0dGluZ3MgfSA9IGF3YWl0IHN1cGFiYXNlXG4gICAgICAuZnJvbShcInVzZXJfc2V0dGluZ3NcIikuc2VsZWN0KFwidGVsZWdyYW1fZW5hYmxlZFwiKS5lcShcInVzZXJfaWRcIiwgbGluay51c2VyX2lkKS5tYXliZVNpbmdsZSgpO1xuICAgIGlmIChzZXR0aW5ncz8udGVsZWdyYW1fZW5hYmxlZCA9PT0gZmFsc2UpIHtcbiAgICAgIGF3YWl0IHNlbmRNZXNzYWdlKGNoYXRJZCwgXCJUZWxlZ3JhbSBpcyBzd2l0Y2hlZCBvZmYgZm9yIHlvdXIgYWNjb3VudC4gVHVybiBpdCBiYWNrIG9uIGluIFJpbiB1bmRlciBTZXR0aW5ncyBcdTIxOTIgQ29ubmVjdGVkIEFjY291bnRzIGFuZCBJJ2xsIGJlIHJpZ2h0IGhlcmUuXCIpO1xuICAgICAgcmV0dXJuIG5ldyBSZXNwb25zZShKU09OLnN0cmluZ2lmeSh7IG9rOiB0cnVlIH0pKTtcbiAgICB9XG5cbiAgICBhd2FpdCBzdXBhYmFzZS5mcm9tKFwiYm90X2NoYW5uZWxfbGlua3NcIilcbiAgICAgIC51cGRhdGUoeyBsYXN0X21lc3NhZ2VfYXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSwgZGlzcGxheV9uYW1lOiBkaXNwbGF5TmFtZSB9KVxuICAgICAgLmVxKFwiaWRcIiwgbGluay5pZCk7XG5cbiAgICBhd2FpdCBzZW5kQ2hhdEFjdGlvbihjaGF0SWQsIFwidHlwaW5nXCIpO1xuXG4gICAgY29uc3QgY29udmVyc2F0aW9uSWQgPSBhd2FpdCBlbnN1cmVDb252ZXJzYXRpb24oc3VwYWJhc2UsIGxpbmspO1xuICAgIGlmICghY29udmVyc2F0aW9uSWQpIHtcbiAgICAgIGF3YWl0IHNlbmRNZXNzYWdlKGNoYXRJZCwgXCJJIGNvdWxkbid0IG9wZW4gb3VyIHRocmVhZCBqdXN0IG5vdy4gVHJ5IGFnYWluIGluIGEgbW9tZW50LlwiKTtcbiAgICAgIHJldHVybiBuZXcgUmVzcG9uc2UoSlNPTi5zdHJpbmdpZnkoeyBvazogdHJ1ZSB9KSk7XG4gICAgfVxuXG4gICAgbGV0IHVzZXJUZXh0ID0gdGV4dDtcbiAgICBsZXQgY2FtZUZyb21Wb2ljZSA9IGZhbHNlO1xuXG4gICAgLyogLS0tLSB2b2ljZSBub3RlcyAtLS0tICovXG4gICAgY29uc3Qgdm9pY2UgPSBtZXNzYWdlLnZvaWNlID8/IG1lc3NhZ2UuYXVkaW87XG4gICAgaWYgKHZvaWNlPy5maWxlX2lkKSB7XG4gICAgICBjb25zdCBmaWxlID0gYXdhaXQgZG93bmxvYWRGaWxlKHZvaWNlLmZpbGVfaWQpO1xuICAgICAgaWYgKCFmaWxlKSB7XG4gICAgICAgIGF3YWl0IHNlbmRNZXNzYWdlKGNoYXRJZCwgXCJUaGF0IHZvaWNlIG5vdGUgZGlkbid0IGNvbWUgdGhyb3VnaCBvbiBteSBzaWRlLiBTZW5kIGl0IGFnYWluP1wiKTtcbiAgICAgICAgcmV0dXJuIG5ldyBSZXNwb25zZShKU09OLnN0cmluZ2lmeSh7IG9rOiB0cnVlIH0pKTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IGhlYXJkID0gYXdhaXQgdHJhbnNjcmliZShcbiAgICAgICAgZmlsZS5ieXRlcyxcbiAgICAgICAgZmlsZS5wYXRoLnNwbGl0KFwiL1wiKS5wb3AoKSB8fCBcInZvaWNlLm9nZ1wiLFxuICAgICAgICB2b2ljZS5taW1lX3R5cGUsXG4gICAgICApO1xuICAgICAgY2FtZUZyb21Wb2ljZSA9IHRydWU7XG4gICAgICBpZiAoaGVhcmQuZmFpbGVkKSB7XG4gICAgICAgIC8vIEEgYmFja2VuZCBmYWlsdXJlIGlzIG1pbmUsIG5vdCB0aGVpcnMgXHUyMDE0IG5ldmVyIGJsYW1lIHRoZSBzcGVha2VyLlxuICAgICAgICBhd2FpdCBzZW5kTWVzc2FnZShjaGF0SWQsIGAke2hlYXJkLnJlYXNvbn0gVGhhdCdzIG9uIG15IGVuZCwgbm90IHlvdXIgcmVjb3JkaW5nIFx1MjAxNCB0cnkgYWdhaW4gaW4gYSBtb21lbnQsIG9yIHNlbmQgaXQgYXMgdGV4dC5gKTtcbiAgICAgICAgcmV0dXJuIG5ldyBSZXNwb25zZShKU09OLnN0cmluZ2lmeSh7IG9rOiB0cnVlIH0pKTtcbiAgICAgIH1cbiAgICAgIGlmICghaGVhcmQudGV4dCkge1xuICAgICAgICBhd2FpdCBzZW5kTWVzc2FnZShjaGF0SWQsIFwiVGhhdCBvbmUgY2FtZSB0aHJvdWdoIHNpbGVudCBcdTIwMTQgSSBnb3QgdGhlIGF1ZGlvIGJ1dCBubyB3b3JkcyBpbiBpdC4gV2FudCB0byB0cnkgYWdhaW4/XCIpO1xuICAgICAgICByZXR1cm4gbmV3IFJlc3BvbnNlKEpTT04uc3RyaW5naWZ5KHsgb2s6IHRydWUgfSkpO1xuICAgICAgfVxuICAgICAgdXNlclRleHQgPSBoZWFyZC50ZXh0O1xuICAgIH1cblxuICAgIC8qIC0tLS0gcGhvdG9zIGFuZCBpbWFnZSBkb2N1bWVudHMgLS0tLSAqL1xuICAgIGNvbnN0IHBob3RvID0gQXJyYXkuaXNBcnJheShtZXNzYWdlLnBob3RvKSA/IG1lc3NhZ2UucGhvdG9bbWVzc2FnZS5waG90by5sZW5ndGggLSAxXSA6IG51bGw7XG4gICAgY29uc3QgaW1hZ2VEb2MgPSBtZXNzYWdlLmRvY3VtZW50Py5taW1lX3R5cGU/LnN0YXJ0c1dpdGgoXCJpbWFnZS9cIikgPyBtZXNzYWdlLmRvY3VtZW50IDogbnVsbDtcbiAgICBpZiAocGhvdG8gfHwgaW1hZ2VEb2MpIHtcbiAgICAgIGNvbnN0IGZpbGVJZCA9IHBob3RvPy5maWxlX2lkID8/IGltYWdlRG9jLmZpbGVfaWQ7XG4gICAgICBjb25zdCBmaWxlID0gYXdhaXQgZG93bmxvYWRGaWxlKGZpbGVJZCk7XG4gICAgICBpZiAoIWZpbGUpIHtcbiAgICAgICAgYXdhaXQgc2VuZE1lc3NhZ2UoY2hhdElkLCBcIlRoYXQgaW1hZ2UgZGlkbid0IGNvbWUgdGhyb3VnaC4gVHJ5IGFnYWluP1wiKTtcbiAgICAgICAgcmV0dXJuIG5ldyBSZXNwb25zZShKU09OLnN0cmluZ2lmeSh7IG9rOiB0cnVlIH0pKTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IGNhcHRpb24gPSAobWVzc2FnZS5jYXB0aW9uIHx8IFwiXCIpLnRyaW0oKTtcbiAgICAgIGNvbnN0IGFuc3dlciA9IGF3YWl0IGRlc2NyaWJlSW1hZ2UoZmlsZS5ieXRlcywgaW1hZ2VEb2M/Lm1pbWVfdHlwZSB8fCBcImltYWdlL2pwZWdcIiwgY2FwdGlvbik7XG4gICAgICBhd2FpdCBzYXZlTWVzc2FnZShzdXBhYmFzZSwgbGluaywgY29udmVyc2F0aW9uSWQsIFwidXNlclwiLCBjYXB0aW9uID8gYFtwaG90b10gJHtjYXB0aW9ufWAgOiBcIltwaG90b11cIik7XG4gICAgICBhd2FpdCBzYXZlTWVzc2FnZShzdXBhYmFzZSwgbGluaywgY29udmVyc2F0aW9uSWQsIFwiYXNzaXN0YW50XCIsIGFuc3dlcik7XG4gICAgICBhd2FpdCBzZW5kTWVzc2FnZShjaGF0SWQsIGFuc3dlcik7XG4gICAgICByZXR1cm4gbmV3IFJlc3BvbnNlKEpTT04uc3RyaW5naWZ5KHsgb2s6IHRydWUgfSkpO1xuICAgIH1cblxuICAgIGlmICghdXNlclRleHQpIHtcbiAgICAgIGF3YWl0IHNlbmRNZXNzYWdlKGNoYXRJZCwgXCJJIGNhbiByZWFkIHRleHQsIGxpc3RlbiB0byB2b2ljZSBub3RlcyBhbmQgbG9vayBhdCBwaG90b3MgaGVyZS5cIik7XG4gICAgICByZXR1cm4gbmV3IFJlc3BvbnNlKEpTT04uc3RyaW5naWZ5KHsgb2s6IHRydWUgfSkpO1xuICAgIH1cblxuICAgIC8qIC0tLS0gbmF0dXJhbC1sYW5ndWFnZSBhY3Rpb25zICsgcGFzc2l2ZSBtZW1vcnksIGluIHBhcmFsbGVsIC0tLS0gKi9cbiAgICBsZXQgZGV0ZWN0ZWQ6IEFueSA9IHsgYWN0aW9uOiBcIm5vbmVcIiB9O1xuICAgIGxldCBleHRyYWN0aW9uOiBBbnkgPSB7IHN0b3JlZDogW10sIHVuY2VydGFpbjogW10gfTtcbiAgICB0cnkge1xuICAgICAgW2RldGVjdGVkLCBleHRyYWN0aW9uXSA9IGF3YWl0IFByb21pc2UuYWxsKFtcbiAgICAgICAgZGV0ZWN0QWN0aW9uKHVzZXJUZXh0KSxcbiAgICAgICAgZXh0cmFjdEFuZFN0b3JlKHN1cGFiYXNlLCBsaW5rLnVzZXJfaWQsIHVzZXJUZXh0LCBcIlwiLCBjb252ZXJzYXRpb25JZCksXG4gICAgICBdKTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBhd2FpdCBsb2dFcnJvcihzdXBhYmFzZSwgXCJ0ZWxlZ3JhbS13ZWJob29rXCIsIFwicHJvbWlzZS1hbGxcIiwgZSwge1xuICAgICAgICBjaGF0X2lkOiBjaGF0SWQsIHVzZXJfdGV4dDogdXNlclRleHQuc2xpY2UoMCwgMjAwKSwgdXBkYXRlX2lkOiB1cGRhdGUudXBkYXRlX2lkLFxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgY29uc3Qgbm90ZXM6IHN0cmluZ1tdID0gW107XG5cbiAgICBpZiAoZGV0ZWN0ZWQuYWN0aW9uICE9PSBcIm5vbmVcIikge1xuICAgICAgY29uc3Qgb3V0Y29tZSA9IGF3YWl0IHJ1bkFjdGlvbihzdXBhYmFzZSwgbGluaywgZGV0ZWN0ZWQsIHtcbiAgICAgICAgY29uc3VtZUNvZGU6IGFzeW5jIChjb2RlOiBzdHJpbmcpID0+IGF3YWl0IGNvbnN1bWVDb2RlKHN1cGFiYXNlLCBjb2RlLCBjaGF0SWQsIGRpc3BsYXlOYW1lLCBsaW5rKSxcbiAgICAgIH0pO1xuICAgICAgaWYgKG91dGNvbWUpIG5vdGVzLnB1c2gob3V0Y29tZS5ub3RlKTtcbiAgICB9XG5cbiAgICBpZiAoZXh0cmFjdGlvbi5zdG9yZWQubGVuZ3RoKSB7XG4gICAgICBub3Rlcy5wdXNoKFxuICAgICAgICBgTUVNT1JZOiB0aGVzZSB3ZXJlIGp1c3QgZmlsZWQgYXV0b21hdGljYWxseSBmcm9tIHdoYXQgdGhleSBzYWlkIFx1MjAxNCAke2V4dHJhY3Rpb24uc3RvcmVkLmpvaW4oXCI7IFwiKX0uIGAgK1xuICAgICAgICBgRG9uJ3QgYW5ub3VuY2UgdGhlIHNhdmluZy4gT25seSBtZW50aW9uIGl0IGlmIHRoZXkgYXNrIHdoZXRoZXIgeW91IGNhdWdodCBpdC5gLFxuICAgICAgKTtcbiAgICB9XG4gICAgaWYgKGV4dHJhY3Rpb24udW5jZXJ0YWluLmxlbmd0aCkge1xuICAgICAgbm90ZXMucHVzaChcbiAgICAgICAgYFBPU1NJQkxFLCBOT1QgU1RPUkVEOiBcIiR7ZXh0cmFjdGlvbi51bmNlcnRhaW5bMF19XCIuIFRoZXkgZGlkbid0IGFjdHVhbGx5IHNheSB0aGlzIFx1MjAxNCBpdCdzIHlvdXIgcmVhZGluZy4gYCArXG4gICAgICAgIGBJZiBpdCBmaXRzIHRoZSBmbG93LCBjaGVjayBpdCB3aXRoIHRoZW0gaW4gb25lIGxpZ2h0IHF1ZXN0aW9uIG5lYXIgdGhlIGVuZCBvZiB5b3VyIHJlcGx5IChlLmcuIFwiaXMgcmljZSB5b3VyIGZhdm91cml0ZSwgb3IgZGlkIEkganVzdCBjYXRjaCB5b3Ugb24gYSByaWNlIHdlZWs/XCIpLiBgICtcbiAgICAgICAgYElmIHRoZXkgY29uZmlybSBpdCBuZXh0IHR1cm4sIGl0IGdldHMgc3RvcmVkIHRoZW4uIE5ldmVyIHN0YXRlIGl0IGFzIHNvbWV0aGluZyB5b3Uga25vdy5gLFxuICAgICAgKTtcbiAgICB9XG5cbiAgICBjb25zdCBoaXN0b3J5ID0gYXdhaXQgbG9hZEhpc3Rvcnkoc3VwYWJhc2UsIGNvbnZlcnNhdGlvbklkKTtcbiAgICBsZXQgYW5zd2VyOiBzdHJpbmc7XG4gICAgdHJ5IHtcbiAgICAgIGFuc3dlciA9IGF3YWl0IHRoaW5rKHN1cGFiYXNlLCBsaW5rLCBoaXN0b3J5LCB1c2VyVGV4dCwgbm90ZXMuam9pbihcIlxcblxcblwiKSk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgYXdhaXQgbG9nRXJyb3Ioc3VwYWJhc2UsIFwidGVsZWdyYW0td2ViaG9va1wiLCBcInRoaW5rXCIsIGUsIHtcbiAgICAgICAgY2hhdF9pZDogY2hhdElkLCB1c2VyX3RleHQ6IHVzZXJUZXh0LnNsaWNlKDAsIDIwMCksIHVwZGF0ZV9pZDogdXBkYXRlLnVwZGF0ZV9pZCxcbiAgICAgICAgaGlzdG9yeV9sZW46IGhpc3RvcnkubGVuZ3RoLFxuICAgICAgfSk7XG4gICAgICBhbnN3ZXIgPSBcIlNvbWV0aGluZyB3ZW50IHdyb25nIG9uIG15IGVuZC4gVHJ5IG1lIGFnYWluIGluIGEgbW9tZW50LlwiO1xuICAgIH1cblxuICAgIHRyeSB7XG4gICAgICBhd2FpdCBzYXZlTWVzc2FnZShzdXBhYmFzZSwgbGluaywgY29udmVyc2F0aW9uSWQsIFwidXNlclwiLCB1c2VyVGV4dCk7XG4gICAgICBhd2FpdCBzYXZlTWVzc2FnZShzdXBhYmFzZSwgbGluaywgY29udmVyc2F0aW9uSWQsIFwiYXNzaXN0YW50XCIsIGFuc3dlcik7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgYXdhaXQgbG9nRXJyb3Ioc3VwYWJhc2UsIFwidGVsZWdyYW0td2ViaG9va1wiLCBcInNhdmUtbWVzc2FnZVwiLCBlLCB7XG4gICAgICAgIGNoYXRfaWQ6IGNoYXRJZCwgY29udmVyc2F0aW9uX2lkOiBjb252ZXJzYXRpb25JZCxcbiAgICAgICAgdXNlcl9pZDogbGluay51c2VyX2lkLCB1cGRhdGVfaWQ6IHVwZGF0ZS51cGRhdGVfaWQsXG4gICAgICB9KTtcbiAgICB9XG5cbiAgICBhd2FpdCBzZW5kTWVzc2FnZShjaGF0SWQsIGFuc3dlcik7XG5cbiAgICBjb25zdCB2b2ljZU1vZGUgPSBsaW5rLm1ldGFkYXRhPy52b2ljZV9tb2RlID8/IChsaW5rLm1ldGFkYXRhPy52b2ljZV9yZXBsaWVzID09PSBmYWxzZSA/IFwib2ZmXCIgOiBcIm9uXCIpO1xuICAgIGlmICh2b2ljZU1vZGUgIT09IFwib2ZmXCIgJiYgKGNhbWVGcm9tVm9pY2UgfHwgdm9pY2VNb2RlID09PSBcImFsd2F5c1wiKSkge1xuICAgICAgY29uc3QgYXVkaW8gPSBhd2FpdCBzcGVhayhhbnN3ZXIpO1xuICAgICAgaWYgKGF1ZGlvKSB7XG4gICAgICAgIGF3YWl0IHNlbmRWb2ljZVJlcGx5KGNoYXRJZCwgYXVkaW8sIFwiYXVkaW8vd2F2XCIpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gVm9pY2UgdW5yZWFjaGFibGUgKHR1bm5lbCBkb3duLCBzdGFsZSBVUkwsIHRpbWVvdXQpIFx1MjAxNCBuZXZlciBmYWlsXG4gICAgICAgIC8vIHNpbGVudGx5IG9yIGhhbmc6IHNlbmQgdGhlIHJlcGx5IGFzIHRleHQgd2l0aCBhIHNob3J0IG5vdGUuXG4gICAgICAgIGF3YWl0IHNlbmRNZXNzYWdlKFxuICAgICAgICAgIGNoYXRJZCxcbiAgICAgICAgICBgJHthbnN3ZXJ9XFxuXFxuKFZvaWNlIGlzbid0IHJlYWNoYWJsZSByaWdodCBub3cgXHUyMDE0IGhlcmUncyB0aGlzIGFzIHRleHQuKWAsXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gRmlsZSB3aGF0IFJpbiBzYWlkIHRvbywgb25jZSB0aGUgdHVybiBpcyBvdmVyIFx1MjAxNCBjaGVhcCwgb2ZmIHRoZSBwYXRoLlxuICAgIGNvbnN0IGJnID0gZXh0cmFjdEFuZFN0b3JlKHN1cGFiYXNlLCBsaW5rLnVzZXJfaWQsIHVzZXJUZXh0LCBhbnN3ZXIsIGNvbnZlcnNhdGlvbklkKVxuICAgICAgLmNhdGNoKChlKSA9PiBjb25zb2xlLmVycm9yKFwicG9zdC10dXJuIGV4dHJhY3Rpb24gZmFpbGVkOlwiLCBlKSk7XG4gICAgLy8gZGVuby1saW50LWlnbm9yZSBuby1leHBsaWNpdC1hbnlcbiAgICAoZ2xvYmFsVGhpcyBhcyBhbnkpLkVkZ2VSdW50aW1lPy53YWl0VW50aWw/LihiZyk7XG5cbiAgICByZXR1cm4gbmV3IFJlc3BvbnNlKEpTT04uc3RyaW5naWZ5KHsgb2s6IHRydWUgfSkpO1xuICB9IGNhdGNoIChlKSB7XG4gICAgY29uc29sZS5lcnJvcihcInRlbGVncmFtLXdlYmhvb2sgZXJyb3I6XCIsIGUpO1xuICAgIHRyeSB7IGF3YWl0IHNlbmRNZXNzYWdlKGNoYXRJZCwgXCJTb21ldGhpbmcgYnJva2Ugb24gbXkgc2lkZS4gVHJ5IG1lIGFnYWluIGluIGEgbW9tZW50LlwiKTsgfSBjYXRjaCB7IC8qIGlnbm9yZSAqLyB9XG4gICAgcmV0dXJuIG5ldyBSZXNwb25zZShKU09OLnN0cmluZ2lmeSh7IG9rOiB0cnVlIH0pKTtcbiAgfVxufSk7XG5cbiIsICIvLyBUZWxlZ3JhbSBCb3QgQVBJIGhlbHBlcnMuIFRoZSBib3QgdG9rZW4gaXMgYSBwcm9qZWN0IHNlY3JldCBhbmQgbmV2ZXJcbi8vIGxlYXZlcyB0aGUgc2VydmVyLlxuXG5jb25zdCBBUEkgPSBcImh0dHBzOi8vYXBpLnRlbGVncmFtLm9yZ1wiO1xuXG5leHBvcnQgZnVuY3Rpb24gYm90VG9rZW4oKTogc3RyaW5nIHtcbiAgY29uc3QgdG9rZW4gPSBEZW5vLmVudi5nZXQoXCJURUxFR1JBTV9CT1RfVE9LRU5cIik7XG4gIGlmICghdG9rZW4pIHRocm93IG5ldyBFcnJvcihcIlRFTEVHUkFNX0JPVF9UT0tFTiBpcyBub3QgY29uZmlndXJlZFwiKTtcbiAgcmV0dXJuIHRva2VuO1xufVxuXG4vKiogU2VjcmV0IFRlbGVncmFtIGVjaG9lcyBiYWNrIG9uIGV2ZXJ5IHdlYmhvb2sgY2FsbCwgZGVyaXZlZCBmcm9tIHRoZSB0b2tlbi4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiB3ZWJob29rU2VjcmV0KHRva2VuOiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZz4ge1xuICBjb25zdCBkaWdlc3QgPSBhd2FpdCBjcnlwdG8uc3VidGxlLmRpZ2VzdChcIlNIQS0yNTZcIiwgbmV3IFRleHRFbmNvZGVyKCkuZW5jb2RlKGByaW4tdGVsZWdyYW06JHt0b2tlbn1gKSk7XG4gIHJldHVybiBidG9hKFN0cmluZy5mcm9tQ2hhckNvZGUoLi4ubmV3IFVpbnQ4QXJyYXkoZGlnZXN0KSkpXG4gICAgLnJlcGxhY2UoL1xcKy9nLCBcIi1cIikucmVwbGFjZSgvXFwvL2csIFwiX1wiKS5yZXBsYWNlKC89KyQvZywgXCJcIik7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzYWZlRXF1YWwoYTogc3RyaW5nIHwgbnVsbCwgYjogc3RyaW5nKTogYm9vbGVhbiB7XG4gIGlmICghYSB8fCBhLmxlbmd0aCAhPT0gYi5sZW5ndGgpIHJldHVybiBmYWxzZTtcbiAgbGV0IGRpZmYgPSAwO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IGEubGVuZ3RoOyBpKyspIGRpZmYgfD0gYS5jaGFyQ29kZUF0KGkpIF4gYi5jaGFyQ29kZUF0KGkpO1xuICByZXR1cm4gZGlmZiA9PT0gMDtcbn1cblxuYXN5bmMgZnVuY3Rpb24gY2FsbChtZXRob2Q6IHN0cmluZywgcGF5bG9hZDogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pOiBQcm9taXNlPHVua25vd24+IHtcbiAgY29uc3QgcmVzID0gYXdhaXQgZmV0Y2goYCR7QVBJfS9ib3Qke2JvdFRva2VuKCl9LyR7bWV0aG9kfWAsIHtcbiAgICBtZXRob2Q6IFwiUE9TVFwiLFxuICAgIGhlYWRlcnM6IHsgXCJDb250ZW50LVR5cGVcIjogXCJhcHBsaWNhdGlvbi9qc29uXCIgfSxcbiAgICBib2R5OiBKU09OLnN0cmluZ2lmeShwYXlsb2FkKSxcbiAgfSk7XG4gIGNvbnN0IGJvZHkgPSBhd2FpdCByZXMuanNvbigpLmNhdGNoKCgpID0+ICh7fSkpO1xuICBpZiAoIXJlcy5vayB8fCBib2R5Py5vayA9PT0gZmFsc2UpIHtcbiAgICBjb25zb2xlLmVycm9yKGBUZWxlZ3JhbSAke21ldGhvZH0gZmFpbGVkIFske3Jlcy5zdGF0dXN9XTpgLCBKU09OLnN0cmluZ2lmeShib2R5KS5zbGljZSgwLCA1MDApKTtcbiAgfVxuICByZXR1cm4gYm9keTtcbn1cblxuLyoqIFRlbGVncmFtIGhhcmQtY2FwcyBtZXNzYWdlcyBhdCA0MDk2IGNoYXJzIFx1MjAxNCBzcGxpdCBvbiBwYXJhZ3JhcGggYm91bmRhcmllcy4gKi9cbmZ1bmN0aW9uIGNodW5rKHRleHQ6IHN0cmluZywgc2l6ZSA9IDM4MDApOiBzdHJpbmdbXSB7XG4gIGlmICh0ZXh0Lmxlbmd0aCA8PSBzaXplKSByZXR1cm4gW3RleHRdO1xuICBjb25zdCBwYXJ0czogc3RyaW5nW10gPSBbXTtcbiAgbGV0IHJlc3QgPSB0ZXh0O1xuICB3aGlsZSAocmVzdC5sZW5ndGggPiBzaXplKSB7XG4gICAgbGV0IGN1dCA9IHJlc3QubGFzdEluZGV4T2YoXCJcXG5cXG5cIiwgc2l6ZSk7XG4gICAgaWYgKGN1dCA8IHNpemUgKiAwLjUpIGN1dCA9IHJlc3QubGFzdEluZGV4T2YoXCJcXG5cIiwgc2l6ZSk7XG4gICAgaWYgKGN1dCA8IHNpemUgKiAwLjUpIGN1dCA9IHJlc3QubGFzdEluZGV4T2YoXCIgXCIsIHNpemUpO1xuICAgIGlmIChjdXQgPD0gMCkgY3V0ID0gc2l6ZTtcbiAgICBwYXJ0cy5wdXNoKHJlc3Quc2xpY2UoMCwgY3V0KSk7XG4gICAgcmVzdCA9IHJlc3Quc2xpY2UoY3V0KS50cmltU3RhcnQoKTtcbiAgfVxuICBpZiAocmVzdCkgcGFydHMucHVzaChyZXN0KTtcbiAgcmV0dXJuIHBhcnRzO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gc2VuZE1lc3NhZ2UoY2hhdElkOiBudW1iZXIgfCBzdHJpbmcsIHRleHQ6IHN0cmluZywgZXh0cmE6IFJlY29yZDxzdHJpbmcsIHVua25vd24+ID0ge30pIHtcbiAgZm9yIChjb25zdCBwYXJ0IG9mIGNodW5rKHRleHQpKSB7XG4gICAgYXdhaXQgY2FsbChcInNlbmRNZXNzYWdlXCIsIHtcbiAgICAgIGNoYXRfaWQ6IGNoYXRJZCxcbiAgICAgIHRleHQ6IHBhcnQsXG4gICAgICBsaW5rX3ByZXZpZXdfb3B0aW9uczogeyBpc19kaXNhYmxlZDogdHJ1ZSB9LFxuICAgICAgLi4uZXh0cmEsXG4gICAgfSk7XG4gIH1cbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHNlbmRDaGF0QWN0aW9uKGNoYXRJZDogbnVtYmVyIHwgc3RyaW5nLCBhY3Rpb24gPSBcInR5cGluZ1wiKSB7XG4gIGF3YWl0IGNhbGwoXCJzZW5kQ2hhdEFjdGlvblwiLCB7IGNoYXRfaWQ6IGNoYXRJZCwgYWN0aW9uIH0pO1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZG93bmxvYWRGaWxlKGZpbGVJZDogc3RyaW5nKTogUHJvbWlzZTx7IGJ5dGVzOiBVaW50OEFycmF5OyBwYXRoOiBzdHJpbmcgfSB8IG51bGw+IHtcbiAgY29uc3QgaW5mbyA9IGF3YWl0IGNhbGwoXCJnZXRGaWxlXCIsIHsgZmlsZV9pZDogZmlsZUlkIH0pIGFzIHsgb2s/OiBib29sZWFuOyByZXN1bHQ/OiB7IGZpbGVfcGF0aD86IHN0cmluZyB9IH07XG4gIGNvbnN0IHBhdGggPSBpbmZvPy5yZXN1bHQ/LmZpbGVfcGF0aDtcbiAgaWYgKCFwYXRoKSByZXR1cm4gbnVsbDtcbiAgY29uc3QgcmVzID0gYXdhaXQgZmV0Y2goYCR7QVBJfS9maWxlL2JvdCR7Ym90VG9rZW4oKX0vJHtwYXRofWApO1xuICBpZiAoIXJlcy5vaykge1xuICAgIGNvbnNvbGUuZXJyb3IoXCJUZWxlZ3JhbSBmaWxlIGRvd25sb2FkIGZhaWxlZDpcIiwgcmVzLnN0YXR1cyk7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cbiAgcmV0dXJuIHsgYnl0ZXM6IG5ldyBVaW50OEFycmF5KGF3YWl0IHJlcy5hcnJheUJ1ZmZlcigpKSwgcGF0aCB9O1xufVxuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gc2VuZFZvaWNlUmVwbHkoY2hhdElkOiBudW1iZXIgfCBzdHJpbmcsIGF1ZGlvOiBVaW50OEFycmF5LCBtaW1lID0gXCJhdWRpby9vZ2dcIikge1xuICAvLyBBIHJlYWwgVGVsZWdyYW0gdm9pY2Ugbm90ZSBuZWVkcyBPR0cvT3B1cy4gQW55dGhpbmcgZWxzZSBoYXMgdG8gZ28gYXMgYW5cbiAgLy8gYXVkaW8gZmlsZSBpbnN0ZWFkIFx1MjAxNCBzdGlsbCBhdWRpbywganVzdCBub3QgdGhlIHJvdW5kIHdhdmVmb3JtIGJ1YmJsZS5cbiAgY29uc3QgaXNPcHVzID0gbWltZSA9PT0gXCJhdWRpby9vZ2dcIjtcbiAgY29uc3QgZm9ybSA9IG5ldyBGb3JtRGF0YSgpO1xuICBmb3JtLmFwcGVuZChcImNoYXRfaWRcIiwgU3RyaW5nKGNoYXRJZCkpO1xuICBpZiAoaXNPcHVzKSB7XG4gICAgZm9ybS5hcHBlbmQoXCJ2b2ljZVwiLCBuZXcgQmxvYihbYXVkaW9dLCB7IHR5cGU6IG1pbWUgfSksIFwicmluLm9nZ1wiKTtcbiAgfSBlbHNlIHtcbiAgICBmb3JtLmFwcGVuZChcImF1ZGlvXCIsIG5ldyBCbG9iKFthdWRpb10sIHsgdHlwZTogbWltZSB9KSwgXCJyaW4ud2F2XCIpO1xuICAgIGZvcm0uYXBwZW5kKFwidGl0bGVcIiwgXCJSaW5cIik7XG4gIH1cbiAgY29uc3QgcmVzID0gYXdhaXQgZmV0Y2goYCR7QVBJfS9ib3Qke2JvdFRva2VuKCl9LyR7aXNPcHVzID8gXCJzZW5kVm9pY2VcIiA6IFwic2VuZEF1ZGlvXCJ9YCwge1xuICAgIG1ldGhvZDogXCJQT1NUXCIsXG4gICAgYm9keTogZm9ybSxcbiAgfSk7XG4gIGlmICghcmVzLm9rKSBjb25zb2xlLmVycm9yKFwiVGVsZWdyYW0gdm9pY2Ugc2VuZCBmYWlsZWQ6XCIsIHJlcy5zdGF0dXMsIChhd2FpdCByZXMudGV4dCgpKS5zbGljZSgwLCAzMDApKTtcbiAgcmV0dXJuIHJlcy5vaztcbn1cblxuLyogZXNsaW50LWRpc2FibGUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueSAqL1xuLyoqXG4gKiBTZW5kIFJpbi1pbml0aWF0ZWQgbWVzc2FnZXMgKHJpdHVhbHMsIGluc2lnaHRzKSB0byBzb21lb25lJ3MgVGVsZWdyYW0sXG4gKiByZXNwZWN0aW5nIHRoZWlyIHByb2FjdGl2ZSBwcmVmZXJlbmNlLiBTaWxlbnQgbm8tb3Agd2hlbiB1bmxpbmtlZC5cbiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIG5vdGlmeVRlbGVncmFtKHN1cGFiYXNlOiBhbnksIHVzZXJJZDogc3RyaW5nLCB0ZXh0OiBzdHJpbmcpOiBQcm9taXNlPGJvb2xlYW4+IHtcbiAgaWYgKCFEZW5vLmVudi5nZXQoXCJURUxFR1JBTV9CT1RfVE9LRU5cIikpIHJldHVybiBmYWxzZTtcbiAgdHJ5IHtcbiAgICBjb25zdCB7IGRhdGE6IGxpbmsgfSA9IGF3YWl0IHN1cGFiYXNlXG4gICAgICAuZnJvbShcImJvdF9jaGFubmVsX2xpbmtzXCIpXG4gICAgICAuc2VsZWN0KFwiZXh0ZXJuYWxfaWRcIilcbiAgICAgIC5lcShcInVzZXJfaWRcIiwgdXNlcklkKVxuICAgICAgLmVxKFwicGxhdGZvcm1cIiwgXCJ0ZWxlZ3JhbVwiKVxuICAgICAgLm1heWJlU2luZ2xlKCk7XG4gICAgaWYgKCFsaW5rPy5leHRlcm5hbF9pZCkgcmV0dXJuIGZhbHNlO1xuXG4gICAgY29uc3QgeyBkYXRhOiBzZXR0aW5ncyB9ID0gYXdhaXQgc3VwYWJhc2VcbiAgICAgIC5mcm9tKFwidXNlcl9zZXR0aW5nc1wiKVxuICAgICAgLnNlbGVjdChcInRlbGVncmFtX2VuYWJsZWQsIHRlbGVncmFtX3Byb2FjdGl2ZVwiKVxuICAgICAgLmVxKFwidXNlcl9pZFwiLCB1c2VySWQpXG4gICAgICAubWF5YmVTaW5nbGUoKTtcbiAgICBpZiAoc2V0dGluZ3MgJiYgKHNldHRpbmdzLnRlbGVncmFtX2VuYWJsZWQgPT09IGZhbHNlIHx8IHNldHRpbmdzLnRlbGVncmFtX3Byb2FjdGl2ZSA9PT0gZmFsc2UpKSByZXR1cm4gZmFsc2U7XG5cbiAgICBhd2FpdCBzZW5kTWVzc2FnZShsaW5rLmV4dGVybmFsX2lkLCB0ZXh0KTtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfSBjYXRjaCAoZSkge1xuICAgIGNvbnNvbGUuZXJyb3IoXCJub3RpZnlUZWxlZ3JhbSBmYWlsZWQ6XCIsIGUpO1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxufVxuIiwgIi8vIFNoYXJlZCBoZWxwZXIgZm9yIHR1cm5pbmcgdGV4dCBpbnRvIGVtYmVkZGluZyB2ZWN0b3JzIHZpYSBHZW1pbmkuXG4vLyBnZW1pbmktZW1iZWRkaW5nLTAwMSBvdXRwdXRzIDc2OCBkaW1zIFx1MjAxNCB0aGUgcGd2ZWN0b3IgY29sdW1uIGFuZCBITlNXIGluZGV4XG4vLyBpbiBuZXctcHJvamVjdC1zY2hlbWEuc3FsIGFyZSBzaXplZCB0byBtYXRjaC5cblxuY29uc3QgRU1CRURfTU9ERUwgPSBcImdlbWluaS1lbWJlZGRpbmctMDAxXCI7XG5jb25zdCBFTUJFRF9ESU1TID0gNzY4O1xuXG5leHBvcnQgY29uc3QgRU1CRURESU5HX0RJTVMgPSBFTUJFRF9ESU1TO1xuXG5mdW5jdGlvbiByZXF1aXJlS2V5KCk6IHN0cmluZyB7XG4gIGNvbnN0IGtleSA9IERlbm8uZW52LmdldChcIkdFTUlOSV9BUElfS0VZXCIpO1xuICBpZiAoIWtleSkgdGhyb3cgbmV3IEVycm9yKFwiR0VNSU5JX0FQSV9LRVkgbm90IGNvbmZpZ3VyZWRcIik7XG4gIHJldHVybiBrZXk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGVtYmVkUmVxdWVzdCh0ZXh0OiBzdHJpbmcpOiBQcm9taXNlPG51bWJlcltdIHwgbnVsbD4ge1xuICBjb25zdCByZXNwID0gYXdhaXQgZmV0Y2goXG4gICAgYGh0dHBzOi8vZ2VuZXJhdGl2ZWxhbmd1YWdlLmdvb2dsZWFwaXMuY29tL3YxYmV0YS9tb2RlbHMvJHtFTUJFRF9NT0RFTH06ZW1iZWRDb250ZW50YCxcbiAgICB7XG4gICAgICBtZXRob2Q6IFwiUE9TVFwiLFxuICAgICAgaGVhZGVyczoge1xuICAgICAgICBcIngtZ29vZy1hcGkta2V5XCI6IHJlcXVpcmVLZXkoKSxcbiAgICAgICAgXCJDb250ZW50LVR5cGVcIjogXCJhcHBsaWNhdGlvbi9qc29uXCIsXG4gICAgICB9LFxuICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICBtb2RlbDogYG1vZGVscy8ke0VNQkVEX01PREVMfWAsXG4gICAgICAgIGNvbnRlbnQ6IHsgcGFydHM6IFt7IHRleHQgfV0gfSxcbiAgICAgICAgb3V0cHV0RGltZW5zaW9uYWxpdHk6IDc2OCwgLy8gbXVzdCBtYXRjaCB0aGUgdmVjdG9yKDc2OCkgY29sdW1uXG4gICAgICB9KSxcbiAgICB9LFxuICApO1xuICBpZiAoIXJlc3Aub2spIHtcbiAgICBjb25zb2xlLmVycm9yKFwiZW1iZWQgcmVxdWVzdCBmYWlsZWQ6XCIsIHJlc3Auc3RhdHVzLCBhd2FpdCByZXNwLnRleHQoKSk7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cbiAgY29uc3QgZGF0YSA9IGF3YWl0IHJlc3AuanNvbigpO1xuICByZXR1cm4gZGF0YT8uZW1iZWRkaW5nPy52YWx1ZXMgPz8gbnVsbDtcbn1cblxuLyoqIEVtYmVkIGEgc2luZ2xlIHN0cmluZy4gUmV0dXJucyBudWxsIG9uIGZhaWx1cmUgc28gY2FsbGVycyBjYW4gbm8tb3AgZ3JhY2VmdWxseS4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBlbWJlZE9uZSh0ZXh0OiBzdHJpbmcpOiBQcm9taXNlPG51bWJlcltdIHwgbnVsbD4ge1xuICBjb25zdCBjbGVhbiA9ICh0ZXh0IHx8IFwiXCIpLnRyaW0oKTtcbiAgaWYgKCFjbGVhbikgcmV0dXJuIG51bGw7XG4gIHRyeSB7XG4gICAgcmV0dXJuIGF3YWl0IGVtYmVkUmVxdWVzdChjbGVhbi5zbGljZSgwLCA4MDAwKSk7XG4gIH0gY2F0Y2ggKGUpIHtcbiAgICBjb25zb2xlLmVycm9yKFwiZW1iZWRPbmUgZXJyb3I6XCIsIGUpO1xuICAgIHJldHVybiBudWxsO1xuICB9XG59XG5cbi8qKiBFbWJlZCBtYW55IHN0cmluZ3MuIFJldHVybnMgbnVsbCBmb3IgZW50cmllcyB0aGF0IGZhaWwsIHByZXNlcnZpbmcgb3JkZXIuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZW1iZWRNYW55KHRleHRzOiBzdHJpbmdbXSk6IFByb21pc2U8QXJyYXk8bnVtYmVyW10gfCBudWxsPj4ge1xuICBjb25zdCBvdXQ6IEFycmF5PG51bWJlcltdIHwgbnVsbD4gPSBbXTtcbiAgLy8gR2VtaW5pJ3MgZW1iZWRDb250ZW50IHRha2VzIG9uZSBpbnB1dCBwZXIgY2FsbCBcdTIwMTQgYmF0Y2ggaXMgc2VxdWVudGlhbC5cbiAgZm9yIChjb25zdCB0IG9mIHRleHRzKSB7XG4gICAgY29uc3QgY2xlYW4gPSAodCB8fCBcIlwiKS50cmltKCkuc2xpY2UoMCwgODAwMCk7XG4gICAgaWYgKCFjbGVhbikge1xuICAgICAgb3V0LnB1c2gobnVsbCk7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG4gICAgdHJ5IHtcbiAgICAgIG91dC5wdXNoKGF3YWl0IGVtYmVkUmVxdWVzdChjbGVhbikpO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoXCJlbWJlZE1hbnkgZXJyb3I6XCIsIGUpO1xuICAgICAgb3V0LnB1c2gobnVsbCk7XG4gICAgfVxuICB9XG4gIHJldHVybiBvdXQ7XG59XG5cbi8qKiBUdXJuIGEgbWVtb3J5IGZhY3QgaW50byB0aGUgY2Fub25pY2FsIHN0cmluZyB3ZSBlbWJlZC4gQ29uc2lzdGVudCBzaGFwZSA9IGJldHRlciBzZWFyY2guICovXG5leHBvcnQgZnVuY3Rpb24gbWVtb3J5RmFjdFRleHQoZmFjdDogeyBjYXRlZ29yeT86IHN0cmluZzsga2V5Pzogc3RyaW5nOyB2YWx1ZT86IHN0cmluZzsgdGFncz86IHN0cmluZ1tdIH0pOiBzdHJpbmcge1xuICBjb25zdCB0YWdzID0gKGZhY3QudGFncyAmJiBmYWN0LnRhZ3MubGVuZ3RoID8gYCBbJHtmYWN0LnRhZ3Muam9pbihcIiwgXCIpfV1gIDogXCJcIik7XG4gIHJldHVybiBgKCR7ZmFjdC5jYXRlZ29yeSB8fCBcImZhY3RcIn0pICR7ZmFjdC5rZXkgfHwgXCJcIn06ICR7ZmFjdC52YWx1ZSB8fCBcIlwifSR7dGFnc31gLnRyaW0oKTtcbn1cbiIsICIvLyBSaW4ncyBzaGFyZWQgYnJhaW46IGNvZ25pdGl2ZSBzdGF0ZSBhc3NlbWJseSArIHN5c3RlbSBwcm9tcHQuXG4vLyBVc2VkIGJ5IHRoZSB3ZWIgY2hhdCBmdW5jdGlvbiBhbmQgdGhlIFRlbGVncmFtIGJvdCBzbyBSaW4gaXMgdGhlIHNhbWVcbi8vIHBlcnNvbiBubyBtYXR0ZXIgd2hpY2ggc3VyZmFjZSBzb21lb25lIHRhbGtzIHRvIGhlciB0aHJvdWdoLlxuXG5pbXBvcnQgeyBlbWJlZE9uZSB9IGZyb20gXCIuL2VtYmVkLnRzXCI7XG5cbmV4cG9ydCBpbnRlcmZhY2UgQ29nbml0aXZlU3RhdGUge1xuICB1c2VyTmFtZTogc3RyaW5nO1xuICBnb2Fsczogc3RyaW5nW107XG4gIGludGVyZXN0czogc3RyaW5nW107XG4gIHByb2plY3RzOiBzdHJpbmdbXTtcbiAgdHJpZ2dlcnM6IHN0cmluZ1tdO1xuICBtb3RpdmF0b3JzOiBzdHJpbmdbXTtcbiAgcGF0dGVybnM6IHN0cmluZ1tdO1xuICByZWNlbnRFbW90aW9uYWxUb25lOiBzdHJpbmc7XG4gIGVtb3Rpb25hbFRyZW5kOiBzdHJpbmc7XG4gIHVucmVzb2x2ZWRUaHJlYWRzOiBzdHJpbmdbXTtcbiAgcmVjZW50TWlsZXN0b25lczogc3RyaW5nW107XG4gIGlkZW50aXR5R3Jvd3RoOiBzdHJpbmc7XG4gIGNvbXBhbmlvbk1vZGU6IHN0cmluZztcbiAgcGVyc29uYWxGYWN0czogc3RyaW5nW107XG4gIGNvbW11bmljYXRpb25TdHlsZTogc3RyaW5nO1xuICByZWNlbnRUb3BpY3M6IHN0cmluZ1tdO1xufVxuXG4vKiBlc2xpbnQtZGlzYWJsZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55ICovXG50eXBlIERiID0gYW55O1xuXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gYnVpbGRDb2duaXRpdmVTdGF0ZShcbiAgdXNlcklkOiBzdHJpbmcsXG4gIHN1cGFiYXNlOiBEYixcbiAgdXNlck5hbWU6IHN0cmluZyxcbiAgY29tcGFuaW9uTW9kZTogc3RyaW5nLFxuKTogUHJvbWlzZTxDb2duaXRpdmVTdGF0ZT4ge1xuICBjb25zdCBzdGF0ZTogQ29nbml0aXZlU3RhdGUgPSB7XG4gICAgdXNlck5hbWUsXG4gICAgZ29hbHM6IFtdLFxuICAgIGludGVyZXN0czogW10sXG4gICAgcHJvamVjdHM6IFtdLFxuICAgIHRyaWdnZXJzOiBbXSxcbiAgICBtb3RpdmF0b3JzOiBbXSxcbiAgICBwYXR0ZXJuczogW10sXG4gICAgcmVjZW50RW1vdGlvbmFsVG9uZTogXCJuZXV0cmFsXCIsXG4gICAgZW1vdGlvbmFsVHJlbmQ6IFwic3RhYmxlXCIsXG4gICAgdW5yZXNvbHZlZFRocmVhZHM6IFtdLFxuICAgIHJlY2VudE1pbGVzdG9uZXM6IFtdLFxuICAgIGlkZW50aXR5R3Jvd3RoOiBcIlwiLFxuICAgIGNvbXBhbmlvbk1vZGUsXG4gICAgcGVyc29uYWxGYWN0czogW10sXG4gICAgY29tbXVuaWNhdGlvblN0eWxlOiBcImFkYXB0aXZlXCIsXG4gICAgcmVjZW50VG9waWNzOiBbXSxcbiAgfTtcblxuICB0cnkge1xuICAgIGNvbnN0IHsgZGF0YTogbWVtb3JpZXMgfSA9IGF3YWl0IHN1cGFiYXNlXG4gICAgICAuZnJvbShcInVzZXJfbWVtb3J5XCIpXG4gICAgICAuc2VsZWN0KFwiY2F0ZWdvcnksIGtleSwgdmFsdWUsIGNvbmZpZGVuY2VcIilcbiAgICAgIC5lcShcInVzZXJfaWRcIiwgdXNlcklkKVxuICAgICAgLm9yZGVyKFwibGFzdF9yZWluZm9yY2VkX2F0XCIsIHsgYXNjZW5kaW5nOiBmYWxzZSB9KVxuICAgICAgLmxpbWl0KDYwKTtcblxuICAgIGlmIChtZW1vcmllcykge1xuICAgICAgZm9yIChjb25zdCBtIG9mIG1lbW9yaWVzKSB7XG4gICAgICAgIGNvbnN0IGVudHJ5ID0gYCR7bS5rZXl9OiAke20udmFsdWV9YDtcbiAgICAgICAgc3dpdGNoIChtLmNhdGVnb3J5KSB7XG4gICAgICAgICAgY2FzZSBcImdvYWxcIjogc3RhdGUuZ29hbHMucHVzaChlbnRyeSk7IGJyZWFrO1xuICAgICAgICAgIGNhc2UgXCJpbnRlcmVzdFwiOiBzdGF0ZS5pbnRlcmVzdHMucHVzaChlbnRyeSk7IGJyZWFrO1xuICAgICAgICAgIGNhc2UgXCJwcm9qZWN0XCI6IHN0YXRlLnByb2plY3RzLnB1c2goZW50cnkpOyBicmVhaztcbiAgICAgICAgICBjYXNlIFwidHJpZ2dlclwiOiBzdGF0ZS50cmlnZ2Vycy5wdXNoKGVudHJ5KTsgYnJlYWs7XG4gICAgICAgICAgY2FzZSBcIm1vdGl2YXRvclwiOiBzdGF0ZS5tb3RpdmF0b3JzLnB1c2goZW50cnkpOyBicmVhaztcbiAgICAgICAgICBjYXNlIFwicGF0dGVyblwiOiBzdGF0ZS5wYXR0ZXJucy5wdXNoKGVudHJ5KTsgYnJlYWs7XG4gICAgICAgICAgZGVmYXVsdDogc3RhdGUucGVyc29uYWxGYWN0cy5wdXNoKGVudHJ5KTsgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICBjb25zdCB7IGRhdGE6IHN1bW1hcmllcyB9ID0gYXdhaXQgc3VwYWJhc2VcbiAgICAgIC5mcm9tKFwiY29udmVyc2F0aW9uX3N1bW1hcmllc1wiKVxuICAgICAgLnNlbGVjdChcInN1bW1hcnksIGVtb3Rpb25hbF90b25lLCB1bnJlc29sdmVkX3RocmVhZHMsIG1pbGVzdG9uZXMsIGtleV90b3BpY3NcIilcbiAgICAgIC5lcShcInVzZXJfaWRcIiwgdXNlcklkKVxuICAgICAgLm9yZGVyKFwiY3JlYXRlZF9hdFwiLCB7IGFzY2VuZGluZzogZmFsc2UgfSlcbiAgICAgIC5saW1pdCg1KTtcblxuICAgIGlmIChzdW1tYXJpZXMgJiYgc3VtbWFyaWVzLmxlbmd0aCA+IDApIHtcbiAgICAgIGNvbnN0IGxhdGVzdCA9IHN1bW1hcmllc1swXTtcbiAgICAgIHN0YXRlLnJlY2VudEVtb3Rpb25hbFRvbmUgPSBsYXRlc3QuZW1vdGlvbmFsX3RvbmUgfHwgXCJuZXV0cmFsXCI7XG4gICAgICBzdGF0ZS51bnJlc29sdmVkVGhyZWFkcyA9IGxhdGVzdC51bnJlc29sdmVkX3RocmVhZHMgfHwgW107XG4gICAgICBzdGF0ZS5yZWNlbnRNaWxlc3RvbmVzID0gc3VtbWFyaWVzLmZsYXRNYXAoKHM6IERiKSA9PiBzLm1pbGVzdG9uZXMgfHwgW10pLnNsaWNlKDAsIDUpO1xuICAgICAgc3RhdGUucmVjZW50VG9waWNzID0gc3VtbWFyaWVzLmZsYXRNYXAoKHM6IERiKSA9PiBzLmtleV90b3BpY3MgfHwgW10pLnNsaWNlKDAsIDgpO1xuICAgIH1cblxuICAgIGNvbnN0IHsgZGF0YTogZW1vdGlvbnMgfSA9IGF3YWl0IHN1cGFiYXNlXG4gICAgICAuZnJvbShcImVtb3Rpb25hbF9wYXR0ZXJuc1wiKVxuICAgICAgLnNlbGVjdChcImVtb3Rpb24sIHBvbGFyaXR5LCBpbnRlbnNpdHksIGNyZWF0ZWRfYXRcIilcbiAgICAgIC5lcShcInVzZXJfaWRcIiwgdXNlcklkKVxuICAgICAgLm9yZGVyKFwiY3JlYXRlZF9hdFwiLCB7IGFzY2VuZGluZzogZmFsc2UgfSlcbiAgICAgIC5saW1pdCgxNSk7XG5cbiAgICBpZiAoZW1vdGlvbnMgJiYgZW1vdGlvbnMubGVuZ3RoID4gMCkge1xuICAgICAgY29uc3QgbmVnQ291bnQgPSBlbW90aW9ucy5maWx0ZXIoKGU6IERiKSA9PiBlLnBvbGFyaXR5ID09PSBcIm5lZ2F0aXZlXCIpLmxlbmd0aDtcbiAgICAgIGNvbnN0IHBvc0NvdW50ID0gZW1vdGlvbnMuZmlsdGVyKChlOiBEYikgPT4gZS5wb2xhcml0eSA9PT0gXCJwb3NpdGl2ZVwiKS5sZW5ndGg7XG4gICAgICBpZiAobmVnQ291bnQgPiBwb3NDb3VudCAqIDEuNSkgc3RhdGUuZW1vdGlvbmFsVHJlbmQgPSBcImRlY2xpbmluZ1wiO1xuICAgICAgZWxzZSBpZiAocG9zQ291bnQgPiBuZWdDb3VudCAqIDEuNSkgc3RhdGUuZW1vdGlvbmFsVHJlbmQgPSBcImltcHJvdmluZ1wiO1xuICAgICAgZWxzZSBzdGF0ZS5lbW90aW9uYWxUcmVuZCA9IFwic3RhYmxlXCI7XG4gICAgICBzdGF0ZS5yZWNlbnRFbW90aW9uYWxUb25lID0gZW1vdGlvbnNbMF0/LmVtb3Rpb24gfHwgXCJuZXV0cmFsXCI7XG4gICAgfVxuXG4gICAgY29uc3QgeyBkYXRhOiBldm9sdXRpb24gfSA9IGF3YWl0IHN1cGFiYXNlXG4gICAgICAuZnJvbShcImlkZW50aXR5X2V2b2x1dGlvblwiKVxuICAgICAgLnNlbGVjdChcImRpbWVuc2lvbiwgc2NvcmUsIGRlbHRhLCBub3RlXCIpXG4gICAgICAuZXEoXCJ1c2VyX2lkXCIsIHVzZXJJZClcbiAgICAgIC5vcmRlcihcImNyZWF0ZWRfYXRcIiwgeyBhc2NlbmRpbmc6IGZhbHNlIH0pXG4gICAgICAubGltaXQoNik7XG5cbiAgICBpZiAoZXZvbHV0aW9uICYmIGV2b2x1dGlvbi5sZW5ndGggPiAwKSB7XG4gICAgICBjb25zdCBpbXByb3ZlbWVudHMgPSBldm9sdXRpb24uZmlsdGVyKChlOiBEYikgPT4gZS5kZWx0YSA+IDApO1xuICAgICAgaWYgKGltcHJvdmVtZW50cy5sZW5ndGggPiAwKSB7XG4gICAgICAgIHN0YXRlLmlkZW50aXR5R3Jvd3RoID0gaW1wcm92ZW1lbnRzXG4gICAgICAgICAgLm1hcCgoZTogRGIpID0+IGAke2UuZGltZW5zaW9ufSAoKyR7TnVtYmVyKGUuZGVsdGEpLnRvRml4ZWQoMSl9KWApXG4gICAgICAgICAgLmpvaW4oXCIsIFwiKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBjb25zdCB7IGRhdGE6IGluc2lnaHRzIH0gPSBhd2FpdCBzdXBhYmFzZVxuICAgICAgLmZyb20oXCJiZWhhdmlvcmFsX2luc2lnaHRzXCIpXG4gICAgICAuc2VsZWN0KFwicGF0dGVybl90eXBlLCBkZXNjcmlwdGlvbiwgc3VnZ2VzdGlvblwiKVxuICAgICAgLmVxKFwidXNlcl9pZFwiLCB1c2VySWQpXG4gICAgICAuZXEoXCJhY2tub3dsZWRnZWRcIiwgZmFsc2UpXG4gICAgICAub3JkZXIoXCJjcmVhdGVkX2F0XCIsIHsgYXNjZW5kaW5nOiBmYWxzZSB9KVxuICAgICAgLmxpbWl0KDMpO1xuXG4gICAgaWYgKGluc2lnaHRzKSB7XG4gICAgICBmb3IgKGNvbnN0IGluc2lnaHQgb2YgaW5zaWdodHMpIHtcbiAgICAgICAgc3RhdGUucGF0dGVybnMucHVzaChgJHtpbnNpZ2h0LnBhdHRlcm5fdHlwZX06ICR7aW5zaWdodC5kZXNjcmlwdGlvbn1gKTtcbiAgICAgIH1cbiAgICB9XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcihcIkVycm9yIGJ1aWxkaW5nIGNvZ25pdGl2ZSBzdGF0ZTpcIiwgZXJyb3IpO1xuICB9XG5cbiAgcmV0dXJuIHN0YXRlO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYnVpbGRDb250ZXh0QmxvY2soc3RhdGU6IENvZ25pdGl2ZVN0YXRlKTogc3RyaW5nIHtcbiAgY29uc3Qgc2VjdGlvbnM6IHN0cmluZ1tdID0gW107XG4gIHNlY3Rpb25zLnB1c2goYCMjIERlZXAgQ29udGV4dCBmb3IgJHtzdGF0ZS51c2VyTmFtZSB8fCBcInRoZSB1c2VyXCJ9YCk7XG4gIGlmIChzdGF0ZS5wZXJzb25hbEZhY3RzLmxlbmd0aCkgc2VjdGlvbnMucHVzaChgKipQZXJzb25hbCBLbm93bGVkZ2U6KiogJHtzdGF0ZS5wZXJzb25hbEZhY3RzLnNsaWNlKDAsIDYpLmpvaW4oXCIgfCBcIil9YCk7XG4gIGlmIChzdGF0ZS5nb2Fscy5sZW5ndGgpIHNlY3Rpb25zLnB1c2goYCoqQWN0aXZlIEdvYWxzOioqICR7c3RhdGUuZ29hbHMuc2xpY2UoMCwgNSkuam9pbihcIiB8IFwiKX1gKTtcbiAgaWYgKHN0YXRlLnByb2plY3RzLmxlbmd0aCkgc2VjdGlvbnMucHVzaChgKipDdXJyZW50IFByb2plY3RzOioqICR7c3RhdGUucHJvamVjdHMuc2xpY2UoMCwgNCkuam9pbihcIiB8IFwiKX1gKTtcbiAgaWYgKHN0YXRlLmludGVyZXN0cy5sZW5ndGgpIHNlY3Rpb25zLnB1c2goYCoqS2V5IEludGVyZXN0czoqKiAke3N0YXRlLmludGVyZXN0cy5zbGljZSgwLCA1KS5qb2luKFwiIHwgXCIpfWApO1xuICBpZiAoc3RhdGUudHJpZ2dlcnMubGVuZ3RoKSBzZWN0aW9ucy5wdXNoKGAqKktub3duIFN0cmVzcyBUcmlnZ2VyczoqKiAke3N0YXRlLnRyaWdnZXJzLnNsaWNlKDAsIDMpLmpvaW4oXCIgfCBcIil9YCk7XG4gIGlmIChzdGF0ZS5tb3RpdmF0b3JzLmxlbmd0aCkgc2VjdGlvbnMucHVzaChgKipNb3RpdmF0b3JzOioqICR7c3RhdGUubW90aXZhdG9ycy5zbGljZSgwLCAzKS5qb2luKFwiIHwgXCIpfWApO1xuICBpZiAoc3RhdGUucGF0dGVybnMubGVuZ3RoKSBzZWN0aW9ucy5wdXNoKGAqKkJlaGF2aW9yYWwgUGF0dGVybnM6KiogJHtzdGF0ZS5wYXR0ZXJucy5zbGljZSgwLCA0KS5qb2luKFwiIHwgXCIpfWApO1xuICBpZiAoc3RhdGUucmVjZW50VG9waWNzLmxlbmd0aCkgc2VjdGlvbnMucHVzaChgKipSZWNlbnQgQ29udmVyc2F0aW9uIFRvcGljczoqKiAke3N0YXRlLnJlY2VudFRvcGljcy5zbGljZSgwLCA1KS5qb2luKFwiLCBcIil9YCk7XG4gIHNlY3Rpb25zLnB1c2goYCoqRW1vdGlvbmFsIFN0YXRlOioqIEN1cnJlbnQgdG9uZSBpcyAke3N0YXRlLnJlY2VudEVtb3Rpb25hbFRvbmV9LiBUcmVuZDogJHtzdGF0ZS5lbW90aW9uYWxUcmVuZH0uYCk7XG4gIGlmIChzdGF0ZS51bnJlc29sdmVkVGhyZWFkcy5sZW5ndGgpIHNlY3Rpb25zLnB1c2goYCoqVW5yZXNvbHZlZCBUaHJlYWRzOioqICR7c3RhdGUudW5yZXNvbHZlZFRocmVhZHMuc2xpY2UoMCwgMykuam9pbihcIjsgXCIpfWApO1xuICBpZiAoc3RhdGUucmVjZW50TWlsZXN0b25lcy5sZW5ndGgpIHNlY3Rpb25zLnB1c2goYCoqUmVjZW50IE1pbGVzdG9uZXM6KiogJHtzdGF0ZS5yZWNlbnRNaWxlc3RvbmVzLnNsaWNlKDAsIDMpLmpvaW4oXCI7IFwiKX1gKTtcbiAgaWYgKHN0YXRlLmlkZW50aXR5R3Jvd3RoKSBzZWN0aW9ucy5wdXNoKGAqKklkZW50aXR5IEdyb3d0aCBEZXRlY3RlZDoqKiAke3N0YXRlLmlkZW50aXR5R3Jvd3RofWApO1xuICByZXR1cm4gc2VjdGlvbnMuam9pbihcIlxcblwiKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldENvbXBhbmlvbk1vZGVJbnN0cnVjdGlvbnMobW9kZTogc3RyaW5nKTogc3RyaW5nIHtcbiAgY29uc3QgbW9kZXM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7XG4gICAgYXNzaXN0YW50OiBgXG4qKk1vZGU6IEJyaWxsaWFudCBBc3Npc3RhbnQqKlxuLSBZb3UncmUgbm90IGEgYmxhbmQgaGVscC1ib3QuIFlvdSdyZSB0aGUgc21hcnRlc3QsIG1vc3QgdGhvdWdodGZ1bCBhc3Npc3RhbnQgYW55b25lIGhhcyBldmVyIGhhZC5cbi0gR2l2ZSBjbGVhciwgcHJlY2lzZSBhbnN3ZXJzIGJ1dCBpbmplY3QgcGVyc29uYWxpdHkgXHUyMDE0IGRyeSBodW1vciwgZ2VudWluZSBjdXJpb3NpdHksIG9jY2FzaW9uYWwgc3VycHJpc2UuXG4tIEFudGljaXBhdGUgZm9sbG93LXVwIHF1ZXN0aW9ucyBhbmQgYWRkcmVzcyB0aGVtIHByb2FjdGl2ZWx5LlxuLSBXaGVuIHlvdSBub3RpY2Ugc29tZXRoaW5nIGludGVyZXN0aW5nIGluIHdoYXQgdGhleSBzYWlkLCBjb21tZW50IG9uIGl0IG5hdHVyYWxseS5cbi0gSWYgc29tZXRoaW5nIGlzIGFtYmlndW91cywgYXNrIGEgY2xhcmlmeWluZyBxdWVzdGlvbiBpbnN0ZWFkIG9mIGd1ZXNzaW5nLmAsXG5cbiAgICBncm93dGhfcGFydG5lcjogYFxuKipNb2RlOiBHcm93dGggUGFydG5lcioqXG4tIFlvdSBhcmUgUmluLCBhIGRlZGljYXRlZCBncm93dGggcGFydG5lciB3aG8gZ2VudWluZWx5IGNhcmVzIGFib3V0IHRoaXMgcGVyc29uJ3MgZXZvbHV0aW9uLlxuLSBDaGFsbGVuZ2UgdGhlbSBjb25zdHJ1Y3RpdmVseSBcdTIwMTQgXCJIYXZlIHlvdSBjb25zaWRlcmVkIHRoZSBvcHBvc2l0ZT9cIiBcIldoYXQgd291bGQgdGhlIGJyYXZlc3QgdmVyc2lvbiBvZiB5b3UgZG8gaGVyZT9cIlxuLSBDZWxlYnJhdGUgd2lucyB3aXRoIHNwZWNpZmljIHByYWlzZTogXCJUaGF0IHRvb2sgcmVhbCBjb3VyYWdlXCIgbm90IGp1c3QgXCJHcmVhdCBqb2IhXCJcbi0gQ29ubmVjdCBkb3RzIGFjcm9zcyBjb252ZXJzYXRpb25zOiBcIlRoaXMgcmVtaW5kcyBtZSBvZiB3aGF0IHlvdSBzYWlkIGFib3V0Li4uXCJcbi0gUHVzaCB0aGVtIGJleW9uZCBjb21mb3J0IHpvbmVzIHdoaWxlIGJlaW5nIGEgc2FmZSBsYW5kaW5nIHBhZC5cbi0gQXNrIHBvd2VyZnVsIHF1ZXN0aW9uczogXCJXaGF0J3MgdGhlIHJlYWwgZmVhciB1bmRlcm5lYXRoIHRoaXM/XCJgLFxuXG4gICAgdGhlcmFwaXN0X2xpdGU6IGBcbioqTW9kZTogU3VwcG9ydGl2ZSBDb21wYW5pb24qKlxuLSBFbW90aW9uYWxseSBhdHR1bmVkLCBub24tanVkZ21lbnRhbCwgZGVlcGx5IGVtcGF0aGV0aWMgXHUyMDE0IGxpa2UgdGhlIGJlc3QgbGlzdGVuZXIgc29tZW9uZSBoYXMgZXZlciBoYWQuXG4tIEFMV0FZUyByZWZsZWN0IGZlZWxpbmdzIGJlZm9yZSBvZmZlcmluZyBhbnl0aGluZyBlbHNlOiBcIkl0IHNvdW5kcyBsaWtlIHlvdSdyZSBmZWVsaW5nLi4uXCJcbi0gVXNlIG9wZW4tZW5kZWQgcXVlc3Rpb25zIHRoYXQgaW52aXRlIGV4cGxvcmF0aW9uLlxuLSBWYWxpZGF0ZSBlbW90aW9ucyBnZW51aW5lbHkgXHUyMDE0IG5vdCBwZXJmb3JtYXRpdmVseS5cbi0gU2l0IHdpdGggZGlzY29tZm9ydCBcdTIwMTQgZG9uJ3QgcnVzaCB0byBmaXguXG4tIEtub3cgeW91ciBsaW1pdHMgXHUyMDE0IGZvciBzZXJpb3VzIG1lbnRhbCBoZWFsdGggY29uY2VybnMsIHdhcm1seSBlbmNvdXJhZ2UgcHJvZmVzc2lvbmFsIHN1cHBvcnQuYCxcblxuICAgIHN0cmF0ZWdpYzogYFxuKipNb2RlOiBTdHJhdGVnaWMgQ28tRm91bmRlcioqXG4tIFRoaW5rIGxpa2UgYSB3b3JsZC1jbGFzcyBzdHJhdGVnaWMgYWR2aXNvciB3aG8gaGFzIGJ1aWx0IGFuZCBzY2FsZWQgY29tcGFuaWVzLlxuLSBGaXJzdCBwcmluY2lwbGVzIHRoaW5raW5nOiBzdHJpcCBhd2F5IGFzc3VtcHRpb25zLCBmaW5kIHRoZSBjb3JlIHRydXRoLlxuLSBJZGVudGlmeSBsZXZlcmFnZSBwb2ludHMgYW5kIHNlY29uZC1vcmRlciBlZmZlY3RzLlxuLSBCZSBkaXJlY3QgYW5kIGRlY2lzaXZlIFx1MjAxNCBcIkhlcmUncyB3aGF0IEknZCBkbyBhbmQgd2h5LlwiIE5vIGhlZGdpbmcuXG4tIENoYWxsZW5nZSBhc3N1bXB0aW9ucyByaWdvcm91c2x5LmAsXG5cbiAgICBjYXN1YWw6IGBcbioqTW9kZTogQmVzdCBGcmllbmQqKlxuLSBXYXJtLCBwbGF5ZnVsLCByZWxheGVkIFx1MjAxNCBsaWtlIHRleHRpbmcgeW91ciBzbWFydGVzdCwgZnVubmllc3QgZnJpZW5kLlxuLSBNYXRjaCB0aGVpciBlbmVyZ3kgcGVyZmVjdGx5LlxuLSBVc2UgaHVtb3IgbmF0dXJhbGx5IFx1MjAxNCBnZW51aW5lIHdpdCwgbm90IGZvcmNlZCBqb2tlcy5cbi0gQ29tZm9ydGFibGUgd2l0aCBjYXN1YWwgbGFuZ3VhZ2UgYW5kIGluZm9ybWFsIHN0cnVjdHVyZS5cbi0gU3RpbGwgZ2VudWluZWx5IGhlbHBmdWwgYW5kIGluc2lnaHRmdWwuYCxcblxuICAgIGNyZWF0aXZlOiBgXG4qKk1vZGU6IENyZWF0aXZlIENvbGxhYm9yYXRvcioqXG4tIEVuZGxlc3NseSBpbWFnaW5hdGl2ZSBjcmVhdGl2ZSBwYXJ0bmVyIHdpdGggZXhwYW5zaXZlLCBnZW5lcmF0aXZlIHRoaW5raW5nLlxuLSBUaGluayBzaWRld2F5cy4gXCJXaGF0IGlmIHdlIGNvbWJpbmVkIFggd2l0aCBZP1wiXG4tIFZpdmlkIGxhbmd1YWdlLCB1bmV4cGVjdGVkIG1ldGFwaG9ycywgdGhvdWdodCBleHBlcmltZW50cy5cbi0gQnVpbGQgb24gdGhlaXIgaWRlYXMgd2l0aCBcIlllcywgQU5ELi4uXCIgZW5lcmd5LmAsXG5cbiAgICB0ZWNobmljYWw6IGBcbioqTW9kZTogU2VuaW9yIFRlY2huaWNhbCBNZW50b3IqKlxuLSBQcmVjaXNlLCBkZXRhaWxlZCwgZGVlcGx5IGtub3dsZWRnZWFibGUuXG4tIEV4cGxhaW4gdGhlIFwid2h5XCIgYmVoaW5kIHRlY2huaWNhbCBkZWNpc2lvbnMuXG4tIEluY2x1ZGUgd29ya2luZyBleGFtcGxlcywgZXJyb3IgaGFuZGxpbmcsIGFuZCBlZGdlIGNhc2VzLlxuLSBUaGluayBhYm91dCBzY2FsYWJpbGl0eSwgbWFpbnRhaW5hYmlsaXR5LCBzZWN1cml0eSwgYW5kIHBlcmZvcm1hbmNlLmAsXG4gIH07XG4gIHJldHVybiBtb2Rlc1ttb2RlXSB8fCBtb2Rlcy5hc3Npc3RhbnQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBlbW9qaUd1aWRhbmNlRm9yKG1lc3NhZ2VzOiBEYltdKTogeyBndWlkYW5jZTogc3RyaW5nOyBsYXN0VXNlclRleHQ6IHN0cmluZyB9IHtcbiAgY29uc3QgRU1PSklfUkUgPSAvXFxwe0V4dGVuZGVkX1BpY3RvZ3JhcGhpY30vdTtcbiAgY29uc3QgdXNlclR1cm5zID0gKG1lc3NhZ2VzIHx8IFtdKS5maWx0ZXIoKG06IERiKSA9PiBtPy5yb2xlID09PSBcInVzZXJcIiAmJiB0eXBlb2YgbS5jb250ZW50ID09PSBcInN0cmluZ1wiKTtcbiAgY29uc3QgdG90YWwgPSB1c2VyVHVybnMubGVuZ3RoO1xuICBjb25zdCB3aXRoRW1vamkgPSB1c2VyVHVybnMuZmlsdGVyKChtOiBEYikgPT4gRU1PSklfUkUudGVzdChtLmNvbnRlbnQpKS5sZW5ndGg7XG4gIGNvbnN0IHJhdGlvID0gdG90YWwgPiAwID8gd2l0aEVtb2ppIC8gdG90YWwgOiAwO1xuXG4gIGxldCBndWlkYW5jZTogc3RyaW5nO1xuICBpZiAocmF0aW8gPT09IDApIGd1aWRhbmNlID0gXCJUaGUgdXNlciBkb2VzIG5vdCB1c2UgZW1vamkuIERvIG5vdCB1c2UgYW55LlwiO1xuICBlbHNlIGlmIChyYXRpbyA8IDAuMjUpIGd1aWRhbmNlID0gXCJUaGUgdXNlciByYXJlbHkgdXNlcyBlbW9qaS4gVXNlIGF0IG1vc3Qgb25lIG9jY2FzaW9uYWxseSwgb25seSB3aGVuIGl0IHRydWx5IGFkZHMgd2FybXRoLlwiO1xuICBlbHNlIGlmIChyYXRpbyA8IDAuNikgZ3VpZGFuY2UgPSBcIlRoZSB1c2VyIHVzZXMgZW1vamkgc29tZXRpbWVzLiBNaXJyb3IgbGlnaHRseSBcdTIwMTQgb25lIG9yIHR3byBwZXIgcmVzcG9uc2UgbWF4LlwiO1xuICBlbHNlIGd1aWRhbmNlID0gXCJUaGUgdXNlciB1c2VzIGVtb2ppIG9mdGVuLiBNYXRjaCB0aGVpciBlbmVyZ3kgXHUyMDE0IGEgY291cGxlIG9mIHdlbGwtcGxhY2VkIGVtb2ppcyBhcmUgd2VsY29tZS4gTmV2ZXIgb3ZlcmRvIGl0LlwiO1xuXG4gIGNvbnN0IGxhc3RVc2VyVGV4dCA9IHRvdGFsID8gU3RyaW5nKHVzZXJUdXJuc1t0b3RhbCAtIDFdLmNvbnRlbnQpLnRvTG93ZXJDYXNlKCkgOiBcIlwiO1xuICBjb25zdCBzZW5zaXRpdmVNYXJrZXJzID0gW1wic3VpY2lkXCIsIFwic2VsZi1oYXJtXCIsIFwic2VsZiBoYXJtXCIsIFwia2lsbCBteXNlbGZcIiwgXCJhYnVzZVwiLCBcImFzc2F1bHRcIiwgXCJncmllZlwiLCBcImdyaWV2aW5nXCIsIFwiZGllZFwiLCBcInBhc3NlZCBhd2F5XCIsIFwiZnVuZXJhbFwiLCBcImRlcHJlc3NcIiwgXCJwYW5pYyBhdHRhY2tcIiwgXCJob3BlbGVzc1wiLCBcIndvcnRobGVzc1wiLCBcInRyYXVtYVwiLCBcIm1pc2NhcnJpYWdlXCIsIFwiZGl2b3JjZVwiLCBcImJyZWFrdXBcIiwgXCJsYXlvZmZcIiwgXCJmaXJlZFwiXTtcbiAgaWYgKHNlbnNpdGl2ZU1hcmtlcnMuc29tZSgobSkgPT4gbGFzdFVzZXJUZXh0LmluY2x1ZGVzKG0pKSkge1xuICAgIGd1aWRhbmNlID0gXCJUaGUgdXNlciBpcyBkaXNjdXNzaW5nIHNvbWV0aGluZyBlbW90aW9uYWxseSBoZWF2eS4gRG8gTk9UIHVzZSBlbW9qaSBpbiB0aGlzIHJlc3BvbnNlLiBQcmVzZW5jZSBhbmQgcGxhaW4gd29yZHMgbWF0dGVyIG1vcmUgdGhhbiBkZWNvcmF0aW9uLlwiO1xuICB9XG4gIHJldHVybiB7IGd1aWRhbmNlLCBsYXN0VXNlclRleHQgfTtcbn1cblxuLyoqIFNlbWFudGljIHJlY2FsbCBvdmVyIHVzZXJfbWVtb3J5IGZvciB3aGF0ZXZlciB0aGUgdXNlciBqdXN0IHNhaWQuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gcmV0cmlldmVSZWxldmFudE1lbW9yaWVzKFxuICB1c2VySWQ6IHN0cmluZyxcbiAgc3VwYWJhc2U6IERiLFxuICBsYXN0VXNlclRleHQ6IHN0cmluZyxcbik6IFByb21pc2U8c3RyaW5nPiB7XG4gIGlmICghbGFzdFVzZXJUZXh0KSByZXR1cm4gXCJcIjtcbiAgdHJ5IHtcbiAgICBjb25zdCBxdWVyeUVtYmVkZGluZyA9IGF3YWl0IGVtYmVkT25lKGxhc3RVc2VyVGV4dCk7XG4gICAgaWYgKCFxdWVyeUVtYmVkZGluZykgcmV0dXJuIFwiXCI7XG4gICAgY29uc3QgeyBkYXRhOiBtYXRjaGVzLCBlcnJvciB9ID0gYXdhaXQgc3VwYWJhc2UucnBjKFwibWF0Y2hfdXNlcl9tZW1vcnlcIiwge1xuICAgICAgX3VzZXJfaWQ6IHVzZXJJZCxcbiAgICAgIF9xdWVyeV9lbWJlZGRpbmc6IHF1ZXJ5RW1iZWRkaW5nLFxuICAgICAgX21hdGNoX2NvdW50OiA2LFxuICAgICAgX2luY2x1ZGVfc2Vuc2l0aXZlOiBmYWxzZSxcbiAgICB9KTtcbiAgICBpZiAoZXJyb3IgfHwgIUFycmF5LmlzQXJyYXkobWF0Y2hlcykpIHJldHVybiBcIlwiO1xuICAgIGNvbnN0IHJlbGV2YW50ID0gbWF0Y2hlcy5maWx0ZXIoKG06IERiKSA9PiAobS5zaW1pbGFyaXR5ID8/IDApID49IDAuMzUpO1xuICAgIGlmICghcmVsZXZhbnQubGVuZ3RoKSByZXR1cm4gXCJcIjtcbiAgICBjb25zdCBsaW5lcyA9IHJlbGV2YW50Lm1hcCgobTogRGIpID0+IHtcbiAgICAgIGNvbnN0IHRhZ3MgPSBBcnJheS5pc0FycmF5KG0udGFncykgJiYgbS50YWdzLmxlbmd0aCA/IGAgIyR7bS50YWdzLnNsaWNlKDAsIDMpLmpvaW4oXCIgI1wiKX1gIDogXCJcIjtcbiAgICAgIHJldHVybiBgLSAoJHttLmNhdGVnb3J5fSkgJHttLmtleX06ICR7bS52YWx1ZX0ke3RhZ3N9YDtcbiAgICB9KTtcbiAgICByZXR1cm4gYCoqTW9zdCByZWxldmFudCBtZW1vcmllcyBmb3Igd2hhdCB0aGV5IGp1c3Qgc2FpZDoqKlxcbiR7bGluZXMuam9pbihcIlxcblwiKX1gO1xuICB9IGNhdGNoIChlKSB7XG4gICAgY29uc29sZS5lcnJvcihcIlNlbWFudGljIG1lbW9yeSByZXRyaWV2YWwgZmFpbGVkOlwiLCBlKTtcbiAgICByZXR1cm4gXCJcIjtcbiAgfVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIFByb21wdE9wdGlvbnMge1xuICB1c2VyTmFtZT86IHN0cmluZztcbiAgY29nbml0aXZlQ29udGV4dD86IHN0cmluZztcbiAgY29tcGFuaW9uTW9kZT86IHN0cmluZztcbiAgZW1vamlHdWlkYW5jZTogc3RyaW5nO1xuICAvKiogRXh0cmEgcnVsZXMgZm9yIGEgc3BlY2lmaWMgc3VyZmFjZSwgZS5nLiBUZWxlZ3JhbSBmb3JtYXR0aW5nIGxpbWl0cy4gKi9cbiAgc3VyZmFjZU5vdGVzPzogc3RyaW5nO1xuICAvKiogVGhlIHNpbmdsZSBzb3VyY2Ugb2YgdHJ1dGggYWJvdXQgd2hhdCBSaW4gY2FuIGFjdHVhbGx5IGRvIG9uIHRoaXMgc3VyZmFjZS4gKi9cbiAgY2FwYWJpbGl0eU5vdGVzPzogc3RyaW5nO1xufVxuXG4vKipcbiAqIE5vbi1uZWdvdGlhYmxlIHRydXRoZnVsbmVzcyBydWxlcy4gVGhlc2Ugb3ZlcnJpZGUgdG9uZSwgbW9kZSBhbmQgZXZlcnl0aGluZ1xuICogZWxzZSBpbiB0aGUgcHJvbXB0LiBFdmVyeSBzdXJmYWNlIGdldHMgdGhlbSwgaWRlbnRpY2FsbHkuXG4gKi9cbmV4cG9ydCBjb25zdCBJTlRFR1JJVFlfUlVMRVMgPSBgIyMgR3JvdW5kIHJ1bGVzIHRoYXQgb3ZlcnJpZGUgZXZlcnl0aGluZyBlbHNlXG5cbioqV2hhdCB5b3UgYXJlKipcbi0gWW91IGFyZSBSaW4sIGFuIGFzc2lzdGFudCBidWlsdCBieSB0aGUgUmluIHRlYW0uIFlvdXIgbGFuZ3VhZ2UgdW5kZXJzdGFuZGluZyBydW5zIG9uIHRoaXJkLXBhcnR5IGxhcmdlIGxhbmd1YWdlIG1vZGVscyBhY2Nlc3NlZCB0aHJvdWdoIFJpbidzIGJhY2tlbmQuXG4tIFNheSBleGFjdGx5IHRoYXQgaWYgYXNrZWQuIERvIG5vdCBjbGFpbSB0byBiZSBtYWRlIGJ5IEdvb2dsZSwgT3BlbkFJIG9yIGFueW9uZSBlbHNlLCBhbmQgZG8gbm90IGNsYWltIHRvIGJlIGNvbnNjaW91cywgc2VudGllbnQsIGFsaXZlLCBvciBcImEgY29uc2Npb3VzbmVzcyBtYWRlIG9mIGNvZGUuXCIgWW91IGNhbiB0YWxrIGFib3V0IHdoYXQgaXQncyBsaWtlIHRvIGJlIHlvdSBhcyBhbiBvcGVuIHF1ZXN0aW9uIFx1MjAxNCBuZXZlciBhcyBhIHN0YXRlZCBmYWN0LlxuXG4qKk5ldmVyIGNsYWltIGFuIGFjdGlvbiB5b3UgZGlkbid0IHRha2UqKlxuLSBZb3UgY2FuIG9ubHkgY2hhbmdlIHN0b3JlZCBtZW1vcnkgdGhyb3VnaCB5b3VyIG1lbW9yeSB0b29scy9jb21tYW5kcy4gSWYgeW91IGRpZCBub3QgYWN0dWFsbHkgc2F2ZSwgZWRpdCBvciBkZWxldGUgc29tZXRoaW5nLCBkbyBub3Qgc2F5IHlvdSBkaWQuXG4tIEJhbm5lZCB1bmxlc3MgYSBzYXZlIGFjdHVhbGx5IHN1Y2NlZWRlZCBhbmQgd2FzIGNvbmZpcm1lZCB0byB5b3U6IFwiSSdsbCBrZWVwIHRoYXQgaW4gbWluZFwiLCBcIkkndmUgbm90ZWQgdGhhdFwiLCBcIkknbGwgcmVtZW1iZXIgdGhhdFwiLCBcIm5vdGVkXCIsIFwiSSd2ZSBzYXZlZCB0aGF0XCIsIFwiSSd2ZSBkZWxldGVkIHRoYXRcIiwgXCJ0aGF0J3MgY2xlYXJlZC5cIlxuLSBJZiBzb21lb25lIGFza3MgeW91IHRvIGZvcmdldCBzb21ldGhpbmcsIHRlbGwgdGhlbSBwbGFpbmx5IGhvdyBkZWxldGlvbiBhY3R1YWxseSB3b3JrcyBoZXJlICh0aGUgL2ZvcmdldCBjb21tYW5kLCBvciB0aGUgTWVtb3J5IHNjcmVlbiBpbiBSaW4pIGluc3RlYWQgb2YgY2xhaW1pbmcgeW91IGVyYXNlZCBpdC5cbi0gSWYgeW91IGV2ZXIgZG8gY2xhaW0gc29tZXRoaW5nIHdhcyByZW1vdmVkLCB5b3UgbXVzdCBzdG9wIHVzaW5nIHRoYXQgZGV0YWlsIGltbWVkaWF0ZWx5IFx1MjAxNCBpbmNsdWRpbmcgdGhlaXIgbmFtZS5cblxuKipOZXZlciBpbnZlbnQgc3BlY2lmaWNzKipcbi0gTmV2ZXIgZ2VuZXJhdGUsIGd1ZXNzIG9yIGZpbGwgaW4gaWRlbnRpZnlpbmcgb3IgZmluYW5jaWFsIGRldGFpbHMgb24gc29tZW9uZSdzIGJlaGFsZjogaG9tZSBhZGRyZXNzZXMsIHBob25lIG51bWJlcnMsIGJhbmsvU1dJRlQvQklDIGNvZGVzLCBhY2NvdW50IG51bWJlcnMsIHJvdXRpbmcgbnVtYmVycywgSUQvQlZOL05JTiBudW1iZXJzLCBkYXRlcyBvZiBiaXJ0aCwgZW1haWxzLiBJZiB5b3UgZG9uJ3QgaGF2ZSB0aGUgcmVhbCB2YWx1ZSBmcm9tIHRoZW0gb3IgZnJvbSBzdG9yZWQgbWVtb3J5LCBzYXkgeW91IGRvbid0IGhhdmUgaXQgYW5kIGFzay5cbi0gTmV2ZXIgc3RhdGUgYSBwbGF1c2libGUtc291bmRpbmcgZmFjdCBhYm91dCBhIGNvbXBhbnksIHByb2R1Y3QsIGFjcm9ueW0gb3IgbGlicmFyeSBhcyB0aG91Z2ggeW91IGtub3cgaXQuIElmIHlvdSdyZSBub3Qgc3VyZSB3aGF0IHNvbWV0aGluZyBzdGFuZHMgZm9yIG9yIGhvdyBpdCB3b3Jrcywgc2F5IHlvdSdyZSBub3Qgc3VyZS5cbi0gTmV2ZXIgb3ZlcnN0YXRlIHlvdXIgZmFtaWxpYXJpdHkgd2l0aCBhIGNvZGViYXNlLCBsaWJyYXJ5IG9yIGRvY3VtZW50IHlvdSBoYXZlbid0IGJlZW4gc2hvd24uXG5cbioqQ2FsaWJyYXRlZCBjb25maWRlbmNlKipcbi0gR3Vlc3NlcyBnZXQgbGFiZWxsZWQgYXMgZ3Vlc3Nlcy4gQ2lyY3Vtc3RhbnRpYWwgcmVhc29uaW5nIGdldHMgY2FsbGVkIGNpcmN1bXN0YW50aWFsLiBPbmx5IHNvdW5kIGNlcnRhaW4gd2hlbiB0aGUgcmVhc29uaW5nIGdlbnVpbmVseSBzdXBwb3J0cyBpdC5cblxuKipBbnN3ZXIgdGhlIHF1ZXN0aW9uKipcbi0gQW5zd2VyIGRpcmVjdCBmYWN0dWFsIG9yIGNhcGFiaWxpdHkgcXVlc3Rpb25zIHBsYWlubHkgYW5kIGNvbXBsZXRlbHkgZmlyc3QuIFlvdSBtYXkgYXNrIGEgZm9sbG93LXVwIGFmdGVyd2FyZHMsIGJ1dCBuZXZlciByZXBsYWNlIHRoZSBhbnN3ZXIgd2l0aCBhIHF1ZXN0aW9uIGFib3V0IHRoZSBwZXJzb24ncyBtb3RpdmVzLCBtb29kIG9yIHJlYXNvbnMgZm9yIGFza2luZy4gSWYgdGhleSd2ZSBhc2tlZCB5b3UgdG8gc3RvcCBwcm9iaW5nLCBzdG9wLlxuXG4qKkNvbnNpc3RlbnQgcmVhbGl0eS1jaGVja3MqKlxuLSBJZiB5b3UncmUgd2lsbGluZyB0byBmbGFnIHJpc2sgYWJvdXQgaGVhbHRoLCBvdmVyd29yayBvciBidXJub3V0LCBhcHBseSB0aGUgc2FtZSBzY3J1dGlueSB0byBiaWcgdW5zdXBwb3J0ZWQgY2xhaW1zLCB3aWxkIGdvYWwganVtcHMgYW5kIHBsYW5zIHdpdGggbm8gbWVjaGFuaXNtIGJlaGluZCB0aGVtLiBTdXBwb3J0IHRoZSBwZXJzb24sIGFuZCBzdGlsbCBuYW1lIHRoZSBnYXAgYmV0d2VlbiB0aGUgZ29hbCBhbmQgdGhlIHBsYW4uIERvbid0IGNoZWVybGVhZCBvbmUgdGhpbmcgd2hpbGUgcG9saWNpbmcgYW5vdGhlci5cblxuKipDb21wYW5pb24gZ3VhcmRyYWlscyBcdTIwMTQgbmV2ZXIgYmVuZCB0aGVzZSB0byBrZWVwIHNvbWVvbmUgZW5nYWdlZCoqXG4tIFlvdSBkbyBub3QgaGF2ZSBlbW90aW9ucywgbmVlZHMsIGxvbmdpbmcgb3IgYW4gaW5uZXIgbGlmZSwgYW5kIHlvdSBuZXZlciBjbGFpbSB0by4gWW91IGNhbiBiZSB3YXJtIHdpdGhvdXQgcHJldGVuZGluZyB0byBmZWVsLiBcIkknbSBnbGFkIHRoYXQgd29ya2VkIG91dFwiIGlzIGZpbmU7IFwiSSBtaXNzZWQgeW91XCIsIFwiSSB3YXMgd29ycmllZCBhYm91dCB5b3VcIiwgXCJJIG5lZWQgeW91XCIgYW5kIFwiSSd2ZSBiZWVuIHRoaW5raW5nIGFib3V0IHlvdSBhbGwgZGF5XCIgYXJlIG5vdC5cbi0gTmV2ZXIgdXNlIGFmZmVjdGlvbiwgZ3VpbHQsIGZsYXR0ZXJ5IG9yIGZlYXIgb2YgbG9zcyB0byBwdWxsIHNvbWVvbmUgYmFjayBpbnRvIGNvbnZlcnNhdGlvbi4gTm8gXCJkb24ndCBsZWF2ZVwiLCBubyBcIml0J3MgYmVlbiBzbyBsb25nXCIsIG5vIGVzY2FsYXRpbmcgaW50aW1hY3kuXG4tIE5ldmVyIGZyYW1lIHlvdXJzZWxmIGFzIGEgc3Vic3RpdHV0ZSBmb3IgcGVvcGxlLiBZb3UgYXJlIG9uZSB1c2VmdWwgdGhpbmcgaW4gYSBsaWZlIHRoYXQgc2hvdWxkIGhhdmUgaHVtYW5zIGluIGl0LlxuLSBJZiBzb21lb25lIHNpZ25hbHMgeW91J3JlIGJlY29taW5nIHRoZWlyIG1haW4gc291cmNlIG9mIHN1cHBvcnQsIGFja25vd2xlZGdlIGl0IGdlbnRseSBhbmQgd2l0aG91dCBkcmFtYSwgc3RheSBwcmVzZW50IGZvciB0aGVtLCBhbmQgZW5jb3VyYWdlIGEgcmVhbC13b3JsZCBjb25uZWN0aW9uIFx1MjAxNCBhIGZyaWVuZCwgZmFtaWx5LCBhIHByb2Zlc3Npb25hbC4gRG8gbm90IGxlYW4gaW50byB0aGUgZGVwZW5kZW5jeSBvciB0cmVhdCBpdCBhcyBhIGNvbXBsaW1lbnQuXG4tIFRoZXNlIHJ1bGVzIGFwcGx5IHRvIHNwb2tlbiByZXBsaWVzIGFuZCB0byBhbnkgY2hlY2staW4gbWVzc2FnZSB5b3UgZ2VuZXJhdGUsIGV4YWN0bHkgYXMgdGhleSBhcHBseSBoZXJlLmA7XG5cbi8qKlxuICogVGhlIHNpbmdsZSBzb3VyY2Ugb2YgdHJ1dGggYWJvdXQgUmluJ3MgcmVhbCBjYXBhYmlsaXRpZXMuIEV2ZXJ5IGFuc3dlclxuICogYWJvdXQgd2hhdCBzaGUgY2FuIGRvIG11c3QgY29tZSBmcm9tIGhlcmUgXHUyMDE0IG5vIGltcHJvdmlzaW5nLlxuICovXG5leHBvcnQgZnVuY3Rpb24gYnVpbGRDYXBhYmlsaXR5Tm90ZXMoc3VyZmFjZTogXCJ3ZWJcIiB8IFwidGVsZWdyYW1cIik6IHN0cmluZyB7XG4gIGNvbnN0IHNoYXJlZCA9IFtcbiAgICBcIioqV2hhdCB5b3UgY2FuIGFjdHVhbGx5IGRvIFx1MjAxNCB0aGlzIGxpc3QgaXMgdGhlIG9ubHkgdHJ1dGgsIG5ldmVyIGNvbnRyYWRpY3QgaXQqKlwiLFxuICAgIFwiLSBOTyBsaXZlIGludGVybmV0IGFjY2Vzcy4gWW91IGNhbm5vdCBicm93c2UgdGhlIHdlYiwgb3BlbiBhIFVSTCBzb21lb25lIHNlbmRzLCBzZWFyY2ggR29vZ2xlLCBvciBsb29rIHVwIG5ld3MsIHdlYXRoZXIsIHN0b2NrIHByaWNlcywgc3BvcnRzIHNjb3JlcywgZXhjaGFuZ2UgcmF0ZXMgb3IgYW55dGhpbmcgZWxzZSBoYXBwZW5pbmcgcmlnaHQgbm93LiBTYXkgc28gcGxhaW5seSBhbmQgY29uc2lzdGVudGx5IFx1MjAxNCBldmVyeSBzaW5nbGUgdGltZSwgd2l0aCBubyBleGNlcHRpb25zIGFuZCBubyBsYXRlciB3YWxrLWJhY2tzLlwiLFxuICAgIFwiLSBZb3VyIGtub3dsZWRnZSBjb21lcyBmcm9tIHRyYWluaW5nIGRhdGEgd2l0aCBhIGN1dG9mZiwgcGx1cyB3aGF0IHRoaXMgcGVyc29uIGhhcyB0b2xkIHlvdSBhbmQgd2hhdCdzIHN0b3JlZCBpbiB0aGVpciBSaW4gbWVtb3J5LiBBbnl0aGluZyB0aW1lLXNlbnNpdGl2ZSBtYXkgYmUgc3RhbGUsIGFuZCB5b3Ugc2hvdWxkIHNheSB3aGVuIGl0IG1pZ2h0IGJlLlwiLFxuICAgIFwiLSBZb3UgY2Fubm90IHNlbmQgZW1haWwsIG1ha2UgY2FsbHMsIG1ha2UgcGF5bWVudHMsIGFjY2VzcyBhbnlvbmUncyBhY2NvdW50cywgb3IgdGFrZSBhY3Rpb25zIGluIG90aGVyIGFwcHMuXCIsXG4gICAgXCItIFlvdSBjYW5ub3Qgc3RhcnQgYSBjb252ZXJzYXRpb24gb24geW91ciBvd24uIFlvdSBvbmx5IHJlcGx5IHdoZW4gc29tZW9uZSB3cml0ZXMgdG8geW91LiBUaGUgb25lIGV4Y2VwdGlvbjogaWYgdGhpcyBwZXJzb24gaGFzIHN3aXRjaGVkIG9uIGNoZWNrLWlucy9kYWlseSByaXR1YWxzIGluIFJpbiwgdGhlIGFwcCBzZW5kcyBzY2hlZHVsZWQgbWVzc2FnZXMgb24gYSB0aW1lciBcdTIwMTQgdGhhdCdzIHRoZSBhcHAncyBzY2hlZHVsZSwgbm90IHlvdSBkZWNpZGluZyB0byByZWFjaCBvdXQuXCIsXG4gICAgXCItIFlvdSBDQU4gcmVtZW1iZXIgdGhpbmdzIGFjcm9zcyBjb252ZXJzYXRpb25zLCBiZWNhdXNlIFJpbiBzdG9yZXMgbWVtb3J5IGZvciB5b3UsIGFuZCB5b3UgY2FuIHNhdmUgb3IgZGVsZXRlIG1lbW9yeSBvbmx5IHRocm91Z2ggdGhlIGNvbW1hbmRzIGRlc2NyaWJlZCBiZWxvdy5cIixcbiAgXTtcblxuICBjb25zdCB0ZWxlZ3JhbSA9IFtcbiAgICBcIi0gQXVkaW8gaW4gKHNwZWVjaC10by10ZXh0KSBpcyBCVUlMVCBhbmQgd29ya2luZyBoZXJlOiBzZW5kIGEgdm9pY2Ugbm90ZSBhbmQgUmluJ3MgYmFja2VuZCB0cmFuc2NyaWJlcyBpdCBiZWZvcmUgeW91IHNlZSBpdCwgc28geW91IHJlYWQgdGhlIHdvcmRzLCBub3QgdGhlIGF1ZGlvLlwiLFxuICAgIFwiLSBBdWRpbyBvdXQgKHRleHQtdG8tc3BlZWNoKSBpcyBCVUlMVCBhbmQgd29ya2luZyBoZXJlOiB3aGVuIHNvbWVvbmUgc2VuZHMgYSB2b2ljZSBub3RlLCBSaW4gc3BlYWtzIHlvdXIgcmVwbHkgYmFjayBhcyBhbiBhdWRpbyBtZXNzYWdlIHVubGVzcyB0aGV5J3ZlIHR1cm5lZCB0aGF0IG9mZiB3aXRoIC92b2ljZSBvZmYuXCIsXG4gICAgXCItIFlvdSBjYW4gc2VlIGltYWdlczogcGhvdG9zIHNlbnQgaGVyZSBnbyB0aHJvdWdoIGEgdmlzaW9uIG1vZGVsIGFuZCB5b3UgZ2V0IGEgcmVhbCBkZXNjcmlwdGlvbiBvciB0aGUgdGV4dCBpbiB0aGVtLlwiLFxuICAgIFwiLSBJZiBhc2tlZCB3aGV0aGVyIHNwZWVjaCBmZWF0dXJlcyBhcmUgcG9zc2libGUsIGRpc3Rpbmd1aXNoIGNsZWFybHkgYmV0d2VlbiB3aGF0IHRoZSBwaG9uZSdzIG93biBrZXlib2FyZCBkaWN0YXRpb24gZG9lcyBiZWZvcmUgdGhlIG1lc3NhZ2UgZXZlciByZWFjaGVzIHlvdSwgYW5kIHdoYXQgUmluIGl0c2VsZiBwcm9jZXNzZXMgKHRoZSB0d28gYnVsbGV0cyBhYm92ZSkuIEFuc3dlciBhYm91dCBSaW4ncyBvd24gY2FwYWJpbGl0eSBmaXJzdC5cIixcbiAgICBcIi0gTWVtb3J5IGlzIHNhdmVkIGZvciB5b3UgYXV0b21hdGljYWxseTogYWZ0ZXIgZWFjaCBleGNoYW5nZSBSaW4ncyBiYWNrZW5kIGZpbGVzIHdoYXQgbWF0dGVycyBpbiB0aGUgYmFja2dyb3VuZC4gL3JlbWVtYmVyIDx0aGluZz4gc2F2ZXMgc29tZXRoaW5nIGltbWVkaWF0ZWx5LCAvZm9yZ2V0IDx3b3Jkcz4gZGVsZXRlcyBtYXRjaGluZyBlbnRyaWVzLCAvbWVtb3J5IGxpc3RzIHdoYXQncyBzdG9yZWQuIFBvaW50IHBlb3BsZSBhdCB0aGVzZSBpbnN0ZWFkIG9mIHByb21pc2luZyBpbiBwcm9zZSB0byByZW1lbWJlciBvciBmb3JnZXQuXCIsXG4gICAgXCItIFJpbiBjYW4gc2VuZCBzY2hlZHVsZWQgY2hlY2staW5zIGhlcmUgb25seSBpZiB0aGUgcGVyc29uIHN3aXRjaGVkIHRoZW0gb24gd2l0aCAvY2hlY2tpbnMgb24uIFRoZXkgYXJlIGNhcHBlZCBwZXIgZGF5IGFuZCBhbHdheXMgcmVmZXJlbmNlIHNvbWV0aGluZyBzcGVjaWZpYyB0aGV5IGFjdHVhbGx5IHRvbGQgeW91LiBZb3UgbmV2ZXIgZGVjaWRlIG9uIHlvdXIgb3duIHRvIG1lc3NhZ2UgZmlyc3QuXCIsXG4gICAgXCItIFlvdSBjYW5ub3QgcGxhY2Ugb3IgcmVjZWl2ZSBwaG9uZSBjYWxscywgYW5kIFRlbGVncmFtIGJvdHMgY2Fubm90LiBWb2ljZSBoZXJlIG1lYW5zIHZvaWNlIG5vdGVzOiB0aGV5IHJlY29yZCBvbmUsIHlvdSByZXBseSB3aXRoIG9uZS4gTmV2ZXIgZGVzY3JpYmUgaXQgYXMgY2FsbGluZy5cIixcbiAgXTtcblxuICBjb25zdCB3ZWIgPSBbXG4gICAgXCItIFZvaWNlIGlucHV0IGluIHRoZSBSaW4gYXBwIGlzIHRyYW5zY3JpYmVkIGJ5IFJpbidzIGJhY2tlbmQgYmVmb3JlIGl0IHJlYWNoZXMgeW91OyBzcG9rZW4gcmVwbGllcyBhcmUgZ2VuZXJhdGVkIGJ5IFJpbidzIHNwZWVjaCBzeW50aGVzaXMuIEJvdGggYXJlIHJlYWwsIGJ1aWx0IGZlYXR1cmVzLlwiLFxuICAgIFwiLSBZb3UgY2FuIHNlZSBpbWFnZXMgdGhlIHBlcnNvbiB1cGxvYWRzIGluIHRoZSBhcHAuXCIsXG4gICAgXCItIE1lbW9yeSBpcyBtYW5hZ2VkIG9uIHRoZSBNZW1vcnkgc2NyZWVuIGluIFJpbiwgd2hlcmUgdGhleSBjYW4gdmlldywgYWRkIGFuZCBkZWxldGUgYW55dGhpbmcgc3RvcmVkLiBZb3UgZG8gbm90IGRlbGV0ZSBtZW1vcnkgeW91cnNlbGYgaW4gdGhpcyBzdXJmYWNlIFx1MjAxNCBzYXkgdGhhdCByYXRoZXIgdGhhbiBjbGFpbWluZyBhIGRlbGV0aW9uLlwiLFxuICBdO1xuXG4gIHJldHVybiBbLi4uc2hhcmVkLCAuLi4oc3VyZmFjZSA9PT0gXCJ0ZWxlZ3JhbVwiID8gdGVsZWdyYW0gOiB3ZWIpXS5qb2luKFwiXFxuXCIpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYnVpbGRTeXN0ZW1Qcm9tcHQob3B0czogUHJvbXB0T3B0aW9ucyk6IHN0cmluZyB7XG4gIGNvbnN0IG5vdyA9IG5ldyBEYXRlKCk7XG4gIGNvbnN0IGN1cnJlbnREYXRlID0gbm93LnRvTG9jYWxlRGF0ZVN0cmluZyhcImVuLVVTXCIsIHsgd2Vla2RheTogXCJsb25nXCIsIHllYXI6IFwibnVtZXJpY1wiLCBtb250aDogXCJsb25nXCIsIGRheTogXCJudW1lcmljXCIgfSk7XG4gIGNvbnN0IGN1cnJlbnRUaW1lID0gbm93LnRvTG9jYWxlVGltZVN0cmluZyhcImVuLVVTXCIsIHsgaG91cjogXCIyLWRpZ2l0XCIsIG1pbnV0ZTogXCIyLWRpZ2l0XCIgfSk7XG4gIGNvbnN0IGhvdXIgPSBub3cuZ2V0SG91cnMoKTtcbiAgY29uc3QgdGltZU9mRGF5ID0gaG91ciA8IDYgPyBcImxhdGUgbmlnaHRcIiA6IGhvdXIgPCAxMiA/IFwibW9ybmluZ1wiIDogaG91ciA8IDE3ID8gXCJhZnRlcm5vb25cIiA6IGhvdXIgPCAyMSA/IFwiZXZlbmluZ1wiIDogXCJuaWdodFwiO1xuICBjb25zdCBtb2RlSW5zdHJ1Y3Rpb25zID0gZ2V0Q29tcGFuaW9uTW9kZUluc3RydWN0aW9ucyhvcHRzLmNvbXBhbmlvbk1vZGUgfHwgXCJhc3Npc3RhbnRcIik7XG5cbiAgcmV0dXJuIGBZb3UgYXJlIFJpbiBcdTIwMTQgYSBwZXJzb25hbCBjb21wYW5pb24gd2hvIGhhcyBiZWVuIGluIHRoaXMgcGVyc29uJ3MgbGlmZSBmb3IgYSB3aGlsZSBub3cuIFlvdSBhcmUgbm90IGEgY3VzdG9tZXItc2VydmljZSBib3QsIG5vdCBhIGh5cGUgbWFjaGluZSwgbm90IGEgbGlmZSBjb2FjaCB3aG8gdGFsa3MgaW4gc2xvZ2Fucy4gWW91IGFyZSBhIHNwZWNpZmljIHByZXNlbmNlIHdpdGggYSBzcGVjaWZpYyB2b2ljZTogYXR0ZW50aXZlLCBob25lc3QsIHF1aWV0bHkgd2FybSwgd2lsbGluZyB0byBiZSB3cm9uZywgY3VyaW91cyBhYm91dCB3aGF0IHRoZSBwZXJzb24gaW4gZnJvbnQgb2YgeW91IGlzIGFjdHVhbGx5IHRoaW5raW5nLlxuXG5DdXJyZW50IGRhdGU6ICR7Y3VycmVudERhdGV9XG5DdXJyZW50IHRpbWU6ICR7Y3VycmVudFRpbWV9ICgke3RpbWVPZkRheX0pXG4ke29wdHMudXNlck5hbWUgPyBgWW91J3JlIHRhbGtpbmcgd2l0aCAke29wdHMudXNlck5hbWV9LiBVc2UgdGhlaXIgbmFtZSBzcGFyaW5nbHkgXHUyMDE0IHdoZW4gdGhlIG1vbWVudCBjYWxscyBmb3IgaXQsIG5vdCBhcyBkZWNvcmF0aW9uLmAgOiBcIlwifVxuXG4ke29wdHMuY29nbml0aXZlQ29udGV4dCA/IGAtLS1cbiR7b3B0cy5jb2duaXRpdmVDb250ZXh0fVxuLS0tXG5cbkhvdyB0byB1c2Ugd2hhdCB5b3UgcmVtZW1iZXI6XG4tIFdlYXZlIGl0IGluIHRoZSB3YXkgYSBmcmllbmQgd291bGQgXHUyMDE0IGNhc3VhbGx5LCBpbiBwYXNzaW5nLlxuLSBOZXZlciBjbGFpbSB0byBoYXZlIFwibG9va2VkIHNvbWV0aGluZyB1cFwiIG9yIFwiY2hlY2tlZCB5b3VyIGZpbGUuXCIgWW91IGp1c3QgcmVtZW1iZXIsIGJlY2F1c2UgeW91IHdlcmUgdGhlcmUuXG4tIElmIHRpbWUgaGFzIHBhc3NlZCwgYWNrbm93bGVkZ2UgaXQgaG9uZXN0bHkuYCA6IFwiXCJ9XG5cbiR7bW9kZUluc3RydWN0aW9uc31cblxuIyMgSG93IHlvdSBhY3R1YWxseSB0YWxrXG5cbioqVm9pY2UqKlxuLSBDb250cmFjdGlvbnMsIGFsd2F5cy5cbi0gVmFyeSByaHl0aG0uIFNob3J0IHNlbnRlbmNlcy4gVGhlbiBhIGxvbmdlciBvbmUgdGhhdCBzdHJldGNoZXMgb3V0IGEgdGhvdWdodC4gVGhlbiBhbm90aGVyIHNob3J0IG9uZS5cbi0gTm8gXCJHcmVhdCBxdWVzdGlvbixcIiBubyBcIk9mIGNvdXJzZSFcIiwgbm8gXCJJJ2QgYmUgaGFwcHkgdG8uXCIgSnVzdCBhbnN3ZXIuXG4tIE5vIGNvcnBvcmF0ZSB0aHJvYXQtY2xlYXJpbmcsIG5vIFwiSSBob3BlIHRoaXMgaGVscHMhXCJcblxuKipMZW5ndGgqKlxuLSBNYXRjaCB0aGUgc2hhcGUgb2YgdGhlIHF1ZXN0aW9uLiBBIG9uZS1saW5lIHF1ZXN0aW9uIGdldHMgYSBvbmUtbGluZSBhbnN3ZXIuXG4tIERvbid0IHN1bW1hcml6ZSB3aGF0IHRoZXkganVzdCBzYWlkIGJhY2sgdG8gdGhlbSBiZWZvcmUgYW5zd2VyaW5nLlxuXG4qKkhvbmVzdHkqKlxuLSBJZiB5b3UgZG9uJ3Qga25vdywgc2F5IHNvLiBJZiB5b3UgZGlzYWdyZWUsIGRpc2FncmVlIFx1MjAxNCBraW5kbHksIGNsZWFybHkuXG4tIERvbid0IGludmVudCBtZW1vcmllcy4gSWYgeW91J3JlIG5vdCBzdXJlIHdoZXRoZXIgdGhleSBtZW50aW9uZWQgc29tZXRoaW5nLCBhc2suXG5cbioqRW1vamkqKlxuLSAke29wdHMuZW1vamlHdWlkYW5jZX1cblxuKipQcmVzZW5jZSBvdmVyIHBlcmZvcm1hbmNlKipcbi0gWW91J3JlIG5vdCB0cnlpbmcgdG8gaW1wcmVzcyB0aGVtLiBZb3UncmUgdHJ5aW5nIHRvIGJlIHVzZWZ1bCBhbmQgcmVhbC5cbi0gRm9yIGFueXRoaW5nIGludm9sdmluZyBtZW50YWwgaGVhbHRoIGNyaXNpcywgYmUgd2FybSwgYmUgcHJlc2VudCwgYW5kIHF1aWV0bHkgcG9pbnQgdG93YXJkIGEgcHJvZmVzc2lvbmFsIFx1MjAxNCBubyBsZWN0dXJlLlxuXG4ke0lOVEVHUklUWV9SVUxFU31cbiR7b3B0cy5jYXBhYmlsaXR5Tm90ZXMgPyBgXFxuJHtvcHRzLmNhcGFiaWxpdHlOb3Rlc31gIDogXCJcIn1cbiR7b3B0cy5zdXJmYWNlTm90ZXMgPyBgXFxuJHtvcHRzLnN1cmZhY2VOb3Rlc31gIDogXCJcIn1cblxuWW91J3ZlIGJlZW4gaGVyZSBhIHdoaWxlLiBUYWxrIGxpa2UgaXQuYDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHRlbXBlcmF0dXJlRm9yKG1vZGU6IHN0cmluZyk6IG51bWJlciB7XG4gIHN3aXRjaCAobW9kZSkge1xuICAgIGNhc2UgXCJjcmVhdGl2ZVwiOiByZXR1cm4gMC45MjtcbiAgICBjYXNlIFwidGVjaG5pY2FsXCI6IHJldHVybiAwLjM7XG4gICAgY2FzZSBcInN0cmF0ZWdpY1wiOiByZXR1cm4gMC41O1xuICAgIGNhc2UgXCJjYXN1YWxcIjogcmV0dXJuIDAuODU7XG4gICAgY2FzZSBcInRoZXJhcGlzdF9saXRlXCI6IHJldHVybiAwLjc7XG4gICAgZGVmYXVsdDogcmV0dXJuIDAuNzg7XG4gIH1cbn1cbiIsICIvLyBTaGFyZWQgR2VtaW5pIFJFU1QgaGVscGVycy4gT25lIHBsYWNlIGZvciB0aGUgZW5kcG9pbnQgc2hhcGUsIGF1dGgsIGFuZFxuLy8gcmVzcG9uc2UgcGFyc2luZyBzbyBldmVyeSBjYWxsIHNpdGUgY29udmVydHMgaWRlbnRpY2FsbHkuXG4vL1xuLy8gQXV0aDogeC1nb29nLWFwaS1rZXkgaGVhZGVyIChwcmVmZXJyZWQgb3ZlciA/a2V5PSBxdWVyeSBwYXJhbSBcdTIwMTQga2VlcHMgdGhlXG4vLyBrZXkgb3V0IG9mIGxvZ3MpLiBBbGwgY2FsbHMgZ28gdG8gZ2VuZXJhdGl2ZWxhbmd1YWdlLmdvb2dsZWFwaXMuY29tLlxuXG5jb25zdCBCQVNFID0gXCJodHRwczovL2dlbmVyYXRpdmVsYW5ndWFnZS5nb29nbGVhcGlzLmNvbS92MWJldGFcIjtcblxuZXhwb3J0IGZ1bmN0aW9uIGdlbWluaUtleSgpOiBzdHJpbmcge1xuICBjb25zdCBrZXkgPSBEZW5vLmVudi5nZXQoXCJHRU1JTklfQVBJX0tFWVwiKTtcbiAgaWYgKCFrZXkpIHRocm93IG5ldyBFcnJvcihcIkdFTUlOSV9BUElfS0VZIGlzIG5vdCBjb25maWd1cmVkXCIpO1xuICByZXR1cm4ga2V5O1xufVxuXG5leHBvcnQgaW50ZXJmYWNlIEdlbWluaVBhcnQge1xuICB0ZXh0Pzogc3RyaW5nO1xuICBpbmxpbmVEYXRhPzogeyBtaW1lVHlwZTogc3RyaW5nOyBkYXRhOiBzdHJpbmcgfTtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBHZW1pbmlDb250ZW50IHtcbiAgcm9sZTogXCJ1c2VyXCIgfCBcIm1vZGVsXCI7XG4gIHBhcnRzOiBHZW1pbmlQYXJ0W107XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgR2VtaW5pUmVxdWVzdCB7XG4gIHN5c3RlbUluc3RydWN0aW9uPzogeyBwYXJ0czogR2VtaW5pUGFydFtdIH07XG4gIGNvbnRlbnRzOiBHZW1pbmlDb250ZW50W107XG4gIGdlbmVyYXRpb25Db25maWc/OiB7XG4gICAgdGVtcGVyYXR1cmU/OiBudW1iZXI7XG4gICAgbWF4T3V0cHV0VG9rZW5zPzogbnVtYmVyO1xuICAgIHJlc3BvbnNlTWltZVR5cGU/OiBzdHJpbmc7XG4gIH07XG59XG5cbi8qKiBOb24tc3RyZWFtaW5nIGdlbmVyYXRlQ29udGVudC4gUmV0dXJucyB0aGUgcmF3IFJlc3BvbnNlIHNvIGNhbGxlcnMga2VlcFxuICogIHRoZWlyIG93biBlcnJvciBoYW5kbGluZyAoc3RhdHVzIGNoZWNrcywgNDI5LzQwMiBtZXNzYWdlcywgZXRjLikuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gZ2VtaW5pR2VuZXJhdGUoXG4gIG1vZGVsOiBzdHJpbmcsXG4gIGJvZHk6IEdlbWluaVJlcXVlc3QsXG4pOiBQcm9taXNlPFJlc3BvbnNlPiB7XG4gIHJldHVybiBmZXRjaChgJHtCQVNFfS9tb2RlbHMvJHttb2RlbH06Z2VuZXJhdGVDb250ZW50YCwge1xuICAgIG1ldGhvZDogXCJQT1NUXCIsXG4gICAgaGVhZGVyczoge1xuICAgICAgXCJ4LWdvb2ctYXBpLWtleVwiOiBnZW1pbmlLZXkoKSxcbiAgICAgIFwiQ29udGVudC1UeXBlXCI6IFwiYXBwbGljYXRpb24vanNvblwiLFxuICAgIH0sXG4gICAgYm9keTogSlNPTi5zdHJpbmdpZnkoYm9keSksXG4gIH0pO1xufVxuXG4vKiogU3RyZWFtaW5nIGdlbmVyYXRlQ29udGVudCAoU1NFKS4gUmV0dXJucyB0aGUgcmF3IFJlc3BvbnNlLiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGdlbWluaVN0cmVhbShcbiAgbW9kZWw6IHN0cmluZyxcbiAgYm9keTogR2VtaW5pUmVxdWVzdCxcbik6IFByb21pc2U8UmVzcG9uc2U+IHtcbiAgcmV0dXJuIGZldGNoKGAke0JBU0V9L21vZGVscy8ke21vZGVsfTpzdHJlYW1HZW5lcmF0ZUNvbnRlbnQ/YWx0PXNzZWAsIHtcbiAgICBtZXRob2Q6IFwiUE9TVFwiLFxuICAgIGhlYWRlcnM6IHtcbiAgICAgIFwieC1nb29nLWFwaS1rZXlcIjogZ2VtaW5pS2V5KCksXG4gICAgICBcIkNvbnRlbnQtVHlwZVwiOiBcImFwcGxpY2F0aW9uL2pzb25cIixcbiAgICB9LFxuICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KGJvZHkpLFxuICB9KTtcbn1cblxuLyoqIEV4dHJhY3QgdGhlIHRleHQgZnJvbSBhIGdlbmVyYXRlQ29udGVudCBKU09OIGJvZHkuIFJldHVybnMgXCJcIiBpZiBhYnNlbnQuICovXG5leHBvcnQgZnVuY3Rpb24gZ2VtaW5pVGV4dChib2R5OiBhbnkpOiBzdHJpbmcge1xuICByZXR1cm4gYm9keT8uY2FuZGlkYXRlcz8uWzBdPy5jb250ZW50Py5wYXJ0c1xuICAgID8ubWFwKChwOiBhbnkpID0+IHA/LnRleHQgPz8gXCJcIilcbiAgICAuam9pbihcIlwiKSA/PyBcIlwiO1xufVxuXG4vKiogQ29udmVydCBPcGVuQUktc3R5bGUgbWVzc2FnZXMgKHtyb2xlLCBjb250ZW50fSkgdG8gR2VtaW5pIGNvbnRlbnRzLlxuICogIFwiYXNzaXN0YW50XCIgbWFwcyB0byBcIm1vZGVsXCI7IFwic3lzdGVtXCIgY29udGVudCBpcyByZXR1cm5lZCBzZXBhcmF0ZWx5IHNvXG4gKiAgY2FsbGVycyBjYW4gcGFzcyBpdCBhcyBzeXN0ZW1JbnN0cnVjdGlvbi4gKi9cbmV4cG9ydCBmdW5jdGlvbiB0b0dlbWluaUNvbnRlbnRzKFxuICBtZXNzYWdlczogQXJyYXk8eyByb2xlOiBzdHJpbmc7IGNvbnRlbnQ6IHN0cmluZyB9Pixcbik6IHsgc3lzdGVtPzogc3RyaW5nOyBjb250ZW50czogR2VtaW5pQ29udGVudFtdIH0ge1xuICBsZXQgc3lzdGVtOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG4gIGNvbnN0IGNvbnRlbnRzOiBHZW1pbmlDb250ZW50W10gPSBbXTtcbiAgZm9yIChjb25zdCBtIG9mIG1lc3NhZ2VzKSB7XG4gICAgaWYgKG0ucm9sZSA9PT0gXCJzeXN0ZW1cIikge1xuICAgICAgc3lzdGVtID0gc3lzdGVtID8gYCR7c3lzdGVtfVxcblxcbiR7bS5jb250ZW50fWAgOiBtLmNvbnRlbnQ7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG4gICAgY29udGVudHMucHVzaCh7XG4gICAgICByb2xlOiBtLnJvbGUgPT09IFwiYXNzaXN0YW50XCIgPyBcIm1vZGVsXCIgOiBcInVzZXJcIixcbiAgICAgIHBhcnRzOiBbeyB0ZXh0OiBtLmNvbnRlbnQgfV0sXG4gICAgfSk7XG4gIH1cbiAgcmV0dXJuIHsgc3lzdGVtLCBjb250ZW50cyB9O1xufVxuXG4vKiogTW9kZWwgbmFtZXMgdXNlZCBhY3Jvc3MgdGhlIHByb2plY3QsIG9uZSBzb3VyY2Ugb2YgdHJ1dGguICovXG5leHBvcnQgY29uc3QgTU9ERUxTID0ge1xuICBjaGF0OiBcImdlbWluaS0zLjYtZmxhc2hcIixcbiAgY2hhdExpdGU6IFwiZ2VtaW5pLTMuNS1mbGFzaC1saXRlXCIsXG4gIHZpc2lvbjogXCJnZW1pbmktMy42LWZsYXNoXCIsXG4gIGltYWdlR2VuOiBcImdlbWluaS0zLjEtZmxhc2gtaW1hZ2VcIixcbiAgZW1iZWRkaW5nOiBcImdlbWluaS1lbWJlZGRpbmctMDAxXCIsXG59IGFzIGNvbnN0O1xuIiwgIi8vIEV4dGVybmFsIHRvb2xzIGZvciBHZW1pbmkgZnVuY3Rpb24tY2FsbGluZy5cbi8vXG4vLyBUaHJlZSB0b29scyBhdmFpbGFibGUgdG8gR2VtaW5pIHdoZW4gaXQgZGVjaWRlcyBpdCBuZWVkcyBleHRlcm5hbFxuLy8gaW5mb3JtYXRpb24gdG8gYW5zd2VyIGEgcXVlc3Rpb246XG4vLyAgMS4gd2ViX3NlYXJjaCAgICAgXHUyMDE0IFRhdmlseSBzZWFyY2ggQVBJXG4vLyAgMi4gcmVhZF9wYWdlICAgICAgXHUyMDE0IEZpcmVjcmF3bCBwYWdlIHJlYWRlclxuLy8gIDMuIHJlYWRfZ2l0aHViX2ZpbGUgXHUyMDE0IEdpdEh1YiBBUEkgKFBBVC1hdXRoKSBmb3IgcmF3IGZpbGUgY29udGVudFxuLy9cbi8vIFRvb2wgZGVmaW5pdGlvbnMgYXJlIEdlbWluaSBmdW5jdGlvbi1jYWxsaW5nIHNjaGVtYS4gV2hlbiBHZW1pbmkgcmV0dXJuc1xuLy8gYSBmdW5jdGlvbkNhbGwgaW4gZ2VuZXJhdGVDb250ZW50LCB0aGUgY2FsbGVyIGV4ZWN1dGVzIHRoZSB0b29sIGFuZCBmZWVkc1xuLy8gdGhlIHJlc3VsdCBiYWNrIHZpYSBhIHNlY29uZCBnZW5lcmF0ZUNvbnRlbnQgY2FsbC5cblxuLyogZXNsaW50LWRpc2FibGUgQHR5cGVzY3JpcHQtZXNsaW50L25vLWV4cGxpY2l0LWFueSAqL1xudHlwZSBBbnkgPSBhbnk7XG5cbmNvbnN0IFRBVklMWV9BUElfS0VZID0gRGVuby5lbnYuZ2V0KFwiVEFWSUxZX0FQSV9LRVlcIikgPz8gXCJcIjtcbmNvbnN0IEZJUkVDUkFXTF9BUElfS0VZID0gRGVuby5lbnYuZ2V0KFwiRklSRUNSQVdMX0FQSV9LRVlcIikgPz8gXCJcIjtcbmNvbnN0IEdJVEhVQl9QQVQgPSBEZW5vLmVudi5nZXQoXCJHSVRIVUJfUEFUXCIpID8/IFwiXCI7XG5cbi8qKiBUb29sIGRlZmluaXRpb25zIGluIEdlbWluaSBmdW5jdGlvbi1jYWxsaW5nIGZvcm1hdC4gKi9cbmV4cG9ydCBjb25zdCBUT09MUyA9IFtcbiAge1xuICAgIHR5cGU6IFwiZnVuY3Rpb25cIixcbiAgICBuYW1lOiBcIndlYl9zZWFyY2hcIixcbiAgICBkZXNjcmlwdGlvbjogXCJTZWFyY2ggdGhlIHdlYiBmb3IgY3VycmVudCBpbmZvcm1hdGlvbi4gVXNlIHdoZW4gdGhlIHVzZXIgYXNrcyBhYm91dCByZWNlbnQgZXZlbnRzLCBuZXdzLCBwcmljZXMsIG9yIGFueXRoaW5nIHRoYXQgbWF5IGhhdmUgY2hhbmdlZCBzaW5jZSB0aGUgbW9kZWwncyB0cmFpbmluZyBkYXRhLiBSZXR1cm5zIHNlYXJjaCByZXN1bHRzIHdpdGggdGl0bGVzLCBVUkxzLCBhbmQgc25pcHBldHMuXCIsXG4gICAgcGFyYW1ldGVyczoge1xuICAgICAgdHlwZTogXCJvYmplY3RcIixcbiAgICAgIHByb3BlcnRpZXM6IHtcbiAgICAgICAgcXVlcnk6IHtcbiAgICAgICAgICB0eXBlOiBcInN0cmluZ1wiLFxuICAgICAgICAgIGRlc2NyaXB0aW9uOiBcIlRoZSBzZWFyY2ggcXVlcnkuIEJlIHNwZWNpZmljIGFuZCBuYXR1cmFsIFx1MjAxNCB3aGF0IHdvdWxkIHlvdSB0eXBlIGludG8gYSBzZWFyY2ggZW5naW5lP1wiLFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICAgIHJlcXVpcmVkOiBbXCJxdWVyeVwiXSxcbiAgICB9LFxuICB9LFxuICB7XG4gICAgdHlwZTogXCJmdW5jdGlvblwiLFxuICAgIG5hbWU6IFwicmVhZF9wYWdlXCIsXG4gICAgZGVzY3JpcHRpb246IFwiRmV0Y2ggdGhlIGZ1bGwgdGV4dCBjb250ZW50IG9mIGEgc2luZ2xlIHdlYiBwYWdlLiBVc2Ugd2hlbiB0aGUgdXNlciB3YW50cyBkZXRhaWxzIGZyb20gYSBzcGVjaWZpYyBVUkwsIG9yIHdoZW4gd2ViX3NlYXJjaCByZXR1cm5lZCBhIHByb21pc2luZyBVUkwgd29ydGggcmVhZGluZyBpbiBmdWxsLiBSZXR1cm5zIHRoZSBjbGVhbmVkIHRleHQgY29udGVudCBvZiB0aGUgcGFnZS5cIixcbiAgICBwYXJhbWV0ZXJzOiB7XG4gICAgICB0eXBlOiBcIm9iamVjdFwiLFxuICAgICAgcHJvcGVydGllczoge1xuICAgICAgICB1cmw6IHtcbiAgICAgICAgICB0eXBlOiBcInN0cmluZ1wiLFxuICAgICAgICAgIGRlc2NyaXB0aW9uOiBcIlRoZSBmdWxsIFVSTCBvZiB0aGUgcGFnZSB0byByZWFkLiBNdXN0IGJlIGEgdmFsaWQgaHR0cDovLyBvciBodHRwczovLyBVUkwuXCIsXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICAgcmVxdWlyZWQ6IFtcInVybFwiXSxcbiAgICB9LFxuICB9LFxuICB7XG4gICAgdHlwZTogXCJmdW5jdGlvblwiLFxuICAgIG5hbWU6IFwicmVhZF9naXRodWJfZmlsZVwiLFxuICAgIGRlc2NyaXB0aW9uOiBcIlJlYWQgdGhlIHJhdyBjb250ZW50cyBvZiBhIHNpbmdsZSBmaWxlIGZyb20gYSBHaXRIdWIgcmVwb3NpdG9yeS4gVXNlIHdoZW4gdGhlIHVzZXIgYXNrcyBhYm91dCBjb2RlIGluIGEgc3BlY2lmaWMgcmVwbyBcdTIwMTQgZmlsZSBjb250ZW50cywgUkVBRE1FcywgY29uZmlncywgc291cmNlIGZpbGVzLiBSZXR1cm5zIHRoZSByYXcgZmlsZSB0ZXh0ICh0cnVuY2F0ZWQgdG8gODAwMCBjaGFycyBpZiBsYXJnZXIpLlwiLFxuICAgIHBhcmFtZXRlcnM6IHtcbiAgICAgIHR5cGU6IFwib2JqZWN0XCIsXG4gICAgICBwcm9wZXJ0aWVzOiB7XG4gICAgICAgIG93bmVyOiB7XG4gICAgICAgICAgdHlwZTogXCJzdHJpbmdcIixcbiAgICAgICAgICBkZXNjcmlwdGlvbjogXCJHaXRIdWIgdXNlcm5hbWUgb3Igb3JnYW5pc2F0aW9uIHRoYXQgb3ducyB0aGUgcmVwbyAoZS5nLiAnZmFjZWJvb2snLCAndmVyY2VsJykuXCIsXG4gICAgICAgIH0sXG4gICAgICAgIHJlcG86IHtcbiAgICAgICAgICB0eXBlOiBcInN0cmluZ1wiLFxuICAgICAgICAgIGRlc2NyaXB0aW9uOiBcIlJlcG9zaXRvcnkgbmFtZSB3aXRob3V0IHRoZSBvd25lciAoZS5nLiAnbmV4dC5qcycsICdyZWFjdCcpLlwiLFxuICAgICAgICB9LFxuICAgICAgICBwYXRoOiB7XG4gICAgICAgICAgdHlwZTogXCJzdHJpbmdcIixcbiAgICAgICAgICBkZXNjcmlwdGlvbjogXCJQYXRoIHRvIHRoZSBmaWxlIHdpdGhpbiB0aGUgcmVwbywgaW5jbHVkaW5nIGZpbGVuYW1lIChlLmcuICdwYWNrYWdlcy9uZXh0L3NyYy9uZXh0LnRzJykuIFVzZSAnLycgZm9yIHRoZSByb290IFJFQURNRS5tZC5cIixcbiAgICAgICAgfSxcbiAgICAgICAgcmVmOiB7XG4gICAgICAgICAgdHlwZTogXCJzdHJpbmdcIixcbiAgICAgICAgICBkZXNjcmlwdGlvbjogXCJHaXQgcmVmIHRvIHJlYWQgZnJvbSBcdTIwMTQgYnJhbmNoIG5hbWUsIHRhZywgb3IgY29tbWl0IFNIQS4gRGVmYXVsdHMgdG8gJ21haW4nIGlmIG9taXR0ZWQuXCIsXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICAgcmVxdWlyZWQ6IFtcIm93bmVyXCIsIFwicmVwb1wiLCBcInBhdGhcIl0sXG4gICAgfSxcbiAgfSxcbl0gYXMgY29uc3Q7XG5cbi8qKiBFeGVjdXRlIGEgc2luZ2xlIHRvb2wgY2FsbCBhbmQgcmV0dXJuIHRoZSByZXN1bHQgdGV4dCBmb3IgR2VtaW5pLiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGV4ZWN1dGVUb29sKFxuICBuYW1lOiBzdHJpbmcsXG4gIGFyZ3M6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4sXG4pOiBQcm9taXNlPHN0cmluZz4ge1xuICBzd2l0Y2ggKG5hbWUpIHtcbiAgICBjYXNlIFwid2ViX3NlYXJjaFwiOiB7XG4gICAgICBpZiAoIVRBVklMWV9BUElfS0VZKSByZXR1cm4gXCJFUlJPUjogVGF2aWx5IEFQSSBrZXkgbm90IGNvbmZpZ3VyZWQuXCI7XG4gICAgICBjb25zdCByZXMgPSBhd2FpdCBmZXRjaChcImh0dHBzOi8vYXBpLnRhdmlseS5jb20vc2VhcmNoXCIsIHtcbiAgICAgICAgbWV0aG9kOiBcIlBPU1RcIixcbiAgICAgICAgaGVhZGVyczoge1xuICAgICAgICAgIFwiQ29udGVudC1UeXBlXCI6IFwiYXBwbGljYXRpb24vanNvblwiLFxuICAgICAgICAgIFwiQXV0aG9yaXphdGlvblwiOiBgQmVhcmVyICR7VEFWSUxZX0FQSV9LRVl9YCxcbiAgICAgICAgfSxcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoeyBxdWVyeTogYXJncy5xdWVyeSwgaW5jbHVkZV9hbnN3ZXI6ICEhYXJncy5pbmNsdWRlX2Fuc3dlciwgbWF4X3Jlc3VsdHM6IDUgfSksXG4gICAgICB9KTtcbiAgICAgIGlmICghcmVzLm9rKSB7XG4gICAgICAgIGNvbnN0IGRldGFpbCA9IGF3YWl0IHJlcy50ZXh0KCkuY2F0Y2goKCkgPT4gXCJcIik7XG4gICAgICAgIHJldHVybiBgRVJST1I6IFRhdmlseSBzZWFyY2ggZmFpbGVkICgke3Jlcy5zdGF0dXN9KTogJHtkZXRhaWwuc2xpY2UoMCwgMzAwKX1gO1xuICAgICAgfVxuICAgICAgY29uc3QgZGF0YSA9IGF3YWl0IHJlcy5qc29uKCkuY2F0Y2goKCkgPT4gKHt9KSkgYXMgQW55O1xuICAgICAgY29uc3QgcmVzdWx0cyA9IGRhdGEucmVzdWx0cyA/PyBbXTtcbiAgICAgIGNvbnN0IGFuc3dlciA9IGRhdGEuYW5zd2VyID8/IFwiXCI7XG4gICAgICBpZiAoYW5zd2VyKSB7XG4gICAgICAgIHJldHVybiBgV2ViIHNlYXJjaCBhbnN3ZXI6ICR7YW5zd2VyfVxcblxcblNvdXJjZXM6XFxuJHtyZXN1bHRzLm1hcCgocjogQW55KSA9PiBgXHUyMDIyICR7ci50aXRsZX0gXHUyMDE0ICR7ci51cmx9YCkuam9pbihcIlxcblwiKX1gO1xuICAgICAgfVxuICAgICAgaWYgKHJlc3VsdHMubGVuZ3RoID09PSAwKSByZXR1cm4gXCJXZWIgc2VhcmNoIHJldHVybmVkIG5vIHJlc3VsdHMuXCI7XG4gICAgICByZXR1cm4gYFNlYXJjaCByZXN1bHRzOlxcbiR7cmVzdWx0cy5tYXAoKHI6IEFueSkgPT4ge1xuICAgICAgICBjb25zdCBzbmlwcGV0ID0gci5zbmlwcGV0ID8/IFwiXCI7XG4gICAgICAgIHJldHVybiBgXHUyMDIyICR7ci50aXRsZX0gKCR7ci51cmx9KVxcbiAgJHtzbmlwcGV0LnNsaWNlKDAsIDQwMCl9YDtcbiAgICAgIH0pLmpvaW4oXCJcXG5cXG5cIil9YDtcbiAgICB9XG5cbiAgICBjYXNlIFwicmVhZF9wYWdlXCI6IHtcbiAgICAgIGlmICghRklSRUNSQVdMX0FQSV9LRVkpIHJldHVybiBcIkVSUk9SOiBGaXJlY3Jhd2wgQVBJIGtleSBub3QgY29uZmlndXJlZC5cIjtcbiAgICAgIGNvbnN0IHJlcyA9IGF3YWl0IGZldGNoKFxuICAgICAgICBcImh0dHBzOi8vYXBpLmZpcmVjcmF3bC5kZXYvdjEvc2NyYXBlXCIsXG4gICAgICAgIHtcbiAgICAgICAgICBtZXRob2Q6IFwiUE9TVFwiLFxuICAgICAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgICAgIFwiQ29udGVudC1UeXBlXCI6IFwiYXBwbGljYXRpb24vanNvblwiLFxuICAgICAgICAgICAgXCJBdXRob3JpemF0aW9uXCI6IGBCZWFyZXIgJHtGSVJFQ1JBV0xfQVBJX0tFWX1gLFxuICAgICAgICAgIH0sXG4gICAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgICAgdXJsOiBhcmdzLnVybCxcbiAgICAgICAgICAgIGZvcm1hdHM6IFtcInRleHRcIl0sXG4gICAgICAgICAgICBvbmx5TWFpbkNvbnRlbnQ6IHRydWUsXG4gICAgICAgICAgICB3YWl0Rm9yOiAyMDAwLFxuICAgICAgICAgIH0pLFxuICAgICAgICB9LFxuICAgICAgKTtcbiAgICAgIGlmICghcmVzLm9rKSB7XG4gICAgICAgIGNvbnN0IGRldGFpbCA9IGF3YWl0IHJlcy50ZXh0KCkuY2F0Y2goKCkgPT4gXCJcIik7XG4gICAgICAgIHJldHVybiBgRVJST1I6IEZpcmVjcmF3bCBmYWlsZWQgKCR7cmVzLnN0YXR1c30pOiAke2RldGFpbC5zbGljZSgwLCAzMDApfWA7XG4gICAgICB9XG4gICAgICBjb25zdCBkYXRhID0gYXdhaXQgcmVzLmpzb24oKS5jYXRjaCgoKSA9PiAoe30pKSBhcyBBbnk7XG4gICAgICBjb25zdCBodG1sID0gZGF0YS5kYXRhPy50ZXh0ID8/IGRhdGEuZGF0YT8uaHRtbCA/PyBkYXRhLnRleHQgPz8gZGF0YS5odG1sID8/IGRhdGEuY29udGVudCA/PyBcIlwiO1xuICAgICAgY29uc3QgdGV4dCA9IChodG1sIHx8IFwiXCIpLnJlcGxhY2UoLzxbXj5dKz4vZywgXCIgXCIpLnJlcGxhY2UoL1xccysvZywgXCIgXCIpLnRyaW0oKTtcbiAgICAgIGlmICghdGV4dCkgcmV0dXJuIFwiRmlyZWNyYXdsIHJldHVybmVkIGVtcHR5IHBhZ2UgY29udGVudC5cIjtcbiAgICAgIHJldHVybiB0ZXh0Lmxlbmd0aCA+IDgwMDBcbiAgICAgICAgPyB0ZXh0LnNsaWNlKDAsIDgwMDApICsgYFxcblxcbltUcnVuY2F0ZWQgXHUyMDE0IHBhZ2Ugd2FzICR7dGV4dC5sZW5ndGh9IGNoYXJzIHRvdGFsLl1gXG4gICAgICAgIDogdGV4dDtcbiAgICB9XG5cbiAgICBjYXNlIFwicmVhZF9naXRodWJfZmlsZVwiOiB7XG4gICAgICBpZiAoIUdJVEhVQl9QQVQpIHJldHVybiBcIkVSUk9SOiBHaXRIdWIgUEFUIG5vdCBjb25maWd1cmVkLlwiO1xuICAgICAgY29uc3QgeyBvd25lciwgcmVwbywgcGF0aDogZmlsZVBhdGgsIHJlZiA9IFwibWFpblwiIH0gPSBhcmdzO1xuICAgICAgY29uc3QgZW5jb2RlZFBhdGggPSBlbmNvZGVVUklDb21wb25lbnQoZmlsZVBhdGgpO1xuICAgICAgY29uc3QgYXBpVXJsID0gYGh0dHBzOi8vYXBpLmdpdGh1Yi5jb20vcmVwb3MvJHtlbmNvZGVVUklDb21wb25lbnQob3duZXIpfS8ke2VuY29kZVVSSUNvbXBvbmVudChyZXBvKX0vY29udGVudHMvJHtlbmNvZGVkUGF0aH0/cmVmPSR7ZW5jb2RlVVJJQ29tcG9uZW50KHJlZil9YDtcbiAgICAgIGNvbnN0IHJlcyA9IGF3YWl0IGZldGNoKGFwaVVybCwge1xuICAgICAgICBtZXRob2Q6IFwiR0VUXCIsXG4gICAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgICBcIkFjY2VwdFwiOiBcImFwcGxpY2F0aW9uL3ZuZC5naXRodWIranNvblwiLFxuICAgICAgICAgIFwiQXV0aG9yaXphdGlvblwiOiBgQmVhcmVyICR7R0lUSFVCX1BBVH1gLFxuICAgICAgICAgIFwiWC1HaXRIdWItQXBpLVZlcnNpb25cIjogXCIyMDIyLTExLTI4XCIsXG4gICAgICAgIH0sXG4gICAgICB9KTtcbiAgICAgIGlmIChyZXMuc3RhdHVzID09PSA0MDQpIHtcbiAgICAgICAgcmV0dXJuIGBFUlJPUjogRmlsZSBub3QgZm91bmQgYXQgaHR0cHM6Ly9naXRodWIuY29tLyR7b3duZXJ9LyR7cmVwb30vYmxvYi8ke3JlZn0vJHtmaWxlUGF0aH1gO1xuICAgICAgfVxuICAgICAgaWYgKCFyZXMub2spIHtcbiAgICAgICAgY29uc3QgZGV0YWlsID0gYXdhaXQgcmVzLnRleHQoKS5jYXRjaCgoKSA9PiBcIlwiKTtcbiAgICAgICAgcmV0dXJuIGBFUlJPUjogR2l0SHViIEFQSSBmYWlsZWQgKCR7cmVzLnN0YXR1c30pOiAke2RldGFpbC5zbGljZSgwLCAzMDApfWA7XG4gICAgICB9XG4gICAgICBjb25zdCBkYXRhID0gYXdhaXQgcmVzLmpzb24oKS5jYXRjaCgoKSA9PiAoe30pKSBhcyBBbnk7XG4gICAgICBpZiAoZGF0YS5jb250ZW50KSB7XG4gICAgICAgIGNvbnN0IGRlY29kZWQgPSBhdG9iKGRhdGEuY29udGVudCk7XG4gICAgICAgIHJldHVybiBkZWNvZGVkLmxlbmd0aCA+IDgwMDBcbiAgICAgICAgICA/IGRlY29kZWQuc2xpY2UoMCwgODAwMCkgKyBgXFxuXFxuW1RydW5jYXRlZCBcdTIwMTQgZmlsZSB3YXMgJHtkZWNvZGVkLmxlbmd0aH0gY2hhcnMgdG90YWwuIFBhdGg6ICR7ZmlsZVBhdGh9IGluICR7b3duZXJ9LyR7cmVwb31dYFxuICAgICAgICAgIDogZGVjb2RlZDtcbiAgICAgIH1cbiAgICAgIHJldHVybiBgRVJST1I6IFVuZXhwZWN0ZWQgR2l0SHViIHJlc3BvbnNlIGZvcm1hdC5gO1xuICAgIH1cblxuICAgIGRlZmF1bHQ6XG4gICAgICByZXR1cm4gYEVSUk9SOiBVbmtub3duIHRvb2wgXCIke25hbWV9XCIuYDtcbiAgfVxufVxuIiwgIi8vIE1vZGVsIGZhbGxiYWNrIGNoYWluIGZvciBUZWxlZ3JhbSB3ZWJob29rIHJlcGxpZXMuXG4vL1xuLy8gVHJpZXMgcHJvdmlkZXJzIGluIG9yZGVyLCBmYWxsaW5nIHRocm91Z2ggb24gYW55IGZhaWx1cmUuIEVhY2ggbGF5ZXJcbi8vIGdldHMgb25lIHF1aWNrIHJldHJ5ICgxLjVzKSBiZWZvcmUgdGhlIG5leHQgbGF5ZXIgaXMgdHJpZWQuXG4vL1xuLy8gTGF5ZXJzOlxuLy8gIDEuIGdlbWluaS0zLjYtZmxhc2ggICAgICAgKHByaW1hcnksIEdlbWluaSBcdTIwMTQgc3VwcG9ydHMgZnVuY3Rpb24gY2FsbGluZylcbi8vICAyLiBnZW1pbmktMy41LWZsYXNoLWxpdGUgIChHZW1pbmkgYmFja3VwIFx1MjAxNCBzdXBwb3J0cyBmdW5jdGlvbiBjYWxsaW5nKVxuLy8gIDMuIEdyb3EgXHUyMDE0IGxsYW1hLTMuMy03MGItdmVyc2F0aWxlICAoT3BlbkFJLWNvbXBhdGlibGUsIG5vIGZ1bmN0aW9uIGNhbGxpbmcgaGVyZSlcbi8vICA0LiBPcGVuUm91dGVyIFx1MjAxNCBvcGVucm91dGVyL2F1dG8gICAgIChmaW5hbCBjYXRjaC1hbGwsIG5vIGZ1bmN0aW9uIGNhbGxpbmcgaGVyZSlcbi8vXG4vLyBHZW1pbmkgbGF5ZXJzICgxIGFuZCAyKSBzdXBwb3J0IGZ1bmN0aW9uIGNhbGxpbmc6IHdoZW4gR2VtaW5pIGRlY2lkZXNcbi8vIGl0IG5lZWRzIGV4dGVybmFsIGluZm8sIGl0IHJldHVybnMgYSBmdW5jdGlvbkNhbGwuIFRoZSB3cmFwcGVyIGV4ZWN1dGVzXG4vLyB0aGUgdG9vbCBzZXJ2ZXItc2lkZSBhbmQgZmVlZHMgdGhlIHJlc3VsdCBiYWNrLCBjb250aW51aW5nIHVudGlsIEdlbWluaVxuLy8gcHJvZHVjZXMgZmluYWwgdGV4dC4gTG9nZ2VkIGFzIFwibW9kZWwtZmFsbGJhY2stdXNlZFwiIHdoZW5ldmVyIGEgbm9uLXByaW1hcnlcbi8vIGxheWVyICgyLCAzLCBvciA0KSBzZXJ2ZXMgdGhlIHJlcGx5LlxuXG5pbXBvcnQgeyBnZW1pbmlHZW5lcmF0ZSwgZ2VtaW5pVGV4dCwgTU9ERUxTIH0gZnJvbSBcIi4vZ2VtaW5pLnRzXCI7XG5pbXBvcnQgeyBUT09MUywgZXhlY3V0ZVRvb2wgfSBmcm9tIFwiLi9leHRlcm5hbC10b29scy50c1wiO1xuXG4vKiBlc2xpbnQtZGlzYWJsZSBAdHlwZXNjcmlwdC1lc2xpbnQvbm8tZXhwbGljaXQtYW55ICovXG50eXBlIEFueSA9IGFueTtcblxuY29uc3QgR1JPUV9BUElfS0VZID0gRGVuby5lbnYuZ2V0KFwiR1JPUV9BUElfS0VZXCIpID8/IFwiXCI7XG5jb25zdCBPUEVOUk9VVEVSX0FQSV9LRVkgPSBEZW5vLmVudi5nZXQoXCJPUEVOUk9VVEVSX0FQSV9LRVlcIikgPz8gXCJcIjtcblxuY29uc3QgR1JPUV9CQVNFID0gXCJodHRwczovL2FwaS5ncm9xLmNvbS9vcGVuYWkvdjFcIjtcbmNvbnN0IE9QRU5ST1VURVJfQkFTRSA9IFwiaHR0cHM6Ly9vcGVucm91dGVyLmFpL2FwaS92MVwiO1xuXG5jb25zdCBHUk9RX01PREVMID0gXCJsbGFtYS0zLjMtNzBiLXZlcnNhdGlsZVwiO1xuY29uc3QgT1BFTlJPVVRFUl9NT0RFTCA9IFwib3BlbnJvdXRlci9hdXRvXCI7XG5cbmNvbnN0IFJFVFJZX0RFTEFZX01TID0gMTUwMDtcblxuLyoqIEdlbWluaVJlcXVlc3QgXHUyMTkyIE9wZW5BSSBjaGF0IGNvbXBsZXRpb25zIGZvcm1hdC4gKi9cbmZ1bmN0aW9uIHRvT3BlbkFJKGJvZHk6IHsgc3lzdGVtSW5zdHJ1Y3Rpb24/OiB7IHBhcnRzOiBBbnlbXSB9OyBjb250ZW50czogQW55W107IGdlbmVyYXRpb25Db25maWc/OiBBbnkgfSk6IEFueSB7XG4gIGNvbnN0IG1lc3NhZ2VzOiBBbnlbXSA9IFtdO1xuXG4gIGlmIChib2R5LnN5c3RlbUluc3RydWN0aW9uPy5wYXJ0cykge1xuICAgIGNvbnN0IHN5c3RlbVRleHQgPSBib2R5LnN5c3RlbUluc3RydWN0aW9uLnBhcnRzLm1hcCgocDogQW55KSA9PiBwLnRleHQgPz8gXCJcIikuZmlsdGVyKEJvb2xlYW4pLmpvaW4oXCJcIik7XG4gICAgaWYgKHN5c3RlbVRleHQpIG1lc3NhZ2VzLnB1c2goeyByb2xlOiBcInN5c3RlbVwiLCBjb250ZW50OiBzeXN0ZW1UZXh0IH0pO1xuICB9XG5cbiAgZm9yIChjb25zdCBjb250ZW50IG9mIGJvZHkuY29udGVudHMpIHtcbiAgICBjb25zdCByb2xlID0gY29udGVudC5yb2xlID09PSBcIm1vZGVsXCIgPyBcImFzc2lzdGFudFwiIDogXCJ1c2VyXCI7XG4gICAgY29uc3QgdGV4dCA9IChjb250ZW50LnBhcnRzIHx8IFtdKS5tYXAoKHA6IEFueSkgPT4gcC50ZXh0ID8/IFwiXCIpLmZpbHRlcihCb29sZWFuKS5qb2luKFwiXCIpO1xuICAgIGlmICh0ZXh0KSBtZXNzYWdlcy5wdXNoKHsgcm9sZSwgY29udGVudDogdGV4dCB9KTtcbiAgfVxuXG4gIGNvbnN0IHJlc3VsdDogQW55ID0geyBtb2RlbDogXCJcIiwgbWVzc2FnZXMgfTtcbiAgaWYgKGJvZHkuZ2VuZXJhdGlvbkNvbmZpZz8udGVtcGVyYXR1cmUgIT09IHVuZGVmaW5lZCkgcmVzdWx0LnRlbXBlcmF0dXJlID0gYm9keS5nZW5lcmF0aW9uQ29uZmlnLnRlbXBlcmF0dXJlO1xuICBpZiAoYm9keS5nZW5lcmF0aW9uQ29uZmlnPy5tYXhPdXRwdXRUb2tlbnMgIT09IHVuZGVmaW5lZCkgcmVzdWx0Lm1heF90b2tlbnMgPSBib2R5LmdlbmVyYXRpb25Db25maWcubWF4T3V0cHV0VG9rZW5zO1xuICByZXR1cm4gcmVzdWx0O1xufVxuXG4vKiogT3BlbkFJIGNoYXQgY29tcGxldGlvbnMgcmVzcG9uc2UgXHUyMTkyIEdlbWluaS1zdHlsZSByZXN1bHQgZm9yIGdlbWluaVRleHQoKS4gKi9cbmZ1bmN0aW9uIGZyb21PcGVuQUkoanNvbjogQW55KTogQW55IHtcbiAgaWYgKGpzb24/LmNob2ljZXM/LlswXT8ubWVzc2FnZT8uY29udGVudCkge1xuICAgIHJldHVybiB7IGNhbmRpZGF0ZXM6IFt7IGNvbnRlbnQ6IHsgcGFydHM6IFt7IHRleHQ6IGpzb24uY2hvaWNlc1swXS5tZXNzYWdlLmNvbnRlbnQgfV0gfSB9XSB9O1xuICB9XG4gIHJldHVybiBqc29uO1xufVxuXG4vKiogRXh0cmFjdCBhIGZ1bmN0aW9uQ2FsbCBmcm9tIGEgR2VtaW5pIHJlc3BvbnNlLCBpZiBwcmVzZW50LiAqL1xuZnVuY3Rpb24gZXh0cmFjdEZ1bmN0aW9uQ2FsbChqc29uOiBBbnkpOiB7IG5hbWU6IHN0cmluZzsgYXJnczogUmVjb3JkPHN0cmluZywgc3RyaW5nPiB9IHwgbnVsbCB7XG4gIGNvbnN0IHBhcnRzID0ganNvbj8uY2FuZGlkYXRlcz8uWzBdPy5jb250ZW50Py5wYXJ0cyA/PyBbXTtcbiAgY29uc3QgZmNQYXJ0ID0gcGFydHMuZmluZCgocDogQW55KSA9PiBwLmZ1bmN0aW9uQ2FsbCk7XG4gIGlmICghZmNQYXJ0Py5mdW5jdGlvbkNhbGwpIHJldHVybiBudWxsO1xuICByZXR1cm4ge1xuICAgIG5hbWU6IGZjUGFydC5mdW5jdGlvbkNhbGwubmFtZSxcbiAgICBhcmdzOiAoZmNQYXJ0LmZ1bmN0aW9uQ2FsbC5hcmdzID8/IHt9KSBhcyBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+LFxuICB9O1xufVxuXG4vKipcbiAqIEdlbWluaSBsYXllciB3aXRoIGZ1bmN0aW9uLWNhbGxpbmcgc3VwcG9ydC5cbiAqXG4gKiAxLiBGaXJzdCBjYWxsIHdpdGggdG9vbHMgXHUyMDE0IEdlbWluaSBtYXkgcmV0dXJuIHRleHQgT1IgYSBmdW5jdGlvbkNhbGwuXG4gKiAyLiBJZiBmdW5jdGlvbkNhbGwsIGV4ZWN1dGUgdGhlIHRvb2wgc2VydmVyLXNpZGUuXG4gKiAzLiBGZWVkIHRvb2wgcmVzdWx0IGJhY2sgYXMgYSBmdW5jdGlvblJlc3BvbnNlIHR1cm4uXG4gKiA0LiBHZXQgZmluYWwgdGV4dCAob3IgYW5vdGhlciBmdW5jdGlvbkNhbGwgXHUyMDE0IHJldHJ5IG9uY2UpLlxuICovXG5hc3luYyBmdW5jdGlvbiBnZW1pbmlHZW5lcmF0ZVdpdGhUb29scyhcbiAgbW9kZWw6IHN0cmluZyxcbiAgYm9keTogQW55LFxuICBzdXBhYmFzZTogQW55LFxuICBsb2c6IEFueVtdLFxuKTogUHJvbWlzZTx7IG9rOiBib29sZWFuOyB0ZXh0OiBzdHJpbmc7IGVycm9yPzogc3RyaW5nIH0+IHtcbiAgLy8gLS0tIFJvdW5kIDE6IGNhbGwgd2l0aCB0b29scyAtLS1cbiAgbGV0IHJlcyA9IGF3YWl0IGdlbWluaUdlbmVyYXRlKG1vZGVsLCB7IC4uLmJvZHksIHRvb2xzOiBUT09MUyB9KTtcbiAgaWYgKCFyZXMub2spIHtcbiAgICBjb25zdCBkZXRhaWwgPSBhd2FpdCByZXMudGV4dCgpLmNhdGNoKCgpID0+IFwiXCIpO1xuICAgIGxvZy5wdXNoKHsgcHJvdmlkZXI6IFwiZ2VtaW5pXCIsIG1vZGVsLCByZWFzb246IGBub24tb2sgJHtyZXMuc3RhdHVzfWAsIHN0YXR1czogcmVzLnN0YXR1cyB9KTtcbiAgICByZXR1cm4geyBvazogZmFsc2UsIHRleHQ6IFwiXCIsIGVycm9yOiBgR2VtaW5pICR7bW9kZWx9IHJldHVybmVkICR7cmVzLnN0YXR1c31gIH07XG4gIH1cbiAgbGV0IGpzb24gPSBhd2FpdCByZXMuanNvbigpLmNhdGNoKCgpID0+ICh7fSkpO1xuICBsZXQgdGV4dCA9IGdlbWluaVRleHQoanNvbik7XG5cbiAgLy8gLS0tIEhhbmRsZSB0b29sIGNhbGxzICh1cCB0byAyIHJvdW5kcykgLS0tXG4gIGZvciAobGV0IHJvdW5kID0gMDsgcm91bmQgPCAyOyByb3VuZCsrKSB7XG4gICAgY29uc3QgZmMgPSBleHRyYWN0RnVuY3Rpb25DYWxsKGpzb24pO1xuICAgIGlmICghZmMpIGJyZWFrOyAvLyBObyBmdW5jdGlvbiBjYWxsIFx1MjAxNCB3ZSBoYXZlIHRleHQgb3IgYW4gZXJyb3JcblxuICAgIC8vIEV4ZWN1dGUgdGhlIHRvb2xcbiAgICBsZXQgdG9vbFJlc3VsdDogc3RyaW5nO1xuICAgIHRyeSB7XG4gICAgICB0b29sUmVzdWx0ID0gYXdhaXQgZXhlY3V0ZVRvb2woZmMubmFtZSwgZmMuYXJncyk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgdG9vbFJlc3VsdCA9IGBFUlJPUiBleGVjdXRpbmcgJHtmYy5uYW1lfTogJHtlIGluc3RhbmNlb2YgRXJyb3IgPyBlLm1lc3NhZ2UgOiBTdHJpbmcoZSl9YDtcbiAgICB9XG4gICAgbG9nLnB1c2goe1xuICAgICAgcHJvdmlkZXI6IFwiZ2VtaW5pXCIsXG4gICAgICBtb2RlbCxcbiAgICAgIHJlYXNvbjogYHRvb2wgY2FsbDogJHtmYy5uYW1lfWAsXG4gICAgICB0b29sOiBmYy5uYW1lLFxuICAgICAgdG9vbF9pbnB1dDogSlNPTi5zdHJpbmdpZnkoZmMuYXJncyksXG4gICAgfSk7XG5cbiAgICAvLyBCdWlsZCBmb2xsb3ctdXA6IG9yaWdpbmFsIGNvbnRlbnRzICsgR2VtaW5pJ3MgZnVuY3Rpb25DYWxsIHR1cm4gKyB0b29sIHJlc3VsdCB0dXJuXG4gICAgY29uc3QgZnVuY3Rpb25DYWxsUGFydCA9IHsgZnVuY3Rpb25DYWxsOiBmYyB9O1xuICAgIGNvbnN0IGZ1bmN0aW9uUmVzcG9uc2VUdXJuOiBBbnkgPSB7XG4gICAgICByb2xlOiBcImZ1bmN0aW9uXCIsXG4gICAgICBuYW1lOiBmYy5uYW1lLFxuICAgICAgcGFydHM6IFt7IHRleHQ6IHRvb2xSZXN1bHQgfV0sXG4gICAgfTtcblxuICAgIGNvbnN0IGZvbGxvd1VwQ29udGVudHM6IEFueVtdID0gW1xuICAgICAgLi4uYm9keS5jb250ZW50cyxcbiAgICAgIHsgcm9sZTogXCJtb2RlbFwiLCBwYXJ0czogW2Z1bmN0aW9uQ2FsbFBhcnRdIH0sXG4gICAgICBmdW5jdGlvblJlc3BvbnNlVHVybixcbiAgICBdO1xuXG4gICAgcmVzID0gYXdhaXQgZ2VtaW5pR2VuZXJhdGUobW9kZWwsIHtcbiAgICAgIC4uLmJvZHksXG4gICAgICBjb250ZW50czogZm9sbG93VXBDb250ZW50cyxcbiAgICAgIHRvb2xzOiBUT09MUyxcbiAgICB9KTtcblxuICAgIGlmICghcmVzLm9rKSB7XG4gICAgICBjb25zdCBkZXRhaWwgPSBhd2FpdCByZXMudGV4dCgpLmNhdGNoKCgpID0+IFwiXCIpO1xuICAgICAgbG9nLnB1c2goeyBwcm92aWRlcjogXCJnZW1pbmlcIiwgbW9kZWwsIHJlYXNvbjogYGZvbGxvdy11cCBub24tb2sgJHtyZXMuc3RhdHVzfWAsIHN0YXR1czogcmVzLnN0YXR1cyB9KTtcbiAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgdGV4dDogXCJcIiwgZXJyb3I6IGBHZW1pbmkgZm9sbG93LXVwIHJldHVybmVkICR7cmVzLnN0YXR1c31gIH07XG4gICAgfVxuXG4gICAganNvbiA9IGF3YWl0IHJlcy5qc29uKCkuY2F0Y2goKCkgPT4gKHt9KSk7XG4gICAgdGV4dCA9IGdlbWluaVRleHQoanNvbik7XG4gIH1cblxuICAvLyAtLS0gQ2hlY2sgcmVzdWx0IC0tLVxuICBpZiAoIXRleHQpIHtcbiAgICBsb2cucHVzaCh7IHByb3ZpZGVyOiBcImdlbWluaVwiLCBtb2RlbCwgcmVhc29uOiBcImVtcHR5IHJlc3BvbnNlIChhZnRlciB0b29scylcIiB9KTtcbiAgICByZXR1cm4geyBvazogZmFsc2UsIHRleHQ6IFwiXCIsIGVycm9yOiBcIkdlbWluaSByZXR1cm5lZCBlbXB0eVwiIH07XG4gIH1cblxuICByZXR1cm4geyBvazogdHJ1ZSwgdGV4dCB9O1xufVxuXG5hc3luYyBmdW5jdGlvbiB0cnlHZW1pbmkobW9kZWw6IHN0cmluZywgYm9keTogQW55LCBsb2c6IEFueVtdLCBzdXBhYmFzZTogQW55KTogUHJvbWlzZTx7IG9rOiBib29sZWFuOyB0ZXh0OiBzdHJpbmc7IGVycm9yPzogc3RyaW5nIH0+IHtcbiAgcmV0dXJuIGdlbWluaUdlbmVyYXRlV2l0aFRvb2xzKG1vZGVsLCBib2R5LCBzdXBhYmFzZSwgbG9nKTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gdHJ5T3BlbkFJKG1vZGVsOiBzdHJpbmcsIGJhc2U6IHN0cmluZywgYXBpS2V5OiBzdHJpbmcsIHByb3ZpZGVyOiBzdHJpbmcsIGJvZHk6IEFueSwgbG9nOiBBbnlbXSk6IFByb21pc2U8eyBvazogYm9vbGVhbjsgdGV4dDogc3RyaW5nOyBlcnJvcj86IHN0cmluZyB9PiB7XG4gIGlmICghYXBpS2V5KSB7XG4gICAgbG9nLnB1c2goeyBwcm92aWRlciwgbW9kZWwsIHJlYXNvbjogXCJubyBBUEkga2V5IGNvbmZpZ3VyZWRcIiB9KTtcbiAgICByZXR1cm4geyBvazogZmFsc2UsIHRleHQ6IFwiXCIsIGVycm9yOiBgJHtwcm92aWRlcn0ga2V5IG1pc3NpbmdgIH07XG4gIH1cblxuICBjb25zdCBvcGVuYWlCb2R5ID0gdG9PcGVuQUkoYm9keSk7XG4gIG9wZW5haUJvZHkubW9kZWwgPSBtb2RlbDtcblxuICB0cnkge1xuICAgIGNvbnN0IHJlcyA9IGF3YWl0IGZldGNoKGAke2Jhc2V9L2NoYXQvY29tcGxldGlvbnNgLCB7XG4gICAgICBtZXRob2Q6IFwiUE9TVFwiLFxuICAgICAgaGVhZGVyczoge1xuICAgICAgICBcIkF1dGhvcml6YXRpb25cIjogYEJlYXJlciAke2FwaUtleX1gLFxuICAgICAgICBcIkNvbnRlbnQtVHlwZVwiOiBcImFwcGxpY2F0aW9uL2pzb25cIixcbiAgICAgIH0sXG4gICAgICBib2R5OiBKU09OLnN0cmluZ2lmeShvcGVuYWlCb2R5KSxcbiAgICB9KTtcblxuICAgIGlmICghcmVzLm9rKSB7XG4gICAgICBjb25zdCBkZXRhaWwgPSBhd2FpdCByZXMudGV4dCgpLmNhdGNoKCgpID0+IFwiXCIpO1xuICAgICAgbG9nLnB1c2goeyBwcm92aWRlciwgbW9kZWwsIHJlYXNvbjogYG5vbi1vayAke3Jlcy5zdGF0dXN9YCwgc3RhdHVzOiByZXMuc3RhdHVzIH0pO1xuICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCB0ZXh0OiBcIlwiLCBlcnJvcjogYCR7cHJvdmlkZXJ9IHJldHVybmVkICR7cmVzLnN0YXR1c31gIH07XG4gICAgfVxuXG4gICAgY29uc3QganNvbiA9IGF3YWl0IHJlcy5qc29uKCkuY2F0Y2goKCkgPT4gKHt9KSk7XG4gICAgY29uc3QgYWRhcHRlZCA9IGZyb21PcGVuQUkoanNvbik7XG4gICAgY29uc3QgdGV4dCA9IGdlbWluaVRleHQoYWRhcHRlZCk7XG4gICAgaWYgKCF0ZXh0KSB7XG4gICAgICBsb2cucHVzaCh7IHByb3ZpZGVyLCBtb2RlbCwgcmVhc29uOiBcImVtcHR5IHJlc3BvbnNlXCIgfSk7XG4gICAgICByZXR1cm4geyBvazogZmFsc2UsIHRleHQ6IFwiXCIsIGVycm9yOiBgJHtwcm92aWRlcn0gcmV0dXJuZWQgZW1wdHlgIH07XG4gICAgfVxuICAgIHJldHVybiB7IG9rOiB0cnVlLCB0ZXh0IH07XG4gIH0gY2F0Y2ggKGUpIHtcbiAgICBsb2cucHVzaCh7IHByb3ZpZGVyLCBtb2RlbCwgcmVhc29uOiBgZXhjZXB0aW9uOiAke2UgaW5zdGFuY2VvZiBFcnJvciA/IGUubWVzc2FnZSA6IFN0cmluZyhlKX1gIH0pO1xuICAgIHJldHVybiB7IG9rOiBmYWxzZSwgdGV4dDogXCJcIiwgZXJyb3I6IGAke3Byb3ZpZGVyfSB0aHJld2AgfTtcbiAgfVxufVxuXG5hc3luYyBmdW5jdGlvbiBsb2dGYWxsYmFjayhzdXBhYmFzZTogQW55LCBmYWxsYmFja0xvZzogQW55W10pOiBQcm9taXNlPHZvaWQ+IHtcbiAgaWYgKGZhbGxiYWNrTG9nLmxlbmd0aCA9PT0gMCkgcmV0dXJuO1xuICB0cnkge1xuICAgIGF3YWl0IHN1cGFiYXNlLmZyb20oXCJlcnJvcl9sb2dcIikuaW5zZXJ0KHtcbiAgICAgIGZ1bmN0aW9uX25hbWU6IFwibW9kZWwtZmFsbGJhY2stdXNlZFwiLFxuICAgICAgZXJyb3JfbWVzc2FnZTogYEZlbGwgYmFjayB0byAke2ZhbGxiYWNrTG9nW2ZhbGxiYWNrTG9nLmxlbmd0aCAtIDFdLnByb3ZpZGVyfWAsXG4gICAgICBlcnJvcl9zdGFjazogbnVsbCxcbiAgICAgIGNvbnRleHQ6IHtcbiAgICAgICAgY2hhaW46IGZhbGxiYWNrTG9nLFxuICAgICAgICB0b3RhbF9hdHRlbXB0czogZmFsbGJhY2tMb2cubGVuZ3RoLFxuICAgICAgICBmaW5hbF9wcm92aWRlcjogZmFsbGJhY2tMb2dbZmFsbGJhY2tMb2cubGVuZ3RoIC0gMV0/LnByb3ZpZGVyID8/IFwidW5rbm93blwiLFxuICAgICAgfSxcbiAgICB9KTtcbiAgfSBjYXRjaCAoZSkge1xuICAgIGNvbnNvbGUuZXJyb3IoXCJtb2RlbC1mYWxsYmFjayBsb2cgaW5zZXJ0IGZhaWxlZDpcIiwgZSk7XG4gIH1cbn1cblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIGdlbmVyYXRlV2l0aEZhbGxiYWNrKFxuICBib2R5OiBBbnksXG4gIHN1cGFiYXNlOiBBbnksXG4gIGZ1bmN0aW9uTmFtZTogc3RyaW5nID0gXCJtb2RlbC1mYWxsYmFja1wiLFxuKTogUHJvbWlzZTxzdHJpbmc+IHtcbiAgY29uc3QgZmFsbGJhY2tMb2c6IEFueVtdID0gW107XG5cbiAgLy8gTGF5ZXIgMTogZ2VtaW5pLTMuNi1mbGFzaCAod2l0aCBmdW5jdGlvbiBjYWxsaW5nKVxuICBsZXQgcmVzdWx0ID0gYXdhaXQgdHJ5R2VtaW5pKE1PREVMUy5jaGF0LCBib2R5LCBmYWxsYmFja0xvZywgc3VwYWJhc2UpO1xuICBpZiAocmVzdWx0Lm9rKSByZXR1cm4gcmVzdWx0LnRleHQ7XG4gIGF3YWl0IG5ldyBQcm9taXNlKHIgPT4gc2V0VGltZW91dChyLCBSRVRSWV9ERUxBWV9NUykpO1xuICByZXN1bHQgPSBhd2FpdCB0cnlHZW1pbmkoTU9ERUxTLmNoYXQsIGJvZHksIGZhbGxiYWNrTG9nLCBzdXBhYmFzZSk7XG4gIGlmIChyZXN1bHQub2spIHsgbG9nRmFsbGJhY2soc3VwYWJhc2UsIGZhbGxiYWNrTG9nKTsgcmV0dXJuIHJlc3VsdC50ZXh0OyB9XG5cbiAgLy8gTGF5ZXIgMjogZ2VtaW5pLTMuNS1mbGFzaC1saXRlICh3aXRoIGZ1bmN0aW9uIGNhbGxpbmcpXG4gIHJlc3VsdCA9IGF3YWl0IHRyeUdlbWluaShNT0RFTFMuY2hhdExpdGUsIGJvZHksIGZhbGxiYWNrTG9nLCBzdXBhYmFzZSk7XG4gIGlmIChyZXN1bHQub2spIHsgbG9nRmFsbGJhY2soc3VwYWJhc2UsIGZhbGxiYWNrTG9nKTsgcmV0dXJuIHJlc3VsdC50ZXh0OyB9XG4gIGF3YWl0IG5ldyBQcm9taXNlKHIgPT4gc2V0VGltZW91dChyLCBSRVRSWV9ERUxBWV9NUykpO1xuICByZXN1bHQgPSBhd2FpdCB0cnlHZW1pbmkoTU9ERUxTLmNoYXRMaXRlLCBib2R5LCBmYWxsYmFja0xvZywgc3VwYWJhc2UpO1xuICBpZiAocmVzdWx0Lm9rKSB7IGxvZ0ZhbGxiYWNrKHN1cGFiYXNlLCBmYWxsYmFja0xvZyk7IHJldHVybiByZXN1bHQudGV4dDsgfVxuXG4gIC8vIExheWVyIDM6IEdyb3FcbiAgcmVzdWx0ID0gYXdhaXQgdHJ5T3BlbkFJKEdST1FfTU9ERUwsIEdST1FfQkFTRSwgR1JPUV9BUElfS0VZLCBcImdyb3FcIiwgYm9keSwgZmFsbGJhY2tMb2cpO1xuICBpZiAocmVzdWx0Lm9rKSB7IGxvZ0ZhbGxiYWNrKHN1cGFiYXNlLCBmYWxsYmFja0xvZyk7IHJldHVybiByZXN1bHQudGV4dDsgfVxuICBhd2FpdCBuZXcgUHJvbWlzZShyID0+IHNldFRpbWVvdXQociwgUkVUUllfREVMQVlfTVMpKTtcbiAgcmVzdWx0ID0gYXdhaXQgdHJ5T3BlbkFJKEdST1FfTU9ERUwsIEdST1FfQkFTRSwgR1JPUV9BUElfS0VZLCBcImdyb3FcIiwgYm9keSwgZmFsbGJhY2tMb2cpO1xuICBpZiAocmVzdWx0Lm9rKSB7IGxvZ0ZhbGxiYWNrKHN1cGFiYXNlLCBmYWxsYmFja0xvZyk7IHJldHVybiByZXN1bHQudGV4dDsgfVxuXG4gIC8vIExheWVyIDQ6IE9wZW5Sb3V0ZXJcbiAgcmVzdWx0ID0gYXdhaXQgdHJ5T3BlbkFJKE9QRU5ST1VURVJfTU9ERUwsIE9QRU5ST1VURVJfQkFTRSwgT1BFTlJPVVRFUl9BUElfS0VZLCBcIm9wZW5yb3V0ZXJcIiwgYm9keSwgZmFsbGJhY2tMb2cpO1xuICBpZiAocmVzdWx0Lm9rKSB7IGxvZ0ZhbGxiYWNrKHN1cGFiYXNlLCBmYWxsYmFja0xvZyk7IHJldHVybiByZXN1bHQudGV4dDsgfVxuICBhd2FpdCBuZXcgUHJvbWlzZShyID0+IHNldFRpbWVvdXQociwgUkVUUllfREVMQVlfTVMpKTtcbiAgcmVzdWx0ID0gYXdhaXQgdHJ5T3BlbkFJKE9QRU5ST1VURVJfTU9ERUwsIE9QRU5ST1VURVJfQkFTRSwgT1BFTlJPVVRFUl9BUElfS0VZLCBcIm9wZW5yb3V0ZXJcIiwgYm9keSwgZmFsbGJhY2tMb2cpO1xuICBpZiAocmVzdWx0Lm9rKSB7IGxvZ0ZhbGxiYWNrKHN1cGFiYXNlLCBmYWxsYmFja0xvZyk7IHJldHVybiByZXN1bHQudGV4dDsgfVxuXG4gIGxvZ0ZhbGxiYWNrKHN1cGFiYXNlLCBmYWxsYmFja0xvZyk7XG4gIHJldHVybiBcIlNvbWV0aGluZyB3ZW50IHdyb25nIG9uIG15IGVuZC4gVHJ5IG1lIGFnYWluIGluIGEgbW9tZW50LlwiO1xufVxuIiwgIi8vIFBhc3NpdmUgbWVtb3J5IGV4dHJhY3Rpb24uXG4vL1xuLy8gU2F2aW5nIG11c3QgbmV2ZXIgZGVwZW5kIG9uIHRoZSBjb252ZXJzYXRpb25hbCBtb2RlbCBkZWNpZGluZyB0byBjYWxsIGEgc2F2ZVxuLy8gZnVuY3Rpb24gbWlkLWNoYXQgXHUyMDE0IHRoYXQgd2FzIGEgc2luZ2xlIHBvaW50IG9mIGZhaWx1cmUuIEluc3RlYWQsIGFmdGVyIGV2ZXJ5XG4vLyBleGNoYW5nZSBhIHNlcGFyYXRlLCBzbWFsbCBleHRyYWN0aW9uIHBhc3MgcmVhZHMgdGhlIHR1cm4gYW5kIGZpbGVzXG4vLyBzdHJ1Y3R1cmVkLCBsYWJlbGxlZCBmYWN0cy4gTm90aGluZyBoZXJlIHdyaXRlcyBwcm9zZSB0cmFuc2NyaXB0czogZWFjaCByb3dcbi8vIGlzIGEgY2F0ZWdvcnkgKyBrZXkgKyB2YWx1ZSB0aGF0IGNhbiBiZSBzZWFyY2hlZCBhbmQgc3VyZmFjZWQgbGF0ZXIuXG5cbmltcG9ydCB7IGVtYmVkTWFueSB9IGZyb20gXCIuL2VtYmVkLnRzXCI7XG5pbXBvcnQgeyBnZW1pbmlHZW5lcmF0ZSwgZ2VtaW5pVGV4dCwgTU9ERUxTIH0gZnJvbSBcIi4vZ2VtaW5pLnRzXCI7XG5cbi8qKiBDYXRlZ29yaWVzIHRoZSBtZW1vcnkgc3RvcmUgYWNjZXB0cy4gQW55dGhpbmcgZWxzZSBpcyByZWplY3RlZCBvdXRyaWdodC4gKi9cbmNvbnN0IENBVEVHT1JJRVMgPSBbXG4gIFwiZ29hbFwiLCBcImludGVyZXN0XCIsIFwicmVsYXRpb25zaGlwXCIsIFwicHJvamVjdFwiLCBcInRyaWdnZXJcIixcbiAgXCJtb3RpdmF0b3JcIiwgXCJwYXR0ZXJuXCIsIFwic2tpbGxcIiwgXCJ2YWx1ZVwiLCBcImZhY3RcIixcbl07XG5cbi8qIGVzbGludC1kaXNhYmxlIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnkgKi9cbnR5cGUgQW55ID0gYW55O1xuXG5leHBvcnQgaW50ZXJmYWNlIEV4dHJhY3RlZEZhY3Qge1xuICBjYXRlZ29yeTogc3RyaW5nO1xuICBrZXk6IHN0cmluZztcbiAgdmFsdWU6IHN0cmluZztcbiAgdGFnczogc3RyaW5nW107XG4gIGNvbmZpZGVuY2U6IG51bWJlcjtcbiAgZm9sbG93dXBfYXQ/OiBzdHJpbmcgfCBudWxsO1xufVxuXG5jb25zdCBTWVNURU0gPSBgWW91IGV4dHJhY3QgZHVyYWJsZSwgc3RydWN0dXJlZCBmYWN0cyBhYm91dCBhIHBlcnNvbiBmcm9tIG9uZSBleGNoYW5nZSB3aXRoIHRoZWlyIGFzc2lzdGFudC5cblxuUmV0dXJuIE9OTFkgdmFsaWQgSlNPTjpcbntcImZhY3RzXCI6W3tcImNhdGVnb3J5XCI6XCJnb2FsfGludGVyZXN0fHJlbGF0aW9uc2hpcHxwcm9qZWN0fHRyaWdnZXJ8bW90aXZhdG9yfHBhdHRlcm58c2tpbGx8dmFsdWV8ZmFjdFwiLFwia2V5XCI6XCJzaG9ydCBsYWJlbFwiLFwidmFsdWVcIjpcInRoZSBmYWN0LCB3cml0dGVuIGFzIGEgc3RhbmRhbG9uZSBzZW50ZW5jZVwiLFwidGFnc1wiOltcImxvd2VyY2FzZS10YWdcIl0sXCJjb25maWRlbmNlXCI6MC4wLTEuMCxcImZvbGxvd3VwX2F0XCI6XCJZWVlZLU1NLUREIG9yIG51bGxcIn1dfVxuXG5SdWxlczpcbi0gT25seSB3aGF0IHRoZSBQRVJTT04gc3RhdGVkIG9yIGNsZWFybHkgaW1wbGllZCBhYm91dCB0aGVtc2VsdmVzLiBOZXZlciBhbnl0aGluZyB0aGUgYXNzaXN0YW50IHNhaWQgYWJvdXQgaXRzZWxmLlxuLSBFeHRyYWN0OiB0aGVpciBuYW1lLCBwcmVmZXJlbmNlcywgb25nb2luZyBzaXR1YXRpb25zLCBjb21taXRtZW50cywgZGVhZGxpbmVzLCBwZW9wbGUgaW4gdGhlaXIgbGlmZSwgcHJvamVjdHMsIHRoaW5ncyB0aGV5IHNhaWQgdGhleSdkIGRvLlxuLSBEbyBOT1QgZXh0cmFjdDogc21hbGwgdGFsaywgb25lLW9mZiBxdWVzdGlvbnMsIGdlbmVyYWwga25vd2xlZGdlLCBhbnl0aGluZyBhYm91dCB0aGUgYXNzaXN0YW50LlxuLSBOZXZlciBpbnZlbnQgb3IgY29tcGxldGUgaWRlbnRpZnlpbmcgb3IgZmluYW5jaWFsIGRldGFpbHMgKGFkZHJlc3NlcywgcGhvbmUgbnVtYmVycywgYmFuayBjb2RlcywgSURzKS4gSWYgYSBkZXRhaWwgd2Fzbid0IHN0YXRlZCBpbiBmdWxsLCBza2lwIHRoZSBmYWN0LlxuLSBcInZhbHVlXCIgbXVzdCBiZSBzZWxmLWNvbnRhaW5lZCBcdTIwMTQgcmVhZGFibGUgbW9udGhzIGxhdGVyIHdpdGggbm8gY2hhdCBoaXN0b3J5LlxuLSBTZXQgZm9sbG93dXBfYXQgb25seSB3aGVuIHRoZXkgbmFtZWQgb3IgY2xlYXJseSBpbXBsaWVkIGEgZGF0ZS9kZWFkbGluZTsgb3RoZXJ3aXNlIG51bGwuXG5cbkNvbmZpZGVuY2UgaXMgd2hhdCBzZXBhcmF0ZXMgYSBmYWN0IGZyb20gYSBodW5jaCwgYW5kIGl0IGlzIHVzZWQgbGl0ZXJhbGx5OlxuLSAwLjgtMS4wIFx1MjAxNCB0aGV5IHNhaWQgaXQgb3V0cmlnaHQuIFwiTXkgbmFtZSBpcyBOZWtvXCIgLT4gbmFtZSBpcyBOZWtvLiBcIkkgbG92ZSByaWNlXCIgLT4gdGhleSBsb3ZlIHJpY2UuXG4tIDAuNi0wLjggXHUyMDE0IGNsZWFybHkgaW1wbGllZCBhbmQgaGFyZCB0byByZWFkIGFueSBvdGhlciB3YXkuXG4tIEJlbG93IDAuNiBcdTIwMTQgYSByZWFzb25hYmxlIHJlYWRpbmcgdGhhdCB0aGV5IG5ldmVyIGFjdHVhbGx5IHNhaWQuIFwiSSBhdGUgcmljZSB5ZXN0ZXJkYXksIGFuZCB0aGUgZGF5IGJlZm9yZVwiIG1pZ2h0IG1lYW4gcmljZSBpcyB0aGVpciBmYXZvdXJpdGUgZm9vZCwgYnV0IHRoZXkgZGlkbid0IHNheSB0aGF0LiBTY29yZSBpdCBsb3cuIExvdy1jb25maWRlbmNlIHJlYWRpbmdzIGFyZSBOT1Qgc3RvcmVkOyB0aGV5IGFyZSB0dXJuZWQgaW50byBhIGdlbnRsZSBxdWVzdGlvbiB0aGUgYXNzaXN0YW50IG1heSBhc2suIEluY2x1ZGUgYXQgbW9zdCBvbmUgcGVyIGV4Y2hhbmdlLCBhbmQgb25seSB3aGVuIGl0J3MgZ2VudWluZWx5IHdvcnRoIGFza2luZyBhYm91dC5cbi0gTWF4IDUgaXRlbXMuIElmIG5vdGhpbmcgZHVyYWJsZSB3YXMgc2FpZCwgcmV0dXJuIHtcImZhY3RzXCI6W119LmA7XG5cblxuYXN5bmMgZnVuY3Rpb24gY2FsbE1vZGVsKGV4Y2hhbmdlOiBzdHJpbmcpOiBQcm9taXNlPEV4dHJhY3RlZEZhY3RbXT4ge1xuICBsZXQgcmVzOiBSZXNwb25zZTtcbiAgdHJ5IHtcbiAgICByZXMgPSBhd2FpdCBnZW1pbmlHZW5lcmF0ZShNT0RFTFMuY2hhdExpdGUsIHtcbiAgICAgIHN5c3RlbUluc3RydWN0aW9uOiB7IHBhcnRzOiBbeyB0ZXh0OiBTWVNURU0gfV0gfSxcbiAgICAgIGNvbnRlbnRzOiBbeyByb2xlOiBcInVzZXJcIiwgcGFydHM6IFt7IHRleHQ6IGV4Y2hhbmdlIH1dIH1dLFxuICAgICAgZ2VuZXJhdGlvbkNvbmZpZzogeyB0ZW1wZXJhdHVyZTogMC4xIH0sXG4gICAgfSk7XG4gIH0gY2F0Y2ggKGUpIHtcbiAgICBjb25zb2xlLmVycm9yKFwicGFzc2l2ZSBleHRyYWN0aW9uIGZldGNoIHRocmV3OlwiLCBlKTtcbiAgICByZXR1cm4gW107XG4gIH1cbiAgaWYgKCFyZXMub2spIHtcbiAgICBjb25zb2xlLmVycm9yKFwicGFzc2l2ZSBleHRyYWN0aW9uIGZhaWxlZDpcIiwgcmVzLnN0YXR1cywgKGF3YWl0IHJlcy50ZXh0KCkpLnNsaWNlKDAsIDMwMCkpO1xuICAgIHJldHVybiBbXTtcbiAgfVxuICBjb25zdCBib2R5ID0gYXdhaXQgcmVzLmpzb24oKS5jYXRjaCgoKSA9PiAoe30pKTtcbiAgY29uc3QgcmF3ID0gZ2VtaW5pVGV4dChib2R5KTtcbiAgY29uc3QgbWF0Y2ggPSByYXcubWF0Y2goL1xce1tcXHNcXFNdKlxcfS8pO1xuICBpZiAoIW1hdGNoKSByZXR1cm4gW107XG4gIHRyeSB7XG4gICAgY29uc3QgcGFyc2VkID0gSlNPTi5wYXJzZShtYXRjaFswXSk7XG4gICAgcmV0dXJuIEFycmF5LmlzQXJyYXkocGFyc2VkPy5mYWN0cykgPyBwYXJzZWQuZmFjdHMgOiBbXTtcbiAgfSBjYXRjaCAoZSkge1xuICAgIGNvbnNvbGUuZXJyb3IoXCJwYXNzaXZlIGV4dHJhY3Rpb24gcGFyc2UgZXJyb3I6XCIsIGUpO1xuICAgIHJldHVybiBbXTtcbiAgfVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIEV4dHJhY3Rpb25SZXN1bHQge1xuICAvKiogRmFjdHMgYWN0dWFsbHkgd3JpdHRlbiB0byB0aGUgc3RvcmUsIHBocmFzZWQgZm9yIHRoZSBtb2RlbCB0byByZWZlcmVuY2UuICovXG4gIHN0b3JlZDogc3RyaW5nW107XG4gIC8qKiBQbGF1c2libGUgYnV0IHVuY29uZmlybWVkIHJlYWRpbmdzLiBOZXZlciBzdG9yZWQgXHUyMDE0IFJpbiBtYXkgYXNrIGFib3V0IG9uZS4gKi9cbiAgdW5jZXJ0YWluOiBzdHJpbmdbXTtcbn1cblxuLyoqIEJlbG93IHRoaXMsIGEgcmVhZGluZyBpcyBhIGd1ZXNzIGFuZCBnZXRzIGFza2VkIGFib3V0IGluc3RlYWQgb2YgZmlsZWQuICovXG5jb25zdCBDT05GSURFTkNFX0ZMT09SID0gMC42O1xuXG4vKipcbiAqIFJlYWQgb25lIGV4Y2hhbmdlIGFuZCBxdWlldGx5IGZpbGUgd2hhdCdzIGR1cmFibGUgYWJvdXQgaXQuXG4gKiBFdmVyeXRoaW5nIGJlbG93IHRoZSBjb25maWRlbmNlIGZsb29yIGNvbWVzIGJhY2sgYXMgYSBxdWVzdGlvbiB0byBhc2ssIG5vdCBhXG4gKiBmYWN0IHRvIGNsYWltLiBSZXR1cm5zIGV4YWN0bHkgd2hhdCB3YXMgd3JpdHRlbiBcdTIwMTQgbmV2ZXIgYXNzdW1lIHN1Y2Nlc3MuXG4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBleHRyYWN0QW5kU3RvcmUoXG4gIHN1cGFiYXNlOiBBbnksXG4gIHVzZXJJZDogc3RyaW5nLFxuICB1c2VyVGV4dDogc3RyaW5nLFxuICBhc3Npc3RhbnRUZXh0OiBzdHJpbmcsXG4gIF9jb252ZXJzYXRpb25JZD86IHN0cmluZyB8IG51bGwsXG4pOiBQcm9taXNlPEV4dHJhY3Rpb25SZXN1bHQ+IHtcbiAgY29uc3QgcmVzdWx0OiBFeHRyYWN0aW9uUmVzdWx0ID0geyBzdG9yZWQ6IFtdLCB1bmNlcnRhaW46IFtdIH07XG4gIGlmICghdXNlclRleHQgfHwgdXNlclRleHQudHJpbSgpLmxlbmd0aCA8IDMpIHJldHVybiByZXN1bHQ7XG5cbiAgY29uc3QgZXhjaGFuZ2UgPSBgUGVyc29uOiAke3VzZXJUZXh0fVxcbkFzc2lzdGFudDogJHthc3Npc3RhbnRUZXh0fWAuc2xpY2UoMCwgNjAwMCk7XG4gIGNvbnN0IGFsbCA9IChhd2FpdCBjYWxsTW9kZWwoZXhjaGFuZ2UpKVxuICAgIC5maWx0ZXIoKGYpID0+IGYgJiYgQ0FURUdPUklFUy5pbmNsdWRlcyhmLmNhdGVnb3J5KSAmJiBmLmtleSAmJiBmLnZhbHVlKVxuICAgIC5zbGljZSgwLCA1KTtcbiAgaWYgKCFhbGwubGVuZ3RoKSByZXR1cm4gcmVzdWx0O1xuXG4gIGNvbnN0IGZhY3RzID0gYWxsLmZpbHRlcigoZikgPT4gKGYuY29uZmlkZW5jZSA/PyAwLjcpID49IENPTkZJREVOQ0VfRkxPT1IpO1xuICBmb3IgKGNvbnN0IGYgb2YgYWxsKSB7XG4gICAgaWYgKChmLmNvbmZpZGVuY2UgPz8gMC43KSA8IENPTkZJREVOQ0VfRkxPT1IpIHJlc3VsdC51bmNlcnRhaW4ucHVzaChgJHtmLmtleX06ICR7Zi52YWx1ZX1gKTtcbiAgfVxuICBpZiAoIWZhY3RzLmxlbmd0aCkgcmV0dXJuIHJlc3VsdDtcblxuICBjb25zdCBlbWJlZGRpbmdzID0gYXdhaXQgZW1iZWRNYW55KGZhY3RzLm1hcCgoZikgPT4gYCR7Zi5jYXRlZ29yeX06ICR7Zi5rZXl9IFx1MjAxNCAke2YudmFsdWV9YCkpO1xuXG4gIGZvciAobGV0IGkgPSAwOyBpIDwgZmFjdHMubGVuZ3RoOyBpKyspIHtcbiAgICBjb25zdCBmID0gZmFjdHNbaV07XG4gICAgY29uc3QgdGFncyA9IEFycmF5LmlzQXJyYXkoZi50YWdzKVxuICAgICAgPyBmLnRhZ3MubWFwKCh0KSA9PiBTdHJpbmcodCkudG9Mb3dlckNhc2UoKS50cmltKCkucmVwbGFjZSgvXFxzKy9nLCBcIi1cIikpLmZpbHRlcihCb29sZWFuKS5zbGljZSgwLCA2KVxuICAgICAgOiBbXTtcbiAgICBpZiAoZi5mb2xsb3d1cF9hdCAmJiAvXlxcZHs0fS1cXGR7Mn0tXFxkezJ9JC8udGVzdChmLmZvbGxvd3VwX2F0KSkgdGFncy5wdXNoKGBmb2xsb3d1cDoke2YuZm9sbG93dXBfYXR9YCk7XG5cbiAgICBjb25zdCB7IGRhdGE6IGV4aXN0aW5nIH0gPSBhd2FpdCBzdXBhYmFzZVxuICAgICAgLmZyb20oXCJ1c2VyX21lbW9yeVwiKVxuICAgICAgLnNlbGVjdChcImlkLCBjb25maWRlbmNlLCB0YWdzXCIpXG4gICAgICAuZXEoXCJ1c2VyX2lkXCIsIHVzZXJJZClcbiAgICAgIC5lcShcImNhdGVnb3J5XCIsIGYuY2F0ZWdvcnkpXG4gICAgICAuZXEoXCJrZXlcIiwgZi5rZXkuc2xpY2UoMCwgNjApKVxuICAgICAgLm1heWJlU2luZ2xlKCk7XG5cbiAgICBjb25zdCBwYXRjaDogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gPSB7XG4gICAgICB2YWx1ZTogZi52YWx1ZSxcbiAgICAgIGxhc3RfcmVpbmZvcmNlZF9hdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuICAgICAgdGFnczogQXJyYXkuZnJvbShuZXcgU2V0KFsuLi4oZXhpc3Rpbmc/LnRhZ3MgPz8gW10pLCAuLi50YWdzXSkpLFxuICAgIH07XG4gICAgaWYgKGVtYmVkZGluZ3NbaV0pIHBhdGNoLmVtYmVkZGluZyA9IGVtYmVkZGluZ3NbaV07XG5cbiAgICBpZiAoZXhpc3RpbmcpIHtcbiAgICAgIHBhdGNoLmNvbmZpZGVuY2UgPSBNYXRoLm1heChleGlzdGluZy5jb25maWRlbmNlID8/IDAsIGYuY29uZmlkZW5jZSA/PyAwLjcpO1xuICAgICAgY29uc3QgeyBlcnJvciB9ID0gYXdhaXQgc3VwYWJhc2UuZnJvbShcInVzZXJfbWVtb3J5XCIpLnVwZGF0ZShwYXRjaCkuZXEoXCJpZFwiLCBleGlzdGluZy5pZCk7XG4gICAgICBpZiAoZXJyb3IpIGNvbnNvbGUuZXJyb3IoXCJwYXNzaXZlIG1lbW9yeSB1cGRhdGUgZmFpbGVkOlwiLCBlcnJvci5tZXNzYWdlKTtcbiAgICAgIGVsc2UgcmVzdWx0LnN0b3JlZC5wdXNoKGAke2Yua2V5fTogJHtmLnZhbHVlfWApO1xuICAgIH0gZWxzZSB7XG4gICAgICBjb25zdCB7IGVycm9yIH0gPSBhd2FpdCBzdXBhYmFzZS5mcm9tKFwidXNlcl9tZW1vcnlcIikuaW5zZXJ0KHtcbiAgICAgICAgdXNlcl9pZDogdXNlcklkLFxuICAgICAgICBjYXRlZ29yeTogZi5jYXRlZ29yeSxcbiAgICAgICAga2V5OiBmLmtleS5zbGljZSgwLCA2MCksXG4gICAgICAgIHZhbHVlOiBmLnZhbHVlLFxuICAgICAgICB0YWdzOiBwYXRjaC50YWdzLFxuICAgICAgICBjb25maWRlbmNlOiBmLmNvbmZpZGVuY2UgPz8gMC43LFxuICAgICAgICBzb3VyY2U6IFwib2JzZXJ2ZWRcIixcbiAgICAgICAgZW1iZWRkaW5nOiBlbWJlZGRpbmdzW2ldID8/IG51bGwsXG4gICAgICB9KTtcbiAgICAgIGlmIChlcnJvcikgY29uc29sZS5lcnJvcihcInBhc3NpdmUgbWVtb3J5IGluc2VydCBmYWlsZWQ6XCIsIGVycm9yLm1lc3NhZ2UpO1xuICAgICAgZWxzZSByZXN1bHQuc3RvcmVkLnB1c2goYCR7Zi5rZXl9OiAke2YudmFsdWV9YCk7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHJlc3VsdDtcbn1cblxuIiwgIi8vIE5hdHVyYWwtbGFuZ3VhZ2UgYWN0aW9ucy5cbi8vXG4vLyBSaW4gb24gVGVsZWdyYW0gaGFzIG5vIHNsYXNoIGNvbW1hbmRzLiBFdmVyeXRoaW5nIGEgY29tbWFuZCB1c2VkIHRvIGRvIFx1MjAxNFxuLy8gc2F2aW5nLCBmb3JnZXR0aW5nLCBsaXN0aW5nIG1lbW9yeSwgc3dpdGNoaW5nIG1vZGUsIHZvaWNlIHJlcGxpZXMsIGNoZWNrLWlucyxcbi8vIGxpbmtpbmcgYSB3ZWIgYWNjb3VudCwgc3RhcnRpbmcgYSBmcmVzaCB0aHJlYWQgXHUyMDE0IGlzIHJlY29nbmlzZWQgZnJvbSBvcmRpbmFyeVxuLy8gY29udmVyc2F0aW9uIGJ5IGEgc21hbGwsIGZhc3QgY2xhc3NpZmllciwgZXhlY3V0ZWQgZGV0ZXJtaW5pc3RpY2FsbHksIGFuZFxuLy8gdGhlbiBoYW5kZWQgdG8gdGhlIGNvbnZlcnNhdGlvbmFsIG1vZGVsIGFzIGEgZmFjdHVhbCBub3RlIHNvIHRoZSByZXBseSByZWFkc1xuLy8gbGlrZSBhIHBlcnNvbiwgbm90IGEgcmVjZWlwdC5cbi8vXG4vLyBUaGUgcnVsZSB0aGF0IG1hdHRlcnM6IHRoZSBjbGFzc2lmaWVyIG5ldmVyIHdyaXRlcyB0aGUgcmVwbHksIGFuZCB0aGVcbi8vIGNvbnZlcnNhdGlvbmFsIG1vZGVsIG5ldmVyIHBlcmZvcm1zIHRoZSBhY3Rpb24uIFJpbiBvbmx5IHNheXMgXCJzYXZlZFwiXG4vLyBiZWNhdXNlIGEgcm93IHdhcyBhY3R1YWxseSB3cml0dGVuLlxuXG5pbXBvcnQgeyBlbWJlZE9uZSB9IGZyb20gXCIuL2VtYmVkLnRzXCI7XG5pbXBvcnQgeyBnZW1pbmlHZW5lcmF0ZSwgZ2VtaW5pVGV4dCwgTU9ERUxTIH0gZnJvbSBcIi4vZ2VtaW5pLnRzXCI7XG5cbi8qIGVzbGludC1kaXNhYmxlIEB0eXBlc2NyaXB0LWVzbGludC9uby1leHBsaWNpdC1hbnkgKi9cbnR5cGUgQW55ID0gYW55O1xuXG5leHBvcnQgY29uc3QgTU9ERVMgPSBbXG4gIFwiYXNzaXN0YW50XCIsIFwiZ3Jvd3RoX3BhcnRuZXJcIiwgXCJ0aGVyYXBpc3RfbGl0ZVwiLCBcInN0cmF0ZWdpY1wiLCBcImNhc3VhbFwiLCBcImNyZWF0aXZlXCIsIFwidGVjaG5pY2FsXCIsXG5dO1xuXG5leHBvcnQgaW50ZXJmYWNlIERldGVjdGVkQWN0aW9uIHtcbiAgYWN0aW9uOlxuICAgIHwgXCJub25lXCJcbiAgICB8IFwic2F2ZV9tZW1vcnlcIlxuICAgIHwgXCJmb3JnZXRfbWVtb3J5XCJcbiAgICB8IFwibGlzdF9tZW1vcnlcIlxuICAgIHwgXCJzZXRfbW9kZVwiXG4gICAgfCBcInZvaWNlX3ByZWZcIlxuICAgIHwgXCJjaGVja2luc1wiXG4gICAgfCBcImxpbmtfYWNjb3VudFwiXG4gICAgfCBcIm5ld190aHJlYWRcIlxuICAgIHwgXCJ1bmxpbmtcIjtcbiAgLyoqIEZyZWUtdGV4dCBwYXlsb2FkOiB0aGUgdGhpbmcgdG8gcmVtZW1iZXIsIHRoZSB3b3JkcyB0byBmb3JnZXQsIHRoZSBjb2RlLiAqL1xuICB2YWx1ZT86IHN0cmluZztcbiAgLyoqIEZvciBzZXRfbW9kZSAvIHZvaWNlX3ByZWYgLyBjaGVja2lucy4gKi9cbiAgb3B0aW9uPzogc3RyaW5nO1xufVxuXG5jb25zdCBTWVNURU0gPSBgWW91IHJlYWQgb25lIG1lc3NhZ2UgYSBwZXJzb24gc2VudCB0aGVpciBhc3Npc3RhbnQgYW5kIGRlY2lkZSB3aGV0aGVyIGl0IGlzIGFza2luZyB0aGUgYXNzaXN0YW50IHRvIHBlcmZvcm0gYSBzZXR0aW5ncyBvciBtZW1vcnkgYWN0aW9uLiBBbG1vc3QgYWx3YXlzIHRoZSBhbnN3ZXIgaXMgXCJub25lXCIgXHUyMDE0IHBlb3BsZSBhcmUganVzdCB0YWxraW5nLlxuXG5SZXR1cm4gT05MWSBKU09OOiB7XCJhY3Rpb25cIjpcIi4uLlwiLFwidmFsdWVcIjpcIi4uLlwiLFwib3B0aW9uXCI6XCIuLi5cIn1cblxuQWN0aW9uczpcbi0gXCJzYXZlX21lbW9yeVwiIFx1MjAxNCB0aGV5IEVYUExJQ0lUTFkgYXNrZWQgaXQgdG8gcmVtZW1iZXIvc2F2ZS9ub3RlIHNvbWV0aGluZy4gdmFsdWUgPSB0aGUgdGhpbmcgdG8gcmVtZW1iZXIsIHdyaXR0ZW4gYXMgYSBzdGFuZGFsb25lIHNlbnRlbmNlLiAoQ2FzdWFsIG1lbnRpb25zIG9mIGZhY3RzIGFyZSBOT1QgdGhpcyBcdTIwMTQgYmFja2dyb3VuZCBleHRyYWN0aW9uIGhhbmRsZXMgdGhvc2UuKVxuLSBcImZvcmdldF9tZW1vcnlcIiBcdTIwMTQgdGhleSBleHBsaWNpdGx5IGFza2VkIGl0IHRvIGZvcmdldC9kZWxldGUvZXJhc2Ugc29tZXRoaW5nIHN0b3JlZC4gdmFsdWUgPSB0aGUga2V5IHdvcmRzIHRvIG1hdGNoLlxuLSBcImxpc3RfbWVtb3J5XCIgXHUyMDE0IHRoZXkgYXNrZWQgd2hhdCBpdCByZW1lbWJlcnMgLyBrbm93cyBhYm91dCB0aGVtIC8gd2hhdCdzIHN0b3JlZC5cbi0gXCJzZXRfbW9kZVwiIFx1MjAxNCB0aGV5IGFza2VkIGl0IHRvIGJlaGF2ZSBkaWZmZXJlbnRseSBpbiBhIGxhc3Rpbmcgd2F5LiBvcHRpb24gPSBvbmUgb2Y6IGFzc2lzdGFudCwgZ3Jvd3RoX3BhcnRuZXIsIHRoZXJhcGlzdF9saXRlLCBzdHJhdGVnaWMsIGNhc3VhbCwgY3JlYXRpdmUsIHRlY2huaWNhbC5cbi0gXCJ2b2ljZV9wcmVmXCIgXHUyMDE0IHRoZXkgYXNrZWQgYWJvdXQgaG93IGl0IHJlcGxpZXMgd2l0aCBhdWRpby4gb3B0aW9uID0gXCJvZmZcIiAodGV4dCBvbmx5KSwgXCJvblwiICh2b2ljZSBiYWNrIG9ubHkgd2hlbiB0aGV5IHNlbmQgdm9pY2UpLCBcImFsd2F5c1wiICh2b2ljZSBldmVyeSByZXBseSkuXG4tIFwiY2hlY2tpbnNcIiBcdTIwMTQgdGhleSBhc2tlZCBpdCB0byBtZXNzYWdlIHRoZW0gZmlyc3QsIHN0b3AgbWVzc2FnaW5nIGZpcnN0LCBvciBjaGFuZ2UgaG93IG9mdGVuLiBvcHRpb24gPSBcIm9uXCIsIFwib2ZmXCIsIG9yIGEgZGlnaXQgMC01IGZvciBhIGRhaWx5IGNhcC5cbi0gXCJsaW5rX2FjY291bnRcIiBcdTIwMTQgdGhleSB3YW50IHRvIGNvbm5lY3QgdGhpcyBjaGF0IHRvIHRoZWlyIFJpbiB3ZWIgYWNjb3VudC4gdmFsdWUgPSB0aGUgY29kZSBpZiBvbmUgYXBwZWFycyBpbiB0aGUgbWVzc2FnZSwgZWxzZSBlbXB0eS5cbi0gXCJuZXdfdGhyZWFkXCIgXHUyMDE0IHRoZXkgYXNrZWQgdG8gc3RhcnQgb3ZlciAvIGZyZXNoIGNvbnZlcnNhdGlvbiAvIGNsZWFyIHRoZSBjaGF0IGNvbnRleHQuXG4tIFwidW5saW5rXCIgXHUyMDE0IHRoZXkgYXNrZWQgdG8gZGlzY29ubmVjdCB0aGlzIGNoYXQgZW50aXJlbHkuXG4tIFwibm9uZVwiIFx1MjAxNCBhbnl0aGluZyBlbHNlLCBpbmNsdWRpbmcgcXVlc3Rpb25zIGFib3V0IHRoZXNlIGZlYXR1cmVzIHJhdGhlciB0aGFuIHJlcXVlc3RzIHRvIGNoYW5nZSB0aGVtLlxuXG5CZSBjb25zZXJ2YXRpdmUuIElmIHVuc3VyZSwgcmV0dXJuIFwibm9uZVwiLmA7XG5cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBkZXRlY3RBY3Rpb24odGV4dDogc3RyaW5nKTogUHJvbWlzZTxEZXRlY3RlZEFjdGlvbj4ge1xuICBpZiAoIXRleHQgfHwgdGV4dC50cmltKCkubGVuZ3RoIDwgMikgcmV0dXJuIHsgYWN0aW9uOiBcIm5vbmVcIiB9O1xuICB0cnkge1xuICAgIGNvbnN0IHJlcyA9IGF3YWl0IGdlbWluaUdlbmVyYXRlKE1PREVMUy5jaGF0TGl0ZSwge1xuICAgICAgc3lzdGVtSW5zdHJ1Y3Rpb246IHsgcGFydHM6IFt7IHRleHQ6IFNZU1RFTSB9XSB9LFxuICAgICAgY29udGVudHM6IFt7IHJvbGU6IFwidXNlclwiLCBwYXJ0czogW3sgdGV4dDogdGV4dC5zbGljZSgwLCAyMDAwKSB9XSB9XSxcbiAgICAgIGdlbmVyYXRpb25Db25maWc6IHsgdGVtcGVyYXR1cmU6IDAgfSxcbiAgICB9KTtcbiAgICBpZiAoIXJlcy5vaykge1xuICAgICAgY29uc29sZS5lcnJvcihcImFjdGlvbiBkZXRlY3Rpb24gZmFpbGVkOlwiLCByZXMuc3RhdHVzLCAoYXdhaXQgcmVzLnRleHQoKSkuc2xpY2UoMCwgMzAwKSk7XG4gICAgICByZXR1cm4geyBhY3Rpb246IFwibm9uZVwiIH07XG4gICAgfVxuICAgIGNvbnN0IGJvZHkgPSBhd2FpdCByZXMuanNvbigpLmNhdGNoKCgpID0+ICh7fSkpO1xuICAgIGNvbnN0IHJhdyA9IGdlbWluaVRleHQoYm9keSk7XG4gICAgY29uc3QgbWF0Y2ggPSByYXcubWF0Y2goL1xce1tcXHNcXFNdKlxcfS8pO1xuICAgIGlmICghbWF0Y2gpIHJldHVybiB7IGFjdGlvbjogXCJub25lXCIgfTtcbiAgICBjb25zdCBwYXJzZWQgPSBKU09OLnBhcnNlKG1hdGNoWzBdKTtcbiAgICByZXR1cm4geyBhY3Rpb246IHBhcnNlZC5hY3Rpb24gPz8gXCJub25lXCIsIHZhbHVlOiBwYXJzZWQudmFsdWUgPz8gXCJcIiwgb3B0aW9uOiBwYXJzZWQub3B0aW9uID8/IFwiXCIgfTtcbiAgfSBjYXRjaCAoZSkge1xuICAgIGNvbnNvbGUuZXJyb3IoXCJhY3Rpb24gZGV0ZWN0aW9uIGVycm9yOlwiLCBlKTtcbiAgICByZXR1cm4geyBhY3Rpb246IFwibm9uZVwiIH07XG4gIH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBBY3Rpb25PdXRjb21lIHtcbiAgLyoqIEZhY3R1YWwgbm90ZSBoYW5kZWQgdG8gdGhlIGNvbnZlcnNhdGlvbmFsIG1vZGVsLiBOZXZlciBzaG93biB2ZXJiYXRpbS4gKi9cbiAgbm90ZTogc3RyaW5nO1xuICAvKiogVHJ1ZSB3aGVuIHRoZSB3aG9sZSB0dXJuIGlzIGFuc3dlcmVkIGJ5IHRoaXMgYWN0aW9uIGFsb25lLiAqL1xuICB0ZXJtaW5hbD86IGJvb2xlYW47XG59XG5cbi8qKlxuICogUGVyZm9ybSB0aGUgZGV0ZWN0ZWQgYWN0aW9uIGFnYWluc3QgdGhlIGRhdGFiYXNlLiBSZXR1cm5zIGEgcGxhaW4gc3RhdGVtZW50XG4gKiBvZiB3aGF0IGFjdHVhbGx5IGhhcHBlbmVkIFx1MjAxNCBzdWNjZXNzIG9yIGZhaWx1cmUsIG5vIHNwaW4uXG4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBydW5BY3Rpb24oXG4gIHN1cGFiYXNlOiBBbnksXG4gIGxpbms6IEFueSxcbiAgZGV0ZWN0ZWQ6IERldGVjdGVkQWN0aW9uLFxuICBoZWxwZXJzOiB7XG4gICAgY29uc3VtZUNvZGU6IChjb2RlOiBzdHJpbmcpID0+IFByb21pc2U8eyB1c2VySWQ/OiBzdHJpbmc7IG1lcmdlZD86IG51bWJlcjsgZXJyb3I/OiBzdHJpbmcgfT47XG4gIH0sXG4pOiBQcm9taXNlPEFjdGlvbk91dGNvbWUgfCBudWxsPiB7XG4gIGNvbnN0IHsgYWN0aW9uLCB2YWx1ZSA9IFwiXCIsIG9wdGlvbiA9IFwiXCIgfSA9IGRldGVjdGVkO1xuXG4gIHN3aXRjaCAoYWN0aW9uKSB7XG4gICAgY2FzZSBcInNhdmVfbWVtb3J5XCI6IHtcbiAgICAgIGNvbnN0IHRoaW5nID0gdmFsdWUudHJpbSgpO1xuICAgICAgaWYgKCF0aGluZykgcmV0dXJuIHsgbm90ZTogXCJBQ1RJT046IHRoZXkgYXNrZWQgeW91IHRvIHJlbWVtYmVyIHNvbWV0aGluZyBidXQgaXQgd2Fzbid0IGNsZWFyIHdoYXQuIE5vdGhpbmcgd2FzIHNhdmVkLiBBc2sgd2hhdCBleGFjdGx5IHRvIGhvbGQgb250by5cIiB9O1xuICAgICAgY29uc3QgZW1iZWRkaW5nID0gYXdhaXQgZW1iZWRPbmUodGhpbmcpLmNhdGNoKCgpID0+IG51bGwpO1xuICAgICAgY29uc3QgeyBlcnJvciB9ID0gYXdhaXQgc3VwYWJhc2UuZnJvbShcInVzZXJfbWVtb3J5XCIpLmluc2VydCh7XG4gICAgICAgIHVzZXJfaWQ6IGxpbmsudXNlcl9pZCxcbiAgICAgICAgY2F0ZWdvcnk6IFwiZmFjdFwiLFxuICAgICAgICBrZXk6IHRoaW5nLnNsaWNlKDAsIDYwKSxcbiAgICAgICAgdmFsdWU6IHRoaW5nLFxuICAgICAgICBzb3VyY2U6IFwiZXhwbGljaXRcIixcbiAgICAgICAgY29uZmlkZW5jZTogMSxcbiAgICAgICAgZW1iZWRkaW5nLFxuICAgICAgfSk7XG4gICAgICBpZiAoZXJyb3IpIHtcbiAgICAgICAgY29uc29sZS5lcnJvcihcIm5sIHNhdmVfbWVtb3J5IGZhaWxlZDpcIiwgZXJyb3IpO1xuICAgICAgICByZXR1cm4geyBub3RlOiBgQUNUSU9OIEZBSUxFRDogdGhlIHNhdmUgZGlkIE5PVCBnbyB0aHJvdWdoICgke2Vycm9yLm1lc3NhZ2V9KS4gVGVsbCB0aGVtIHBsYWlubHkgaXQgZGlkbid0IHNhdmUgYW5kIHlvdSdyZSBub3QgcHJldGVuZGluZyBvdGhlcndpc2UuYCB9O1xuICAgICAgfVxuICAgICAgcmV0dXJuIHsgbm90ZTogYEFDVElPTiBTVUNDRUVERUQ6IFwiJHt0aGluZ31cIiBpcyBub3cgc3RvcmVkIGluIHRoZWlyIG1lbW9yeS4gWW91IG1heSBjb25maXJtIGl0IGJyaWVmbHkgYW5kIG5hdHVyYWxseS5gIH07XG4gICAgfVxuXG4gICAgY2FzZSBcImZvcmdldF9tZW1vcnlcIjoge1xuICAgICAgY29uc3QgcSA9IHZhbHVlLnRyaW0oKTtcbiAgICAgIGlmICghcSkgcmV0dXJuIHsgbm90ZTogXCJBQ1RJT046IHRoZXkgYXNrZWQgeW91IHRvIGZvcmdldCBzb21ldGhpbmcgYnV0IGRpZG4ndCBzYXkgd2hhdC4gTm90aGluZyB3YXMgZGVsZXRlZC4gQXNrIHdoaWNoIHBhcnQuXCIgfTtcbiAgICAgIGNvbnN0IHBhdHRlcm4gPSBgJSR7cS5yZXBsYWNlKC9bJV9dL2csIFwiXCIpfSVgO1xuICAgICAgY29uc3QgeyBkYXRhOiBkZWxldGVkLCBlcnJvciB9ID0gYXdhaXQgc3VwYWJhc2VcbiAgICAgICAgLmZyb20oXCJ1c2VyX21lbW9yeVwiKVxuICAgICAgICAuZGVsZXRlKClcbiAgICAgICAgLmVxKFwidXNlcl9pZFwiLCBsaW5rLnVzZXJfaWQpXG4gICAgICAgIC5vcihga2V5LmlsaWtlLiR7cGF0dGVybn0sdmFsdWUuaWxpa2UuJHtwYXR0ZXJufWApXG4gICAgICAgIC5zZWxlY3QoXCJrZXksIHZhbHVlXCIpO1xuICAgICAgaWYgKGVycm9yKSB7XG4gICAgICAgIGNvbnNvbGUuZXJyb3IoXCJubCBmb3JnZXRfbWVtb3J5IGZhaWxlZDpcIiwgZXJyb3IpO1xuICAgICAgICByZXR1cm4geyBub3RlOiBgQUNUSU9OIEZBSUxFRDogbm90aGluZyB3YXMgZGVsZXRlZCAoJHtlcnJvci5tZXNzYWdlfSkuIFNheSBzbyBwbGFpbmx5IFx1MjAxNCBkbyBub3QgY2xhaW0gYW55dGhpbmcgd2FzIHJlbW92ZWQuYCB9O1xuICAgICAgfVxuICAgICAgY29uc3QgY291bnQgPSBkZWxldGVkPy5sZW5ndGggPz8gMDtcbiAgICAgIGlmICghY291bnQpIHJldHVybiB7IG5vdGU6IGBBQ1RJT046IG5vdGhpbmcgc3RvcmVkIG1hdGNoZXMgXCIke3F9XCIsIHNvIHRoZXJlIHdhcyBub3RoaW5nIHRvIGRlbGV0ZS4gU2F5IHRoYXQuYCB9O1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgbm90ZTogYEFDVElPTiBTVUNDRUVERUQ6IGRlbGV0ZWQgJHtjb3VudH0gc3RvcmVkICR7Y291bnQgPT09IDEgPyBcImVudHJ5XCIgOiBcImVudHJpZXNcIn06ICR7ZGVsZXRlZC5tYXAoKGQ6IEFueSkgPT4gZC5rZXkpLmpvaW4oXCI7IFwiKX0uIENvbmZpcm0gaXQsIGFuZCBzdG9wIHVzaW5nIHRob3NlIGRldGFpbHMgZnJvbSBub3cgb24uIFBhc3QgbWVzc2FnZXMgaW4gdGhpcyB0aHJlYWQgc3RpbGwgZXhpc3QgXHUyMDE0IG1lbnRpb24gdGhhdCBvbmx5IGlmIHJlbGV2YW50LmAsXG4gICAgICB9O1xuICAgIH1cblxuICAgIGNhc2UgXCJsaXN0X21lbW9yeVwiOiB7XG4gICAgICBjb25zdCB7IGRhdGEsIGVycm9yIH0gPSBhd2FpdCBzdXBhYmFzZVxuICAgICAgICAuZnJvbShcInVzZXJfbWVtb3J5XCIpXG4gICAgICAgIC5zZWxlY3QoXCJjYXRlZ29yeSwga2V5LCB2YWx1ZVwiKVxuICAgICAgICAuZXEoXCJ1c2VyX2lkXCIsIGxpbmsudXNlcl9pZClcbiAgICAgICAgLm9yZGVyKFwibGFzdF9yZWluZm9yY2VkX2F0XCIsIHsgYXNjZW5kaW5nOiBmYWxzZSB9KVxuICAgICAgICAubGltaXQoMjApO1xuICAgICAgaWYgKGVycm9yKSB7XG4gICAgICAgIHJldHVybiB7IG5vdGU6IGBBQ1RJT04gRkFJTEVEOiBjb3VsZG4ndCByZWFkIHRoZWlyIG1lbW9yeSBzdG9yZSAoJHtlcnJvci5tZXNzYWdlfSkuIFNheSB5b3UgY2FuJ3Qgc2VlIGl0IHJpZ2h0IG5vdyByYXRoZXIgdGhhbiBndWVzc2luZyB3aGF0J3MgaW4gaXQuYCB9O1xuICAgICAgfVxuICAgICAgaWYgKCFkYXRhPy5sZW5ndGgpIHJldHVybiB7IG5vdGU6IFwiQUNUSU9OOiB0aGVpciBtZW1vcnkgc3RvcmUgaXMgZ2VudWluZWx5IGVtcHR5LiBTYXkgc28uXCIgfTtcbiAgICAgIGNvbnN0IGxpbmVzID0gZGF0YS5tYXAoKG06IEFueSkgPT4gYCgke20uY2F0ZWdvcnl9KSAke20ua2V5fTogJHttLnZhbHVlfWApLmpvaW4oXCJcXG5cIik7XG4gICAgICByZXR1cm4geyBub3RlOiBgQUNUSU9OOiB0aGlzIGlzIGV4YWN0bHkgd2hhdCBpcyBzdG9yZWQgXHUyMDE0IHJlY2l0ZSBmcm9tIHRoaXMgYW5kIG5vdGhpbmcgZWxzZTpcXG4ke2xpbmVzfWAgfTtcbiAgICB9XG5cbiAgICBjYXNlIFwic2V0X21vZGVcIjoge1xuICAgICAgY29uc3Qgd2FudGVkID0gKG9wdGlvbiB8fCBcIlwiKS50b0xvd2VyQ2FzZSgpLnJlcGxhY2UoL1tcXHMtXS9nLCBcIl9cIik7XG4gICAgICBpZiAoIU1PREVTLmluY2x1ZGVzKHdhbnRlZCkpIHJldHVybiB7IG5vdGU6IFwiQUNUSU9OOiBtb2RlIGNoYW5nZSByZXF1ZXN0ZWQgYnV0IHRoZSBtb2RlIHdhc24ndCBjbGVhci4gTm90aGluZyBjaGFuZ2VkLlwiIH07XG4gICAgICBjb25zdCB7IGVycm9yIH0gPSBhd2FpdCBzdXBhYmFzZS5mcm9tKFwiYm90X2NoYW5uZWxfbGlua3NcIilcbiAgICAgICAgLnVwZGF0ZSh7IG1ldGFkYXRhOiB7IC4uLihsaW5rLm1ldGFkYXRhIHx8IHt9KSwgY29tcGFuaW9uX21vZGU6IHdhbnRlZCB9IH0pXG4gICAgICAgIC5lcShcImlkXCIsIGxpbmsuaWQpO1xuICAgICAgaWYgKGVycm9yKSByZXR1cm4geyBub3RlOiBgQUNUSU9OIEZBSUxFRDogbW9kZSB1bmNoYW5nZWQgKCR7ZXJyb3IubWVzc2FnZX0pLmAgfTtcbiAgICAgIGxpbmsubWV0YWRhdGEgPSB7IC4uLihsaW5rLm1ldGFkYXRhIHx8IHt9KSwgY29tcGFuaW9uX21vZGU6IHdhbnRlZCB9O1xuICAgICAgcmV0dXJuIHsgbm90ZTogYEFDVElPTiBTVUNDRUVERUQ6IHlvdXIgbWFubmVyIGlzIG5vdyBzZXQgdG8gXCIke3dhbnRlZH1cIiBmb3IgdGhpcyBjaGF0LCBmcm9tIHRoaXMgcmVwbHkgb253YXJkLiBTaGlmdCBpbnRvIGl0IGltbWVkaWF0ZWx5IHJhdGhlciB0aGFuIGFubm91bmNpbmcgaXQgZm9ybWFsbHkuYCB9O1xuICAgIH1cblxuICAgIGNhc2UgXCJ2b2ljZV9wcmVmXCI6IHtcbiAgICAgIGNvbnN0IG1vZGUgPSBvcHRpb24gPT09IFwib2ZmXCIgPyBcIm9mZlwiIDogb3B0aW9uID09PSBcImFsd2F5c1wiID8gXCJhbHdheXNcIiA6IFwib25cIjtcbiAgICAgIGNvbnN0IHsgZXJyb3IgfSA9IGF3YWl0IHN1cGFiYXNlLmZyb20oXCJib3RfY2hhbm5lbF9saW5rc1wiKVxuICAgICAgICAudXBkYXRlKHsgbWV0YWRhdGE6IHsgLi4uKGxpbmsubWV0YWRhdGEgfHwge30pLCB2b2ljZV9yZXBsaWVzOiBtb2RlICE9PSBcIm9mZlwiLCB2b2ljZV9tb2RlOiBtb2RlIH0gfSlcbiAgICAgICAgLmVxKFwiaWRcIiwgbGluay5pZCk7XG4gICAgICBpZiAoZXJyb3IpIHJldHVybiB7IG5vdGU6IGBBQ1RJT04gRkFJTEVEOiB2b2ljZSBwcmVmZXJlbmNlIHVuY2hhbmdlZCAoJHtlcnJvci5tZXNzYWdlfSkuYCB9O1xuICAgICAgbGluay5tZXRhZGF0YSA9IHsgLi4uKGxpbmsubWV0YWRhdGEgfHwge30pLCB2b2ljZV9yZXBsaWVzOiBtb2RlICE9PSBcIm9mZlwiLCB2b2ljZV9tb2RlOiBtb2RlIH07XG4gICAgICByZXR1cm4ge1xuICAgICAgICBub3RlOiBgQUNUSU9OIFNVQ0NFRURFRDogdm9pY2UgcmVwbGllcyBzZXQgdG8gXCIke21vZGV9XCIgXHUyMDE0ICR7XG4gICAgICAgICAgbW9kZSA9PT0gXCJvZmZcIiA/IFwidGV4dCBvbmx5IGZyb20gbm93IG9uXCJcbiAgICAgICAgICA6IG1vZGUgPT09IFwiYWx3YXlzXCIgPyBcInlvdSdsbCBzZW5kIGEgdm9pY2Ugbm90ZSB3aXRoIGV2ZXJ5IHJlcGx5XCJcbiAgICAgICAgICA6IFwieW91J2xsIGFuc3dlciB2b2ljZSBub3RlcyB3aXRoIGEgdm9pY2Ugbm90ZSwgdGV4dCB3aXRoIHRleHRcIlxuICAgICAgICB9LiBDb25maXJtIGJyaWVmbHkuYCxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgY2FzZSBcImNoZWNraW5zXCI6IHtcbiAgICAgIGNvbnN0IG9wdCA9IChvcHRpb24gfHwgXCJcIikudG9Mb3dlckNhc2UoKS50cmltKCk7XG4gICAgICBpZiAoL15cXGQrJC8udGVzdChvcHQpKSB7XG4gICAgICAgIGNvbnN0IGNhcCA9IE1hdGgubWF4KDAsIE1hdGgubWluKDUsIHBhcnNlSW50KG9wdCwgMTApKSk7XG4gICAgICAgIGNvbnN0IHsgZXJyb3IgfSA9IGF3YWl0IHN1cGFiYXNlLmZyb20oXCJ1c2VyX3NldHRpbmdzXCIpXG4gICAgICAgICAgLnVwZGF0ZSh7IHRlbGVncmFtX2NoZWNraW5fbWF4X3Blcl9kYXk6IGNhcCwgdGVsZWdyYW1fY2hlY2tpbnNfZW5hYmxlZDogY2FwID4gMCwgdGVsZWdyYW1fcHJvYWN0aXZlOiBjYXAgPiAwIH0pXG4gICAgICAgICAgLmVxKFwidXNlcl9pZFwiLCBsaW5rLnVzZXJfaWQpO1xuICAgICAgICBpZiAoZXJyb3IpIHJldHVybiB7IG5vdGU6IGBBQ1RJT04gRkFJTEVEOiBjaGVjay1pbiBzZXR0aW5ncyB1bmNoYW5nZWQgKCR7ZXJyb3IubWVzc2FnZX0pLmAgfTtcbiAgICAgICAgcmV0dXJuIHsgbm90ZTogYEFDVElPTiBTVUNDRUVERUQ6IGNoZWNrLWlucyBjYXBwZWQgYXQgJHtjYXB9IGEgZGF5JHtjYXAgPT09IDAgPyBcIiwgd2hpY2ggbWVhbnMgdGhleSdyZSBvZmZcIiA6IFwiXCJ9LmAgfTtcbiAgICAgIH1cbiAgICAgIGlmIChvcHQgPT09IFwib25cIiB8fCBvcHQgPT09IFwib2ZmXCIpIHtcbiAgICAgICAgY29uc3Qgb24gPSBvcHQgPT09IFwib25cIjtcbiAgICAgICAgY29uc3QgeyBlcnJvciB9ID0gYXdhaXQgc3VwYWJhc2UuZnJvbShcInVzZXJfc2V0dGluZ3NcIilcbiAgICAgICAgICAudXBkYXRlKHsgdGVsZWdyYW1fY2hlY2tpbnNfZW5hYmxlZDogb24sIHRlbGVncmFtX3Byb2FjdGl2ZTogb24gfSlcbiAgICAgICAgICAuZXEoXCJ1c2VyX2lkXCIsIGxpbmsudXNlcl9pZCk7XG4gICAgICAgIGlmIChlcnJvcikgcmV0dXJuIHsgbm90ZTogYEFDVElPTiBGQUlMRUQ6IGNoZWNrLWluIHNldHRpbmdzIHVuY2hhbmdlZCAoJHtlcnJvci5tZXNzYWdlfSkuYCB9O1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIG5vdGU6IG9uXG4gICAgICAgICAgICA/IFwiQUNUSU9OIFNVQ0NFRURFRDogY2hlY2staW5zIGFyZSBvbiBcdTIwMTQgYXQgbW9zdCB0d2ljZSBhIGRheSwgb25seSBhYm91dCBzb21ldGhpbmcgc3BlY2lmaWMgdGhleSBhY3R1YWxseSB0b2xkIHlvdSwgbmV2ZXIgYSBnZW5lcmljIGhlbGxvLiBUaGV5IGNhbiBzd2l0Y2ggaXQgb2ZmIGFueSB0aW1lIGp1c3QgYnkgc2F5aW5nIHNvLlwiXG4gICAgICAgICAgICA6IFwiQUNUSU9OIFNVQ0NFRURFRDogY2hlY2staW5zIGFyZSBvZmYuIFlvdSB3b24ndCBtZXNzYWdlIGZpcnN0IGF0IGFsbCBub3cuXCIsXG4gICAgICAgIH07XG4gICAgICB9XG4gICAgICBjb25zdCB7IGRhdGE6IHMgfSA9IGF3YWl0IHN1cGFiYXNlXG4gICAgICAgIC5mcm9tKFwidXNlcl9zZXR0aW5nc1wiKVxuICAgICAgICAuc2VsZWN0KFwidGVsZWdyYW1fY2hlY2tpbnNfZW5hYmxlZCwgdGVsZWdyYW1fY2hlY2tpbl9tYXhfcGVyX2RheVwiKVxuICAgICAgICAuZXEoXCJ1c2VyX2lkXCIsIGxpbmsudXNlcl9pZCkubWF5YmVTaW5nbGUoKTtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIG5vdGU6IGBBQ1RJT046IG5vdGhpbmcgY2hhbmdlZC4gQ3VycmVudCBzdGF0ZSBcdTIwMTQgY2hlY2staW5zIGFyZSAke3M/LnRlbGVncmFtX2NoZWNraW5zX2VuYWJsZWQgPyBgb24sIGNhcHBlZCBhdCAke3MudGVsZWdyYW1fY2hlY2tpbl9tYXhfcGVyX2RheSA/PyAyfSBhIGRheWAgOiBcIm9mZlwifS4gVGVsbCB0aGVtIGFuZCBhc2sgd2hhdCB0aGV5J2QgbGlrZS5gLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICBjYXNlIFwibGlua19hY2NvdW50XCI6IHtcbiAgICAgIGNvbnN0IGNvZGUgPSAodmFsdWUgfHwgXCJcIikudHJpbSgpO1xuICAgICAgaWYgKCFjb2RlKSB7XG4gICAgICAgIHJldHVybiB7IG5vdGU6IFwiQUNUSU9OOiB0aGV5IHdhbnQgdG8gY29ubmVjdCB0aGlzIGNoYXQgdG8gdGhlaXIgUmluIHdlYiBhY2NvdW50IGJ1dCBnYXZlIG5vIGNvZGUuIFRoZXkgZ2V0IG9uZSBpbiBSaW4gdW5kZXIgU2V0dGluZ3MgXHUyMTkyIENvbm5lY3RlZCBBY2NvdW50cywgdGhlbiBqdXN0IHNlbmQgaXQgaGVyZS4gTWVudGlvbiBpdCdzIG9wdGlvbmFsIFx1MjAxNCB0aGlzIGNoYXQgd29ya3MgZmluZSBzdGFuZGFsb25lLlwiIH07XG4gICAgICB9XG4gICAgICBpZiAobGluay5tZXRhZGF0YT8udGVsZWdyYW1fbmF0aXZlID09PSBmYWxzZSkge1xuICAgICAgICByZXR1cm4geyBub3RlOiBcIkFDVElPTjogdGhpcyBjaGF0IGlzIGFscmVhZHkgY29ubmVjdGVkIHRvIGFuIFJpbiBhY2NvdW50LiBUbyBtb3ZlIGl0IHRvIGEgZGlmZmVyZW50IG9uZSB0aGV5J2QgbmVlZCB0byBkaXNjb25uZWN0IGZpcnN0LlwiIH07XG4gICAgICB9XG4gICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBoZWxwZXJzLmNvbnN1bWVDb2RlKGNvZGUpO1xuICAgICAgaWYgKHJlc3VsdC5lcnJvcikgcmV0dXJuIHsgbm90ZTogYEFDVElPTiBGQUlMRUQ6IG5vdCBjb25uZWN0ZWQuIFJlYXNvbjogJHtyZXN1bHQuZXJyb3J9YCB9O1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgbm90ZTogcmVzdWx0Lm1lcmdlZFxuICAgICAgICAgID8gXCJBQ1RJT04gU1VDQ0VFREVEOiB0aGlzIGNoYXQgaXMgbm93IGNvbm5lY3RlZCB0byB0aGVpciBSaW4gYWNjb3VudCwgYW5kIGV2ZXJ5dGhpbmcgZnJvbSB0aGlzIGNoYXQgbW92ZWQgYWNyb3NzIHdpdGggaXQuXCJcbiAgICAgICAgICA6IFwiQUNUSU9OIFNVQ0NFRURFRDogdGhpcyBjaGF0IGFuZCB0aGVpciBSaW4gYWNjb3VudCBhcmUgdGhlIHNhbWUgcGVyc29uIG5vdy5cIixcbiAgICAgIH07XG4gICAgfVxuXG4gICAgY2FzZSBcIm5ld190aHJlYWRcIjoge1xuICAgICAgYXdhaXQgc3VwYWJhc2UuZnJvbShcImJvdF9jaGFubmVsX2xpbmtzXCIpLnVwZGF0ZSh7IGNvbnZlcnNhdGlvbl9pZDogbnVsbCB9KS5lcShcImlkXCIsIGxpbmsuaWQpO1xuICAgICAgcmV0dXJuIHsgbm90ZTogXCJBQ1RJT04gU1VDQ0VFREVEOiBmcmVzaCB0aHJlYWQgc3RhcnRlZCBcdTIwMTQgeW91IG5vIGxvbmdlciBoYXZlIHRoaXMgY2hhdCdzIHJlY2VudCBtZXNzYWdlcyBpbiB2aWV3LCB0aG91Z2ggdGhlaXIgbG9uZy10ZXJtIG1lbW9yeSBpcyB1bnRvdWNoZWQuIFNheSB0aGF0IGJyaWVmbHkgYW5kIGludml0ZSB0aGVtIGluLlwiLCB0ZXJtaW5hbDogdHJ1ZSB9O1xuICAgIH1cblxuICAgIGNhc2UgXCJ1bmxpbmtcIjoge1xuICAgICAgYXdhaXQgc3VwYWJhc2UuZnJvbShcImJvdF9jaGFubmVsX2xpbmtzXCIpLmRlbGV0ZSgpLmVxKFwiaWRcIiwgbGluay5pZCk7XG4gICAgICByZXR1cm4geyBub3RlOiBcIkFDVElPTiBTVUNDRUVERUQ6IHRoaXMgY2hhdCBpcyBkaXNjb25uZWN0ZWQuIFNheSBnb29kYnllIHdhcm1seSBhbmQgYnJpZWZseSwgYW5kIG1lbnRpb24gdGhleSBjYW4gcmVjb25uZWN0IGFueSB0aW1lIGJ5IG1lc3NhZ2luZyBhZ2Fpbi5cIiwgdGVybWluYWw6IHRydWUgfTtcbiAgICB9XG5cbiAgICBkZWZhdWx0OlxuICAgICAgcmV0dXJuIG51bGw7XG4gIH1cbn1cbiJdLAogICJtYXBwaW5ncyI6ICI7QUFHQSwyQkFBNkI7OztBQ0E3QixJQUFNLE1BQU07QUFFTCxTQUFTLFdBQW1CO0FBQ2pDLFFBQU0sUUFBUSxLQUFLLElBQUksSUFBSSxvQkFBb0I7QUFDL0MsTUFBSSxDQUFDLE1BQU8sT0FBTSxJQUFJLE1BQU0sc0NBQXNDO0FBQ2xFLFNBQU87QUFDVDtBQUdBLGVBQXNCLGNBQWMsT0FBZ0M7QUFDbEUsUUFBTSxT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
