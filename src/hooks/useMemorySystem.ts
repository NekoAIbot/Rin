import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { getAuthHeaders } from '@/lib/edgeAuth';

const MEMORY_EXTRACT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/memory-extract`;
const EMOTION_ANALYZE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/emotion-analyze`;
const MEMORY_SEARCH_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/memory-search`;

export interface EmotionResult {
  emotion: string;
  intensity: number;
  polarity: 'positive' | 'negative' | 'neutral';
  responseMode: 'analyst' | 'support' | 'motivator' | 'challenger' | 'listener' | 'default';
  trigger?: string | null;
}

export interface MemoryFact {
  id: string;
  category: string;
  key: string;
  value: string;
  tags?: string[];
  confidence: number;
  source: string;
  is_pinned?: boolean;
  is_sensitive?: boolean;
  last_reinforced_at: string;
  created_at: string;
}

export interface MemoryMatch extends MemoryFact {
  similarity: number;
}

export interface ConversationSummary {
  id: string;
  summary: string;
  emotional_tone: string;
  key_topics: string[];
  decisions_made: string[];
  unresolved_threads: string[];
  milestones: string[];
  period_type: string;
  created_at: string;
}

export interface EmotionalPattern {
  id: string;
  emotion: string;
  intensity: number;
  polarity: string;
  context: string;
  created_at: string;
}

export interface IdentitySnapshot {
  dimension: string;
  score: number;
  delta: number;
  note: string;
  created_at: string;
}

export function useMemorySystem() {
  const { user } = useAuth();
  const [isExtracting, setIsExtracting] = useState(false);
  const [isAnalyzingEmotion, setIsAnalyzingEmotion] = useState(false);

  // Analyze emotion of a user message
  const analyzeEmotion = useCallback(async (text: string): Promise<EmotionResult> => {
    const defaultResult: EmotionResult = { emotion: 'neutral', intensity: 0.5, polarity: 'neutral', responseMode: 'default' };

    if (!text.trim()) return defaultResult;
    setIsAnalyzingEmotion(true);

    try {
      const headers = await getAuthHeaders();
      if (!headers) return defaultResult;
      const resp = await fetch(EMOTION_ANALYZE_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify({ text }),
      });

      if (!resp.ok) return defaultResult;
      return await resp.json();
    } catch (e) {
      console.error('Emotion analysis failed:', e);
      return defaultResult;
    } finally {
      setIsAnalyzingEmotion(false);
    }
  }, []);

  // Extract memory from a completed conversation
  const extractMemory = useCallback(async (
    conversation: Array<{ role: string; content: string }>,
    conversationId?: string
  ) => {
    if (!user || !conversation.length) return;
    // Only extract if conversation has at least 4 messages (meaningful exchange)
    if (conversation.length < 4) return;

    setIsExtracting(true);
    try {
      const headers = await getAuthHeaders();
      if (!headers) return;
      const resp = await fetch(MEMORY_EXTRACT_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          conversation,
          conversationId,
        }),
      });

      if (!resp.ok) {
        console.error('Memory extraction failed:', resp.status);
        return;
      }

      const result = await resp.json();
      console.log('Memory extraction result:', result);
      return result;
    } catch (e) {
      console.error('Memory extraction error:', e);
    } finally {
      setIsExtracting(false);
    }
  }, [user]);

  // Fetch user's memory facts
  const fetchMemoryFacts = useCallback(async (category?: string): Promise<MemoryFact[]> => {
    if (!user) return [];
    try {
      let query = supabase
        .from('user_memory')
        .select('*')
        .eq('user_id', user.id)
        .order('last_reinforced_at', { ascending: false });

      if (category) {
        query = query.eq('category', category);
      }

      const { data, error } = await query.limit(100);
      if (error) throw error;
      return (data || []) as MemoryFact[];
    } catch (e) {
      console.error('Failed to fetch memory facts:', e);
      return [];
    }
  }, [user]);

  // Add a manual memory fact
  const addMemoryFact = useCallback(async (
    category: string,
    key: string,
    value: string
  ) => {
    if (!user) return;
    try {
      const { error } = await supabase.from('user_memory').insert({
        user_id: user.id,
        category,
        key,
        value,
        confidence: 1.0,
        source: 'explicit',
      });
      if (error) throw error;
    } catch (e) {
      console.error('Failed to add memory fact:', e);
      throw e;
    }
  }, [user]);

  // Delete a memory fact
  const deleteMemoryFact = useCallback(async (id: string) => {
    if (!user) return;
    try {
      const { error } = await supabase.from('user_memory').delete().eq('id', id).eq('user_id', user.id);
      if (error) throw error;
    } catch (e) {
      console.error('Failed to delete memory fact:', e);
      throw e;
    }
  }, [user]);

  // Fetch episodic summaries
  const fetchSummaries = useCallback(async (limit = 10): Promise<ConversationSummary[]> => {
    if (!user) return [];
    try {
      const { data, error } = await supabase
        .from('conversation_summaries')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data || []) as ConversationSummary[];
    } catch (e) {
      console.error('Failed to fetch summaries:', e);
      return [];
    }
  }, [user]);

  // Fetch emotional patterns
  const fetchEmotionalPatterns = useCallback(async (limit = 30): Promise<EmotionalPattern[]> => {
    if (!user) return [];
    try {
      const { data, error } = await supabase
        .from('emotional_patterns')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data || []) as EmotionalPattern[];
    } catch (e) {
      console.error('Failed to fetch emotional patterns:', e);
      return [];
    }
  }, [user]);

  // Fetch identity evolution
  const fetchIdentityEvolution = useCallback(async (): Promise<IdentitySnapshot[]> => {
    if (!user) return [];
    try {
      const { data, error } = await supabase
        .from('identity_evolution')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data || []) as IdentitySnapshot[];
    } catch (e) {
      console.error('Failed to fetch identity evolution:', e);
      return [];
    }
  }, [user]);

  // Semantic memory search — hits the retrieval index (vector similarity).
  const searchMemory = useCallback(async (
    query: string,
    opts?: { limit?: number; includeSensitive?: boolean }
  ): Promise<MemoryMatch[]> => {
    if (!user || !query.trim()) return [];
    try {
      const headers = await getAuthHeaders();
      if (!headers) return [];
      const resp = await fetch(MEMORY_SEARCH_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          query,
          limit: opts?.limit ?? 8,
          includeSensitive: opts?.includeSensitive ?? false,
        }),
      });
      if (!resp.ok) return [];
      const data = await resp.json();
      return (data?.matches ?? []) as MemoryMatch[];
    } catch (e) {
      console.error('searchMemory failed:', e);
      return [];
    }
  }, [user]);

  return {
    isExtracting,
    isAnalyzingEmotion,
    analyzeEmotion,
    extractMemory,
    fetchMemoryFacts,
    addMemoryFact,
    deleteMemoryFact,
    fetchSummaries,
    fetchEmotionalPatterns,
    fetchIdentityEvolution,
    searchMemory,
  };
}
