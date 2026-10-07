import { Home } from "@/components/home/Home";
import { MemoryDashboard } from "@/components/MemoryDashboard";
import Workspace from "@/pages/Workspace";
import Automations from "@/pages/Automations";
import Settings from "@/pages/Settings";
import { ChatWindow } from "@/components/ChatWindow";

interface ModeContentProps {
  activeMode: string;
  onModeChange: (mode: string) => void;
}

/**
 * Five primary surfaces. Older modes are folded into their new home so
 * existing links and saved preferences keep working.
 */
const LEGACY: Record<string, string> = {
  dashboard: "home",
  chat: "home",
  multimodal: "workspace",
  reports: "workspace",
  personas: "settings",
  "api-keys": "settings",
  "api-analytics": "settings",
};

export function ModeContent({ activeMode, onModeChange }: ModeContentProps) {
  const mode = LEGACY[activeMode] ?? activeMode;

  if (mode === "workspace") return <Workspace />;
  if (mode === "memory") {
    return (
      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        <MemoryDashboard />
      </div>
    );
  }
  if (mode === "automations") return <Automations />;
  if (mode === "settings") return <Settings />;
  if (mode === "conversation") return <ChatWindow />;

  return <Home onNavigate={onModeChange} />;
}
