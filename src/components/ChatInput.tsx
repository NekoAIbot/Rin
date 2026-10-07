import { Button } from "@/components/ui/button";
import { Mic, ArrowUp, Volume2, VolumeX, Square, Loader2 } from "lucide-react";
import { useRef, useEffect } from "react";
import { cn } from "@/lib/utils";

interface ChatInputProps {
  inputText: string;
  onInputChange: (text: string) => void;
  onSend: () => void;
  onToggleRecording: () => void;
  onToggleVoice: () => void;
  isRecording: boolean;
  isVoiceEnabled: boolean;
  isTalking: boolean;
  isTranscribing?: boolean;
}

export function ChatInput({
  inputText,
  onInputChange,
  onSend,
  onToggleRecording,
  onToggleVoice,
  isRecording,
  isVoiceEnabled,
  isTranscribing,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 200) + "px";
    }
  }, [inputText]);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  const canSend = inputText.trim().length > 0 && !isTranscribing;

  return (
    <div className="px-3 sm:px-4 pt-2 pb-3 safe-pb bg-gradient-to-t from-background via-background/95 to-transparent">
      {isRecording && (
        <div className="max-w-3xl mx-auto mb-2 flex items-center gap-3 px-4 py-2 rounded-2xl bg-destructive/10 border border-destructive/20 text-destructive text-xs animate-in fade-in slide-in-from-bottom-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full rounded-full bg-destructive opacity-75 animate-ping" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-destructive" />
          </span>
          <span className="font-medium flex-1">Listening — tap stop when done</span>
          <div className="flex items-end gap-0.5 h-4">
            {[0, 1, 2, 3, 4, 5, 6].map((i) => (
              <span
                key={i}
                className="w-0.5 bg-destructive rounded-full animate-pulse"
                style={{
                  height: `${30 + ((i * 41) % 70)}%`,
                  animationDelay: `${i * 110}ms`,
                  animationDuration: "0.7s",
                }}
              />
            ))}
          </div>
        </div>
      )}

      <div className="max-w-3xl mx-auto">
        <div
          className={cn(
            "relative flex items-end gap-1.5 p-2 rounded-[26px] border bg-card/90 backdrop-blur-xl shadow-paper transition-all",
            isRecording
              ? "border-destructive/40 ring-2 ring-destructive/15"
              : "border-border/60 focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/15 focus-within:shadow-lift",
          )}
        >
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="rounded-full h-9 w-9 shrink-0 text-muted-foreground hover:text-foreground hover:bg-muted/60"
            onClick={onToggleVoice}
            aria-label={isVoiceEnabled ? "Mute Aurora's voice" : "Enable Aurora's voice"}
          >
            {isVoiceEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </Button>

          <textarea
            ref={textareaRef}
            value={inputText}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              isTranscribing ? "Transcribing your voice…" : isRecording ? "Listening…" : "Message Aurora"
            }
            disabled={isTranscribing}
            rows={1}
            className="flex-1 min-h-[36px] max-h-[200px] resize-none bg-transparent border-0 outline-none focus:outline-none px-1.5 py-2 text-[15px] leading-snug placeholder:text-muted-foreground/60 disabled:opacity-60"
          />

          <Button
            type="button"
            size="icon"
            variant="ghost"
            className={cn(
              "rounded-full h-9 w-9 shrink-0 transition-all",
              isRecording
                ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/60",
            )}
            onClick={onToggleRecording}
            disabled={isTranscribing}
            aria-label={isRecording ? "Stop recording" : "Voice input"}
          >
            {isTranscribing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : isRecording ? (
              <Square className="h-3.5 w-3.5 fill-current" />
            ) : (
              <Mic className="h-4 w-4" />
            )}
          </Button>

          <Button
            type="button"
            size="icon"
            onClick={onSend}
            disabled={!canSend}
            aria-label="Send message"
            className={cn(
              "rounded-full h-9 w-9 shrink-0 transition-all duration-200",
              canSend
                ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-paper hover:shadow-lift active:scale-95"
                : "bg-muted/70 text-muted-foreground/60",
            )}
          >
            <ArrowUp className="h-4 w-4" strokeWidth={2.5} />
          </Button>
        </div>
        <p className="text-[10.5px] text-muted-foreground/55 text-center mt-2 px-4">
          <kbd className="font-sans px-1 py-0.5 rounded border border-border/60 text-[9.5px] mx-0.5">Enter</kbd>
          to send ·
          <kbd className="font-sans px-1 py-0.5 rounded border border-border/60 text-[9.5px] mx-0.5">Shift</kbd>
          <kbd className="font-sans px-1 py-0.5 rounded border border-border/60 text-[9.5px] mx-0.5">Enter</kbd>
          for a new line · Aurora can make mistakes.
        </p>
      </div>
    </div>
  );
}

