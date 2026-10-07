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
