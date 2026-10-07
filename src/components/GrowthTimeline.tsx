import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { TrendingUp, TrendingDown, Minus, Calendar, Sparkles } from "lucide-react";

interface IdentityEntry {
  id: string;
  dimension: string;
  score: number;
  delta: number;
  note: string;
  evidence: string;
  created_at: string;
}

const DIMENSION_LABELS: Record<string, string> = {
  confidence: "Confidence",
  discipline: "Discipline",
  emotional_stability: "Emotional Stability",
  resilience: "Resilience",
  focus: "Focus",
  growth_mindset: "Growth Mindset",
};

const DIMENSION_COLORS: Record<string, string> = {
  confidence: "text-amber-500",
  discipline: "text-blue-500",
  emotional_stability: "text-green-500",
  resilience: "text-purple-500",
  focus: "text-cyan-500",
  growth_mindset: "text-rose-500",
};

export function GrowthTimeline() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<IdentityEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    const { data } = await supabase
      .from("identity_evolution")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100);
    setEntries((data || []) as IdentityEntry[]);
    setIsLoading(false);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  // Group by dimension and get trajectory
  const trajectories = Object.keys(DIMENSION_LABELS).map(dim => {
    const dimEntries = entries.filter(e => e.dimension === dim).sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
    const latest = dimEntries[dimEntries.length - 1];
    const first = dimEntries[0];
    const totalDelta = latest && first ? latest.score - first.score : 0;
    return { dimension: dim, entries: dimEntries, latest, totalDelta };
  }).filter(t => t.entries.length > 0);

  // Timeline events (most recent first)
  const timelineEvents = entries.slice(0, 20);

  if (isLoading) {
    return <div className="flex items-center justify-center py-8">
      <TrendingUp className="h-6 w-6 animate-pulse text-primary" />
    </div>;
  }

  if (entries.length === 0) {
    return (
      <Card className="p-8 text-center border-dashed">
        <Sparkles className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
        <p className="font-medium">Your growth journey starts here</p>
        <p className="text-sm text-muted-foreground mt-1">
          As you chat with Aurora, she'll track your growth across key dimensions like confidence, resilience, and focus.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Dimension Overview */}
      <Card className="p-4">
        <h3 className="font-medium text-sm mb-4 flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          Growth Dimensions
        </h3>
        <div className="space-y-4">
          {trajectories.map(t => (
            <div key={t.dimension}>
              <div className="flex items-center justify-between mb-1.5">
                <span className={`text-sm font-medium ${DIMENSION_COLORS[t.dimension] || ""}`}>
                  {DIMENSION_LABELS[t.dimension]}
                </span>
                <div className="flex items-center gap-2">
                  {t.totalDelta > 0.1 ? (
                    <Badge className="text-xs bg-green-500/10 text-green-600 border-green-500/20">
                      <TrendingUp className="h-3 w-3 mr-1" />+{t.totalDelta.toFixed(1)}
                    </Badge>
                  ) : t.totalDelta < -0.1 ? (
                    <Badge className="text-xs bg-red-500/10 text-red-600 border-red-500/20">
                      <TrendingDown className="h-3 w-3 mr-1" />{t.totalDelta.toFixed(1)}
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="text-xs">
                      <Minus className="h-3 w-3 mr-1" />Stable
                    </Badge>
                  )}
                  <span className="text-sm font-semibold">{t.latest?.score.toFixed(1)}/10</span>
                </div>
              </div>
              <Progress value={(t.latest?.score || 0) * 10} className="h-2" />
              {/* Mini sparkline of data points */}
              <div className="flex items-end gap-0.5 mt-1.5 h-4">
                {t.entries.map((e, i) => (
                  <div
                    key={i}
                    className={`w-1.5 rounded-t ${e.delta >= 0 ? "bg-green-500/40" : "bg-red-500/40"}`}
                    style={{ height: `${Math.max(20, (e.score / 10) * 100)}%` }}
                    title={`${e.score.toFixed(1)} — ${e.note || ""}`}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Timeline */}
      <Card className="p-4">
        <h3 className="font-medium text-sm mb-4 flex items-center gap-2">
          <Calendar className="h-4 w-4 text-primary" />
          Growth Timeline
        </h3>
        <div className="relative">
          <div className="absolute left-3 top-0 bottom-0 w-px bg-border" />
          <div className="space-y-4">
            {timelineEvents.map(event => (
              <div key={event.id} className="relative pl-8">
                <div className={`absolute left-1.5 top-1.5 w-3 h-3 rounded-full border-2 ${
                  event.delta > 0 ? "border-green-500 bg-green-500/20" :
                  event.delta < 0 ? "border-red-500 bg-red-500/20" :
                  "border-muted-foreground bg-muted"
                }`} />
                <div className="p-2 rounded-lg bg-muted/30">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className={`text-xs font-medium ${DIMENSION_COLORS[event.dimension] || ""}`}>
                      {DIMENSION_LABELS[event.dimension] || event.dimension}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(event.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-xs">{event.note || event.evidence}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-muted-foreground">
                      Score: {event.score.toFixed(1)}
                    </span>
                    {event.delta !== 0 && (
                      <span className={`text-xs font-medium ${event.delta > 0 ? "text-green-500" : "text-red-500"}`}>
                        ({event.delta > 0 ? "+" : ""}{event.delta.toFixed(1)})
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}
