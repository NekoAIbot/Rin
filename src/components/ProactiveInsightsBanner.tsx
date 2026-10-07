import { useEffect, useState } from "react";
import { useProactiveInsights, ProactiveInsight } from "@/hooks/useProactiveInsights";
import { Button } from "@/components/ui/button";
import { X, Lightbulb, TrendingDown, Target, AlertTriangle, Sparkles } from "lucide-react";

const INSIGHT_ICONS: Record<string, typeof Lightbulb> = {
  mood_decline: TrendingDown,
  high_intensity: AlertTriangle,
  forgotten_goal: Target,
  pattern_alert: AlertTriangle,
  identity_reinforcement: Sparkles,
  unresolved_thread: Lightbulb,
};

export function ProactiveInsightsBanner() {
  const { fetchInsights, dismissInsight, markSurfaced } = useProactiveInsights();
  const [insights, setInsights] = useState<ProactiveInsight[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchInsights().then(data => {
      setInsights(data);
      data.forEach(i => markSurfaced(i.id));
    });
  }, [fetchInsights, markSurfaced]);

  const handleDismiss = (id: string) => {
    setDismissed(prev => new Set(prev).add(id));
    dismissInsight(id);
  };

  const visible = insights.filter(i => !dismissed.has(i.id));
  if (visible.length === 0) return null;

  return (
    <div className="px-4 py-2 space-y-2">
      {visible.map(insight => {
        const Icon = INSIGHT_ICONS[insight.insight_type] || Lightbulb;
        return (
          <div
            key={insight.id}
            className="flex items-start gap-3 p-3 rounded-lg bg-primary/5 border border-primary/10 animate-in fade-in slide-in-from-top-2"
          >
            <Icon className="h-4 w-4 text-primary mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{insight.title}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{insight.message}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0"
              onClick={() => handleDismiss(insight.id)}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        );
      })}
    </div>
  );
}
