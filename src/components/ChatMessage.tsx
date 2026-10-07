import { cn, timeAgo } from "@/lib/utils";
import { AuroraAvatar } from "./AuroraAvatar";
import ReactMarkdown from "react-markdown";
import { Button } from "./ui/button";
import { Copy, Check, Bookmark, RotateCcw, Pencil } from "lucide-react";
import { useEffect, useState } from "react";

export interface ChatMessageProps {
  message: string;
  sender: "user" | "bot";
  timestamp: Date;
  emotion?: "neutral" | "happy" | "sad" | "excited" | "thoughtful" | "urgent";
  isLoading?: boolean;
  id?: string;
  onRegenerate?: () => void;
  onEdit?: (next: string) => void;
}

const BOOKMARK_KEY = "aurora_bookmarks";

function isBookmarked(id?: string) {
  if (!id) return false;
  try {
    const set = JSON.parse(localStorage.getItem(BOOKMARK_KEY) || "[]") as string[];
    return set.includes(id);
  } catch {
    return false;
  }
}

function toggleBookmark(id: string) {
  try {
    const set = new Set<string>(JSON.parse(localStorage.getItem(BOOKMARK_KEY) || "[]"));
    if (set.has(id)) set.delete(id);
    else set.add(id);
    localStorage.setItem(BOOKMARK_KEY, JSON.stringify([...set]));
    return set.has(id);
  } catch {
    return false;
  }
}

export function ChatMessage({
  message,
  sender,
  timestamp,
  isLoading = false,
  id,
  onRegenerate,
  onEdit,
}: ChatMessageProps) {
  const isBot = sender === "bot";
  const [copied, setCopied] = useState(false);
  const [bookmarked, setBookmarked] = useState(() => isBookmarked(id));
  const [relative, setRelative] = useState(() => timeAgo(timestamp));

  // Refresh relative timestamps every 30s so "just now" doesn't get stuck.
  useEffect(() => {
    const t = setInterval(() => setRelative(timeAgo(timestamp)), 30_000);
    return () => clearInterval(t);
  }, [timestamp]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  const handleBookmark = () => {
    if (!id) return;
    setBookmarked(toggleBookmark(id));
  };

  if (isBot) {
    return (
      <div className="flex w-full gap-3.5 group animate-in fade-in slide-in-from-bottom-1 duration-300">
        <div className="shrink-0 mt-1">
          <AuroraAvatar isActive isThinking={isLoading} size="sm" />
        </div>
        <div className="flex-1 min-w-0 pt-0.5">
          {isLoading ? (
            <div className="py-2">
              <span className="shimmer-text text-[14px] font-medium tracking-wide">
                Aurora is thinking
              </span>
            </div>
          ) : (
            <>
              <div className="prose prose-sm dark:prose-invert max-w-none text-foreground leading-[1.75] [&>p]:mb-3 [&>p:last-child]:mb-0 [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded-md [&_code]:text-[0.85em] [&_code]:font-mono [&_pre]:bg-[hsl(var(--surface-sunken))] [&_pre]:rounded-2xl [&_pre]:p-4 [&_pre]:border [&_pre]:border-border/40 [&_pre]:shadow-paper [&_a]:text-primary [&_a]:underline-offset-4 [&_a]:decoration-primary/40 hover:[&_a]:decoration-primary [&_ul]:my-2 [&_ol]:my-2 [&_li]:my-0.5 [&_blockquote]:border-l-2 [&_blockquote]:border-primary/40 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-muted-foreground">
                <ReactMarkdown>{message}</ReactMarkdown>
              </div>
              <div className="flex items-center gap-0.5 mt-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={handleCopy}
                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                  aria-label="Copy message"
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
                </Button>
                {id && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={handleBookmark}
                    className={cn(
                      "h-7 w-7 text-muted-foreground hover:text-foreground",
                      bookmarked && "text-accent hover:text-accent"
                    )}
                    aria-label={bookmarked ? "Remove bookmark" : "Bookmark message"}
                  >
                    <Bookmark className={cn("h-3.5 w-3.5", bookmarked && "fill-current")} />
                  </Button>
                )}
                {onRegenerate && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={onRegenerate}
                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                    aria-label="Regenerate response"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                  </Button>
                )}
                <span className="text-[10px] text-muted-foreground/60 ml-1.5 tabular-nums">
                  {relative}
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex w-full justify-end group animate-in fade-in slide-in-from-bottom-1 duration-300">
      <div className="flex flex-col items-end max-w-[85%] md:max-w-[70%]">
        <div
          className={cn(
            "px-4 py-2.5 rounded-[20px] rounded-br-md text-[15px] leading-relaxed shadow-paper",
            "bg-gradient-to-br from-primary to-[hsl(var(--forest))] text-primary-foreground",
            "ring-1 ring-[hsl(var(--gold)/0.25)]",
          )}
        >
          <span className="whitespace-pre-wrap break-words">{message}</span>
        </div>
        <div className="flex items-center gap-0.5 mt-1 mr-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
          {onEdit && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => onEdit(message)}
              className="h-6 w-6 text-muted-foreground hover:text-foreground"
              aria-label="Edit message"
            >
              <Pencil className="h-3 w-3" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleCopy}
            className="h-6 w-6 text-muted-foreground hover:text-foreground"
            aria-label="Copy message"
          >
            {copied ? <Check className="h-3 w-3 text-primary" /> : <Copy className="h-3 w-3" />}
          </Button>
          <span className="text-[10px] text-muted-foreground/60 ml-1 tabular-nums">
            {relative}
          </span>
        </div>
      </div>
    </div>
  );
}
