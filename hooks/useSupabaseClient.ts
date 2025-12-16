import { createSupabaseClient } from "@/lib/supabase";
import { useSession } from "@clerk/clerk-expo";
import { useMemo } from "react";

/**
 * Hook that creates a Supabase client authenticated with Clerk session.
 * The client is memoized and will update when the session changes.
 */
export function useSupabaseClient() {
  const { session } = useSession();

  const supabaseClient = useMemo(() => {
    return createSupabaseClient(async () => {
      if (!session) return null;
      return session.getToken() ?? null;
    });
  }, [session]);

  return supabaseClient;
}
