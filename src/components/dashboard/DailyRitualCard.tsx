import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sun, Moon, Flame } from "lucide-react";

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function computeStreak(): number {
  try {
    const raw = localStorage.getItem("aurora_visit_days");
    const days: string[] = raw ? JSON.parse(raw) : [];
    const today = todayKey();
    if (!days.includes(today)) days.push(today);
    days.sort();
    localStorage.setItem("aurora_visit_days", JSON.stringify(days.slice(-60)));

    let streak = 0;
    const set = new Set(days);
    const d = new Date();
    while (set.has(d.toISOString().slice(0, 10))) {
      streak += 1;
      d.setDate(d.getDate() - 1);
    }
    return streak;
  } catch {
    return 1;
  }
}

export function DailyRitualCard() {
  const [streak, setStreak] = useState(0);
  const [isEvening, setIsEvening] = useState(false);

  useEffect(() => {
    setStreak(computeStreak());
    setIsEvening(new Date().getHours() >= 17);
  }, []);

  const triggerRitual = (kind: "morning" | "evening") => {
    const prompt =
      kind === "morning"
        ? "Give me a warm morning briefing for today — tone, focus, one small intention."
        : "Let's do an evening reflection. Ask me one gentle question about today.";
    window.dispatchEvent(new CustomEvent("setMode", { detail: { mode: "chat" } }));
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent("quickAction", { detail: { action: "prefill", text: prompt } }));
    }, 150);
  };

  return (
    <Card className="p-5 rounded-2xl bg-gradient-to-br from-primary/10 via-card to-accent/10 border-border/60">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
            {isEvening ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
            <span>{isEvening ? "Evening ritual" : "Morning ritual"}</span>
          </div>
          <h3 className="font-display text-xl mt-2">
            {isEvening ? "How did today land?" : "Let's set the tone for today."}
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            A quiet two-minute check-in with Aurora.
          </p>
        </div>
        <div className="flex flex-col items-center gap-1 px-3 py-2 rounded-xl bg-background/60 border border-border/50 shrink-0">
          <Flame className="h-4 w-4 text-accent" />
          <span className="text-lg font-semibold leading-none">{streak}</span>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">day{streak === 1 ? "" : "s"}</span>
        </div>
      </div>
      <div className="flex gap-2 mt-4">
        <Button
          onClick={() => triggerRitual(isEvening ? "evening" : "morning")}
          className="rounded-xl flex-1"
        >
          Begin
        </Button>
        <Button
          variant="outline"
          onClick={() => triggerRitual(isEvening ? "morning" : "evening")}
          className="rounded-xl"
        >
          {isEvening ? "Morning instead" : "Evening instead"}
        </Button>
      </div>
    </Card>
  );
}
