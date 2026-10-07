import { useEffect, useState } from "react";
import { MessagesSquare, ImageIcon, FileText, Sparkles } from "lucide-react";
import { Multimodal } from "@/components/Multimodal";
import Reports from "@/pages/Reports";
import { ChatWindow } from "@/components/ChatWindow";
import { AmbientBackdrop, Segmented } from "@/components/aurora/Surface";
import { cn } from "@/lib/utils";

/**
 * Workspace — a single adaptive environment. The surface stays constant;
 * only the working material changes as you move between modes.
 */
const MODES = [
  {
    value: "create",
    label: "Create",
    icon: MessagesSquare,
    hint: "Think out loud, draft, and refine with Aurora.",
  },
  {
    value: "visual",
    label: "Visual",
    icon: ImageIcon,
    hint: "Images, screenshots, and anything you'd rather show than say.",
  },
  {
    value: "documents",
    label: "Documents",
    icon: FileText,
    hint: "Generated reports, recaps, and long-form output.",
  },
];

export default function Workspace() {
  const [tab, setTab] = useState("create");

  useEffect(() => {
    const onPrompt = (e: Event) => {
      const detail = (e as CustomEvent).detail as { surface?: string };
      if (detail?.surface === "workspace") setTab("create");
    };
    window.addEventListener("aurora:prompt", onPrompt as EventListener);
    return () => window.removeEventListener("aurora:prompt", onPrompt as EventListener);
  }, []);

  const active = MODES.find((m) => m.value === tab) ?? MODES[0];

  return (
    <div className="relative flex h-full flex-col">
      <AmbientBackdrop tone={tab === "visual" ? "gold" : tab === "documents" ? "sage" : "forest"} />

      {/* One persistent frame for every tool */}
      <div className="px-4 pt-5 md:px-6">
        <div className="animate-rise-in flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              Adaptive environment
            </p>
            <h1 className="mt-1 font-display text-[28px] leading-none tracking-tight sm:text-[32px]">
              Workspace
            </h1>
            <p className="mt-2 flex items-center gap-1.5 text-[14px] text-muted-foreground transition-all duration-500">
              <Sparkles className="h-3.5 w-3.5 text-accent" />
              {active.hint}
            </p>
          </div>
          <Segmented items={MODES} value={tab} onChange={setTab} className="mb-1" />
        </div>
        <div className="mt-4 h-px bg-gradient-to-r from-border/70 via-border/30 to-transparent" />
      </div>

      {/* Material panes — the frame never moves, only the contents cross-fade */}
      <div className="min-h-0 flex-1 px-2 pb-2 pt-3 md:px-4 md:pb-4">
        <div className="relative h-full overflow-hidden rounded-[1.75rem] surface-paper">
          {MODES.map((m) => (
            <div
              key={m.value}
              role="tabpanel"
              hidden={m.value !== tab}
              className={cn(
                "h-full",
                m.value === tab && "animate-rise-in",
                m.value === "create" ? "overflow-hidden" : "overflow-y-auto",
              )}
            >
              {m.value === "create" && <ChatWindow />}
              {m.value === "visual" && <Multimodal />}
              {m.value === "documents" && <Reports />}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
