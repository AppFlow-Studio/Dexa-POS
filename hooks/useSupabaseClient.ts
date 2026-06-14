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

// Dev-only payload-size logger. RN's NetworkingModule materializes whole HTTP
// bodies into a single Java String — a multi-MB response can OOM Android even
// when the JS heap is fine. Anything above the threshold gets a console.warn
// so the next outlier surfaces immediately during dev.
const PAYLOAD_WARN_BYTES = 1_000_000; // 1 MB
const instrumentedFetch: typeof fetch | undefined = __DEV__
  ? async (input, init) => {
      const start = Date.now();
      const response = await fetch(input, init);
      try {
        const len = Number(response.headers.get("content-length") ?? 0);
        if (len >= PAYLOAD_WARN_BYTES) {
          const url =
            typeof input === "string"
              ? input
              : input instanceof URL
                ? input.toString()
                : (input as Request).url;
          // Strip query params for cleanliness — the path is what matters.
          const path = url.split("?")[0];
          // eslint-disable-next-line no-console
          console.warn(
            `[supabase payload] ${(len / 1_000_000).toFixed(2)}MB in ${
              Date.now() - start
            }ms — ${path}`,
          );
        }
      } catch {
        /* logging must never break the request */
      }
      return response;
    }
  : undefined;

function getSharedClient(): SupabaseClient {
  if (!sharedClient) {
    sharedClient = createClient(supabaseUrl, supabaseKey, {
      async accessToken() {
        return (await getTokenRef.current?.()) ?? null;
      },
      realtime: realtimeConfig,
      ...(instrumentedFetch
        ? { global: { fetch: instrumentedFetch } }
        : {}),
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
