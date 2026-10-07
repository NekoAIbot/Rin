
-- ============================================================
-- AURORA LAYERED COGNITIVE MEMORY SYSTEM
-- ============================================================

-- A. Semantic Memory / User Knowledge Graph
CREATE TABLE public.user_memory (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('goal', 'interest', 'relationship', 'project', 'trigger', 'motivator', 'pattern', 'skill', 'value', 'fact')),
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  confidence FLOAT DEFAULT 0.8,
  source TEXT DEFAULT 'inferred', -- inferred, explicit, observed
  last_reinforced_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.user_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own memory"
  ON public.user_memory FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own memory"
  ON public.user_memory FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own memory"
  ON public.user_memory FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own memory"
  ON public.user_memory FOR DELETE USING (auth.uid() = user_id);

-- B. Episodic Memory / Conversation Summaries
CREATE TABLE public.conversation_summaries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  conversation_id UUID,
  summary TEXT NOT NULL,
  emotional_tone TEXT,
  key_topics TEXT[] DEFAULT '{}',
  decisions_made TEXT[] DEFAULT '{}',
  unresolved_threads TEXT[] DEFAULT '{}',
  milestones TEXT[] DEFAULT '{}',
  period_type TEXT DEFAULT 'conversation', -- conversation, daily, weekly, monthly
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.conversation_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own summaries"
  ON public.conversation_summaries FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own summaries"
  ON public.conversation_summaries FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own summaries"
  ON public.conversation_summaries FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own summaries"
  ON public.conversation_summaries FOR DELETE USING (auth.uid() = user_id);

-- C. Emotional Pattern Tracking
CREATE TABLE public.emotional_patterns (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  emotion TEXT NOT NULL, -- joy, sadness, anger, fear, surprise, disgust, stress, pride, shame, burnout, excitement, anxiety
  intensity FLOAT CHECK (intensity >= 0 AND intensity <= 1),
  polarity TEXT CHECK (polarity IN ('positive', 'negative', 'neutral')),
  context TEXT,
  trigger_pattern TEXT,
  conversation_id UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.emotional_patterns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own emotional patterns"
  ON public.emotional_patterns FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own emotional patterns"
  ON public.emotional_patterns FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own emotional patterns"
  ON public.emotional_patterns FOR UPDATE USING (auth.uid() = user_id);

-- D. Identity Evolution Tracking
CREATE TABLE public.identity_evolution (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  dimension TEXT NOT NULL CHECK (dimension IN ('confidence', 'discipline', 'emotional_stability', 'resilience', 'focus', 'growth_mindset')),
  score FLOAT CHECK (score >= 0 AND score <= 10),
  delta FLOAT DEFAULT 0, -- change from last measurement
  note TEXT,
  evidence TEXT, -- what conversation/event led to this
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

ALTER TABLE public.identity_evolution ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own identity evolution"
  ON public.identity_evolution FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own identity evolution"
  ON public.identity_evolution FOR INSERT WITH CHECK (auth.uid() = user_id);

-- E. Companion Mode & Personality Settings (extends user_settings)
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS companion_mode TEXT DEFAULT 'assistant';
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS proactive_enabled BOOLEAN DEFAULT true;
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS memory_depth TEXT DEFAULT 'standard'; -- minimal, standard, deep

-- Triggers for updated_at
CREATE TRIGGER update_user_memory_updated_at
  BEFORE UPDATE ON public.user_memory
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
