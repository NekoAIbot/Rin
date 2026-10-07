import { useEffect, useRef, useState } from "react";
import { ChatInput } from "./ChatInput";
import { Messages } from "./chat/Messages";
import { ConversationHistory } from "./ConversationHistory";
import { ProactiveInsightsBanner } from "./ProactiveInsightsBanner";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { useSpeechSynthesis } from "@/hooks/useSpeechSynthesis";
import { useVoiceControls } from "@/hooks/useVoiceControls";
import { useAIChat } from "@/hooks/useAIChat";
import { useConversations } from "@/hooks/useConversations";
import { useProfile } from "@/hooks/useProfile";
import { useUserSettings } from "@/hooks/useUserSettings";
import { useMemorySystem } from "@/hooks/useMemorySystem";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { ChatMessageProps } from "./ChatMessage";

export function ChatWindow() {
  const initialGreetingRef = useRef(false);
  const [displayMessages, setDisplayMessages] = useState<ChatMessageProps[]>([]);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  // Chat history sidebar is LOCKED collapsed by default — user opens it manually.
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true);
  const [currentEmotionMode, setCurrentEmotionMode] = useState<string>("default");

  const { user } = useAuth();
  const { profile } = useProfile();
  const { settings } = useUserSettings();
  const {
    conversations,
    currentConversation,
    messages: dbMessages,
    createConversation,
    selectConversation,
    addMessage,
    deleteConversation
  } = useConversations();

  const { streamChat, isStreaming } = useAIChat(settings.active_persona);
  const { analyzeEmotion, extractMemory } = useMemorySystem();

  const { speak, cancel: cancelSpeech } = useSpeechSynthesis({
    onStart: () => setIsTalking(true),
    onEnd: () => setIsTalking(false)
  });

  const speakText = (text: string) => {
    if (!settings.voice_enabled) return;
    try {
      let voice = null;
      let rate = 1;
      let pitch = 1;
      const savedSettings = localStorage.getItem("settings");
      if (savedSettings) {
        const { selectedVoice, voiceRate, voicePitch } = JSON.parse(savedSettings);
        if (selectedVoice) voice = selectedVoice.split('-')[2];
        if (voiceRate) rate = voiceRate;
        if (voicePitch) pitch = voicePitch;
      }
      speak(text, { voice, rate, pitch });
    } catch (error) {
      console.error("Speech synthesis error:", error);
      setIsTalking(false);
    }
  };

  const { startRecognition, stopRecognition, isTranscribing } = useSpeechRecognition({
    onResult: (transcript) => {
      setInputText(transcript);
      setTimeout(() => handleSendMessage(transcript), 200);
    },
    onInterim: (transcript) => setInputText(transcript),
    onError: (error) => {
      console.error("Speech recognition error:", error);
      setIsRecording(false);
    },
    onEnd: () => {
      setIsRecording(false);
    }
  });

  const {
    isRecording,
    setIsRecording,
    setIsTalking,
    isTalking,
    isVoiceEnabled,
    setIsVoiceEnabled,
    toggleRecording,
    toggleVoice
  } = useVoiceControls(startRecognition, stopRecognition, cancelSpeech);

  useEffect(() => {
    setIsVoiceEnabled(settings.voice_enabled);
  }, [settings.voice_enabled, setIsVoiceEnabled]);

  // Convert DB messages to display format
  useEffect(() => {
    if (dbMessages.length > 0) {
      const formatted: ChatMessageProps[] = dbMessages.map(msg => ({
        message: msg.content,
        sender: msg.role === 'user' ? 'user' : 'bot',
        timestamp: new Date(msg.created_at),
        emotion: msg.emotion as ChatMessageProps['emotion']
      }));
      setDisplayMessages(formatted);
      initialGreetingRef.current = true;
    } else {
      // Empty canvas — Messages renders a warm suggestions screen.
      setDisplayMessages([]);
    }
  }, [dbMessages, currentConversation, profile?.display_name]);

  // Speak initial greeting
  useEffect(() => {
    if (!initialGreetingRef.current && displayMessages.length > 0 && settings.voice_enabled) {
      const greeting = displayMessages[0].message;
      setTimeout(() => {
        speakText(greeting);
        initialGreetingRef.current = true;
      }, 500);
    }
  }, [displayMessages, settings.voice_enabled]);

  const handleNewConversation = async () => {
    await createConversation();
    initialGreetingRef.current = false;
  };

  // Requests routed here by the Intent Engine (Home omnibox, voice, skills).
  useEffect(() => {
    const onPrompt = (e: Event) => {
      const prompt = (e as CustomEvent).detail?.prompt;
      if (typeof prompt === "string" && prompt.trim()) handleSendMessage(prompt);
    };
    const onRecord = () => toggleRecording();
    window.addEventListener("aurora:prompt", onPrompt as EventListener);
    window.addEventListener("aurora:record", onRecord);
    return () => {
      window.removeEventListener("aurora:prompt", onPrompt as EventListener);
      window.removeEventListener("aurora:record", onRecord);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayMessages, currentConversation, settings.companion_mode]);


  const handleSendMessage = async (overrideText?: string) => {
    const messageText = overrideText || inputText;
    if (!messageText.trim()) return;

    // Create conversation if none exists
    let conversationId = currentConversation?.id;
    if (!conversationId) {
      const newConv = await createConversation(messageText.slice(0, 50));
      if (!newConv) return;
      conversationId = newConv.id;
    }

    // Analyze emotion of user message + auto-switch companion mode (subtle, no UI announcement)
    analyzeEmotion(messageText).then(emotionResult => {
      setCurrentEmotionMode(emotionResult.responseMode);
      const modeMap: Record<string, string> = {
        support: 'therapist_lite',
        listener: 'therapist_lite',
        motivator: 'casual',
        challenger: 'strategic',
        analyst: 'assistant',
        default: settings.companion_mode || 'assistant',
      };
      const nextMode = modeMap[emotionResult.responseMode] || (settings.companion_mode || 'assistant');
      if (nextMode !== settings.companion_mode) {
        // Fire-and-forget; user sees no popup, Aurora's tone just shifts.
        import('@/integrations/supabase/client').then(({ supabase }) => {
          if (!user?.id) return;
          supabase.from('user_settings').update({ companion_mode: nextMode }).eq('user_id', user.id);
        }).catch(() => {});
      }
    });

    const userMessage: ChatMessageProps = {
      message: messageText,
      sender: "user",
      timestamp: new Date()
    };

    setDisplayMessages(prev => [...prev, userMessage]);
    setInputText("");
    setIsLoading(true);

    await addMessage('user', messageText);

    // Build messages for API
    const apiMessages = displayMessages
      .filter(m => m.message)
      .map(m => ({
        role: m.sender === "user" ? "user" as const : "assistant" as const,
        content: m.message
      }));

    apiMessages.push({ role: "user", content: messageText });

    let assistantContent = "";

    try {
      await streamChat({
        messages: apiMessages,
        userName: profile?.display_name || undefined,
        userId: user?.id,
        companionMode: settings.companion_mode || 'assistant',
        onDelta: (chunk) => {
          assistantContent += chunk;
          setDisplayMessages(prev => {
            const last = prev[prev.length - 1];
            if (last?.sender === "bot" && !last.isLoading) {
              return prev.map((m, i) =>
                i === prev.length - 1
                  ? { ...m, message: assistantContent }
                  : m
              );
            }
            return [...prev, {
              message: assistantContent,
              sender: "bot" as const,
              timestamp: new Date(),
              emotion: "neutral" as const
            }];
          });
        },
        onDone: async () => {
          setIsLoading(false);
          if (assistantContent) {
            await addMessage('assistant', assistantContent, 'neutral');
            if (settings.voice_enabled) {
              speakText(assistantContent);
            }

            // Trigger memory extraction after conversation has enough context (every 6+ messages)
            if (apiMessages.length >= 5 && settings.memory_depth !== 'minimal') {
              const fullConversation = [
                ...apiMessages,
                { role: 'assistant' as const, content: assistantContent }
              ];
              extractMemory(fullConversation, conversationId).catch(console.error);
            }
          }
        },
        onError: (error) => {
          setIsLoading(false);
          toast.error("Failed to get response. Please try again.");
          console.error("Chat error:", error);
        }
      });
    } catch (error) {
      setIsLoading(false);
      toast.error("Failed to send message. Please try again.");
    }
  };

  return (
    <div className="flex h-full">
      <ConversationHistory
        conversations={conversations}
        currentConversation={currentConversation}
        onSelectConversation={selectConversation}
        onNewConversation={handleNewConversation}
        onDeleteConversation={deleteConversation}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
      />

      <div className="flex flex-col flex-1 min-w-0">
        <ProactiveInsightsBanner />
        <Messages
          messages={displayMessages}
          isLoading={isLoading && !isStreaming}
          onSuggestionClick={(text) => handleSendMessage(text)}
        />
        <ChatInput
          inputText={inputText}
          onInputChange={setInputText}
          onSend={() => handleSendMessage()}
          onToggleRecording={toggleRecording}
          onToggleVoice={toggleVoice}
          isRecording={isRecording}
          isVoiceEnabled={isVoiceEnabled}
          isTalking={isTalking}
          isTranscribing={isTranscribing}
        />
      </div>
    </div>
  );
}
