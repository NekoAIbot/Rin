import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Home, LayoutGrid, Brain, Settings2, Zap, CreditCard, Menu, X,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ThemeToggle } from "./ThemeToggle";
import { UserMenu } from "./UserMenu";
import { useNavigate } from "react-router-dom";
import auroraMark from "@/assets/aurora-mark.png";
import { cn } from "@/lib/utils";

interface SidebarProps {
  onModeChange: (mode: string) => void;
  activeMode: string;
}

/** Aurora has exactly five primary surfaces. Everything else is a skill. */
export const NAV_ITEMS = [
  { name: "Home", icon: Home, mode: "home" },
  { name: "Workspace", icon: LayoutGrid, mode: "workspace" },
  { name: "Memory", icon: Brain, mode: "memory" },
  { name: "Automations", icon: Zap, mode: "automations" },
  { name: "Settings", icon: Settings2, mode: "settings" },
];


export function Sidebar({ onModeChange, activeMode }: SidebarProps) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  // Persist user preference for the popup nav being pinned
  const [pinned, setPinned] = useState(false);
  useEffect(() => {
    const saved = localStorage.getItem("aurora_nav_pinned");
    if (saved === "true") setPinned(true);
  }, []);

  const handleNav = (mode: string) => {
    onModeChange(mode);
    if (!pinned) setOpen(false);
  };

  return (
    <aside className="hidden md:flex w-16 h-full border-r border-border/40 bg-card/30 backdrop-blur-xl flex-col items-center py-4 gap-2">
      {/* Logo + popup nav trigger */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            aria-label="Open navigation"
            className="group relative h-11 w-11 rounded-2xl flex items-center justify-center bg-gradient-to-br from-primary/15 to-primary/5 hover:from-primary/25 hover:to-primary/10 transition-all shadow-sm hover:shadow-md ring-1 ring-primary/15"
          >
            <img src={auroraMark} alt="Aurora" width={28} height={28} className="h-7 w-7 object-contain" />
            <span className="absolute -bottom-1 -right-1 h-3 w-3 rounded-full bg-primary/80 ring-2 ring-card flex items-center justify-center">
              <Menu className="h-2 w-2 text-primary-foreground" />
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent
          side="right"
          align="start"
          sideOffset={12}
          className="w-72 p-0 rounded-2xl border-border/50 shadow-2xl bg-card/95 backdrop-blur-2xl"
        >
          <div className="p-4 border-b border-border/50 flex items-center gap-3">
            <img src={auroraMark} alt="" width={36} height={36} className="h-9 w-9 object-contain" />
            <div className="flex-1 min-w-0">
              <p className="font-display text-base font-semibold leading-none">Aurora</p>
              <p className="text-[11px] text-muted-foreground mt-1">Your AI companion</p>
            </div>
            <button
              onClick={() => {
                const next = !pinned;
                setPinned(next);
                localStorage.setItem("aurora_nav_pinned", String(next));
              }}
              title={pinned ? "Unpin" : "Pin open"}
              className={cn(
                "h-7 w-7 rounded-md text-xs flex items-center justify-center transition-colors",
                pinned ? "bg-primary/15 text-primary" : "text-muted-foreground hover:bg-muted"
              )}
            >
              📌
            </button>
            <button
              onClick={() => setOpen(false)}
              className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:bg-muted"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <nav className="p-2 max-h-[60vh] overflow-y-auto">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activeMode === item.mode;
              return (
                <button
                  key={item.mode}
                  onClick={() => handleNav(item.mode)}
                  className={cn(
                    "w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all",
                    isActive
                      ? "bg-primary/12 text-primary font-medium"
                      : "hover:bg-muted/60 text-foreground/85"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{item.name}</span>
                  {isActive && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" />}
                </button>
              );
            })}
            <div className="my-2 h-px bg-border/50" />
            <button
              onClick={() => { navigate("/pricing"); if (!pinned) setOpen(false); }}
              className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm hover:bg-muted/60 text-foreground/85"
            >
              <CreditCard className="h-4 w-4" />
              <span>Pricing</span>
            </button>
          </nav>
        </PopoverContent>
      </Popover>

      {/* Quick icon rail (only the top 4 frequent items) */}
      <div className="flex-1 flex flex-col items-center gap-1 mt-2">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeMode === item.mode;
          return (
            <button
              key={item.mode}
              onClick={() => onModeChange(item.mode)}
              title={item.name}
              className={cn(
                "relative h-10 w-10 rounded-xl flex items-center justify-center transition-colors",
                isActive ? "bg-primary/12 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
              )}
            >
              {isActive && <span className="absolute -left-2 top-1/2 -translate-y-1/2 w-1 h-5 bg-primary rounded-full" />}
              <Icon className="h-5 w-5" />
            </button>
          );
        })}
      </div>

      <div className="flex flex-col items-center gap-1 pt-2 border-t border-border/40 w-full">
        <ThemeToggle />
        <UserMenu />
      </div>
    </aside>
  );
}
