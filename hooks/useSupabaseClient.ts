import { useAuth } from "@clerk/clerk-expo";
import { createClient } from "@supabase/supabase-js";
import { useMemo } from "react";
import { realtimeConfig } from "@/lib/realtimeConfig";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_KEY!;

/**
 * Hook that creates a Supabase client authenticated with Clerk session.
 * The client is memoized and will update when the session changes.
 */
export function useSupabaseClient() {
  const { getToken } = useAuth();

  // IMPORTANT: Empty dependency array to prevent infinite loops.
  // The accessToken callback captures getToken via closure and will use
  // the latest reference when Supabase actually calls it for a token.
  const supabaseClient = useMemo(() => {
    return createClient(supabaseUrl, supabaseKey, {
      async accessToken() {
        return (await getToken?.()) ?? null;
      },
      realtime: realtimeConfig,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Intentionally empty - getToken is accessed via closure when needed

  return supabaseClient;
}
