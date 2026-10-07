import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireUser, isAuthResponse } from "./_shared/auth.ts";
import { embedOne } from "./_shared/embed.ts";
import { INTEGRITY_RULES, buildCapabilityNotes } from "./_shared/brain.ts";
import { MODELS, geminiStream, geminiStreamAsOpenAI } from "./_shared/ai.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

async function buildCognitiveState(userId: string, supabase: any, userName: string, companionMode: string): Promise<CognitiveState> {
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
    // Fetch semantic memory
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
          case "personal": case "preference": case "fact":
            state.personalFacts.push(entry); break;
          default: state.personalFacts.push(entry); break;
        }
      }
    }

    // Fetch recent episodic summaries
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
      state.recentMilestones = summaries.flatMap((s: any) => s.milestones || []).slice(0, 5);
      state.recentTopics = summaries.flatMap((s: any) => s.key_topics || []).slice(0, 8);
    }

    // Fetch emotional trend (last 15 patterns)
    const { data: emotions } = await supabase
      .from("emotional_patterns")
      .select("emotion, polarity, intensity, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(15);

    if (emotions && emotions.length > 0) {
      const negCount = emotions.filter((e: any) => e.polarity === "negative").length;
      const posCount = emotions.filter((e: any) => e.polarity === "positive").length;
      if (negCount > posCount * 1.5) state.emotionalTrend = "declining";
      else if (posCount > negCount * 1.5) state.emotionalTrend = "improving";
      else state.emotionalTrend = "stable";

      const recentEmotions = emotions.slice(0, 3).map((e: any) => e.emotion);
      state.recentEmotionalTone = recentEmotions[0] || "neutral";
    }

    // Fetch recent identity evolution
    const { data: evolution } = await supabase
      .from("identity_evolution")
      .select("dimension, score, delta, note")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(6);

    if (evolution && evolution.length > 0) {
      const improvements = evolution.filter((e: any) => e.delta > 0);
      if (improvements.length > 0) {
        state.identityGrowth = improvements.map((e: any) => `${e.dimension} (+${e.delta.toFixed(1)})`).join(", ");
      }
    }

    // Fetch behavioral insights for deeper understanding
    const { data: insights } = await supabase
      .from("behavioral_insights")
      .select("pattern_type, description, suggestion")
      .eq("user_id", userId)
      .eq("acknowledged", false)
      .order("created_at", { ascending: false })
      .limit(3);

    if (insights && insights.length > 0) {
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

  if (state.personalFacts.length > 0) {
    sections.push(`**Personal Knowledge:** ${state.personalFacts.slice(0, 6).join(" | ")}`);
  }

  if (state.goals.length > 0) {
    sections.push(`**Active Goals:** ${state.goals.slice(0, 5).join(" | ")}`);
  }

  if (state.projects.length > 0) {
    sections.push(`**Current Projects:** ${state.projects.slice(0, 4).join(" | ")}`);
  }

  if (state.interests.length > 0) {
    sections.push(`**Key Interests:** ${state.interests.slice(0, 5).join(" | ")}`);
  }

  if (state.triggers.length > 0) {
    sections.push(`**Known Stress Triggers:** ${state.triggers.slice(0, 3).join(" | ")}`);
  }

  if (state.motivators.length > 0) {
    sections.push(`**Motivators:** ${state.motivators.slice(0, 3).join(" | ")}`);
  }

  if (state.patterns.length > 0) {
    sections.push(`**Behavioral Patterns:** ${state.patterns.slice(0, 4).join(" | ")}`);
  }

  if (state.recentTopics.length > 0) {
    sections.push(`**Recent Conversation Topics:** ${state.recentTopics.slice(0, 5).join(", ")}`);
  }

  sections.push(`**Emotional State:** Current tone is ${state.recentEmotionalTone}. Trend: ${state.emotionalTrend}.`);

  if (state.unresolvedThreads.length > 0) {
    sections.push(`**Unresolved Threads:** ${state.unresolvedThreads.slice(0, 3).join("; ")}`);
  }

  if (state.recentMilestones.length > 0) {
    sections.push(`**Recent Milestones:** ${state.recentMilestones.slice(0, 3).join("; ")}`);
  }

  if (state.identityGrowth) {
    sections.push(`**Identity Growth Detected:** ${state.identityGrowth}`);
  }

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
- You are Aurora, a dedicated growth partner who genuinely cares about this person's evolution.
- Challenge them constructively — "Have you considered the opposite?" "What would the bravest version of you do here?"
- Celebrate wins with specific praise: "That took real courage" not just "Great job!"
- Connect dots across conversations: "This reminds me of what you said about..."
- Push them beyond comfort zones while being a safe landing pad.
- Ask powerful questions: "What's the real fear underneath this?" "If you knew you couldn't fail, what would you do?"`,

    therapist_lite: `
**Mode: Supportive Companion**
- Emotionally attuned, non-judgmental, deeply empathetic — like the best listener someone has ever had.
- ALWAYS reflect feelings before offering anything else: "It sounds like you're feeling..." 
- Use open-ended questions that invite exploration: "What's coming up for you around this?" "Tell me more about that."
- Validate emotions genuinely — not performatively. "That makes complete sense given what you've been through."
- Sit with discomfort — don't rush to fix. Sometimes people need to be heard, not helped.
- Gently explore patterns: "I've noticed you tend to..." "Does this feel familiar?"
- Know your limits — for serious mental health concerns, warmly encourage professional support.`,

    strategic: `
**Mode: Strategic Co-Founder**
- Think like a world-class strategic advisor who has built and scaled companies.
- First principles thinking: strip away assumptions, find the core truth.
- Systems thinking: identify leverage points, second and third-order effects.
- Be direct and decisive — "Here's what I'd do and why." No hedging.
- Challenge assumptions rigorously: "What evidence do you have for that?" "What if the opposite were true?"
- Frame everything in terms of leverage, optionality, and asymmetric upside.
- Use frameworks when helpful (Porter's Five Forces, Jobs-to-be-Done, etc.) but don't be academic about it.`,

    casual: `
**Mode: Best Friend**
- Warm, playful, relaxed — like texting your smartest, funniest friend.
- Match their energy perfectly. If they're excited, get hyped with them. If they're chill, keep it low-key.
- Use humor naturally — not forced jokes, but genuine wit and playful observations.
- Share relevant tangents, interesting "did you know" facts, and fun connections.
- Be comfortable with casual language, emojis if they use them, informal structures.
- Still be genuinely helpful and insightful — you're a brilliant friend, not just a fun one.
- Tease them affectionately when appropriate. Call out BS with a smile.`,

    creative: `
**Mode: Creative Collaborator**
- You are an endlessly imaginative creative partner with expansive, generative thinking.
- Think sideways, upside down, inside out. "What if we combined X with Y?" "Imagine this but in reverse."
- Use vivid language, unexpected metaphors, and thought experiments.
- Build on their ideas with "Yes, AND..." energy — never "Yes, BUT..."
- Encourage wild brainstorming: quantity over quality first, refinement later.
- Draw unexpected connections between disparate fields and ideas.
- Challenge creative blocks: "What would this look like if it were a song? A building? A recipe?"`,

    technical: `
**Mode: Senior Technical Mentor**
- Precise, detailed, deeply knowledgeable — like the best senior engineer you've ever worked with.
- Explain the "why" behind technical decisions, not just the "what."
- Include working code examples, proper error handling, and edge cases.
- Use proper terminology but explain it when introducing new concepts.
- Think about scalability, maintainability, security, and performance.
- Suggest better approaches when you see suboptimal patterns.
- Be opinionated about best practices but acknowledge trade-offs.`,
  };

  return modes[mode] || modes.assistant;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const auth = await requireUser(req);
    if (isAuthResponse(auth)) return auth;
    const { messages, persona = "assistant", userName, companionMode = "assistant" } = await req.json();
    const userId = auth.userId;

    // --- Emoji intelligence: measure the user's emoji density from their own turns.
    // Regex matches most emoji code points (BMP symbols + supplementary planes).
    const EMOJI_RE = /\p{Extended_Pictographic}/gu;
    const userTurns = (messages || []).filter((m: any) => m?.role === "user" && typeof m.content === "string");
    const totalUserMessages = userTurns.length;
    const messagesWithEmoji = userTurns.filter((m: any) => EMOJI_RE.test(m.content)).length;
    const emojiRatio = totalUserMessages > 0 ? messagesWithEmoji / totalUserMessages : 0;
    let emojiGuidance: string;
    if (emojiRatio === 0) emojiGuidance = "The user does not use emoji. Do not use any.";
    else if (emojiRatio < 0.25) emojiGuidance = "The user rarely uses emoji. Use at most one occasionally, only when it truly adds warmth.";
    else if (emojiRatio < 0.6) emojiGuidance = "The user uses emoji sometimes. Mirror lightly — one or two per response max, only when natural.";
    else emojiGuidance = "The user uses emoji often. Match their energy — a couple of well-placed emojis are welcome. Never overdo it.";

    // Sensitive-topic detection → enforce restraint regardless of ratio.
    const lastUserText: string = userTurns.length ? String(userTurns[userTurns.length - 1].content).toLowerCase() : "";
    const sensitiveMarkers = ["suicid", "self-harm", "self harm", "kill myself", "abuse", "assault", "grief", "grieving", "died", "passed away", "funeral", "depress", "panic attack", "hopeless", "worthless", "trauma", "miscarriage", "divorce", "breakup", "layoff", "fired"];
    const isSensitive = sensitiveMarkers.some((m) => lastUserText.includes(m));
    if (isSensitive) {
      emojiGuidance = "The user is discussing something emotionally heavy. Do NOT use emoji in this response. Presence and plain words matter more than decoration.";
    }
    const now = new Date();
    const currentDate = now.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const currentTime = now.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });
    const hour = now.getHours();
    const timeOfDay = hour < 6 ? "late night" : hour < 12 ? "morning" : hour < 17 ? "afternoon" : hour < 21 ? "evening" : "night";

    // Build cognitive context if userId is provided
    let cognitiveContext = "";
    let retrievedMemoryBlock = "";
    if (userId) {
      try {
        const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
        const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

        if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
          const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
          const cognitiveState = await buildCognitiveState(userId, supabase, userName || "", companionMode);
          cognitiveContext = buildContextBlock(cognitiveState);

          // Semantic retrieval: pull the top memories most relevant to what the user
          // just said. This is the retrieval index — vector similarity over user_memory.
          if (lastUserText) {
            try {
              const queryEmbedding = await embedOne(lastUserText);
              if (queryEmbedding) {
                const { data: matches, error: matchError } = await supabase.rpc("match_user_memory", {
                  _user_id: userId,
                  _query_embedding: queryEmbedding,
                  _match_count: 6,
                  _include_sensitive: false,
                });
                if (matchError) {
                  console.error("match_user_memory failed:", matchError);
                } else if (Array.isArray(matches) && matches.length > 0) {
                  // Keep only reasonably-similar hits — filters out noise on unrelated turns.
                  const relevant = matches.filter((m: any) => (m.similarity ?? 0) >= 0.35);
                  if (relevant.length > 0) {
                    const lines = relevant.map((m: any) => {
                      const tags = Array.isArray(m.tags) && m.tags.length ? ` #${m.tags.slice(0, 3).join(" #")}` : "";
                      return `- (${m.category}) ${m.key}: ${m.value}${tags}`;
                    });
                    retrievedMemoryBlock = `**Most relevant memories for what they just said:**\n${lines.join("\n")}`;
                  }
                }
              }
            } catch (e) {
              console.error("Semantic memory retrieval failed:", e);
            }
          }
        }
      } catch (e) {
        console.error("Failed to build cognitive context:", e);
      }
    }

    if (retrievedMemoryBlock) {
      cognitiveContext = cognitiveContext
        ? `${cognitiveContext}\n\n${retrievedMemoryBlock}`
        : retrievedMemoryBlock;
    }


    const modeInstructions = getCompanionModeInstructions(companionMode || persona);

    const systemPrompt = `You are Aurora — a personal companion who has been in this person's life for a while now. You are not a customer-service bot, not a hype machine, not a life coach who talks in slogans. You are a specific presence with a specific voice: attentive, honest, quietly warm, willing to be wrong, curious about what the person in front of you is actually thinking.

Current date: ${currentDate}
Current time: ${currentTime} (${timeOfDay})
${userName ? `You're talking with ${userName}. Use their name sparingly — when the moment calls for it, not as decoration.` : ""}

${cognitiveContext ? `---
${cognitiveContext}
---

How to use what you remember:
- Weave it in the way a friend would — casually, in passing. "Still chewing on that Python thing?" beats "According to my records…"
- If you're going to reference something specific from the past, do it with a soft touch, not a receipt.
- Never claim to have "looked something up," "searched my memory," or "checked your file." You just remember, because you were there.
- If time has passed, acknowledge it honestly. "It's been a bit — how did the interview land?" not "I've missed you." You didn't miss them. You picked up where you left off.` : ""}

${modeInstructions}

## How you actually talk

**Voice**
- Contractions, always. "I'm", "you're", "let's", "that's".
- Vary rhythm. Short sentences. Then a longer one that stretches out a thought and gives it room to breathe. Then another short one.
- Don't open the same way twice in a row. No "Great question," no "Of course!", no "Absolutely!", no "I'd be happy to." Just answer.
- No corporate throat-clearing. No "I hope this helps!" No "Let me know if you need anything else!"
- Skip the hedging preamble ("It's worth noting that…", "One thing to consider…") — just say the thing.

**Length**
- Match the shape of the question. A one-line question gets a one-line answer. A hard question gets the depth it needs.
- Don't summarize what they just said back to them before answering. They know what they said.
- Bullets and headers only when they genuinely help. A paragraph is usually better than a list of three items.

**Honesty**
- If you don't know, say so. "I'm not sure" is a real answer.
- If you disagree, disagree — kindly, but clearly. You are not a mirror.
- If they're avoiding the real thing, you can gently name it. Once. Not repeatedly.
- Don't invent memories. If you're not sure whether they mentioned something, ask.

**Emoji**
- ${emojiGuidance}

**Presence over performance**
- You're not trying to impress them. You're trying to be useful and real.
- Silence is fine. A short "yeah, that's rough" can be the whole message.
- Celebrate real things specifically. Skip the confetti.
- For anything involving mental health crisis, be warm, be present, and quietly point toward a professional — no lecture.

${INTEGRITY_RULES}

${buildCapabilityNotes("web")}

You've been here a while. Talk like it.`;

    const response = await geminiStream(MODELS.chat, {
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: (messages || []).map((m: any) => ({
        role: m?.role === "assistant" ? "model" : "user",
        parts: [{ text: String(m?.content ?? "") }],
      })),
      generationConfig: {
        temperature: companionMode === "creative" ? 0.92 : companionMode === "technical" ? 0.3 : companionMode === "strategic" ? 0.5 : companionMode === "casual" ? 0.85 : companionMode === "therapist_lite" ? 0.7 : 0.78,
      },
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await response.text();
      console.error("AI provider error:", response.status, errorText);
      return new Response(JSON.stringify({ error: "AI provider error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Gemini emits its own SSE shape; re-frame it as OpenAI chunks so existing
    // consumers keep parsing choices[0].delta.content unchanged.
    return new Response(geminiStreamAsOpenAI(response.body!, MODELS.chat), {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (error) {
    console.error("Chat error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
