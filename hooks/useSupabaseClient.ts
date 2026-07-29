import { useAuth } from "@clerk/clerk-expo";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { useEffect, useRef } from "react";
import { realtimeConfig } from "@/lib/realtimeConfig";
import {
  noteRequestEnd,
  noteRequestStart,
} from "@/lib/telemetry/resumeRequests";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_KEY!;

// Module-level getToken ref — updated by whichever component mounts first,
// kept current by every subsequent render. All calls to the singleton client
// read this ref, so tokens are always fresh without recreating the client.
const getTokenRef = { current: null as (() => Promise<string | null>) | null };

// ---------------------------------------------------------------------------
// JWT cache for the Supabase accessToken() callback.
//
// Clerk's getToken() rotates the session JWT (~60s lifetime). Supabase's
// accessToken option calls our callback on EVERY request, and supabase-js feeds
// that token to the Realtime socket — when the token STRING changes, Realtime
// re-authenticates by tearing down and re-subscribing every channel. With one
// authenticated RPC per item-add, that meant both POS channels dropped on every
// send (→ reconnect + "pending items block timed out" + a redundant floor
// refetch, inflating pos.add_to_cart well past budget).
//
// Fix: hold the last token and its decoded exp; only call Clerk again when the
// cached token is missing or within REFRESH_MARGIN_MS of expiry. Back-to-back
// RPCs then see the SAME token string, so Realtime stops re-authing. A 30s
// margin means we always hand out a token with >=30s of life left — ample for
// any in-flight request — while still refreshing before it can actually expire.
// ---------------------------------------------------------------------------
const REFRESH_MARGIN_MS = 30_000;
let cachedToken: string | null = null;
let cachedTokenExpMs = 0;
// Coalesce concurrent refreshes so a burst of parallel requests triggers one
// Clerk call, not N.
let inFlightTokenFetch: Promise<string | null> | null = null;

function decodeJwtExpMs(token: string): number {
  try {
    const payload = token.split(".")[1];
    if (!payload) return 0;
    // base64url → base64
    const b64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const json = globalThis.atob
      ? globalThis.atob(b64)
      : Buffer.from(b64, "base64").toString("binary");
    const exp = JSON.parse(json)?.exp;
    return typeof exp === "number" ? exp * 1000 : 0;
  } catch {
    return 0;
  }
}

async function getCachedAccessToken(): Promise<string | null> {
  const now = Date.now();
  if (cachedToken && now < cachedTokenExpMs - REFRESH_MARGIN_MS) {
    return cachedToken;
  }
  if (inFlightTokenFetch) return inFlightTokenFetch;

  inFlightTokenFetch = (async () => {
    try {
      const fresh = (await getTokenRef.current?.()) ?? null;
      if (fresh) {
        cachedToken = fresh;
        // If exp can't be decoded, treat as immediately stale (exp=0) so we
        // never pin a token we can't reason about — falls back to per-call
        // fetch, i.e. the old behavior, only for undecodable tokens.
        cachedTokenExpMs = decodeJwtExpMs(fresh);
      } else {
        // getToken returned null (signed out / no session) — drop any stale
        // cached token so we don't keep handing out a dead JWT post-sign-out.
        cachedToken = null;
        cachedTokenExpMs = 0;
      }
      return fresh;
    } finally {
      inFlightTokenFetch = null;
    }
  })();
  return inFlightTokenFetch;
}

/** Clear the cached JWT (e.g. on sign-out) so the next call fetches fresh. */
export function clearSupabaseTokenCache(): void {
  cachedToken = null;
  cachedTokenExpMs = 0;
  inFlightTokenFetch = null;
}

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
        // Return a STABLE cached token (refreshed only near expiry) so per-RPC
        // calls don't surface a rotated JWT that makes Realtime drop channels.
        return getCachedAccessToken();
      },
      realtime: realtimeConfig,
      // instrumentedFetch already wraps countedFetch in dev; in production we
      // still need the counting layer, just not the payload logging.
      global: { fetch: instrumentedFetch ?? countedFetch },
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
