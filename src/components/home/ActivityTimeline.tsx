import { MessageSquare } from "lucide-react";
import type { Conversation } from "@/hooks/useConversations";

interface ActivityTimelineProps {
  conversations: Conversation[];
  onSelect: (c: Conversation) => void;
}

function groupLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yest = new Date(Date.now() - 86400000);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(d, today)) return "Today";
  if (same(d, yest)) return "Yesterday";
  return d.toLocaleDateString(undefined, { month: "long", day: "numeric" });
}

export function ActivityTimeline({ conversations, onSelect }: ActivityTimelineProps) {
  if (!conversations.length) return null;

  const groups: { label: string; items: Conversation[] }[] = [];
  for (const c of conversations.slice(0, 8)) {
    const label = groupLabel(c.updated_at);
    const g = groups.find((x) => x.label === label);
    if (g) g.items.push(c);
    else groups.push({ label, items: [c] });
  }

  return (
    <section className="space-y-4">
      <h2 className="font-display text-2xl tracking-tight">Recently</h2>
      <div className="relative space-y-6 pl-5">
        <span className="absolute left-[5px] top-2 bottom-2 w-px bg-gradient-to-b from-primary/30 via-border to-transparent" />
        {groups.map((g) => (
          <div key={g.label} className="space-y-2">
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
              {g.label}
            </p>
            <div className="space-y-1.5">
              {g.items.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => onSelect(c)}
                  className="group relative flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors hover:bg-card/70"
                >
                  <span className="absolute -left-[18px] h-2 w-2 rounded-full bg-primary/40 ring-4 ring-background transition-colors group-hover:bg-primary" />
                  <MessageSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate text-[15px]">
                    {c.title?.trim() || "Untitled conversation"}
                  </span>
                  <span className="shrink-0 text-[13px] text-muted-foreground">
                    {new Date(c.updated_at).toLocaleTimeString(undefined, {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
