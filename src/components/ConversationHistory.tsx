import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Conversation } from '@/hooks/useConversations';
import {
  MessageSquare, Plus, Trash2, ChevronLeft, ChevronRight, Search,
} from 'lucide-react';
import { isToday, isYesterday, differenceInDays } from 'date-fns';
import { cn } from '@/lib/utils';
import auroraMark from '@/assets/aurora-mark.png';


interface ConversationHistoryProps {
  conversations: Conversation[];
  currentConversation: Conversation | null;
  onSelectConversation: (conversation: Conversation) => void;
  onNewConversation: () => void;
  onDeleteConversation: (id: string) => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

function groupConversations(convs: Conversation[]) {
  const groups: Record<string, Conversation[]> = {
    Today: [], Yesterday: [], 'Last 7 days': [], 'Last 30 days': [], Older: [],
  };
  for (const c of convs) {
    const d = new Date(c.updated_at);
    if (isToday(d)) groups.Today.push(c);
    else if (isYesterday(d)) groups.Yesterday.push(c);
    else {
      const diff = differenceInDays(new Date(), d);
      if (diff <= 7) groups['Last 7 days'].push(c);
      else if (diff <= 30) groups['Last 30 days'].push(c);
      else groups.Older.push(c);
    }
  }
  return groups;
}

export function ConversationHistory({
  conversations,
  currentConversation,
  onSelectConversation,
  onNewConversation,
  onDeleteConversation,
  isCollapsed = false,
  onToggleCollapse,
}: ConversationHistoryProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [query, setQuery] = useState('');


  const filtered = useMemo(() => {
    if (!query.trim()) return conversations;
    const q = query.toLowerCase();
    return conversations.filter(c => (c.title || '').toLowerCase().includes(q));
  }, [conversations, query]);

  const grouped = useMemo(() => groupConversations(filtered), [filtered]);

  if (isCollapsed) {
    return (
      <div className="w-14 h-full border-r border-border/40 bg-card/40 backdrop-blur-xl flex flex-col items-center py-3 gap-1">
        <Button
          variant="ghost" size="icon" className="h-9 w-9 rounded-xl"
          onClick={onToggleCollapse} aria-label="Expand sidebar"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost" size="icon"
          onClick={onNewConversation}
          className="h-9 w-9 rounded-xl bg-primary/10 text-primary hover:bg-primary/20 mt-1"
          aria-label="New conversation"
        >
          <Plus className="h-4 w-4" />
        </Button>
        <div className="w-8 h-px bg-border/50 my-2" />
        <ScrollArea className="flex-1 w-full">
          <div className="flex flex-col items-center gap-1 px-1">
            {conversations.slice(0, 12).map((conv) => (
              <Button
                key={conv.id}
                variant="ghost"
                size="icon"
                className={cn(
                  "h-9 w-9 rounded-xl",
                  currentConversation?.id === conv.id && "bg-primary/15 text-primary"
                )}
                onClick={() => onSelectConversation(conv)}
                title={conv.title || 'Conversation'}
              >
                <MessageSquare className="h-4 w-4" />
              </Button>
            ))}
          </div>
        </ScrollArea>
      </div>
    );
  }

  return (
    <div className="w-72 h-full border-r border-border/40 bg-card/40 backdrop-blur-xl flex flex-col">
      {/* Header */}
      <div className="p-3 flex items-center gap-2">
        <img src={auroraMark} alt="" width={28} height={28} className="h-7 w-7 object-contain" />
        <span className="font-display text-base font-semibold tracking-tight flex-1">Aurora</span>
        {onToggleCollapse && (
          <Button
            variant="ghost" size="icon" className="h-8 w-8 rounded-lg"
            onClick={onToggleCollapse} aria-label="Collapse sidebar"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* New chat CTA */}
      <div className="px-3 pb-2">
        <Button
          onClick={onNewConversation}
          className="w-full justify-start gap-2 h-9 rounded-xl bg-primary/10 text-primary hover:bg-primary/15 border border-primary/20 shadow-none font-medium"
          variant="ghost"
        >
          <Plus className="h-4 w-4" />
          New conversation
        </Button>
      </div>

      {/* Search */}
      <div className="px-3 pb-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search conversations"
            className="h-8 pl-8 text-xs rounded-lg bg-background/50 border-border/50"
          />
        </div>
      </div>

      {/* List grouped */}
      <ScrollArea className="flex-1">
        <div className="px-2 pb-2">
          {filtered.length === 0 ? (
            <div className="px-2 py-8 text-center">
              <p className="text-xs text-muted-foreground">
                {query ? 'No matches' : 'No conversations yet'}
              </p>
            </div>
          ) : (
            Object.entries(grouped).map(([label, items]) =>
              items.length === 0 ? null : (
                <div key={label} className="mb-3">
                  <div className="px-2 pt-2 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground/60 font-medium">
                    {label}
                  </div>
                  <div className="space-y-0.5">
                    {items.map((conv) => {
                      const active = currentConversation?.id === conv.id;
                      return (
                        <div
                          key={conv.id}
                          className={cn(
                            "group relative rounded-lg px-2.5 py-2 cursor-pointer transition-colors",
                            active
                              ? "bg-primary/10 text-foreground"
                              : "hover:bg-muted/50 text-foreground/85"
                          )}
                          onClick={() => onSelectConversation(conv)}
                          onMouseEnter={() => setHoveredId(conv.id)}
                          onMouseLeave={() => setHoveredId(null)}
                        >
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium truncate flex-1 leading-snug">
                              {conv.title || 'New Conversation'}
                            </p>
                            {hoveredId === conv.id && (
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                className="h-6 w-6 shrink-0 opacity-70 hover:opacity-100 hover:bg-destructive/10 hover:text-destructive"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onDeleteConversation(conv.id);
                                }}
                                aria-label="Delete conversation"
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )
            )
          )}
        </div>
      </ScrollArea>

      {/* Auto mood footer (subtle, no picker — Aurora auto-adapts) */}
      <div className="border-t border-border/40 p-3">
        <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground/80">
          <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
          <span className="truncate">Aurora adapts to your mood</span>
        </div>
      </div>
    </div>
  );
}
