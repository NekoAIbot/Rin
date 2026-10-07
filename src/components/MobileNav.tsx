import { useState } from "react";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Menu } from "lucide-react";
import { NAV_ITEMS } from "./Sidebar";
import { ThemeToggle } from "./ThemeToggle";
import { UserMenu } from "./UserMenu";
import { useNavigate } from "react-router-dom";
import auroraMark from "@/assets/aurora-mark.png";

interface MobileNavProps {
  onModeChange: (mode: string) => void;
  activeMode: string;
}

export function MobileNav({ onModeChange, activeMode }: MobileNavProps) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const handleMode = (mode: string) => {
    onModeChange(mode);
    setOpen(false);
  };

  return (
    <header className="md:hidden flex items-center justify-between px-4 h-14 border-b border-border bg-background/80 backdrop-blur-xl sticky top-0 z-30 safe-pt">
      <div className="flex items-center gap-2">
        <img src={auroraMark} alt="Aurora" width={28} height={28} className="h-7 w-7 object-contain" />
        <span className="font-display text-lg font-semibold tracking-tight">Aurora</span>
      </div>
      <div className="flex items-center gap-1">
        <ThemeToggle />
        <UserMenu />
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Open menu">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-72 bg-sidebar text-sidebar-foreground border-sidebar-border p-0">
            <div className="p-4 border-b border-sidebar-border flex items-center gap-2">
              <img src={auroraMark} alt="" width={28} height={28} className="h-7 w-7 object-contain" />
              <span className="font-display text-lg font-semibold">Aurora</span>
            </div>
            <nav className="p-3 space-y-1 overflow-y-auto">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive = activeMode === item.mode;
                return (
                  <button
                    key={item.mode}
                    onClick={() => handleMode(item.mode)}
                    className={`w-full flex items-center gap-3 rounded-xl px-3 py-3 text-sm ${
                      isActive ? "bg-sidebar-accent text-sidebar-primary" : "hover:bg-sidebar-accent/60"
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                    <span>{item.name}</span>
                  </button>
                );
              })}
              <button
                onClick={() => { navigate("/pricing"); setOpen(false); }}
                className="w-full flex items-center gap-3 rounded-xl px-3 py-3 text-sm hover:bg-sidebar-accent/60"
              >
                <span>Pricing & Billing</span>
              </button>
            </nav>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
