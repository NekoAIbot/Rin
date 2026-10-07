import { useCallback, useEffect, useState } from "react";
import { Send, Copy, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

type Status = {
  linked: boolean;
  link: { display_name: string | null; last_message_at: string | null } | null;
  bot_username: string | null;
};

export function TelegramConnect() {
  const { user } = useAuth();
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [deepLink, setDeepLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [proactive, setProactive] = useState(true);

  const call = useCallback(async (action: string) => {
    const { data, error } = await supabase.functions.invoke("telegram-link", { body: { action } });
    if (error) throw error;
    return data as Status & { code?: string; deep_link?: string };
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await call("status");
        if (alive) setStatus(data);
      } catch {
        /* offline or not configured */
      } finally {
        if (alive) setLoading(false);
      }
      if (!user) return;
      const { data: s } = await supabase
        .from("user_settings")
        .select("telegram_enabled, telegram_proactive")
        .eq("user_id", user.id)
        .maybeSingle();
      if (alive && s) {
        setEnabled(s.telegram_enabled !== false);
        setProactive(s.telegram_proactive !== false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [call, user]);

  const saveToggle = async (patch: Record<string, boolean>) => {
    if (!user) return;
    await supabase.from("user_settings").upsert(
      { user_id: user.id, ...patch, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );
  };

  const generate = async () => {
    setBusy(true);
    try {
      const data = await call("create_code");
      setCode(data.code ?? null);
      setDeepLink(data.deep_link ?? null);
    } catch {
      toast.error("Couldn't create a code just now");
    } finally {
      setBusy(false);
    }
  };

  const unlink = async () => {
    setBusy(true);
    try {
      await call("unlink");
      setStatus((s) => (s ? { ...s, linked: false, link: null } : s));
      setCode(null);
      toast.success("Telegram disconnected");
    } catch {
      toast.error("Couldn't disconnect");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-1 py-2 text-[13px] text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking Telegram…
      </div>
    );
  }

  const botName = status?.bot_username ? `@${status.bot_username}` : "the Aurora bot";

  return (
    <div className="space-y-3 rounded-2xl surface-sunk p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-primary/10 text-primary">
            <Send className="h-4 w-4" />
          </span>
          <div>
            <Label className="text-[14px]">Telegram</Label>
            <p className="text-[12px] text-muted-foreground">
              {status?.linked
                ? `Connected as ${status.link?.display_name ?? "your chat"}`
                : `Talk to Aurora in a chat thread`}
            </p>
          </div>
        </div>
        {status?.linked ? (
          <Button variant="outline" size="sm" className="rounded-full" disabled={busy} onClick={unlink}>
            Disconnect
          </Button>
        ) : (
          <Button size="sm" className="rounded-full" disabled={busy} onClick={generate}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Connect"}
          </Button>
        )}
      </div>

      {!status?.linked && code && (
        <div className="space-y-2 rounded-xl bg-background/60 p-3">
          <p className="text-[12px] text-muted-foreground">
            Open {botName} on Telegram and send this code. It expires in 15 minutes.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded-full bg-primary/10 px-3 py-2 text-center font-mono text-[15px] tracking-[0.2em] text-primary">
              {code}
            </code>
            <Button
              variant="outline"
              size="icon"
              className="rounded-full"
              onClick={() => {
                navigator.clipboard.writeText(code);
                setCopied(true);
                setTimeout(() => setCopied(false), 1600);
              }}
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          {deepLink && (
            <Button asChild variant="outline" className="w-full rounded-full">
              <a href={deepLink} target="_blank" rel="noreferrer">
                Open Telegram and link automatically
              </a>
            </Button>
          )}
        </div>
      )}

      {status?.linked && (
        <div className="space-y-2 pt-1">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[13px]">Replies on Telegram</p>
            <Switch
              checked={enabled}
              onCheckedChange={(v) => {
                setEnabled(v);
                saveToggle({ telegram_enabled: v });
              }}
            />
          </div>
          <div className="flex items-center justify-between gap-3">
            <p className="text-[13px]">Check-ins and daily rituals</p>
            <Switch
              checked={proactive}
              onCheckedChange={(v) => {
                setProactive(v);
                saveToggle({ telegram_proactive: v });
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
