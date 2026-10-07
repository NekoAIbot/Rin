import { useEffect, useState } from "react";
import {
  Clock, MessageSquareQuote, Bell, Sun, Moon, Zap, Plus, Trash2, GripVertical,
  ArrowRight, Check, Wand2, PlayCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Panel, EmptyState } from "@/components/aurora/Surface";
import { SKILLS } from "@/lib/intent/skills";
import { cn } from "@/lib/utils";

export interface AutomationStep {
  id: string;
  skillId: string;
  detail: string;
}

export interface Automation {
  id: string;
  name: string;
  trigger: "morning" | "evening" | "hourly" | "manual" | "onArrive";
  enabled: boolean;
  steps: AutomationStep[];
  createdAt: string;
}

const STORE_KEY = "aurora_automations";

const TRIGGERS: Record<Automation["trigger"], { label: string; blurb: string; icon: typeof Sun }> = {
  morning: { label: "Every morning", blurb: "Runs when your day starts", icon: Sun },
  evening: { label: "Every evening", blurb: "Runs as the day winds down", icon: Moon },
  hourly: { label: "Hourly", blurb: "Checks in through the day", icon: Clock },
  onArrive: { label: "When I open Aurora", blurb: "Runs on your first visit of the day", icon: Bell },
  manual: { label: "Only when I ask", blurb: "Nothing happens until you run it", icon: PlayCircle },
};

const TEMPLATES: Array<{ name: string; trigger: Automation["trigger"]; steps: Array<[string, string]> }> = [
  {
    name: "Morning briefing",
    trigger: "morning",
    steps: [
      ["research", "Pull anything new worth knowing"],
      ["write", "Write a three-line brief"],
    ],
  },
  {
    name: "Evening reflection",
    trigger: "evening",
    steps: [
      ["write", "Summarise how the day went"],
      ["write", "Suggest one intention for tomorrow"],
    ],
  },
];

function load(): Automation[] {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function save(list: Automation[]) {
  localStorage.setItem(STORE_KEY, JSON.stringify(list));
}

const uid = () => Math.random().toString(36).slice(2, 10);
const skillName = (id: string) => SKILLS.find((s) => s.id === id)?.name ?? id;

export function AutomationBuilder() {
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [editing, setEditing] = useState<Automation | null>(null);
  const [confirming, setConfirming] = useState<Automation | null>(null);

  useEffect(() => { setAutomations(load()); }, []);

  const commit = (next: Automation[]) => {
    setAutomations(next);
    save(next);
  };

  const startNew = () =>
    setEditing({
      id: uid(),
      name: "",
      trigger: "morning",
      enabled: true,
      steps: [{ id: uid(), skillId: SKILLS[0].id, detail: "" }],
      createdAt: new Date().toISOString(),
    });

  const useTemplate = (t: (typeof TEMPLATES)[number]) =>
    setEditing({
      id: uid(),
      name: t.name,
      trigger: t.trigger,
      enabled: true,
      steps: t.steps.map(([skillId, detail]) => ({ id: uid(), skillId, detail })),
      createdAt: new Date().toISOString(),
    });

  const persist = (a: Automation) => {
    const exists = automations.some((x) => x.id === a.id);
    commit(exists ? automations.map((x) => (x.id === a.id ? a : x)) : [a, ...automations]);
    setEditing(null);
    setConfirming(null);
    toast.success(`"${a.name}" saved`);
  };

  const remove = (id: string) => {
    commit(automations.filter((a) => a.id !== id));
    toast.success("Automation removed");
  };

  const toggle = (id: string) =>
    commit(automations.map((a) => (a.id === id ? { ...a, enabled: !a.enabled } : a)));

  const run = (a: Automation) => {
    window.dispatchEvent(
      new CustomEvent("aurora:prompt", {
        detail: { prompt: `${a.name}: ${a.steps.map((s) => s.detail || skillName(s.skillId)).join(", then ")}` },
      }),
    );
    toast.success(`Running "${a.name}"`);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" className="rounded-full" onClick={startNew}>
          <Plus className="mr-1.5 h-4 w-4" /> New automation
        </Button>
        {TEMPLATES.map((t) => (
          <Button
            key={t.name} size="sm" variant="outline" className="rounded-full"
            onClick={() => useTemplate(t)}
          >
            <Wand2 className="mr-1.5 h-3.5 w-3.5" /> {t.name}
          </Button>
        ))}
      </div>

      {automations.length === 0 ? (
        <EmptyState
          icon={Zap}
          title="No automations yet"
          body="Build a small routine — Aurora will handle it on schedule and always show you the plan first."
          action={<Button className="rounded-full" onClick={startNew}>Build your first one</Button>}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {automations.map((a, i) => {
            const T = TRIGGERS[a.trigger];
            const Icon = T.icon;
            return (
              <Panel
                key={a.id}
                className={cn(
                  "animate-rise-in group relative overflow-hidden hover:shadow-lift",
                  !a.enabled && "opacity-60",
                )}
                style={{ animationDelay: `${i * 45}ms` }}
              >
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 -top-16 h-32 bg-[radial-gradient(60%_100%_at_50%_100%,hsl(var(--primary)/0.14),transparent)]"
                />
                <div className="relative flex items-start gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
                    <Icon className="h-4.5 w-4.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-lg leading-tight">{a.name}</p>
                    <p className="mt-0.5 text-[12px] text-muted-foreground">{T.label} · {T.blurb}</p>
                  </div>
                  <Switch checked={a.enabled} onCheckedChange={() => toggle(a.id)} aria-label="Enabled" />
                </div>

                <ol className="relative mt-4 space-y-2">
                  {a.steps.map((s, idx) => (
                    <li key={s.id} className="flex items-start gap-2 text-[13px]">
                      <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-muted text-[11px] text-muted-foreground">
                        {idx + 1}
                      </span>
                      <span className="min-w-0">
                        <span className="font-medium">{skillName(s.skillId)}</span>
                        {s.detail && <span className="text-muted-foreground"> — {s.detail}</span>}
                      </span>
                    </li>
                  ))}
                </ol>

                <div className="relative mt-4 flex items-center gap-1.5">
                  <Button size="sm" variant="ghost" className="rounded-full" onClick={() => run(a)}>
                    <PlayCircle className="mr-1.5 h-3.5 w-3.5" /> Run now
                  </Button>
                  <Button size="sm" variant="ghost" className="rounded-full" onClick={() => setEditing(a)}>
                    Edit
                  </Button>
                  <div className="flex-1" />
                  <Button
                    size="icon" variant="ghost" aria-label="Delete automation"
                    className="h-8 w-8 rounded-full text-muted-foreground hover:text-destructive"
                    onClick={() => remove(a.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </Panel>
            );
          })}
        </div>
      )}

      {/* ── Step editor ─────────────────────────────── */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto rounded-[1.5rem] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">
              {editing?.name || "New automation"}
            </DialogTitle>
            <DialogDescription>
              Give it a name, choose when it runs, then lay out the steps.
            </DialogDescription>
          </DialogHeader>

          {editing && (
            <div className="space-y-5">
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input
                  className="rounded-full"
                  placeholder="Morning briefing"
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                />
              </div>

              <div className="space-y-1.5">
                <Label>When it runs</Label>
                <div className="grid gap-2 sm:grid-cols-2">
                  {(Object.keys(TRIGGERS) as Automation["trigger"][]).map((key) => {
                    const T = TRIGGERS[key];
                    const Icon = T.icon;
                    const active = editing.trigger === key;
                    return (
                      <button
                        key={key}
                        onClick={() => setEditing({ ...editing, trigger: key })}
                        className={cn(
                          "flex items-center gap-2.5 rounded-2xl border p-3 text-left transition-all duration-200",
                          active
                            ? "border-primary/50 bg-primary/8 shadow-glow"
                            : "border-border/60 hover:border-primary/30",
                        )}
                      >
                        <Icon className={cn("h-4 w-4", active ? "text-primary" : "text-muted-foreground")} />
                        <span className="min-w-0">
                          <span className="block text-[13px] font-medium">{T.label}</span>
                          <span className="block text-[11px] text-muted-foreground">{T.blurb}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Steps</Label>
                {editing.steps.map((step, idx) => (
                  <div key={step.id} className="rounded-2xl surface-sunk border border-border/50 p-3">
                    <div className="flex items-center gap-2">
                      <GripVertical className="h-4 w-4 text-muted-foreground/60" />
                      <span className="text-[12px] text-muted-foreground">Step {idx + 1}</span>
                      <div className="flex-1" />
                      {editing.steps.length > 1 && (
                        <Button
                          size="icon" variant="ghost" aria-label="Remove step"
                          className="h-7 w-7 rounded-full text-muted-foreground hover:text-destructive"
                          onClick={() =>
                            setEditing({ ...editing, steps: editing.steps.filter((s) => s.id !== step.id) })
                          }
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                    <div className="mt-2 space-y-2">
                      <Select
                        value={step.skillId}
                        onValueChange={(v) =>
                          setEditing({
                            ...editing,
                            steps: editing.steps.map((s) => (s.id === step.id ? { ...s, skillId: v } : s)),
                          })
                        }
                      >
                        <SelectTrigger className="rounded-full"><SelectValue /></SelectTrigger>
                        <SelectContent className="max-h-64">
                          {SKILLS.map((s) => (
                            <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        className="rounded-full"
                        placeholder="What exactly should Aurora do?"
                        value={step.detail}
                        onChange={(e) =>
                          setEditing({
                            ...editing,
                            steps: editing.steps.map((s) =>
                              s.id === step.id ? { ...s, detail: e.target.value } : s,
                            ),
                          })
                        }
                      />
                    </div>
                  </div>
                ))}
                <Button
                  variant="outline" size="sm" className="w-full rounded-full"
                  onClick={() =>
                    setEditing({
                      ...editing,
                      steps: [...editing.steps, { id: uid(), skillId: SKILLS[0].id, detail: "" }],
                    })
                  }
                >
                  <Plus className="mr-1.5 h-3.5 w-3.5" /> Add step
                </Button>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" className="rounded-full" onClick={() => setEditing(null)}>Cancel</Button>
            <Button
              className="rounded-full"
              disabled={!editing?.name.trim()}
              onClick={() => editing && setConfirming(editing)}
            >
              Review <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Confirmation preview ────────────────────── */}
      <Dialog open={!!confirming} onOpenChange={(o) => !o && setConfirming(null)}>
        <DialogContent className="rounded-[1.5rem]">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">Here's the plan</DialogTitle>
            <DialogDescription>
              Nothing runs until you approve it. You can pause it any time.
            </DialogDescription>
          </DialogHeader>

          {confirming && (
            <Panel material="glass" className="space-y-3">
              <p className="text-[13px] text-muted-foreground">
                {TRIGGERS[confirming.trigger].label} · {confirming.steps.length} step
                {confirming.steps.length > 1 ? "s" : ""}
              </p>
              <ol className="space-y-2.5">
                {confirming.steps.map((s, i) => (
                  <li key={s.id} className="flex items-start gap-2.5">
                    <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary/12 text-[11px] font-medium text-primary">
                      {i + 1}
                    </span>
                    <span className="text-[14px] leading-snug">
                      <span className="font-medium">{skillName(s.skillId)}</span>
                      {s.detail && <span className="text-muted-foreground"> — {s.detail}</span>}
                    </span>
                  </li>
                ))}
              </ol>
            </Panel>
          )}

          <DialogFooter>
            <Button variant="ghost" className="rounded-full" onClick={() => setConfirming(null)}>
              Keep editing
            </Button>
            <Button className="rounded-full" onClick={() => confirming && persist(confirming)}>
              <Check className="mr-1.5 h-4 w-4" /> Approve &amp; save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
