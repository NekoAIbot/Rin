// Aurora Intent Engine — shared types.
// Every user request flows through this pipeline:
// input -> intent -> context -> memory -> skill -> plan -> execution -> response

export type SkillCategory =
  | "conversation"
  | "workspace"
  | "memory"
  | "automation"
  | "device"
  | "settings";

/** Where a resolved intent ultimately runs. */
export type SkillSurface = "home" | "workspace" | "memory" | "automations" | "settings";

export interface DeviceContext {
  battery?: { level: number; charging: boolean };
  network?: { online: boolean; type?: string };
  clipboardAvailable: boolean;
  cameraAvailable: boolean;
  microphoneAvailable: boolean;
  platform: "android" | "ios" | "web";
  timeOfDay: "morning" | "afternoon" | "evening" | "night";
}

export interface IntentContext {
  /** Raw user input. */
  input: string;
  /** Display name, if known. */
  userName?: string;
  /** Ambient device signals (battery, network, clipboard...). */
  device?: DeviceContext;
  /** Short recent-activity trail used to disambiguate follow-ups. */
  recentActivity?: string[];
}

export interface PlanStep {
  /** Human-readable description shown when the plan has real consequences. */
  label: string;
  /** True when this step changes state outside Aurora (sends, deletes, pays...). */
  sensitive?: boolean;
}

export interface Skill {
  id: string;
  name: string;
  category: SkillCategory;
  surface: SkillSurface;
  /** Short description used in the skills catalogue and in planning. */
  description: string;
  /** Regexes that signal this skill. First match wins on score ties. */
  patterns: RegExp[];
  /** Extra keywords that add confidence without being decisive. */
  keywords?: string[];
  /** Requires an Android/native capability that the web layer can't fulfil. */
  requiresDevice?: boolean;
  /** Builds the execution plan for this skill. */
  plan: (ctx: IntentContext) => PlanStep[];
}

export interface ResolvedIntent {
  skill: Skill;
  /** 0..1 — how sure the engine is. Below 0.35 we just converse. */
  confidence: number;
  /** Ordered execution plan. */
  plan: PlanStep[];
  /** True when the plan should be confirmed before running. */
  needsConfirmation: boolean;
  /** Where the user should end up. */
  surface: SkillSurface;
  /** Prompt handed to the conversation engine when no local action exists. */
  prompt: string;
}
