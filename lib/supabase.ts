import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { realtimeConfig } from "@/lib/realtimeConfig";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_KEY!;

/**
 * Creates a Supabase client with Clerk session token for authentication.
 * The accessToken function is called on each request to get a fresh token.
 */
export const createSupabaseClient = (
  getToken: () => Promise<string | null>
): SupabaseClient => {

  return createClient(supabaseUrl, supabaseKey,
    {
      async accessToken() {
        return (await getToken()) ?? null;
      },
      realtime: realtimeConfig,
    }
  );
};
