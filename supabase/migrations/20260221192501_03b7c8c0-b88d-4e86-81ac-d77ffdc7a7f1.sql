
-- API Keys table for external integrations
CREATE TABLE public.api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL DEFAULT 'My API Key',
  key_hash text NOT NULL,
  key_prefix text NOT NULL, -- first 8 chars for display
  tier text NOT NULL DEFAULT 'free', -- free, pro, enterprise
  monthly_limit integer NOT NULL DEFAULT 100,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  expires_at timestamptz
);

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own API keys" ON public.api_keys FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own API keys" ON public.api_keys FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own API keys" ON public.api_keys FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own API keys" ON public.api_keys FOR DELETE USING (auth.uid() = user_id);

-- API Usage tracking
CREATE TABLE public.api_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id uuid NOT NULL REFERENCES public.api_keys(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  endpoint text NOT NULL DEFAULT 'chat',
  tokens_used integer DEFAULT 0,
  status_code integer DEFAULT 200,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.api_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own API usage" ON public.api_usage FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own API usage" ON public.api_usage FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Index for fast usage counting per month
CREATE INDEX idx_api_usage_key_month ON public.api_usage (api_key_id, created_at);
CREATE INDEX idx_api_keys_hash ON public.api_keys (key_hash);

-- Behavioral patterns detected by AI
CREATE TABLE public.behavioral_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  pattern_type text NOT NULL, -- procrastination, decision_paralysis, overcommitment, energy_fluctuation
  description text NOT NULL,
  severity text DEFAULT 'mild', -- mild, moderate, significant
  suggestion text,
  detected_from text, -- conversation_analysis, mood_trend, goal_tracking
  acknowledged boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.behavioral_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own behavioral insights" ON public.behavioral_insights FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own behavioral insights" ON public.behavioral_insights FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own behavioral insights" ON public.behavioral_insights FOR UPDATE USING (auth.uid() = user_id);

-- Proactive insights queue (surfaced at conversation start)
CREATE TABLE public.proactive_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  insight_type text NOT NULL, -- mood_decline, forgotten_goal, milestone_approaching, ritual_reminder, pattern_alert
  title text NOT NULL,
  message text NOT NULL,
  priority integer DEFAULT 5, -- 1-10, higher = more important
  is_surfaced boolean DEFAULT false,
  is_dismissed boolean DEFAULT false,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.proactive_insights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own proactive insights" ON public.proactive_insights FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own proactive insights" ON public.proactive_insights FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own proactive insights" ON public.proactive_insights FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own proactive insights" ON public.proactive_insights FOR DELETE USING (auth.uid() = user_id);

-- Daily/weekly summaries ritual tracking
CREATE TABLE public.ritual_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  ritual_type text NOT NULL, -- daily_recap, weekly_reset
  summary text NOT NULL,
  goals_reviewed text[] DEFAULT '{}',
  accomplishments text[] DEFAULT '{}',
  intentions text[] DEFAULT '{}',
  mood_trend text,
  growth_highlights text[] DEFAULT '{}',
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ritual_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own ritual summaries" ON public.ritual_summaries FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own ritual summaries" ON public.ritual_summaries FOR INSERT WITH CHECK (auth.uid() = user_id);
