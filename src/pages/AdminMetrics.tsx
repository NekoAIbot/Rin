import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Helmet } from "react-helmet-async";

type Metrics = {
  total_users: number;
  new_users_7d: number;
  total_conversations: number;
  total_messages: number;
  active_subscriptions: number;
  mrr_ngn: number;
};

export default function AdminMetrics() {
  const { user } = useAuth();
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data, error } = await supabase.rpc("admin_metrics");
      if (!active) return;
      if (error) setError(error.message);
      else setMetrics(data as unknown as Metrics);
      setLoading(false);
    })();
    return () => { active = false; };
  }, []);

  const cards = metrics ? [
    { label: "Total users", value: metrics.total_users },
    { label: "New users · 7d", value: metrics.new_users_7d },
    { label: "Conversations", value: metrics.total_conversations },
    { label: "Messages", value: metrics.total_messages },
    { label: "Active subscriptions", value: metrics.active_subscriptions },
    { label: "MRR (NGN)", value: `₦${metrics.mrr_ngn.toLocaleString()}` },
  ] : [];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Helmet><title>Admin metrics — Aurora</title></Helmet>
      <header className="border-b border-border/50">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <Button asChild variant="ghost" size="sm"><Link to="/app"><ArrowLeft className="h-4 w-4 mr-1" />Back to app</Link></Button>
          <span className="font-serif text-lg">Admin · Metrics</span>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-10">
        <h1 className="font-serif text-3xl tracking-tight mb-2">Live metrics</h1>
        <p className="text-muted-foreground mb-8">Signed in as {user?.email}</p>

        {loading && (
          <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading metrics…</div>
        )}

        {error && (
          <Card className="p-6 border-destructive/40 bg-destructive/5">
            <h2 className="font-medium text-destructive">Not authorized</h2>
            <p className="text-sm text-muted-foreground mt-2">
              This page is restricted to users with the <code>admin</code> role. Ask an administrator to grant your
              account access by inserting a row into <code>user_roles</code> with your user id and role <code>'admin'</code>.
            </p>
            <p className="text-xs text-muted-foreground mt-3">Error: {error}</p>
          </Card>
        )}

        {metrics && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {cards.map((c) => (
              <Card key={c.label} className="p-5 bg-card/60 border-border/60">
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{c.label}</p>
                <p className="mt-2 font-serif text-3xl tracking-tight">{c.value}</p>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
