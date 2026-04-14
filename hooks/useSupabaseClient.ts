import { useAuth } from "@clerk/clerk-expo";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { useEffect, useRef } from "react";
import { realtimeConfig } from "@/lib/realtimeConfig";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_KEY!;

// Module-level getToken ref — updated by whichever component mounts first,
// kept current by every subsequent render. All calls to the singleton client
// read this ref, so tokens are always fresh without recreating the client.
const getTokenRef = { current: null as (() => Promise<string | null>) | null };

// Single shared client for the entire app lifetime. One WebSocket connection
// to Supabase Realtime, shared across all 66+ call sites.
let sharedClient: SupabaseClient | null = null;

function getSharedClient(): SupabaseClient {
  if (!sharedClient) {
    sharedClient = createClient(supabaseUrl, supabaseKey, {
      async accessToken() {
        return (await getTokenRef.current?.()) ?? null;
      },
      realtime: realtimeConfig,
    });
  }
  return sharedClient;
}

/**
 * Returns the app-wide singleton Supabase client.
 * All components share the same client and WebSocket connection.
 */
export function useSupabaseClient(): SupabaseClient {
  const { getToken } = useAuth();

  // Keep the module-level ref current so the singleton always has a fresh token
  const getTokenStable = useRef(getToken);
  getTokenStable.current = getToken;

  useEffect(() => {
    getTokenRef.current = () => getTokenStable.current();
  }, []);

  // Set immediately on first render too (before useEffect fires)
  if (!getTokenRef.current) {
    getTokenRef.current = () => getTokenStable.current();
  }

  return getSharedClient();
}
