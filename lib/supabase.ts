import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { realtimeConfig } from "@/lib/realtimeConfig";
import * as Sentry from "@sentry/react-native";

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

/**
 * Capture a Supabase RPC error in Sentry with the RPC function name as a tag.
 * Use this for errors that are caught and handled gracefully (returned as { success: false })
 * so they still get visibility in Sentry without crashing the app.
 */
export function captureRpcError(rpcName: string, error: any) {
  const err = error instanceof Error ? error : new Error(error?.message ?? String(error));
  Sentry.captureException(err, {
    tags: { rpc: rpcName, source: "supabase_rpc" },
    level: "error",
  });
}
