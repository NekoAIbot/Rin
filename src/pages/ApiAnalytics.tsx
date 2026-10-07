import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ArrowLeft, BarChart3, TrendingUp, AlertTriangle, DollarSign, Activity, Clock, ChevronDown, Wifi } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

interface UsageRow {
  id: string;
  api_key_id: string;
  endpoint: string;
  status_code: number | null;
  tokens_used: number | null;
  created_at: string;
}

interface ApiKeyInfo {
  id: string;
  name: string;
  tier: string;
  key_prefix: string;
}

const TIER_COST_PER_REQUEST = { free: 0, pro: 0.0049, enterprise: 0.00199 };
const CHART_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--accent))",
  "hsl(210, 70%, 55%)",
  "hsl(150, 60%, 45%)",
  "hsl(30, 80%, 55%)",
];

export default function ApiAnalytics() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [usage, setUsage] = useState<UsageRow[]>([]);
  const [keys, setKeys] = useState<ApiKeyInfo[]>([]);
  const [selectedKey, setSelectedKey] = useState<string>("all");
  const [timeRange, setTimeRange] = useState<string>("30d");
  const [isLoading, setIsLoading] = useState(true);
  const [realtimeConnected, setRealtimeConnected] = useState(false);

  // Collapsible states
  const [volumeOpen, setVolumeOpen] = useState(true);
  const [endpointsOpen, setEndpointsOpen] = useState(true);
  const [keyBreakdownOpen, setKeyBreakdownOpen] = useState(true);
  const [errorsOpen, setErrorsOpen] = useState(true);

  const startDate = useMemo(() => {
    const d = new Date();
    const days = timeRange === "7d" ? 7 : timeRange === "30d" ? 30 : 90;
    d.setDate(d.getDate() - days);
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }, [timeRange]);

  const fetchData = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);

    const [keysRes, usageRes] = await Promise.all([
      supabase.from("api_keys").select("id, name, tier, key_prefix").eq("user_id", user.id),
      supabase.from("api_usage").select("*").eq("user_id", user.id).gte("created_at", startDate).order("created_at", { ascending: true }),
    ]);

    if (keysRes.data) setKeys(keysRes.data as ApiKeyInfo[]);
    if (usageRes.data) setUsage(usageRes.data as UsageRow[]);
    setIsLoading(false);
  }, [user, startDate]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Realtime subscription
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel("api-usage-realtime")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "api_usage",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const newRow = payload.new as UsageRow;
          // Only add if within current time range
          if (new Date(newRow.created_at) >= new Date(startDate)) {
            setUsage((prev) => {
              if (prev.some((r) => r.id === newRow.id)) return prev;
              return [...prev, newRow];
            });
          }
        }
      )
      .subscribe((status) => {
        setRealtimeConnected(status === "SUBSCRIBED");
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, startDate]);

  const filtered = useMemo(() =>
    selectedKey === "all" ? usage : usage.filter(u => u.api_key_id === selectedKey),
    [usage, selectedKey]
  );

  // --- Stats ---
  const totalRequests = filtered.length;
  const errorCount = filtered.filter(u => u.status_code && u.status_code >= 400).length;
  const errorRate = totalRequests > 0 ? ((errorCount / totalRequests) * 100).toFixed(1) : "0";
  const totalTokens = filtered.reduce((s, u) => s + (u.tokens_used || 0), 0);

  const costEstimate = useMemo(() => {
    if (selectedKey !== "all") {
      const key = keys.find(k => k.id === selectedKey);
      const rate = TIER_COST_PER_REQUEST[(key?.tier as keyof typeof TIER_COST_PER_REQUEST) || "free"];
      return (filtered.length * rate).toFixed(2);
    }
    let total = 0;
    for (const row of filtered) {
      const key = keys.find(k => k.id === row.api_key_id);
      const rate = TIER_COST_PER_REQUEST[(key?.tier as keyof typeof TIER_COST_PER_REQUEST) || "free"];
      total += rate;
    }
    return total.toFixed(2);
  }, [filtered, keys, selectedKey]);

  // --- Volume over time chart ---
  const volumeData = useMemo(() => {
    const buckets: Record<string, { date: string; requests: number; errors: number }> = {};
    const granularity = timeRange === "7d" ? "day" : timeRange === "30d" ? "day" : "week";
    for (const row of filtered) {
      const d = new Date(row.created_at);
      let key: string;
      if (granularity === "day") {
        key = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      } else {
        const weekStart = new Date(d);
        weekStart.setDate(d.getDate() - d.getDay());
        key = weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      }
      if (!buckets[key]) buckets[key] = { date: key, requests: 0, errors: 0 };
      buckets[key].requests++;
      if (row.status_code && row.status_code >= 400) buckets[key].errors++;
    }
    return Object.values(buckets);
  }, [filtered, timeRange]);

  // --- Top endpoints ---
  const endpointData = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const row of filtered) {
      counts[row.endpoint] = (counts[row.endpoint] || 0) + 1;
    }
    return Object.entries(counts)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
  }, [filtered]);

  // --- Per-key breakdown ---
  const keyBreakdownData = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const row of filtered) {
      counts[row.api_key_id] = (counts[row.api_key_id] || 0) + 1;
    }
    return Object.entries(counts).map(([keyId, count]) => {
      const keyInfo = keys.find(k => k.id === keyId);
      return { name: keyInfo?.name || keyInfo?.key_prefix || "Unknown", requests: count };
    }).sort((a, b) => b.requests - a.requests);
  }, [filtered, keys]);

  const statCards = [
    { label: "Total Requests", value: totalRequests.toLocaleString(), icon: Activity, color: "text-primary" },
    { label: "Error Rate", value: `${errorRate}%`, icon: AlertTriangle, color: errorCount > 0 ? "text-destructive" : "text-primary" },
    { label: "Tokens Used", value: totalTokens.toLocaleString(), icon: TrendingUp, color: "text-primary" },
    { label: "Est. Cost", value: `$${costEstimate}`, icon: DollarSign, color: "text-primary" },
  ];

  const SectionHeader = ({ title, icon: Icon, open, onToggle, iconColor = "text-primary" }: { title: string; icon: React.ElementType; open: boolean; onToggle: () => void; iconColor?: string }) => (
    <CollapsibleTrigger asChild onClick={onToggle}>
      <button className="flex items-center justify-between w-full text-sm font-semibold hover:opacity-80 transition-opacity">
        <span className="flex items-center gap-2">
          <Icon className={`h-4 w-4 ${iconColor}`} />
          {title}
        </span>
        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "" : "-rotate-90"}`} />
      </button>
    </CollapsibleTrigger>
  );

  return (
    <div className="flex-1 p-6 overflow-y-auto max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/api-keys")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">API Analytics</h1>
            <p className="text-sm text-muted-foreground">Monitor usage, errors, and costs across your API keys</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {realtimeConnected && (
            <Badge variant="outline" className="text-xs gap-1">
              <Wifi className="h-3 w-3 text-green-500" /> Live
            </Badge>
          )}
          <Select value={selectedKey} onValueChange={setSelectedKey}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="All Keys" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Keys</SelectItem>
              {keys.map(k => (
                <SelectItem key={k.id} value={k.id}>{k.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">7 days</SelectItem>
              <SelectItem value="30d">30 days</SelectItem>
              <SelectItem value="90d">90 days</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <Card className="p-12 text-center">
          <BarChart3 className="h-8 w-8 animate-pulse text-primary mx-auto" />
        </Card>
      ) : (
        <>
          {/* Stat Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {statCards.map(s => (
              <Card key={s.label} className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <s.icon className={`h-4 w-4 ${s.color}`} />
                  <span className="text-xs text-muted-foreground">{s.label}</span>
                </div>
                <p className="text-2xl font-bold">{s.value}</p>
              </Card>
            ))}
          </div>

          {/* Volume Over Time - Collapsible */}
          <Collapsible open={volumeOpen} onOpenChange={setVolumeOpen}>
            <Card className="p-6">
              <SectionHeader title="Request Volume Over Time" icon={Clock} open={volumeOpen} onToggle={() => setVolumeOpen(!volumeOpen)} />
              <CollapsibleContent className="mt-4">
                {volumeData.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">No data for this period</p>
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <LineChart data={volumeData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                      <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                      <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                      <Line type="monotone" dataKey="requests" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="errors" stroke="hsl(var(--destructive))" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </CollapsibleContent>
            </Card>
          </Collapsible>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Top Endpoints - Collapsible */}
            <Collapsible open={endpointsOpen} onOpenChange={setEndpointsOpen}>
              <Card className="p-6">
                <SectionHeader title="Top Endpoints" icon={BarChart3} open={endpointsOpen} onToggle={() => setEndpointsOpen(!endpointsOpen)} />
                <CollapsibleContent className="mt-4">
                  {endpointData.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">No data</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={endpointData} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis type="number" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                        <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={80} stroke="hsl(var(--muted-foreground))" />
                        <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }} />
                        <Bar dataKey="value" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CollapsibleContent>
              </Card>
            </Collapsible>

            {/* Per-Key Breakdown - Collapsible */}
            <Collapsible open={keyBreakdownOpen} onOpenChange={setKeyBreakdownOpen}>
              <Card className="p-6">
                <SectionHeader title="Usage by Key" icon={Activity} open={keyBreakdownOpen} onToggle={() => setKeyBreakdownOpen(!keyBreakdownOpen)} />
                <CollapsibleContent className="mt-4">
                  {keyBreakdownData.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">No data</p>
                  ) : (
                    <div className="space-y-3">
                      {keyBreakdownData.map((item, i) => {
                        const maxReq = keyBreakdownData[0]?.requests || 1;
                        const pct = (item.requests / maxReq) * 100;
                        return (
                          <div key={item.name}>
                            <div className="flex justify-between text-xs mb-1">
                              <span className="font-medium truncate max-w-[60%]">{item.name}</span>
                              <span className="text-muted-foreground">{item.requests.toLocaleString()}</span>
                            </div>
                            <div className="h-2 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full"
                                style={{ width: `${pct}%`, background: CHART_COLORS[i % CHART_COLORS.length] }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CollapsibleContent>
              </Card>
            </Collapsible>
          </div>

          {/* Error breakdown - Collapsible */}
          {errorCount > 0 && (
            <Collapsible open={errorsOpen} onOpenChange={setErrorsOpen}>
              <Card className="p-6">
                <SectionHeader title="Error Breakdown" icon={AlertTriangle} open={errorsOpen} onToggle={() => setErrorsOpen(!errorsOpen)} iconColor="text-destructive" />
                <CollapsibleContent className="mt-4">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {Object.entries(
                      filtered
                        .filter(u => u.status_code && u.status_code >= 400)
                        .reduce<Record<string, number>>((acc, u) => {
                          const code = String(u.status_code);
                          acc[code] = (acc[code] || 0) + 1;
                          return acc;
                        }, {})
                    ).sort((a, b) => b[1] - a[1]).map(([code, count]) => (
                      <div key={code} className="flex items-center gap-2 p-3 bg-destructive/5 rounded-lg">
                        <Badge variant="destructive" className="text-xs">{code}</Badge>
                        <span className="text-sm font-medium">{count} requests</span>
                      </div>
                    ))}
                  </div>
                </CollapsibleContent>
              </Card>
            </Collapsible>
          )}
        </>
      )}
    </div>
  );
}
