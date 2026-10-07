
-- One-time codes users generate in Aurora and paste to a bot
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
