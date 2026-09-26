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
// Must stay above the 25s Realtime heartbeat (lib/realtimeConfig.ts).
const REFRESH_MARGIN_MS = 30_000;

// Optional Clerk JWT template for Supabase (plan Phase 6.3). The ~60s session
// token rotates every ~30s with the margin above, and each rotation re-auths
// every Realtime channel (an authorization query per private channel). A
// template with a 5-minute lifetime rotates every ~4.5 min instead. The
// template must be registered in Supabase's Clerk third-party auth and carry
// the claims the database reads: role = "authenticated", sub, org.id, email.
// Unset (default): the session token, exactly as before.
const CLERK_SUPABASE_JWT_TEMPLATE =
  process.env.EXPO_PUBLIC_CLERK_SUPABASE_JWT_TEMPLATE || undefined;
const GET_TOKEN_OPTIONS = CLERK_SUPABASE_JWT_TEMPLATE
  ? { template: CLERK_SUPABASE_JWT_TEMPLATE }
  : undefined;
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
    getTokenRef.current = () => getTokenStable.current(GET_TOKEN_OPTIONS);
  }, []);

  // Set immediately on first render too (before useEffect fires)
  if (!getTokenRef.current) {
    getTokenRef.current = () => getTokenStable.current(GET_TOKEN_OPTIONS);
  }

  return getSharedClient();
}
