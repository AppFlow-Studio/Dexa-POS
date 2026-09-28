import { useAuth } from "@clerk/clerk-expo";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { useEffect, useRef } from "react";
import { realtimeConfig } from "@/lib/realtimeConfig";
import {
  noteRequestEnd,
  noteRequestStart,
} from "@/lib/telemetry/resumeRequests";
import {
  clearSupabaseTokenCache,
  getCachedTokenExpMs,
  getSupabaseAccessToken,
  hasClerkGetToken,
  setClerkGetToken,
  setRealtimeAuthTarget,
  type ClerkGetTokenOptions,
} from "@/lib/auth/supabaseTokenCache";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_KEY!;

// ---------------------------------------------------------------------------
// Token plumbing lives in lib/auth/supabaseTokenCache (pure TS, unit-tested):
// a STABLE cached Clerk JWT for supabase-js's accessToken() callback (so
// back-to-back RPCs see the same string and Realtime doesn't re-auth on every
// send), a bounded mint (a hung Clerk request can no longer pin REST and the
// Realtime socket), and a proactive refresh + `realtime.setAuth()` push before
// expiry so the server never closes a private channel on an expired token.
// This hook only wires Clerk's getToken into it and owns the singleton client.
// ---------------------------------------------------------------------------
export { clearSupabaseTokenCache, getCachedTokenExpMs };

// Single shared client for the entire app lifetime. One WebSocket connection
// to Supabase Realtime, shared across all 66+ call sites.
let sharedClient: SupabaseClient | null = null;

// Dev-only payload-size logger. RN's NetworkingModule materializes whole HTTP
// bodies into a single Java String — a multi-MB response can OOM Android even
// when the JS heap is fine. Anything above the threshold gets a console.warn
// so the next outlier surfaces immediately during dev.
const PAYLOAD_WARN_BYTES = 1_000_000; // 1 MB

/**
 * Always-on request accounting for the resume-window telemetry. Two integer
 * updates per request; records nothing unless a resume window is open. This
 * is what produces the before/after concurrent-request numbers for the
 * lifecycle-coordinator work, so it must NOT be __DEV__-gated — the
 * measurement has to be available on the tablet builds under test.
 */
const countedFetch: typeof fetch = async (input, init) => {
  noteRequestStart();
  try {
    return await fetch(input, init);
  } finally {
    noteRequestEnd();
  }
};

const instrumentedFetch: typeof fetch | undefined = __DEV__
  ? async (input, init) => {
      const start = Date.now();
      const response = await countedFetch(input, init);
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
      // One token source for REST and the Realtime socket; realtime-js re-reads
      // it on connect, every heartbeat and every join, and the cache pushes a
      // fresh token proactively before expiry.
      accessToken: getSupabaseAccessToken,
      realtime: realtimeConfig,
      // instrumentedFetch already wraps countedFetch in dev; in production we
      // still need the counting layer, just not the payload logging.
      global: { fetch: instrumentedFetch ?? countedFetch },
    });
    setRealtimeAuthTarget(sharedClient);
  }
  return sharedClient;
}

/**
 * Returns the app-wide singleton Supabase client.
 * All components share the same client and WebSocket connection.
 */
export function useSupabaseClient(): SupabaseClient {
  const { getToken } = useAuth();

  // Keep the token cache's Clerk hook current without recreating the client.
  // getToken identity can change between renders; the ref always points at
  // the latest one and options (skipCache) pass straight through.
  const getTokenStable = useRef(getToken);
  getTokenStable.current = getToken;

  useEffect(() => {
    setClerkGetToken((options?: ClerkGetTokenOptions) =>
      getTokenStable.current(options),
    );
  }, []);

  // Set immediately on first render too (before useEffect fires)
  if (!hasClerkGetToken()) {
    setClerkGetToken((options?: ClerkGetTokenOptions) =>
      getTokenStable.current(options),
    );
  }

  return getSharedClient();
}
