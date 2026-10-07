ALTER TABLE public.user_settings
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