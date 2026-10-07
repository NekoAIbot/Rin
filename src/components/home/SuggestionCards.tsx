import {
  FileText, PenLine, Code2, Image as ImageIcon, Mic, Languages, ListChecks, Search,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { DeviceContext } from "@/lib/intent/types";

interface Suggestion {
  label: string;
  hint: string;
  icon: LucideIcon;
  prompt: string;
}

const BY_TIME: Record<DeviceContext["timeOfDay"], Suggestion[]> = {
  morning: [
    { label: "Brief me", hint: "Today at a glance", icon: ListChecks, prompt: "Give me a short briefing for today and the one thing I should prioritise." },
    { label: "Draft a proposal", hint: "Structured first pass", icon: PenLine, prompt: "Help me draft a proposal. Ask me what it's for first." },
    { label: "Research a topic", hint: "Depth, then summary", icon: Search, prompt: "Research a topic for me and give me a layered summary." },
    { label: "Explain a document", hint: "PDF or notes", icon: FileText, prompt: "I want to understand a document. Walk me through how to share it." },
  ],
  afternoon: [
    { label: "Write code", hint: "Build or debug", icon: Code2, prompt: "Help me write some code. Ask what I'm building." },
    { label: "Summarise my week", hint: "What actually happened", icon: ListChecks, prompt: "Summarise what I've worked on recently." },
    { label: "Explain a document", hint: "PDF or notes", icon: FileText, prompt: "I want to understand a document. Walk me through how to share it." },
    { label: "Create an image", hint: "Visual ideas", icon: ImageIcon, prompt: "Generate an image for me. Ask me what I want first." },
  ],
  evening: [
    { label: "Reflect on today", hint: "Two quiet minutes", icon: PenLine, prompt: "Walk me through a short reflection on my day." },
    { label: "Capture a thought", hint: "Save it to memory", icon: Mic, prompt: "Remember this for me:" },
    { label: "Translate something", hint: "Any language", icon: Languages, prompt: "Translate something for me." },
    { label: "Plan tomorrow", hint: "Three priorities", icon: ListChecks, prompt: "Help me plan tomorrow with three clear priorities." },
  ],
  night: [
    { label: "Capture a thought", hint: "Save it to memory", icon: Mic, prompt: "Remember this for me:" },
    { label: "Wind-down plan", hint: "Keep it light", icon: PenLine, prompt: "Suggest a short wind-down routine for tonight." },
    { label: "Set a morning ritual", hint: "Runs while you sleep", icon: ListChecks, prompt: "Every weekday at 7am, give me a briefing." },
    { label: "Research a topic", hint: "Read it later", icon: Search, prompt: "Research a topic for me and give me a layered summary." },
  ],
};

interface SuggestionCardsProps {
  timeOfDay: DeviceContext["timeOfDay"];
  onSelect: (prompt: string) => void;
}

export function SuggestionCards({ timeOfDay, onSelect }: SuggestionCardsProps) {
  const items = BY_TIME[timeOfDay];

  return (
    <div className="grid gap-2.5 sm:grid-cols-2">
      {items.map((s, i) => (
        <button
          key={s.label}
          type="button"
          onClick={() => onSelect(s.prompt)}
          style={{ animationDelay: `${100 + i * 60}ms` }}
          className="group animate-rise-in flex items-center gap-3 rounded-2xl surface-glass px-4 py-3 text-left transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lift"
        >
          <s.icon className="h-[18px] w-[18px] shrink-0 text-primary/80 transition-transform duration-300 group-hover:scale-110" />
          <span className="min-w-0">
            <span className="block truncate text-[15px] font-medium">{s.label}</span>
            <span className="block truncate text-[13px] text-muted-foreground">{s.hint}</span>
          </span>
        </button>
      ))}
    </div>
  );
}
