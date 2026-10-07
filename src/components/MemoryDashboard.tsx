import { useState, useEffect, useCallback, useMemo } from "react";
import {
  useMemorySystem, MemoryFact, ConversationSummary, EmotionalPattern,
} from "@/hooks/useMemorySystem";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  Brain, Target, Heart, Flame, Sparkles, BookOpen, Trash2, Plus, TrendingUp,
  Activity, User, Lightbulb, Search, Layers, CalendarDays, Network, X,
} from "lucide-react";
import { Panel, SurfaceHeader, Segmented, AmbientBackdrop, EmptyState } from "@/components/aurora/Surface";
import { cn } from "@/lib/utils";

const CATEGORY_CONFIG: Record<string, { icon: typeof Brain; label: string; blurb: string }> = {
  goal: { icon: Target, label: "Goals", blurb: "What you're moving toward" },
  interest: { icon: Sparkles, label: "Interests", blurb: "What pulls your attention" },
  project: { icon: Flame, label: "Projects", blurb: "What's currently in motion" },
  trigger: { icon: Activity, label: "Stress triggers", blurb: "What wears you down" },
  motivator: { icon: Lightbulb, label: "Motivators", blurb: "What gets you going" },
  pattern: { icon: Brain, label: "Patterns", blurb: "How you tend to operate" },
  skill: { icon: TrendingUp, label: "Skills", blurb: "What you're good at" },
  value: { icon: Heart, label: "Values", blurb: "What you won't trade away" },
  fact: { icon: BookOpen, label: "Personal facts", blurb: "The plain details" },
  relationship: { icon: User, label: "People", blurb: "Who matters to you" },
};

const cfgFor = (c: string) =>
  CATEGORY_CONFIG[c] ?? { icon: Brain, label: c, blurb: "Remembered detail" };

const EMOTION_TONE: Record<string, string> = {
  joy: "bg-accent/15 text-accent-foreground border-accent/30",
  excitement: "bg-accent/15 text-accent-foreground border-accent/30",
  pride: "bg-primary/12 text-primary border-primary/25",
  gratitude: "bg-primary/12 text-primary border-primary/25",
  stress: "bg-destructive/10 text-destructive border-destructive/25",
  anxiety: "bg-destructive/10 text-destructive border-destructive/25",
  burnout: "bg-destructive/10 text-destructive border-destructive/25",
  sadness: "bg-muted text-muted-foreground border-border",
  neutral: "bg-muted text-muted-foreground border-border",
};

const VIEWS = [
  { value: "knowledge", label: "Knowledge", icon: Layers },
  { value: "timeline", label: "Timeline", icon: CalendarDays },
  { value: "relationships", label: "Connections", icon: Network },
];

const ASK_EXAMPLES = [
  "what do you know about my work?",
  "what stresses me out?",
  "who do I talk about most?",
  "what am I working toward?",
];

/** Lightweight natural-language matcher over the local memory set. */
function answerQuestion(q: string, facts: MemoryFact[]) {
  const query = q.toLowerCase();
  const stop = new Set([
    "what", "who", "do", "you", "know", "about", "my", "me", "i", "the", "a", "an", "is",
    "are", "tell", "show", "of", "on", "in", "and", "for", "to", "remember", "does", "your",
  ]);
  const terms = query.split(/[^a-z0-9']+/).filter((t) => t.length > 2 && !stop.has(t));

  const categoryHints: Array<[RegExp, string]> = [
    [/stress|anxious|anxiety|drain|worry/, "trigger"],
    [/goal|aim|working toward|ambition|target/, "goal"],
    [/who|people|friend|family|partner|colleague/, "relationship"],
    [/project|building|shipping/, "project"],
    [/value|believe|principle/, "value"],
    [/skill|good at|strength/, "skill"],
    [/motivat|energi|drive/, "motivator"],
    [/like|love|interest|hobby|enjoy/, "interest"],
    [/pattern|habit|tend/, "pattern"],
  ];
  const hinted = categoryHints.find(([re]) => re.test(query))?.[1];

  return facts
    .map((f) => {
      const hay = `${f.category} ${f.key} ${f.value} ${(f.tags ?? []).join(" ")}`.toLowerCase();
      let score = terms.reduce((s, t) => (hay.includes(t) ? s + 2 : s), 0);
      if (hinted && f.category === hinted) score += 4;
      if (f.is_pinned) score += 1;
      return { fact: f, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 12)
    .map((r) => r.fact);
}

export function MemoryDashboard() {
  const {
    fetchMemoryFacts, addMemoryFact, deleteMemoryFact,
    fetchSummaries, fetchEmotionalPatterns,
  } = useMemorySystem();

  const [facts, setFacts] = useState<MemoryFact[]>([]);
  const [summaries, setSummaries] = useState<ConversationSummary[]>([]);
  const [patterns, setPatterns] = useState<EmotionalPattern[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [view, setView] = useState("knowledge");
  const [query, setQuery] = useState("");
  const [asked, setAsked] = useState("");

  const [showAdd, setShowAdd] = useState(false);
  const [newCategory, setNewCategory] = useState("goal");
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  const loadAll = useCallback(async () => {
    setIsLoading(true);
    const [f, s, p] = await Promise.all([
      fetchMemoryFacts(),
      fetchSummaries(12),
      fetchEmotionalPatterns(40),
    ]);
    setFacts(f);
    setSummaries(s);
    setPatterns(p);
    setIsLoading(false);
  }, [fetchMemoryFacts, fetchSummaries, fetchEmotionalPatterns]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const results = useMemo(
    () => (asked.trim() ? answerQuestion(asked, facts) : []),
    [asked, facts],
  );

  const factsByCategory = useMemo(
    () =>
      facts.reduce((acc, fact) => {
        (acc[fact.category] ||= []).push(fact);
        return acc;
      }, {} as Record<string, MemoryFact[]>),
    [facts],
  );

  const people = useMemo(() => facts.filter((f) => f.category === "relationship"), [facts]);

  const timeline = useMemo(() => {
    const entries = [
      ...facts.map((f) => ({
        id: `f-${f.id}`, at: f.created_at, kind: "memory" as const,
        title: cfgFor(f.category).label, body: `${f.key}: ${f.value}`,
      })),
      ...summaries.map((s) => ({
        id: `s-${s.id}`, at: s.created_at, kind: "episode" as const,
        title: s.emotional_tone, body: s.summary,
      })),
      ...patterns.map((p) => ({
        id: `p-${p.id}`, at: p.created_at, kind: "emotion" as const,
        title: p.emotion, body: p.context || "Noticed in conversation",
      })),
    ].sort((a, b) => +new Date(b.at) - +new Date(a.at));

    const groups: Record<string, typeof entries> = {};
    for (const e of entries) {
      const key = new Date(e.at).toLocaleDateString(undefined, {
        weekday: "long", month: "long", day: "numeric",
      });
      (groups[key] ||= []).push(e);
    }
    return Object.entries(groups).slice(0, 10);
  }, [facts, summaries, patterns]);

  const handleAdd = async () => {
    if (!newKey.trim() || !newValue.trim()) return toast.error("Give it a label and a value");
    setIsAdding(true);
    try {
      await addMemoryFact(newCategory, newKey.trim(), newValue.trim());
      toast.success("Aurora will remember that");
      setNewKey(""); setNewValue(""); setShowAdd(false);
      loadAll();
    } catch {
      toast.error("Couldn't save that memory");
    } finally {
      setIsAdding(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteMemoryFact(id);
      setFacts((prev) => prev.filter((f) => f.id !== id));
      toast.success("Forgotten");
    } catch {
      toast.error("Couldn't remove that");
    }
  };

  const FactRow = ({ fact }: { fact: MemoryFact }) => (
    <div className="group flex items-start justify-between gap-3 rounded-2xl px-3 py-2.5 transition-colors duration-200 hover:bg-foreground/[0.04]">
      <div className="min-w-0 flex-1">
        <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{fact.key}</p>
        <p className="mt-0.5 text-[15px] leading-snug">{fact.value}</p>
      </div>
      <Button
        variant="ghost" size="icon" aria-label="Forget this"
        className="h-7 w-7 rounded-full text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive"
        onClick={() => handleDelete(fact.id)}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );

  return (
    <div className="relative mx-auto w-full max-w-3xl space-y-8 pb-16">
      <AmbientBackdrop tone="sage" />

      <SurfaceHeader
        eyebrow="Personal knowledge"
        title="Memory"
        subtitle="Everything Aurora holds about you — ask it a question, or browse by theme."
        action={
          <Button
            variant="outline" size="sm"
            className="rounded-full"
            onClick={() => setShowAdd((s) => !s)}
          >
            <Plus className="mr-1.5 h-4 w-4" /> Teach Aurora
          </Button>
        }
      />

      {/* ── Conversational search, first ──────────────── */}
      <section className="animate-rise-in space-y-3">
        <div className="flex items-center gap-2 rounded-full surface-glass px-4 py-2.5 shadow-lift transition-shadow focus-within:shadow-glow">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && setAsked(query)}
            placeholder="Ask your memory anything…"
            className="w-full bg-transparent text-[15px] outline-none placeholder:text-muted-foreground/70"
          />
          {(query || asked) && (
            <Button
              variant="ghost" size="icon" aria-label="Clear"
              className="h-7 w-7 rounded-full"
              onClick={() => { setQuery(""); setAsked(""); }}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button size="sm" className="rounded-full" onClick={() => setAsked(query)} disabled={!query.trim()}>
            Ask
          </Button>
        </div>

        {!asked && (
          <div className="flex flex-wrap gap-2">
            {ASK_EXAMPLES.map((ex) => (
              <button
                key={ex}
                onClick={() => { setQuery(ex); setAsked(ex); }}
                className="rounded-full border border-border/60 px-3 py-1.5 text-[13px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
              >
                {ex}
              </button>
            ))}
          </div>
        )}

        {asked && (
          <Panel className="animate-rise-in space-y-1">
            <p className="text-[13px] text-muted-foreground">
              {results.length
                ? `Here's what I hold that relates to "${asked}".`
                : `I don't have anything on "${asked}" yet.`}
            </p>
            <div className="mt-2 divide-y divide-border/40">
              {results.map((f) => (
                <div key={f.id} className="py-1">
                  <Badge variant="outline" className="mb-1 rounded-full text-[10px]">
                    {cfgFor(f.category).label}
                  </Badge>
                  <FactRow fact={f} />
                </div>
              ))}
            </div>
          </Panel>
        )}
      </section>

      {showAdd && (
        <Panel material="glass" className="animate-rise-in space-y-3">
          <p className="font-display text-lg">Teach Aurora something</p>
          <div className="flex flex-wrap gap-2">
            <Select value={newCategory} onValueChange={setNewCategory}>
              <SelectTrigger className="h-10 w-40 rounded-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(CATEGORY_CONFIG).map(([key, c]) => (
                  <SelectItem key={key} value={key}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              placeholder="Label" value={newKey} onChange={(e) => setNewKey(e.target.value)}
              className="h-10 min-w-32 flex-1 rounded-full"
            />
            <Input
              placeholder="What should I remember?" value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              className="h-10 min-w-48 flex-[2] rounded-full"
            />
            <Button className="h-10 rounded-full" onClick={handleAdd} disabled={isAdding}>
              {isAdding ? "Saving…" : "Remember"}
            </Button>
          </div>
        </Panel>
      )}

      <Segmented items={VIEWS} value={view} onChange={setView} />

      {isLoading ? (
        <Panel material="sunk" className="py-14 text-center">
          <Brain className="mx-auto h-7 w-7 animate-pulse text-primary" />
          <p className="mt-3 text-sm text-muted-foreground">Gathering what I know…</p>
        </Panel>
      ) : view === "knowledge" ? (
        Object.keys(factsByCategory).length === 0 ? (
          <EmptyState
            icon={Brain}
            title="Nothing remembered yet"
            body="Aurora builds this as you talk. You can also teach it something directly."
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {Object.entries(factsByCategory).map(([category, catFacts], i) => {
              const cfg = cfgFor(category);
              const Icon = cfg.icon;
              return (
                <Panel
                  key={category}
                  className="animate-rise-in hover:shadow-lift"
                  style={{ animationDelay: `${i * 45}ms` }}
                >
                  <div className="flex items-start gap-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-display text-lg leading-none">{cfg.label}</p>
                      <p className="mt-1 text-[12px] text-muted-foreground">{cfg.blurb}</p>
                    </div>
                    <Badge variant="secondary" className="rounded-full">{catFacts.length}</Badge>
                  </div>
                  <div className="mt-3 divide-y divide-border/40">
                    {catFacts.map((f) => <FactRow key={f.id} fact={f} />)}
                  </div>
                </Panel>
              );
            })}
          </div>
        )
      ) : view === "timeline" ? (
        timeline.length === 0 ? (
          <EmptyState icon={CalendarDays} title="No history yet" body="Your memory timeline fills in as you use Aurora." />
        ) : (
          <div className="relative space-y-8 pl-6">
            <span className="absolute left-[7px] top-1 bottom-1 w-px bg-gradient-to-b from-primary/40 via-border to-transparent" />
            {timeline.map(([day, entries]) => (
              <section key={day} className="animate-rise-in space-y-3">
                <div className="relative">
                  <span className="absolute -left-[22px] top-1.5 h-2.5 w-2.5 rounded-full bg-primary ring-4 ring-background" />
                  <p className="text-[13px] font-medium tracking-tight">{day}</p>
                </div>
                {entries.map((e) => (
                  <Panel key={e.id} material="glass" className="py-3.5">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className={cn(
                          "rounded-full text-[10px] capitalize",
                          e.kind === "emotion" && (EMOTION_TONE[e.title] ?? EMOTION_TONE.neutral),
                        )}
                      >
                        {e.title}
                      </Badge>
                      <span className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                        {e.kind}
                      </span>
                    </div>
                    <p className="mt-1.5 text-[15px] leading-snug">{e.body}</p>
                  </Panel>
                ))}
              </section>
            ))}
          </div>
        )
      ) : people.length === 0 ? (
        <EmptyState
          icon={Network}
          title="No connections mapped yet"
          body="Mention the people in your life and Aurora will start drawing the map."
        />
      ) : (
        <Panel className="animate-rise-in">
          <p className="font-display text-lg">Your circle</p>
          <p className="mt-1 text-[13px] text-muted-foreground">
            People Aurora has heard about, and how they connect back to you.
          </p>
          <div className="relative mt-6 flex flex-wrap items-start justify-center gap-3">
            <div className="mb-4 w-full text-center">
              <span className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-[14px] text-primary-foreground shadow-glow">
                <User className="h-4 w-4" /> You
              </span>
            </div>
            {people.map((p, i) => (
              <div
                key={p.id}
                className="animate-rise-in group relative rounded-2xl surface-glass px-4 py-3 text-center transition-transform duration-300 hover:-translate-y-0.5"
                style={{ animationDelay: `${i * 50}ms` }}
              >
                <p className="text-[14px] font-medium">{p.key}</p>
                <p className="mt-0.5 max-w-[220px] text-[12px] text-muted-foreground">{p.value}</p>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}
