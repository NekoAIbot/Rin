CREATE OR REPLACE FUNCTION public.merge_user_data(_from uuid, _to uuid)
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
GRANT EXECUTE ON FUNCTION public.merge_user_data(uuid, uuid) TO service_role;