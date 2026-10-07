
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
