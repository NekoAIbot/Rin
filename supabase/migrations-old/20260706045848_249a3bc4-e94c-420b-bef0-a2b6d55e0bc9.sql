
CREATE OR REPLACE FUNCTION public.match_user_memory(
  _user_id uuid,
  _query_embedding vector(1536),
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
