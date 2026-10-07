import { useState, useEffect, useCallback } from "react";
import { useProactiveInsights, RitualSummary } from "@/hooks/useProactiveInsights";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Sun, CalendarDays, Sparkles, Target, TrendingUp, Loader2 } from "lucide-react";
import ReactMarkdown from "react-markdown";

export function RitualDashboard() {
  const { generateRitual, fetchRitualHistory, isGeneratingSummary } = useProactiveInsights();
  const [rituals, setRituals] = useState<RitualSummary[]>([]);
  const [currentRitual, setCurrentRitual] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    setIsLoading(true);
    const data = await fetchRitualHistory(10);
    setRituals(data);
    setIsLoading(false);
  }, [fetchRitualHistory]);

  useEffect(() => { load(); }, [load]);

  const handleGenerate = async (type: 'daily' | 'weekly') => {
    const result = await generateRitual(type);
    if (result?.ritual) {
      setCurrentRitual({ ...result.ritual, type });
      toast.success(`${type === 'daily' ? 'Daily recap' : 'Weekly reset'} generated!`);
      load(); // Refresh history
    } else {
      toast.error("Couldn't generate summary. Try chatting more first!");
    }
  };

  return (
    <div className="space-y-6">
      {/* Trigger Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-4 cursor-pointer hover:border-primary/30 transition-colors" onClick={() => handleGenerate('daily')}>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-500/10">
              <Sun className="h-5 w-5 text-amber-500" />
            </div>
            <div className="flex-1">
              <h3 className="font-medium text-sm">Daily Recap</h3>
              <p className="text-xs text-muted-foreground">Reflect on today's conversations, emotions, and wins</p>
            </div>
            {isGeneratingSummary && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
          </div>
        </Card>

        <Card className="p-4 cursor-pointer hover:border-primary/30 transition-colors" onClick={() => handleGenerate('weekly')}>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-500/10">
              <CalendarDays className="h-5 w-5 text-purple-500" />
            </div>
            <div className="flex-1">
              <h3 className="font-medium text-sm">Weekly Strategy Reset</h3>
              <p className="text-xs text-muted-foreground">Review goals, growth, and set intentions for next week</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Current Ritual */}
      {currentRitual && (
        <Card className="p-5 border-primary/20 bg-primary/5">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="h-4 w-4 text-primary" />
            <h3 className="font-medium text-sm">
              {currentRitual.type === 'daily' ? 'Today\'s Recap' : 'This Week\'s Reset'}
            </h3>
          </div>
          <div className="prose prose-sm dark:prose-invert max-w-none text-sm">
            <ReactMarkdown>{currentRitual.summary || ''}</ReactMarkdown>
          </div>

          {currentRitual.accomplishments?.length > 0 && (
            <div className="mt-4">
              <div className="flex items-center gap-1.5 mb-2">
                <TrendingUp className="h-3.5 w-3.5 text-green-500" />
                <span className="text-xs font-medium">Accomplishments</span>
              </div>
              <div className="space-y-1">
                {currentRitual.accomplishments.map((a: string, i: number) => (
                  <p key={i} className="text-xs text-muted-foreground">✓ {a}</p>
                ))}
              </div>
            </div>
          )}

          {currentRitual.intentions?.length > 0 && (
            <div className="mt-3">
              <div className="flex items-center gap-1.5 mb-2">
                <Target className="h-3.5 w-3.5 text-primary" />
                <span className="text-xs font-medium">Intentions</span>
              </div>
              <div className="space-y-1">
                {currentRitual.intentions.map((i: string, idx: number) => (
                  <p key={idx} className="text-xs text-muted-foreground">→ {i}</p>
                ))}
              </div>
            </div>
          )}

          <Button variant="ghost" size="sm" className="mt-3" onClick={() => setCurrentRitual(null)}>
            Dismiss
          </Button>
        </Card>
      )}

      {/* History */}
      <div>
        <h3 className="font-medium text-sm mb-3">Past Rituals</h3>
        {isLoading ? (
          <Card className="p-8 text-center"><Loader2 className="h-5 w-5 animate-spin text-primary mx-auto" /></Card>
        ) : rituals.length === 0 ? (
          <Card className="p-8 text-center border-dashed">
            <CalendarDays className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="font-medium">No rituals yet</p>
            <p className="text-sm text-muted-foreground mt-1">Generate your first daily recap or weekly reset above</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {rituals.map(r => (
              <Card key={r.id} className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <Badge variant="outline" className="text-xs">
                    {r.ritual_type === 'daily_recap' ? '☀️ Daily' : '📅 Weekly'}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {new Date(r.created_at).toLocaleDateString()}
                  </span>
                </div>
                <p className="text-sm line-clamp-3">{r.summary}</p>
                {r.growth_highlights?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {r.growth_highlights.map((h, i) => (
                      <Badge key={i} className="text-xs bg-green-500/10 text-green-600 border-green-500/20">
                        {h}
                      </Badge>
                    ))}
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
