import { Brain, CloudSun, Code, Globe, MessageCircle, Mic, Search, Image, User, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";

interface QuickActionProps {
  onAction: (action: string) => void;
}

const ACTIONS = [
  { name: "Chat", icon: MessageCircle, action: "chat" },
  { name: "Voice", icon: Mic, action: "voice" },
  { name: "Search", icon: Search, action: "search" },
  { name: "Weather", icon: CloudSun, action: "weather" },
  { name: "Code", icon: Code, action: "code" },
  { name: "Web", icon: Globe, action: "web" },
  { name: "Memory", icon: Brain, action: "memory" },
  { name: "Image", icon: Image, action: "multimodal" },
  { name: "Personas", icon: User, action: "personas" },
  { name: "Reports", icon: FileText, action: "reports" },
];

export function QuickActions({ onAction }: QuickActionProps) {
  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 sm:gap-3">
      {ACTIONS.map((item) => {
        const Icon = item.icon;
        return (
          <Button
            key={item.action}
            variant="ghost"
            className="flex-col h-20 rounded-2xl bg-card/60 hover:bg-card border border-border/40 hover:border-primary/40 hover:shadow-md transition-all group p-2"
            onClick={() => onAction(item.action)}
          >
            <div className="p-2 rounded-xl bg-primary/10 mb-1.5 group-hover:bg-primary/20 transition-colors">
              <Icon className="h-4 w-4 text-primary" />
            </div>
            <span className="text-[11px] font-medium text-muted-foreground group-hover:text-foreground transition-colors">
              {item.name}
            </span>
          </Button>
        );
      })}
    </div>
  );
}
