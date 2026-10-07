import { useEffect, useState, useCallback } from "react";
import { useProactiveInsights } from "@/hooks/useProactiveInsights";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle, Brain, Repeat, Clock, Zap } from "lucide-react";

interface BehavioralInsight {
  id: string;
  pattern_type: string;
  description: string;
  severity: string;
  suggestion: string | null;
  detected_from: string;
  acknowledged: boolean;
  created_at: string;
}

const PATTERN_CONFIG: Record<string, { icon: typeof Brain; color: string; label: string }> = {
  procrastination: { icon: Clock, color: "text-amber-500", label: "Procrastination Loop" },
  decision_paralysis: { icon: Repeat, color: "text-purple-500", label: "Decision Paralysis" },
  overcommitment: { icon: Zap, color: "text-red-500", label: "Overcommitment" },
  energy_fluctuation: { icon: AlertTriangle, color: "text-orange-500", label: "Energy Fluctuation" },
  avoidance: { icon: AlertTriangle, color: "text-rose-500", label: "Avoidance Pattern" },
};

const SEVERITY_COLORS: Record<string, string> = {
  mild: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
  moderate: "bg-orange-500/10 text-orange-600 border-orange-500/20",
  significant: "bg-red-500/10 text-red-600 border-red-500/20",
};

export function BehavioralPatterns() {
  const { fetchBehavioralInsights, acknowledgeBehavioralInsight } = useProactiveInsights();
  const [insights, setInsights] = useState<BehavioralInsight[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    setIsLoading(true);
    const data = await fetchBehavioralInsights();
    setInsights(data as BehavioralInsight[]);
    setIsLoading(false);
  }, [fetchBehavioralInsights]);

  useEffect(() => { load(); }, [load]);

  const handleAcknowledge = async (id: string) => {
    await acknowledgeBehavioralInsight(id);
    setInsights(prev => prev.map(i => i.id === id ? { ...i, acknowledged: true } : i));
    toast.success("Pattern acknowledged");
  };

  const active = insights.filter(i => !i.acknowledged);
  const past = insights.filter(i => i.acknowledged);

  if (isLoading) {
    return <Card className="p-8 text-center"><Brain className="h-6 w-6 animate-pulse text-primary mx-auto" /></Card>;
  }

  if (insights.length === 0) {
    return (
      <Card className="p-8 text-center border-dashed">
        <Brain className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
        <p className="font-medium">No behavioral patterns detected yet</p>
        <p className="text-sm text-muted-foreground mt-1">
          Aurora analyzes your conversations over time to detect patterns like procrastination loops, 
          decision paralysis, and overcommitment. Keep chatting and she'll start noticing.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {active.length > 0 && (
        <div>
          <h3 className="font-medium text-sm mb-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Active Patterns
          </h3>
          <div className="space-y-3">
            {active.map(insight => {
              const cfg = PATTERN_CONFIG[insight.pattern_type] || PATTERN_CONFIG.procrastination;
              const Icon = cfg.icon;
              return (
                <Card key={insight.id} className="p-4 border-amber-500/20">
                  <div className="flex items-start gap-3">
                    <Icon className={`h-5 w-5 ${cfg.color} mt-0.5 shrink-0`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium">{cfg.label}</span>
                        <Badge className={`text-xs ${SEVERITY_COLORS[insight.severity] || ""}`}>
                          {insight.severity}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{insight.description}</p>
                      {insight.suggestion && (
                        <p className="text-sm mt-2 p-2 rounded-lg bg-primary/5 border border-primary/10">
                          💡 {insight.suggestion}
                        </p>
                      )}
                      <div className="flex items-center gap-2 mt-3">
                        <Button size="sm" variant="outline" onClick={() => handleAcknowledge(insight.id)}>
                          <CheckCircle className="h-3.5 w-3.5 mr-1.5" />
                          Acknowledge
                        </Button>
                        <span className="text-xs text-muted-foreground">
                          {new Date(insight.created_at).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {past.length > 0 && (
        <div>
          <h3 className="font-medium text-sm mb-3 flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-green-500" />
            Acknowledged Patterns
          </h3>
          <div className="space-y-2">
            {past.slice(0, 5).map(insight => {
              const cfg = PATTERN_CONFIG[insight.pattern_type] || PATTERN_CONFIG.procrastination;
              return (
                <Card key={insight.id} className="p-3 opacity-60">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium">{cfg.label}</span>
                    <span className="text-xs text-muted-foreground flex-1">{insight.description}</span>
                    <span className="text-xs text-muted-foreground">{new Date(insight.created_at).toLocaleDateString()}</span>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
