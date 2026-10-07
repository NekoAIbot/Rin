-- Create profiles table for user data
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own profile" 
ON public.profiles 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own profile" 
ON public.profiles 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own profile" 
ON public.profiles 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (new.id, new.raw_user_meta_data->>'display_name');
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger to auto-create profile on signup
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user();

-- Create conversations table to store chat history
CREATE TABLE public.conversations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title TEXT DEFAULT 'New Conversation',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

-- Conversations policies
CREATE POLICY "Users can view their own conversations" 
ON public.conversations FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own conversations" 
ON public.conversations FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own conversations" 
ON public.conversations FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own conversations" 
ON public.conversations FOR DELETE USING (auth.uid() = user_id);

-- Create trigger for conversations timestamp
CREATE TRIGGER update_conversations_updated_at
BEFORE UPDATE ON public.conversations
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create messages table for chat messages
CREATE TABLE public.messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  emotion TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Messages policies
CREATE POLICY "Users can view their own messages" 
ON public.messages FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own messages" 
ON public.messages FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Create user_settings table for preferences
CREATE TABLE public.user_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  voice_enabled BOOLEAN DEFAULT true,
  active_persona TEXT DEFAULT 'assistant',
  web_search_enabled BOOLEAN DEFAULT false,
  preferred_model TEXT DEFAULT 'google/gemini-3-flash-preview',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

-- Settings policies
CREATE POLICY "Users can view their own settings" 
ON public.user_settings FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own settings" 
ON public.user_settings FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own settings" 
ON public.user_settings FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Trigger for settings timestamp
CREATE TRIGGER update_user_settings_updated_at
BEFORE UPDATE ON public.user_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
-- ============================================================
-- RIN LAYERED COGNITIVE MEMORY SYSTEM
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
-- Enable pg_cron and pg_net extensions for scheduled jobs
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Grant usage to postgres role
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;ALTER PUBLICATION supabase_realtime ADD TABLE public.api_usage;
-- Subscriptions table for Paystack billing
CREATE TABLE public.subscriptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  tier TEXT NOT NULL DEFAULT 'free' CHECK (tier IN ('free','pro','enterprise')),
  status TEXT NOT NULL DEFAULT 'inactive' CHECK (status IN ('inactive','active','past_due','cancelled','trialing')),
  paystack_customer_code TEXT,
  paystack_subscription_code TEXT,
  paystack_email_token TEXT,
  plan_code TEXT,
  currency TEXT NOT NULL DEFAULT 'NGN',
  amount_kobo INTEGER,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own subscription"
  ON public.subscriptions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role manages subscriptions"
  ON public.subscriptions FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE TRIGGER update_subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Payment transactions log (audit)
CREATE TABLE public.payment_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  reference TEXT NOT NULL UNIQUE,
  amount_kobo INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'NGN',
  status TEXT NOT NULL,
  tier TEXT,
  paystack_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.payment_transactions TO authenticated;
GRANT ALL ON public.payment_transactions TO service_role;

ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own transactions"
  ON public.payment_transactions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role manages transactions"
  ON public.payment_transactions FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- Push subscriptions for proactive outreach
CREATE TABLE public.push_subscriptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, endpoint)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions TO authenticated;
GRANT ALL ON public.push_subscriptions TO service_role;

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own push subs"
  ON public.push_subscriptions FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Ritual preferences (morning/midday/evening times)
CREATE TABLE public.ritual_preferences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE UNIQUE,
  morning_enabled BOOLEAN NOT NULL DEFAULT true,
  morning_time TIME NOT NULL DEFAULT '08:00:00',
  midday_enabled BOOLEAN NOT NULL DEFAULT false,
  midday_time TIME NOT NULL DEFAULT '13:00:00',
  evening_enabled BOOLEAN NOT NULL DEFAULT true,
  evening_time TIME NOT NULL DEFAULT '21:00:00',
  timezone TEXT NOT NULL DEFAULT 'UTC',
  push_enabled BOOLEAN NOT NULL DEFAULT false,
  email_enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ritual_preferences TO authenticated;
GRANT ALL ON public.ritual_preferences TO service_role;

ALTER TABLE public.ritual_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own ritual prefs"
  ON public.ritual_preferences FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_ritual_prefs_updated_at
  BEFORE UPDATE ON public.ritual_preferences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Onboarding status on profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS country TEXT,
  ADD COLUMN IF NOT EXISTS preferred_currency TEXT NOT NULL DEFAULT 'NGN';

-- Helper: get effective tier for a user
CREATE OR REPLACE FUNCTION public.get_user_tier(_user_id UUID)
RETURNS TEXT
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT tier FROM public.subscriptions
     WHERE user_id = _user_id AND status = 'active'
     LIMIT 1),
    'free'
  );
$$;

-- Memory pin/sensitive flags
ALTER TABLE public.user_memory
  ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_sensitive BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS source_message_id UUID;

-- Crisis events log (safety)
CREATE TABLE public.crisis_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  risk_level TEXT NOT NULL CHECK (risk_level IN ('moderate','high')),
  detected_in TEXT,
  region TEXT,
  resources_shown JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.crisis_events TO authenticated;
GRANT ALL ON public.crisis_events TO service_role;

ALTER TABLE public.crisis_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own crisis events"
  ON public.crisis_events FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own crisis events"
  ON public.crisis_events FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role manages crisis events"
  ON public.crisis_events FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

REVOKE EXECUTE ON FUNCTION public.get_user_tier(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_tier(UUID) TO service_role;

REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_updated_at_column() TO service_role;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;

-- 1. Roles enum + table
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user', 'super_admin');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users view their own roles" ON public.user_roles
    FOR SELECT TO authenticated USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 2. has_role helper (security definer, avoids RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
$$;

GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, anon;

-- 3. Aggregate metrics function (admin-only)
CREATE OR REPLACE FUNCTION public.admin_metrics()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  result jsonb;
  total_users int := 0;
  total_conversations int := 0;
  total_messages int := 0;
  active_subscriptions int := 0;
  paid_revenue_kobo bigint := 0;
  new_users_7d int := 0;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT count(*) INTO total_users FROM auth.users;
  SELECT count(*) INTO new_users_7d FROM auth.users WHERE created_at > now() - interval '7 days';

  BEGIN
    EXECUTE 'SELECT count(*) FROM public.conversations' INTO total_conversations;
  EXCEPTION WHEN undefined_table THEN total_conversations := 0; END;

  BEGIN
    EXECUTE 'SELECT count(*) FROM public.messages' INTO total_messages;
  EXCEPTION WHEN undefined_table THEN total_messages := 0; END;

  BEGIN
    EXECUTE $q$SELECT count(*), COALESCE(SUM(amount_kobo),0)
              FROM public.subscriptions WHERE status = 'active'$q$
      INTO active_subscriptions, paid_revenue_kobo;
  EXCEPTION WHEN undefined_table THEN
    active_subscriptions := 0; paid_revenue_kobo := 0;
  END;

  result := jsonb_build_object(
    'total_users', total_users,
    'new_users_7d', new_users_7d,
    'total_conversations', total_conversations,
    'total_messages', total_messages,
    'active_subscriptions', active_subscriptions,
    'mrr_ngn', (paid_revenue_kobo / 100.0)
  );
  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_metrics() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.admin_metrics() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_metrics() TO authenticated;
-- Add super_admin role and permanent owner protection
-- ('super_admin' is part of the enum definition above; no ALTER TYPE needed
--  because Postgres forbids using a new enum value in the same transaction.)
-- Grant existing owner if present
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::public.app_role FROM auth.users WHERE lower(email) = 'ahow0166@gmail.com'
ON CONFLICT (user_id, role) DO NOTHING;

INSERT INTO public.user_roles (user_id, role)
SELECT id, 'super_admin'::public.app_role FROM auth.users WHERE lower(email) = 'ahow0166@gmail.com'
ON CONFLICT (user_id, role) DO NOTHING;

-- Auto-grant on signup (trigger on auth.users)
CREATE OR REPLACE FUNCTION public.grant_owner_roles()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF lower(NEW.email) = 'ahow0166@gmail.com' THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin')
      ON CONFLICT (user_id, role) DO NOTHING;
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'super_admin')
      ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_grant_owner ON auth.users;
CREATE TRIGGER on_auth_user_created_grant_owner
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.grant_owner_roles();

-- Protect owner roles from deletion/modification
CREATE OR REPLACE FUNCTION public.protect_owner_roles()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_email text;
  target_uid uuid;
BEGIN
  target_uid := COALESCE(OLD.user_id, NEW.user_id);
  SELECT email INTO target_email FROM auth.users WHERE id = target_uid;
  IF lower(COALESCE(target_email, '')) = 'ahow0166@gmail.com' THEN
    RAISE EXCEPTION 'Owner roles are protected and cannot be modified.';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS protect_owner_roles_trigger ON public.user_roles;
CREATE TRIGGER protect_owner_roles_trigger
BEFORE UPDATE OR DELETE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.protect_owner_roles();
REVOKE EXECUTE ON FUNCTION public.grant_owner_roles() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.protect_owner_roles() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;
-- One-time codes users generate in Rin and paste to a bot
CREATE TABLE public.bot_link_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE,
  platform text NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '15 minutes'),
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bot_link_codes TO authenticated;
GRANT ALL ON public.bot_link_codes TO service_role;
ALTER TABLE public.bot_link_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own link codes"
  ON public.bot_link_codes FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_bot_link_codes_code ON public.bot_link_codes(code);

-- Confirmed platform links (Telegram chat id, Discord user id, etc.)
CREATE TABLE public.bot_channel_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform text NOT NULL,
  external_id text NOT NULL,
  display_name text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (platform, external_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bot_channel_links TO authenticated;
GRANT ALL ON public.bot_channel_links TO service_role;
ALTER TABLE public.bot_channel_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read their own channel links"
  ON public.bot_channel_links FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "Users delete their own channel links"
  ON public.bot_channel_links FOR DELETE
  USING (auth.uid() = user_id);
CREATE INDEX idx_bot_channel_links_user ON public.bot_channel_links(user_id);

CREATE TRIGGER trg_bot_channel_links_updated_at
  BEFORE UPDATE ON public.bot_channel_links
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE public.user_memory
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS embedding vector(768);

CREATE INDEX IF NOT EXISTS user_memory_user_id_idx
  ON public.user_memory (user_id);

CREATE INDEX IF NOT EXISTS user_memory_tags_idx
  ON public.user_memory USING gin (tags);

CREATE INDEX IF NOT EXISTS user_memory_embedding_idx
  ON public.user_memory USING hnsw (embedding vector_cosine_ops);

CREATE OR REPLACE FUNCTION public.match_user_memory(
  _user_id uuid,
  _query_embedding vector(768),
  _match_count int DEFAULT 8,
  _include_sensitive boolean DEFAULT false
)
RETURNS TABLE (
  id uuid,
  category text,
  key text,
  value text,
  tags text[],
  confidence double precision,
  source text,
  is_pinned boolean,
  is_sensitive boolean,
  similarity double precision,
  last_reinforced_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    m.id,
    m.category,
    m.key,
    m.value,
    m.tags,
    m.confidence,
    m.source,
    m.is_pinned,
    m.is_sensitive,
    1 - (m.embedding <=> _query_embedding) AS similarity,
    m.last_reinforced_at
  FROM public.user_memory m
  WHERE m.user_id = _user_id
    AND m.embedding IS NOT NULL
    AND (_include_sensitive OR m.is_sensitive = false)
  ORDER BY m.embedding <=> _query_embedding
  LIMIT GREATEST(1, LEAST(_match_count, 50));
$$;

GRANT EXECUTE ON FUNCTION public.match_user_memory(uuid, vector, int, boolean) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.match_user_memory(
  _user_id uuid,
  _query_embedding vector(768),
  _match_count int DEFAULT 8,
  _include_sensitive boolean DEFAULT false
)
RETURNS TABLE (
  id uuid,
  category text,
  key text,
  value text,
  tags text[],
  confidence double precision,
  source text,
  is_pinned boolean,
  is_sensitive boolean,
  similarity double precision,
  last_reinforced_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    m.id,
    m.category,
    m.key,
    m.value,
    m.tags,
    m.confidence,
    m.source,
    m.is_pinned,
    m.is_sensitive,
    1 - (m.embedding <=> _query_embedding) AS similarity,
    m.last_reinforced_at
  FROM public.user_memory m
  WHERE m.user_id = _user_id
    AND (auth.uid() = _user_id OR auth.role() = 'service_role')
    AND m.embedding IS NOT NULL
    AND (_include_sensitive OR m.is_sensitive = false)
  ORDER BY m.embedding <=> _query_embedding
  LIMIT GREATEST(1, LEAST(_match_count, 50));
$$;

REVOKE ALL ON FUNCTION public.match_user_memory(uuid, vector, int, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.match_user_memory(uuid, vector, int, boolean) TO authenticated, service_role;
CREATE TABLE public.telegram_updates (
  update_id bigint PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.telegram_updates TO service_role;
ALTER TABLE public.telegram_updates ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS telegram_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS telegram_proactive boolean NOT NULL DEFAULT true;

ALTER TABLE public.bot_channel_links
  ADD COLUMN IF NOT EXISTS conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_message_at timestamptz;

CREATE POLICY "Users create their own channel links"
  ON public.bot_channel_links FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update their own channel links"
  ON public.bot_channel_links FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete their own emotional patterns"
  ON public.emotional_patterns FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users update their own identity evolution"
  ON public.identity_evolution FOR UPDATE TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete their own identity evolution"
  ON public.identity_evolution FOR DELETE TO authenticated
  USING (auth.uid() = user_id);CREATE OR REPLACE FUNCTION public.merge_user_data(_from uuid, _to uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _from IS NULL OR _to IS NULL OR _from = _to THEN
    RETURN;
  END IF;

  -- avoid duplicate memory keys before moving
  DELETE FROM public.user_memory m
  WHERE m.user_id = _from
    AND EXISTS (
      SELECT 1 FROM public.user_memory t
      WHERE t.user_id = _to AND t.key = m.key AND t.category = m.category
    );

  UPDATE public.user_memory SET user_id = _to WHERE user_id = _from;
  UPDATE public.conversations SET user_id = _to WHERE user_id = _from;
  UPDATE public.messages SET user_id = _to WHERE user_id = _from;
  UPDATE public.conversation_summaries SET user_id = _to WHERE user_id = _from;
  UPDATE public.behavioral_insights SET user_id = _to WHERE user_id = _from;
  UPDATE public.emotional_patterns SET user_id = _to WHERE user_id = _from;
  UPDATE public.identity_evolution SET user_id = _to WHERE user_id = _from;
  UPDATE public.proactive_insights SET user_id = _to WHERE user_id = _from;
  UPDATE public.crisis_events SET user_id = _to WHERE user_id = _from;
  UPDATE public.ritual_summaries SET user_id = _to WHERE user_id = _from;

  DELETE FROM public.ritual_preferences WHERE user_id = _from;
  DELETE FROM public.user_settings WHERE user_id = _from;
  DELETE FROM public.bot_link_codes WHERE user_id = _from;
END;
$$;

REVOKE ALL ON FUNCTION public.merge_user_data(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.merge_user_data(uuid, uuid) TO service_role;CREATE OR REPLACE FUNCTION public.user_id_by_email(_email text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM auth.users WHERE lower(email) = lower(_email) LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.user_id_by_email(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.user_id_by_email(text) TO service_role;ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS telegram_checkins_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS telegram_checkin_max_per_day integer NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS telegram_checkin_quiet_start integer NOT NULL DEFAULT 21,
  ADD COLUMN IF NOT EXISTS telegram_checkin_quiet_end integer NOT NULL DEFAULT 8;

CREATE TABLE IF NOT EXISTS public.proactive_checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  platform text NOT NULL DEFAULT 'telegram',
  topic_key text NOT NULL,
  memory_id uuid,
  message text NOT NULL,
  responded boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, DELETE ON public.proactive_checkins TO authenticated;
GRANT ALL ON public.proactive_checkins TO service_role;

ALTER TABLE public.proactive_checkins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read their own check-ins" ON public.proactive_checkins;
CREATE POLICY "Users read their own check-ins" ON public.proactive_checkins
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users delete their own check-ins" ON public.proactive_checkins;
CREATE POLICY "Users delete their own check-ins" ON public.proactive_checkins
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS proactive_checkins_user_created_idx
  ON public.proactive_checkins (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS proactive_checkins_topic_idx
  ON public.proactive_checkins (user_id, topic_key, created_at DESC);
-- ===================================================================
-- TTS endpoint (self-hosted Piper via Cloudflare quick tunnel)
-- The local Termux server upserts its current tunnel URL on startup.
-- speak() reads it to find where to POST reply text for synthesis.
-- ===================================================================
CREATE TABLE IF NOT EXISTS public.tts_endpoint (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY CHECK (id = 1),  -- single row
  url text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Only the service role (the local server's upsert + edge functions) can read/write.
GRANT SELECT, INSERT, UPDATE ON public.tts_endpoint TO service_role;
REVOKE ALL ON public.tts_endpoint FROM authenticated, anon;

ALTER TABLE public.tts_endpoint ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role full access" ON public.tts_endpoint;
CREATE POLICY "service_role full access" ON public.tts_endpoint
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Seed the single row so upsert (on id=1) always has a target.
INSERT INTO public.tts_endpoint (id, url, updated_at)
VALUES (1, '', now())
ON CONFLICT (id) DO NOTHING;

-- ===================================================================
-- Persistent error log — every edge function can write its real errors
-- here (service role only) so failures are debuggable without the
-- dashboard's log explorer.
-- ===================================================================
CREATE TABLE IF NOT EXISTS public.error_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  function_name text NOT NULL,
  error_message text NOT NULL,
  error_stack text,
  context jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.error_log TO service_role;
REVOKE ALL ON public.error_log FROM authenticated, anon;

ALTER TABLE public.error_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role full access" ON public.error_log;
CREATE POLICY "service_role full access" ON public.error_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS error_log_created_idx
  ON public.error_log (created_at DESC);
