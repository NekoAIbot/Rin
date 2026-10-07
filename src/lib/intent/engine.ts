import { CONVERSATION_SKILL, SKILLS } from "./skills";
import type { IntentContext, ResolvedIntent, Skill } from "./types";

/**
 * Intent detection.
 *
 * Deliberately deterministic: pattern + keyword scoring, no model round-trip.
 * The model is for conversation, not for deciding where a tap should land.
 */
function scoreSkill(skill: Skill, input: string): number {
  let score = 0;
  for (const pattern of skill.patterns) {
    if (pattern.test(input)) {
      score += 0.6;
      break;
    }
  }
  for (const keyword of skill.keywords ?? []) {
    if (input.toLowerCase().includes(keyword.toLowerCase())) score += 0.12;
  }
  // Short, imperative phrasing is a strong action signal.
  if (score > 0 && input.trim().split(/\s+/).length <= 8) score += 0.15;
  return Math.min(score, 1);
}

const CONFIDENCE_FLOOR = 0.35;

export function detectIntent(ctx: IntentContext): ResolvedIntent {
  const input = ctx.input.trim();

  let best: Skill = CONVERSATION_SKILL;
  let bestScore = 0;

  for (const skill of SKILLS) {
    const score = scoreSkill(skill, input);
    if (score > bestScore) {
      best = skill;
      bestScore = score;
    }
  }

  if (bestScore < CONFIDENCE_FLOOR) {
    best = CONVERSATION_SKILL;
    bestScore = 1 - bestScore; // confident that this is plain conversation
  }

  const plan = best.plan(ctx);
  const needsConfirmation = plan.some((step) => step.sensitive);

  return {
    skill: best,
    confidence: Number(bestScore.toFixed(2)),
    plan,
    needsConfirmation,
    surface: best.surface,
    prompt: input,
  };
}

export interface ExecutionHandlers {
  /** Send the request to the conversation engine. */
  converse: (prompt: string) => void;
  /** Move the user to another primary surface. */
  navigate: (surface: ResolvedIntent["surface"], prompt: string) => void;
  /** Ask before anything irreversible happens. */
  confirm?: (intent: ResolvedIntent) => Promise<boolean>;
  /** Told when a skill needs a native capability the web layer can't provide. */
  onUnavailable?: (intent: ResolvedIntent) => void;
}

/**
 * Execution stage of the pipeline. Keeps one rule above all: Aurora never
 * performs a consequential action without an explicit confirmation.
 */
export async function executeIntent(
  intent: ResolvedIntent,
  handlers: ExecutionHandlers,
): Promise<void> {
  if (intent.skill.requiresDevice) {
    handlers.onUnavailable?.(intent);
  }

  if (intent.needsConfirmation && handlers.confirm) {
    const approved = await handlers.confirm(intent);
    if (!approved) return;
  }

  if (intent.surface === "home" || intent.skill.id === CONVERSATION_SKILL.id) {
    handlers.converse(intent.prompt);
    return;
  }

  handlers.navigate(intent.surface, intent.prompt);
}

/** Convenience: full pipeline in one call. */
export async function runIntent(
  ctx: IntentContext,
  handlers: ExecutionHandlers,
): Promise<ResolvedIntent> {
  const intent = detectIntent(ctx);
  await executeIntent(intent, handlers);
  return intent;
}
