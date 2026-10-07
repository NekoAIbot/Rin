import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Briefcase, Sprout, Heart, Zap, Coffee,
  Palette, Code, ChevronDown
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useUserSettings } from "@/hooks/useUserSettings";

const COMPANION_MODES = [
  {
    id: "assistant",
    label: "Professional Assistant",
    icon: Briefcase,
    description: "Balanced, comprehensive, professional",
    color: "text-blue-500",
  },
  {
    id: "growth_partner",
    label: "Growth Partner",
    icon: Sprout,
    description: "Challenges you, tracks your evolution",
    color: "text-green-500",
  },
  {
    id: "therapist_lite",
    label: "Supportive Companion",
    icon: Heart,
    description: "Empathetic, emotionally attuned",
    color: "text-rose-500",
  },
  {
    id: "strategic",
    label: "Strategic Co-Founder",
    icon: Zap,
    description: "Direct, first-principles thinking",
    color: "text-amber-500",
  },
  {
    id: "casual",
    label: "Casual Companion",
    icon: Coffee,
    description: "Warm, playful, like a trusted friend",
    color: "text-orange-500",
  },
  {
    id: "creative",
    label: "Creative Collaborator",
    icon: Palette,
    description: "Imaginative, expansive, generative",
    color: "text-purple-500",
  },
  {
    id: "technical",
    label: "Technical Expert",
    icon: Code,
    description: "Precise, detailed, best practices",
    color: "text-cyan-500",
  },
];

export function CompanionModeSelector() {
  const { settings, updateSetting } = useUserSettings();
  const [isUpdating, setIsUpdating] = useState(false);

  const currentMode = COMPANION_MODES.find(m => m.id === settings.companion_mode) || COMPANION_MODES[0];
  const CurrentIcon = currentMode.icon;

  const handleSelect = async (modeId: string) => {
    if (modeId === settings.companion_mode) return;
    setIsUpdating(true);
    try {
      await updateSetting('companion_mode', modeId);
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="flex items-center gap-2 text-sm h-8 px-3"
          disabled={isUpdating}
        >
          <CurrentIcon className={`h-3.5 w-3.5 ${currentMode.color}`} />
          <span className="hidden sm:inline text-xs font-medium">{currentMode.label}</span>
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Companion Mode
        </div>
        {COMPANION_MODES.map(mode => {
          const Icon = mode.icon;
          const isActive = settings.companion_mode === mode.id;
          return (
            <DropdownMenuItem
              key={mode.id}
              onClick={() => handleSelect(mode.id)}
              className={`flex items-start gap-3 py-2.5 cursor-pointer ${isActive ? 'bg-accent' : ''}`}
            >
              <Icon className={`h-4 w-4 mt-0.5 ${mode.color} shrink-0`} />
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-medium">{mode.label}</span>
                <span className="text-xs text-muted-foreground truncate">{mode.description}</span>
              </div>
              {isActive && (
                <div className="ml-auto h-1.5 w-1.5 rounded-full bg-primary shrink-0 mt-1.5" />
              )}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
