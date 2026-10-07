import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { getAuthHeaders } from '@/lib/edgeAuth';

const PROACTIVE_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/proactive-insights`;
const DAILY_SUMMARY_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/daily-summary`;

export interface ProactiveInsight {
  id: string;
  insight_type: string;
  title: string;
  message: string;
  priority: number;
  is_surfaced: boolean;
  is_dismissed: boolean;
  created_at: string;
}

export interface RitualSummary {
  id: string;
  ritual_type: string;
  summary: string;
  goals_reviewed: string[];
  accomplishments: string[];
  intentions: string[];
  mood_trend: string;
  growth_highlights: string[];
  period_start: string;
  period_end: string;
  created_at: string;
}

export function useProactiveInsights() {
  const { user } = useAuth();
  const [isLoadingInsights, setIsLoadingInsights] = useState(false);
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);

  const fetchInsights = useCallback(async (): Promise<ProactiveInsight[]> => {
    if (!user) return [];
    setIsLoadingInsights(true);
    try {
      const headers = await getAuthHeaders();
      if (!headers) return [];
      const resp = await fetch(PROACTIVE_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify({}),
      });
      if (!resp.ok) return [];
      const data = await resp.json();
      return data.insights || [];
    } catch (e) {
      console.error('Failed to fetch proactive insights:', e);
      return [];
    } finally {
      setIsLoadingInsights(false);
    }
  }, [user]);

  const dismissInsight = useCallback(async (id: string) => {
    await supabase.from('proactive_insights').update({ is_dismissed: true, is_surfaced: true }).eq('id', id);
  }, []);

  const markSurfaced = useCallback(async (id: string) => {
    await supabase.from('proactive_insights').update({ is_surfaced: true }).eq('id', id);
  }, []);

  const generateRitual = useCallback(async (type: 'daily' | 'weekly') => {
    if (!user) return null;
    setIsGeneratingSummary(true);
    try {
      const headers = await getAuthHeaders();
      if (!headers) return null;
      const resp = await fetch(DAILY_SUMMARY_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify({ type }),
      });
      if (!resp.ok) return null;
      return await resp.json();
    } catch (e) {
      console.error('Failed to generate ritual:', e);
      return null;
    } finally {
      setIsGeneratingSummary(false);
    }
  }, [user]);

  const fetchRitualHistory = useCallback(async (limit = 10): Promise<RitualSummary[]> => {
    if (!user) return [];
    try {
      const { data, error } = await supabase
        .from('ritual_summaries')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data || []) as RitualSummary[];
    } catch (e) {
      console.error('Failed to fetch ritual history:', e);
      return [];
    }
  }, [user]);

  const fetchBehavioralInsights = useCallback(async () => {
    if (!user) return [];
    try {
      const { data, error } = await supabase
        .from('behavioral_insights')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return data || [];
    } catch (e) {
      console.error('Failed to fetch behavioral insights:', e);
      return [];
    }
  }, [user]);

  const acknowledgeBehavioralInsight = useCallback(async (id: string) => {
    await supabase.from('behavioral_insights').update({ acknowledged: true }).eq('id', id);
  }, []);

  return {
    isLoadingInsights,
    isGeneratingSummary,
    fetchInsights,
    dismissInsight,
    markSurfaced,
    generateRitual,
    fetchRitualHistory,
    fetchBehavioralInsights,
    acknowledgeBehavioralInsight,
  };
}
