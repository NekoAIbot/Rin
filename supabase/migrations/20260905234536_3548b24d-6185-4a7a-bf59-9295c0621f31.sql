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
  USING (auth.uid() = user_id);