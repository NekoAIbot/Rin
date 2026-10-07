import type { Skill } from "./types";

/**
 * Universal Skills registry.
 *
 * Skills are modular: adding one here makes it reachable from every surface
 * (Home omnibox, voice, floating actions) without touching any UI.
 */
export const SKILLS: Skill[] = [
  // ---------- Workspace / creation ----------
  {
    id: "write",
    name: "Writing",
    category: "workspace",
    surface: "workspace",
    description: "Drafts, rewrites, and edits documents, emails, and messages.",
    patterns: [/\b(write|draft|rewrite|compose|edit|proofread)\b/i],
    keywords: ["essay", "email", "post", "caption", "letter"],
    plan: () => [{ label: "Draft the text and open it in Workspace" }],
  },
  {
    id: "code",
    name: "Programming",
    category: "workspace",
    surface: "workspace",
    description: "Writes, explains, reviews, and debugs code.",
    patterns: [/\b(code|debug|refactor|function|bug|stack ?trace|regex|sql)\b/i],
    plan: () => [{ label: "Analyse the problem and produce working code" }],
  },
  {
    id: "research",
    name: "Research",
    category: "workspace",
    surface: "workspace",
    description: "Gathers and synthesises information into a usable brief.",
    patterns: [/\b(research|look up|find out|compare|summari[sz]e the web)\b/i],
    plan: () => [
      { label: "Gather sources" },
      { label: "Synthesise a brief in Workspace" },
    ],
  },
  {
    id: "documents",
    name: "File & PDF Analysis",
    category: "workspace",
    surface: "workspace",
    description: "Reads PDFs, spreadsheets, and files and answers questions about them.",
    patterns: [/\b(pdf|document|spreadsheet|csv|attachment|this file)\b/i],
    plan: () => [
      { label: "Read the file" },
      { label: "Extract the parts that matter" },
    ],
  },
  {
    id: "image",
    name: "Image Generation & Vision",
    category: "workspace",
    surface: "workspace",
    description: "Creates images, and reads or describes existing ones.",
    patterns: [/\b(image|picture|photo|generate art|design a|logo|ocr|read this screenshot)\b/i],
    plan: () => [{ label: "Open the visual tools in Workspace" }],
  },
  {
    id: "presentation",
    name: "Presentations",
    category: "workspace",
    surface: "workspace",
    description: "Builds slide outlines and decks.",
    patterns: [/\b(slide|deck|presentation|pitch)\b/i],
    plan: () => [{ label: "Outline the deck section by section" }],
  },

  // ---------- Memory ----------
  {
    id: "remember",
    name: "Remember",
    category: "memory",
    surface: "memory",
    description: "Stores a fact, preference, person, or idea for the long term.",
    patterns: [/\b(remember|note that|keep in mind|don'?t forget|save this)\b/i],
    plan: () => [{ label: "Save it to long-term memory" }],
  },
  {
    id: "recall",
    name: "Recall",
    category: "memory",
    surface: "memory",
    description: "Searches everything Aurora knows in natural language.",
    patterns: [/\b(what did i|when did i|do you remember|recall|my notes about|search memory)\b/i],
    plan: () => [{ label: "Search memory and surface the matches" }],
  },

  // ---------- Automations ----------
  {
    id: "automate",
    name: "Automations",
    category: "automation",
    surface: "automations",
    description: "Creates triggers and routines that run without being asked.",
    patterns: [/\b(automat\w+|routine|whenever|every (morning|day|week|night)|trigger|remind me (at|every))\b/i],
    plan: () => [
      { label: "Define the trigger" },
      { label: "Define the action" },
      { label: "Activate the routine", sensitive: true },
    ],
  },
  {
    id: "schedule",
    name: "Calendar",
    category: "automation",
    surface: "automations",
    description: "Reads and books time.",
    patterns: [/\b(schedule|calendar|meeting|appointment|book a|free (on|at)|agenda)\b/i],
    requiresDevice: true,
    plan: () => [
      { label: "Check the calendar for conflicts" },
      { label: "Create the event", sensitive: true },
    ],
  },

  // ---------- Device / Android layer ----------
  {
    id: "screen",
    name: "Screen Understanding",
    category: "device",
    surface: "home",
    description: "Reads what's on screen and acts on it, with permission.",
    patterns: [/\b(what'?s on (my )?screen|read (my|the) screen|analy[sz]e (this|my) screen)\b/i],
    requiresDevice: true,
    plan: () => [
      { label: "Capture the current screen", sensitive: true },
      { label: "Describe or act on what's visible" },
    ],
  },
  {
    id: "messaging",
    name: "Messages",
    category: "device",
    surface: "home",
    description: "Drafts and sends messages through connected apps.",
    patterns: [/\b(text|message|whatsapp|telegram|dm|reply to)\b/i],
    requiresDevice: true,
    plan: () => [
      { label: "Draft the message" },
      { label: "Send it", sensitive: true },
    ],
  },
  {
    id: "email",
    name: "Email",
    category: "device",
    surface: "home",
    description: "Triages, drafts, and sends email.",
    patterns: [/\b(email|inbox|mail|send .*(a|an) (mail|email))\b/i],
    requiresDevice: true,
    plan: () => [
      { label: "Draft the email" },
      { label: "Send it", sensitive: true },
    ],
  },
  {
    id: "device-status",
    name: "Device Awareness",
    category: "device",
    surface: "home",
    description: "Battery, network, storage, and connectivity awareness.",
    patterns: [/\b(battery|charging|offline|wifi|network|storage|bluetooth)\b/i],
    plan: () => [{ label: "Read live device signals" }],
  },

  // ---------- Ambient conversation utilities ----------
  {
    id: "weather",
    name: "Weather",
    category: "conversation",
    surface: "home",
    description: "Current conditions and forecast.",
    patterns: [/\b(weather|forecast|rain|temperature outside|how hot|how cold)\b/i],
    plan: () => [{ label: "Fetch conditions and answer inline" }],
  },
  {
    id: "calculate",
    name: "Calculator",
    category: "conversation",
    surface: "home",
    description: "Maths, conversions, and quick numbers.",
    patterns: [/\b(calculate|convert|how much is|what'?s \d)\b/i, /[\d)]\s*[+\-*/^]\s*\d/],
    plan: () => [{ label: "Compute and answer inline" }],
  },
  {
    id: "translate",
    name: "Translation",
    category: "conversation",
    surface: "home",
    description: "Translates between languages.",
    patterns: [/\b(translate|in (french|spanish|yoruba|igbo|hausa|german|arabic|chinese))\b/i],
    plan: () => [{ label: "Translate and answer inline" }],
  },
  {
    id: "settings",
    name: "Settings",
    category: "settings",
    surface: "settings",
    description: "Privacy, permissions, voice, memory, theme, and accounts.",
    patterns: [/\b(settings|preferences|permissions|privacy|dark mode|change (my )?voice)\b/i],
    plan: () => [{ label: "Open the relevant setting" }],
  },
];

/** Fallback when nothing matches — Aurora simply talks. */
export const CONVERSATION_SKILL: Skill = {
  id: "converse",
  name: "Conversation",
  category: "conversation",
  surface: "home",
  description: "Understands and responds naturally.",
  patterns: [],
  plan: () => [{ label: "Answer directly" }],
};

export const getSkill = (id: string): Skill | undefined =>
  id === CONVERSATION_SKILL.id ? CONVERSATION_SKILL : SKILLS.find((s) => s.id === id);
