import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Copy, Plus, Trash2, Key, Eye, EyeOff, Zap, Crown, Building2, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  tier: string;
  monthly_limit: number;
  is_active: boolean;
  created_at: string;
  last_used_at: string | null;
}

interface UsageStats {
  total: number;
  limit: number;
}

const TIER_CONFIG = {
  free: { label: "Free", icon: Zap, color: "bg-muted text-muted-foreground", limit: 100, price: "Free" },
  pro: { label: "Pro", icon: Crown, color: "bg-primary/10 text-primary", limit: 10000, price: "$29/mo" },
  enterprise: { label: "Enterprise", icon: Building2, color: "bg-accent/10 text-accent", limit: 100000, price: "Contact us" },
};

export default function ApiKeys() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [usage, setUsage] = useState<Record<string, UsageStats>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [newKeyName, setNewKeyName] = useState("My API Key");
  const [newKeyTier, setNewKeyTier] = useState("free");
  const [showNewKey, setShowNewKey] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  const fetchKeys = useCallback(async () => {
    if (!user) return;
    setIsLoading(true);
    const { data, error } = await supabase
      .from("api_keys")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (!error && data) {
      setKeys(data as ApiKey[]);

      // Fetch usage for each key
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const usageMap: Record<string, UsageStats> = {};
      for (const key of data) {
        const { count } = await supabase
          .from("api_usage")
          .select("*", { count: "exact", head: true })
          .eq("api_key_id", key.id)
          .gte("created_at", startOfMonth.toISOString());
        usageMap[key.id] = { total: count || 0, limit: key.monthly_limit };
      }
      setUsage(usageMap);
    }
    setIsLoading(false);
  }, [user]);

  useEffect(() => { fetchKeys(); }, [fetchKeys]);

  const generateKey = () => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let key = "aur_";
    for (let i = 0; i < 48; i++) {
      key += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return key;
  };

  const hashKey = async (key: string): Promise<string> => {
    const encoder = new TextEncoder();
    const data = encoder.encode(key);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");
  };

  const createKey = async () => {
    if (!user) return;
    setIsCreating(true);
    try {
      const rawKey = generateKey();
      const keyHash = await hashKey(rawKey);
      const tierConfig = TIER_CONFIG[newKeyTier as keyof typeof TIER_CONFIG];

      const { error } = await supabase.from("api_keys").insert({
        user_id: user.id,
        name: newKeyName.trim() || "My API Key",
        key_hash: keyHash,
        key_prefix: rawKey.slice(0, 12),
        tier: newKeyTier,
        monthly_limit: tierConfig.limit,
      });

      if (error) throw error;
      setShowNewKey(rawKey);
      setDialogOpen(false);
      toast.success("API key created! Copy it now — you won't see it again.");
      fetchKeys();
    } catch (e) {
      toast.error("Failed to create API key");
    } finally {
      setIsCreating(false);
    }
  };

  const deleteKey = async (id: string) => {
    const { error } = await supabase.from("api_keys").delete().eq("id", id);
    if (!error) {
      setKeys(prev => prev.filter(k => k.id !== id));
      toast.success("API key deleted");
    }
  };

  const toggleKey = async (id: string, isActive: boolean) => {
    await supabase.from("api_keys").update({ is_active: !isActive }).eq("id", id);
    setKeys(prev => prev.map(k => k.id === id ? { ...k, is_active: !isActive } : k));
  };

  const baseUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/aurora-api`;

  return (
    <div className="flex-1 p-6 overflow-y-auto max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/app")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Aurora API</h1>
          <p className="text-sm text-muted-foreground">Integrate Aurora into your apps, devices, and workflows</p>
        </div>
      </div>

      {/* Pricing Tiers */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {Object.entries(TIER_CONFIG).map(([tier, cfg]) => {
          const Icon = cfg.icon;
          return (
            <Card key={tier} className="p-4 relative overflow-hidden">
              <div className="flex items-center gap-2 mb-2">
                <Icon className="h-5 w-5 text-primary" />
                <h3 className="font-semibold">{cfg.label}</h3>
              </div>
              <p className="text-2xl font-bold mb-1">{cfg.price}</p>
              <p className="text-sm text-muted-foreground">{cfg.limit.toLocaleString()} requests/month</p>
            </Card>
          );
        })}
      </div>

      {/* New key reveal */}
      {showNewKey && (
        <Card className="p-4 border-primary bg-primary/5">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-primary mb-1">🔑 Your new API key (copy now — shown once):</p>
              <code className="text-xs break-all bg-muted p-2 rounded block">{showNewKey}</code>
            </div>
            <Button size="sm" onClick={() => { navigator.clipboard.writeText(showNewKey); toast.success("Copied!"); }}>
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          <Button variant="ghost" size="sm" className="mt-2" onClick={() => setShowNewKey(null)}>
            Dismiss
          </Button>
        </Card>
      )}

      {/* Keys List */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Your API Keys</h2>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="h-4 w-4 mr-2" />Create Key</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create API Key</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Key Name</label>
                <Input value={newKeyName} onChange={e => setNewKeyName(e.target.value)} placeholder="My App" />
              </div>
              <div>
                <label className="text-sm font-medium">Tier</label>
                <Select value={newKeyTier} onValueChange={setNewKeyTier}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="free">Free — 100 req/mo</SelectItem>
                    <SelectItem value="pro">Pro — 10,000 req/mo</SelectItem>
                    <SelectItem value="enterprise">Enterprise — 100,000 req/mo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={createKey} disabled={isCreating} className="w-full">
                {isCreating ? "Creating..." : "Generate API Key"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <Card className="p-8 text-center"><Key className="h-8 w-8 animate-pulse text-primary mx-auto" /></Card>
      ) : keys.length === 0 ? (
        <Card className="p-8 text-center border-dashed">
          <Key className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="font-medium">No API keys yet</p>
          <p className="text-sm text-muted-foreground mt-1">Create your first key to start integrating Aurora</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {keys.map(key => {
            const tierCfg = TIER_CONFIG[key.tier as keyof typeof TIER_CONFIG] || TIER_CONFIG.free;
            const keyUsage = usage[key.id] || { total: 0, limit: key.monthly_limit };
            const usagePct = Math.min((keyUsage.total / keyUsage.limit) * 100, 100);
            return (
              <Card key={key.id} className={`p-4 ${!key.is_active ? "opacity-60" : ""}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-sm">{key.name}</span>
                      <Badge className={`text-xs ${tierCfg.color}`}>{tierCfg.label}</Badge>
                      {!key.is_active && <Badge variant="destructive" className="text-xs">Inactive</Badge>}
                    </div>
                    <code className="text-xs text-muted-foreground">{key.key_prefix}••••••••</code>
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                      <span>Usage: {keyUsage.total}/{keyUsage.limit}</span>
                      <div className="flex-1 max-w-32 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${usagePct > 80 ? "bg-destructive" : "bg-primary"}`}
                          style={{ width: `${usagePct}%` }}
                        />
                      </div>
                      {key.last_used_at && <span>Last used: {new Date(key.last_used_at).toLocaleDateString()}</span>}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => toggleKey(key.id, key.is_active)}>
                      {key.is_active ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteKey(key.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* API Documentation */}
      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-4">Quick Start</h2>
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-medium mb-2">Endpoint</h3>
            <code className="text-xs bg-muted p-2 rounded block break-all">{baseUrl}</code>
          </div>
          <div>
            <h3 className="text-sm font-medium mb-2">Example Request</h3>
            <pre className="text-xs bg-muted p-3 rounded overflow-x-auto">{`curl -X POST ${baseUrl} \\
  -H "Content-Type: application/json" \\
  -H "x-aurora-api-key: aur_YOUR_KEY_HERE" \\
  -d '{
    "messages": [
      {"role": "user", "content": "Hello Aurora!"}
    ],
    "stream": false
  }'`}</pre>
          </div>
          <div>
            <h3 className="text-sm font-medium mb-2">Parameters</h3>
            <div className="text-xs space-y-1 text-muted-foreground">
              <p><code className="text-foreground">messages</code> — Array of {`{role, content}`} objects (required)</p>
              <p><code className="text-foreground">system_prompt</code> — Custom system prompt (optional)</p>
              <p><code className="text-foreground">stream</code> — Enable SSE streaming (default: false)</p>
              <p><code className="text-foreground">temperature</code> — 0-1 creativity (default: 0.7)</p>
              <p><code className="text-foreground">model</code> — AI model (default: gemini-3-flash-preview)</p>
            </div>
          </div>
          <div>
            <h3 className="text-sm font-medium mb-2">IoT / Hardware Integration</h3>
            <p className="text-xs text-muted-foreground">
              Any device that can make HTTP requests (Raspberry Pi, Arduino with WiFi, ESP32, smart home hubs) 
              can integrate with Aurora. Use the REST API endpoint above with your API key. 
              Aurora works with any programming language — Python, C++, JavaScript, Go, etc.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
