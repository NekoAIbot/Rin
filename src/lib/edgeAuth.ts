import { supabase } from '@/integrations/supabase/client';

/**
 * Build authenticated fetch headers for calls to Aurora edge functions.
 * Edge functions validate the JWT in code and derive userId from the token —
 * always send the current session's access_token, never the publishable/anon key.
 */
export async function getAuthHeaders(): Promise<Record<string, string> | null> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return null;
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${session.access_token}`,
    apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  };
}
