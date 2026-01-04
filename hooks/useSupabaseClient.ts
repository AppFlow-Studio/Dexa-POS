import { useAuth } from "@clerk/clerk-expo";
import { createClient } from "@supabase/supabase-js";
import { useMemo } from "react";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_KEY!;

/**
 * Hook that creates a Supabase client authenticated with Clerk session.
 * The client is memoized and will update when the session changes.
 */
export function useSupabaseClient() {
  const { getToken } = useAuth();
  const supabaseClient = useMemo(() => {
    // return createSupabaseClient(async () => {
    //   if (!session) return null;
    //   return session.getToken() ?? null;
    // });
    return createClient(supabaseUrl, supabaseKey,
      {
        async accessToken() {
          return (await getToken?.()) ?? null;
        },
      }
    );
  }, [getToken]);

  return supabaseClient;
}
