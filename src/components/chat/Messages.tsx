import { ChatMessage, ChatMessageProps } from "../ChatMessage";
import { Conversation, ConversationContent, ConversationScrollButton } from "@/components/ai-elements/conversation";
import auroraMark from "@/assets/aurora-mark.png";

interface MessagesProps {
  messages: ChatMessageProps[];
  isLoading: boolean;
  onSuggestionClick?: (text: string) => void;
}

function contextualSuggestions() {
  const h = new Date().getHours();
  if (h < 5) {
    return [
      { icon: "☾", title: "Wind down", prompt: "Help me quiet my thoughts before sleep." },
      { icon: "✎", title: "Empty the head", prompt: "I want to offload what's on my mind — just listen." },
      { icon: "✧", title: "Tomorrow's first step", prompt: "Help me pick one thing to do first tomorrow." },
    ];
  }
  if (h < 12) {
    return [
      { icon: "☼", title: "Set the tone", prompt: "Help me set a clear intention for today." },
      { icon: "⤴", title: "Shape the day", prompt: "Help me plan the next few hours so I feel less scattered." },
      { icon: "✎", title: "Think out loud", prompt: "I want to think through something — ask me one good question." },
    ];
  }
  if (h < 18) {
    return [
      { icon: "◐", title: "Check in", prompt: "How am I doing on what I said I'd do today?" },
      { icon: "✦", title: "Untangle it", prompt: "Something's on my mind. Help me sort it out." },
      { icon: "☼", title: "Brighten it up", prompt: "Tell me something genuinely interesting I probably don't know." },
    ];
  }
  return [
    { icon: "◑", title: "Reflect", prompt: "Ask me one honest question about how today went." },
    { icon: "✎", title: "Journal a moment", prompt: "Help me capture one thing worth remembering from today." },
    { icon: "☾", title: "Set down the day", prompt: "Help me close the day gently." },
  ];
}

export function Messages({ messages, isLoading, onSuggestionClick }: MessagesProps) {
  const isEmpty = messages.length === 0;

  if (isEmpty) {
    const suggestions = contextualSuggestions();
    return (
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-xl mx-auto px-6 py-12 flex flex-col items-center text-center min-h-full justify-center">
          <div className="mb-8 relative">
            <div className="absolute inset-0 blur-3xl bg-primary/15 rounded-full" />
            <img
              src={auroraMark}
              alt="Aurora"
              width={72}
              height={72}
              className="relative h-18 w-18 object-contain drop-shadow-lg animate-breathe"
            />
          </div>
          <h2 className="font-display text-3xl sm:text-4xl tracking-tight mb-3 text-foreground">
            What's on your mind?
          </h2>
          <p className="text-[15px] text-muted-foreground max-w-md mb-10 leading-relaxed">
            I remember our conversations, notice patterns, and check in when it matters. Start anywhere.
          </p>
          <div className="flex flex-col gap-2 w-full">
            {suggestions.map((s) => (
              <button
                key={s.title}
                onClick={() => onSuggestionClick?.(s.prompt)}
                className="group text-left px-4 py-3.5 rounded-2xl border border-border/50 bg-card/70 hover:bg-card hover:border-primary/40 hover:shadow-paper transition-all duration-200 active:scale-[0.99]"
              >
                <div className="flex items-center gap-3.5">
                  <span className="text-primary text-lg leading-none shrink-0 opacity-80 group-hover:opacity-100">{s.icon}</span>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-[14px] text-foreground">{s.title}</div>
                    <div className="text-[12.5px] text-muted-foreground line-clamp-1 mt-0.5 leading-snug">
                      {s.prompt}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <Conversation className="flex-1">
      <ConversationContent className="max-w-3xl mx-auto px-4 py-8 gap-7">
        {messages.map((msg, i) => (
          <ChatMessage
            key={i}
            {...msg}
            id={msg.id ?? `${msg.sender}-${i}-${msg.timestamp.getTime?.() ?? i}`}
          />
        ))}
        {isLoading && (
          <ChatMessage message="" sender="bot" timestamp={new Date()} isLoading />
        )}
      </ConversationContent>
      <ConversationScrollButton />
    </Conversation>
  );
}

