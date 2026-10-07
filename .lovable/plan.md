# Aurora Evolution — Sequenced Plan

Executed one phase per turn. You approve each phase before I move to the next. Existing working functionality is preserved unless a step explicitly replaces it.

---

## Phase 1 — UI/UX + Chat Polish  *(starting now)*

**Design system refresh (`src/index.css`, `tailwind.config.ts`)**
- Keep cream-on-forest base; add layered tokens: `--ivory`, `--sage`, `--gold`, `--charcoal`, `--surface-raised`, `--surface-sunken`.
- Softer shadows (`--shadow-paper`, `--shadow-lift`), larger radius scale, generous spacing rhythm.
- Verify light/dark parity — dark theme uses warm charcoal, not pure black.
- Type scale tuned for reading: Fraunces display, Inter Tight body, comfortable line-height.

**Chat surface (`ChatWindow`, `ChatMessage`, `Messages`, `ChatInput`)**
- Assistant text renders directly on canvas (no bubble), user bubbles get refined forest→sage gradient with gold hairline.
- Timestamps become natural ("just now", "2m ago") and appear on hover.
- Message actions: Copy, Edit (user only), Bookmark, Regenerate (assistant only) — icon row on hover.
- Better markdown: refined code blocks with language chip + copy, blockquote styling, list rhythm.
- Loading state: replace three-dot pulse with a single breathing shimmer line ("Aurora is thinking…" removed on stream start).
- Smooth auto-scroll only when user is near bottom.

**Empty state & composer**
- Empty canvas: quiet greeting + 3 contextual suggestion cards (not 6), pulled from time-of-day + recent memories.
- Composer: single rounded surface, mic + send only, subtle focus ring, keyboard shortcuts hint.

**Out of scope this phase:** memory features, security, new AI behaviors.

---

## Phase 2 — Security & Trust Hardening
- Flip `verify_jwt = true` on user-context functions (`chat`, `memory-extract`, `emotion-analyze`, `proactive-insights`, `daily-summary`, `send-report-email`, `multimodal`, `transcribe`). Derive `userId` from `getClaims()`, stop trusting request-body IDs.
- Keep `verify_jwt = false` only for `paystack-webhook` (signature-verified) and `aurora-api` (API-key-verified).
- Reconcile pricing: single source in DB / shared constant, remove hardcoded 9500 vs 4500 drift.
- Audit localStorage: move anything sensitive (voice settings are fine; nothing user-identifying should live there).
- Add rate limits on `chat` and `transcribe`.

## Phase 3 — Human Conversation Engine  *(complete)*
- Rewrote `chat` system prompt: contractions, variable rhythm, no "Great question", no meta-talk, honest continuity, presence over performance.
- Emoji intelligence: server measures user emoji ratio across the conversation and instructs Aurora to mirror lightly, moderately, or heavily — or not at all.
- Sensitive-topic guardrail: when the last user message contains grief / crisis / mental-health markers, emoji use is suppressed regardless of ratio.
- Response shaping baked into the prompt: short questions get short answers, no forced summaries, no bullets by default.

## Phase 4 — Memory Intelligence  *(retrieval index shipped)*
- **Structured extraction:** memory-extract now emits `tags` per fact (lowercase, dashed) alongside category/key/value/confidence/source.
- **Per-user retrieval index:** `user_memory.embedding vector(1536)` + HNSW cosine index; embeddings via `openai/text-embedding-3-small` through the AI Gateway.
- **Live retrieval:** every chat turn embeds the latest user message and injects the top semantically-relevant memories into the system prompt (sensitive memories excluded).
- **`memory-search` edge function** + `useMemorySystem.searchMemory()` for UI-driven semantic lookup.
- Still open for later phases: Memory Repair UI, Private Vault unlock flow, AI Receipts chips, Memory Map graph view.

## Phase 5 — Companion Growth
- Relationship Timeline (visible history of milestones, not scores).
- Reflection Engine (weekly quiet prompt, opt-in).
- Decision Journal + Contradiction Detector (surfaces gently, never judgmental).
- Silent Pattern Discovery feeds Proactive Insights.

## Phase 6 — Companion Behaviors
- Curiosity Mode, Thinking Styles, Context Lens as sidebar toggles.
- Confidence Meter on answers (subtle).
- AI Undo (session-scoped, 5-minute window).
- Multi-version answers generated in background, revealed via "show another take".

## Phase 7 — Life Spaces
- Extend `conversations` with `space_id`; new `spaces` table with own memory/goals/settings.
- Space switcher in sidebar; memory retrieval scoped per space.

## Phase 8 — Honesty Pass
- Search / Weather / Code pages: either wire real providers (SerpAPI / OpenWeather / sandboxed exec) or replace with honest "coming soon" state. No fabricated results.

---

## Execution rules
- One phase per turn. I ship, you review, you approve next.
- No new duplicate systems — refactor existing files.
- Every change keeps the app running; no half-migrated states left between turns.
- After each phase I run typecheck and a quick Playwright smoke on the affected screens.

**Approve to start Phase 1, or tell me to reorder.**
