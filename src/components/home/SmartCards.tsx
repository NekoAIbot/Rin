import { useMemo } from "react";
import {
  BatteryLow, WifiOff, ArrowRight, Moon, Sunrise, Brain, Clock3, Sparkle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { DeviceContext } from "@/lib/intent/types";
import type { Conversation } from "@/hooks/useConversations";
import { cn } from "@/lib/utils";

interface SmartCard {
  id: string;
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  body?: string;
  action?: string;
  tone?: "default" | "warn";
  onSelect?: () => void;
}

interface SmartCardsProps {
  device: DeviceContext;
  conversations: Conversation[];
  memoryCount?: number;
  onResume: (c: Conversation) => void;
  onNavigate: (surface: string) => void;
}

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}

/**
 * Contextual cards. Each card must earn its place — nothing renders
 * unless the underlying signal is actually present.
 */
export function SmartCards({
  device, conversations, memoryCount = 0, onResume, onNavigate,
}: SmartCardsProps) {
  const cards = useMemo(() => {
    const list: SmartCard[] = [];
    const last = conversations[0];

    if (last) {
      list.push({
        id: "resume",
        icon: ArrowRight,
        eyebrow: "Continue",
        title: last.title?.trim() || "Your last conversation",
        body: `Picked up ${relativeTime(last.updated_at)}`,
        action: "Resume",
        onSelect: () => onResume(last),
      });
    }

    if (device.battery && device.battery.level < 0.25 && !device.battery.charging) {
      list.push({
        id: "battery",
        icon: BatteryLow,
        tone: "warn",
        eyebrow: "Power",
        title: `Battery at ${Math.round(device.battery.level * 100)}%`,
        body: "I'll keep responses short and skip voice playback.",
      });
    }

    if (device.network && !device.network.online) {
      list.push({
        id: "offline",
        icon: WifiOff,
        tone: "warn",
        eyebrow: "Connection",
        title: "You're offline",
        body: "Drafts are held locally and sent the moment you reconnect.",
      });
    }

    if (device.timeOfDay === "morning") {
      list.push({
        id: "morning",
        icon: Sunrise,
        eyebrow: "Today",
        title: "Set the shape of your day",
        body: "Name one outcome that would make today count.",
        action: "Plan the day",
        onSelect: () => onNavigate("automations"),
      });
    } else if (device.timeOfDay === "afternoon") {
      list.push({
        id: "focus",
        icon: Clock3,
        eyebrow: "Focus",
        title: "Deep work window",
        body: "The next stretch is the best one for hard thinking.",
        action: "Open workspace",
        onSelect: () => onNavigate("workspace"),
      });
    } else if (device.timeOfDay === "evening") {
      list.push({
        id: "reflect",
        icon: Sparkle,
        eyebrow: "Wind down",
        title: "Close the loop on today",
        body: "A two-minute reflection makes tomorrow easier.",
        action: "Reflect",
        onSelect: () => onNavigate("workspace"),
      });
    } else {
      list.push({
        id: "night",
        icon: Moon,
        eyebrow: "Late",
        title: "Keeping things quiet",
        body: "Minimal replies, no sound, nothing that can wait until morning.",
      });
    }

    if (memoryCount > 0) {
      list.push({
        id: "memory",
        icon: Brain,
        eyebrow: "Memory",
        title: `${memoryCount} things I remember about you`,
        body: "Everything is yours to review, edit or forget.",
        action: "Open memory",
        onSelect: () => onNavigate("memory"),
      });
    }

    return list.slice(0, 4);
  }, [device, conversations, memoryCount, onResume, onNavigate]);

  if (!cards.length) return null;

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {cards.map((card, i) => (
        <button
          key={card.id}
          type="button"
          disabled={!card.onSelect}
          onClick={card.onSelect}
          style={{ animationDelay: `${i * 70}ms` }}
          className={cn(
            "group animate-rise-in text-left rounded-[1.4rem] p-4 sm:p-5",
            "surface-paper transition-[transform,box-shadow] duration-300",
            card.onSelect && "hover:-translate-y-0.5 hover:shadow-lift cursor-pointer",
            card.tone === "warn" && "ring-1 ring-accent/30",
          )}
        >
          <div className="flex items-start gap-3">
            <span
              className={cn(
                "mt-0.5 grid h-9 w-9 place-items-center rounded-full",
                card.tone === "warn"
                  ? "bg-accent/15 text-accent-foreground"
                  : "bg-primary/10 text-primary",
              )}
            >
              <card.icon className="h-[18px] w-[18px]" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                {card.eyebrow}
              </p>
              <p className="mt-1 truncate text-[17px] font-medium leading-snug">{card.title}</p>
              {card.body && (
                <p className="mt-1.5 text-[14px] leading-relaxed text-muted-foreground">{card.body}</p>
              )}
              {card.action && (
                <span className="mt-3 inline-flex items-center gap-1.5 text-[14px] font-medium text-primary">
                  {card.action}
                  <ArrowRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-0.5" />
                </span>
              )}
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}
