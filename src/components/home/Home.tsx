import { useEffect, useMemo, useState } from "react";
import { ArrowUp, Mic, Camera, Paperclip, ChevronLeft, ShieldCheck, Wifi, WifiOff, Battery } from "lucide-react";
import { ChatWindow } from "@/components/ChatWindow";

import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { useProfile } from "@/hooks/useProfile";
import { useDeviceContext } from "@/hooks/useDeviceContext";
import { useConversations } from "@/hooks/useConversations";
import { detectIntent, executeIntent } from "@/lib/intent/engine";
import type { ResolvedIntent } from "@/lib/intent/types";
import { AuroraOrb } from "@/components/home/AuroraOrb";
import { SmartCards } from "@/components/home/SmartCards";
import { SuggestionCards } from "@/components/home/SuggestionCards";
import { ActivityTimeline } from "@/components/home/ActivityTimeline";
import { cn } from "@/lib/utils";

interface HomeProps {
  onNavigate: (surface: string) => void;
}

const GREETINGS = {
  morning: "Good morning",
  afternoon: "Good afternoon",
  evening: "Good evening",
  night: "Still up",
} as const;

const SUBLINES = {
  morning: "The day is still yours to shape.",
  afternoon: "Let's keep the momentum going.",
  evening: "A good moment to close a few loops.",
  night: "I'll keep things quiet and simple.",
} as const;

export function Home({ onNavigate }: HomeProps) {
  const { profile } = useProfile();
  const device = useDeviceContext();
  const { conversations } = useConversations();
  const [input, setInput] = useState("");
  const [conversing, setConversing] = useState(false);
  const [preview, setPreview] = useState<ResolvedIntent | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [pending, setPending] = useState<{
    intent: ResolvedIntent;
    resolve: (ok: boolean) => void;
  } | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const memoryCount = useMemo(() => {
    try {
      const raw = localStorage.getItem("aurora_memories");
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.length : 0;
    } catch {
      return 0;
    }
  }, []);

  const openConversation = (prompt?: string, record = false) => {
    setConversing(true);
    setTimeout(() => {
      if (prompt) window.dispatchEvent(new CustomEvent("aurora:prompt", { detail: { prompt } }));
      if (record) window.dispatchEvent(new CustomEvent("aurora:record"));
    }, 220);
  };

  const handleChange = (value: string) => {
    setInput(value);
    setPreview(value.trim().length > 3 ? detectIntent({ input: value, device }) : null);
  };

  const submit = async (text?: string) => {
    const value = (text ?? input).trim();
    if (!value) return;

    const intent = detectIntent({
      input: value,
      device,
      userName: profile?.display_name ?? undefined,
    });

    await executeIntent(intent, {
      converse: (prompt) => openConversation(prompt),
      navigate: (surface, prompt) => {
        onNavigate(surface);
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent("aurora:prompt", { detail: { prompt, surface } }));
        }, 220);
      },
      confirm: (i) => new Promise<boolean>((resolve) => setPending({ intent: i, resolve })),
      onUnavailable: (i) =>
        toast.info(`${i.skill.name} needs device access`, {
          description: "Grant the permission on your phone and Aurora will handle it directly.",
        }),
    });

    setInput("");
    setPreview(null);
  };

  if (conversing) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-2 px-3 py-2">
          <Button variant="ghost" size="sm" className="rounded-full" onClick={() => setConversing(false)}>
            <ChevronLeft className="mr-1 h-4 w-4" /> Home
          </Button>
        </div>
        <div className="min-h-0 flex-1">
          <ChatWindow />
        </div>
      </div>
    );
  }

  const greeting = GREETINGS[device.timeOfDay];

  return (
    <div className="relative">
      {/* ambient light — shifts with the time of day */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 transition-opacity duration-1000"
        style={{
          background:
            device.timeOfDay === "night"
              ? "radial-gradient(90% 60% at 50% -10%, hsl(var(--forest) / 0.16), transparent 70%)"
              : device.timeOfDay === "evening"
              ? "radial-gradient(90% 60% at 50% -10%, hsl(var(--gold) / 0.16), transparent 70%)"
              : "radial-gradient(90% 60% at 50% -10%, hsl(var(--sage) / 0.22), transparent 70%)",
        }}
      />

      <div className="mx-auto w-full max-w-3xl px-5 pb-40 pt-10 md:pt-16 space-y-10">
        {/* ── Greeting ─────────────────────────────── */}
        <header className="animate-rise-in space-y-5">
          <div className="flex items-start gap-4">
            <AuroraOrb size={52} />
            <div className="min-w-0 flex-1 pt-0.5">
              <p className="text-[14px] text-muted-foreground">
                {now.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
                {" · "}
                {now.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
              </p>
              <h1 className="mt-1 font-display text-[34px] leading-[1.1] tracking-tight sm:text-[40px]">
                {greeting}
                {profile?.display_name ? `, ${profile.display_name}` : ""}
              </h1>
              <p className="mt-2 text-[16px] text-muted-foreground">{SUBLINES[device.timeOfDay]}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5 rounded-full surface-glass px-3 py-1.5">
              {device.network?.online ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
              {device.network?.online ? device.network?.type ?? "Online" : "Offline"}
            </span>
            {device.battery && (
              <span className="inline-flex items-center gap-1.5 rounded-full surface-glass px-3 py-1.5">
                <Battery className={cn("h-3.5 w-3.5", device.battery.level < 0.2 && "text-destructive")} />
                {Math.round(device.battery.level * 100)}%{device.battery.charging ? " · charging" : ""}
              </span>
            )}
            <span className="inline-flex items-center gap-1.5 rounded-full surface-glass px-3 py-1.5">
              <ShieldCheck className="h-3.5 w-3.5" /> Nothing runs without your say-so
            </span>
          </div>
        </header>

        {/* ── What deserves attention right now ────── */}
        <SmartCards
          device={device}
          conversations={conversations}
          memoryCount={memoryCount}
          onResume={() => openConversation()}
          onNavigate={onNavigate}
        />

        {/* ── Suggestions ──────────────────────────── */}
        <section className="space-y-4">
          <h2 className="font-display text-2xl tracking-tight">Start something</h2>
          <SuggestionCards timeOfDay={device.timeOfDay} onSelect={(p) => submit(p)} />
        </section>

        {/* ── Timeline ─────────────────────────────── */}
        <ActivityTimeline conversations={conversations} onSelect={() => openConversation()} />
      </div>

      {/* ── Floating composer ──────────────────────── */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 safe-pb">
        <div className="mx-auto w-full max-w-3xl px-4 pb-4">
          {preview && (
            <div className="pointer-events-none mb-2 flex justify-center">
              <span className="animate-rise-in inline-flex max-w-full items-center gap-2 truncate rounded-full surface-glass px-3 py-1.5 text-[13px] shadow-lift">
                <span className="rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary">
                  {preview.skill.name}
                </span>
                <span className="truncate text-muted-foreground">
                  {preview.plan.map((s) => s.label).join(" → ")}
                </span>
              </span>
            </div>
          )}
          <div className="pointer-events-auto rounded-[1.75rem] surface-glass shadow-lift transition-shadow duration-300 focus-within:shadow-glow">
            <textarea
              value={input}
              onChange={(e) => handleChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              rows={1}
              placeholder="Ask, plan, remember, or automate…"
              className="w-full resize-none bg-transparent px-5 pt-4 pb-1 text-[16px] leading-relaxed outline-none placeholder:text-muted-foreground/70"
            />
            <div className="flex items-center gap-1 px-3 pb-3">
              <Button
                variant="ghost" size="icon" aria-label="Attach a file"
                className="h-9 w-9 rounded-full text-muted-foreground hover:text-foreground"
                onClick={() => onNavigate("workspace")}
              >
                <Paperclip className="h-[18px] w-[18px]" />
              </Button>
              <Button
                variant="ghost" size="icon" aria-label="Use the camera"
                className="h-9 w-9 rounded-full text-muted-foreground hover:text-foreground"
                onClick={() => onNavigate("workspace")}
              >
                <Camera className="h-[18px] w-[18px]" />
              </Button>
              <div className="flex-1" />
              <Button
                variant="ghost" size="icon" aria-label="Talk to Aurora"
                className="h-10 w-10 rounded-full text-muted-foreground hover:text-foreground"
                onClick={() => openConversation(undefined, true)}
              >
                <Mic className="h-[18px] w-[18px]" />
              </Button>
              <Button
                size="icon" aria-label="Send"
                className="h-10 w-10 rounded-full transition-transform duration-200 active:scale-95 disabled:opacity-40"
                disabled={!input.trim()}
                onClick={() => submit()}
              >
                <ArrowUp className="h-[18px] w-[18px]" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      <AlertDialog open={!!pending} onOpenChange={(open) => {
        if (!open && pending) { pending.resolve(false); setPending(null); }
      }}>
        <AlertDialogContent className="rounded-[1.5rem]">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display text-2xl">{pending?.intent.skill.name}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-[15px]">
                <p>Here's what I'd do:</p>
                <ol className="space-y-1 pl-4 list-decimal">
                  {pending?.intent.plan.map((step) => (
                    <li key={step.label} className={step.sensitive ? "text-foreground font-medium" : ""}>
                      {step.label}
                    </li>
                  ))}
                </ol>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { pending?.resolve(false); setPending(null); }}>
              Not now
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => { pending?.resolve(true); setPending(null); }}>
              Go ahead
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
