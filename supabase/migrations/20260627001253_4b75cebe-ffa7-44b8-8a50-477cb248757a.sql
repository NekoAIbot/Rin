
-- 1. Roles enum + table
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');
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
