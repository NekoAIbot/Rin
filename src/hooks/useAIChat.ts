import { useState, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`;

export function useAIChat(persona: string = 'assistant') {
  const [isStreaming, setIsStreaming] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const streamChat = useCallback(async ({
    messages,
    userName,
    userId,
    companionMode,
    onDelta,
    onDone,
    onError,
  }: {
    messages: Message[];
    userName?: string;
    userId?: string;
    companionMode?: string;
    onDelta: (deltaText: string) => void;
    onDone: () => void;
    onError?: (error: Error) => void;
  }) => {
    setIsStreaming(true);
    abortControllerRef.current = new AbortController();

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast.error('Please sign in to chat with Aurora.');
        throw new Error('Not authenticated');
      }
      const resp = await fetch(CHAT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify({ messages, persona, userName, companionMode }),
        signal: abortControllerRef.current.signal,
      });

      if (!resp.ok) {
        if (resp.status === 429) {
          toast.error('Rate limit exceeded. Please wait a moment and try again.');
          throw new Error('Rate limit exceeded');
        }
        if (resp.status === 402) {
          toast.error('Credits needed. Please add more credits to continue.');
          throw new Error('Payment required');
        }
        throw new Error('Failed to start stream');
      }

      if (!resp.body) {
        throw new Error('No response body');
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = '';
      let streamDone = false;

      while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) break;
        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf('\n')) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);

          if (line.endsWith('\r')) line = line.slice(0, -1);
          if (line.startsWith(':') || line.trim() === '') continue;
          if (!line.startsWith('data: ')) continue;

          const jsonStr = line.slice(6).trim();
          if (jsonStr === '[DONE]') {
            streamDone = true;
            break;
          }

          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) onDelta(content);
          } catch {
            textBuffer = line + '\n' + textBuffer;
            break;
          }
        }
      }

      // Final flush
      if (textBuffer.trim()) {
        for (let raw of textBuffer.split('\n')) {
          if (!raw) continue;
          if (raw.endsWith('\r')) raw = raw.slice(0, -1);
          if (raw.startsWith(':') || raw.trim() === '') continue;
          if (!raw.startsWith('data: ')) continue;
          const jsonStr = raw.slice(6).trim();
          if (jsonStr === '[DONE]') continue;
          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) onDelta(content);
          } catch { /* ignore */ }
        }
      }

      onDone();
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        onDone();
        return;
      }
      console.error('Stream error:', error);
      onError?.(error as Error);
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  }, [persona]);

  const cancelStream = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  return { streamChat, isStreaming, cancelStream };
}
