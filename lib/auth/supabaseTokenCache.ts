// lib/auth/supabaseTokenCache.ts
//
// The ONE token source for the shared Supabase client — REST requests and the
// Realtime socket both read it through supabase-js's `accessToken` callback.
// Pure TypeScript (no React), so the timing contract is unit-testable.
//
// Why this exists (2026-09-26 KDS "delayed batch" investigation):
//
//   1. Clerk session JWTs live 60 s. Clerk's own cache serves the same token
//      until 15 s before expiry, and the Realtime socket only learns about a
//      new token when something calls the callback (its 25 s heartbeat, a
//      join, or our hook). Left to chance, ~40% of rotations pushed the new
//      token AFTER the server had already expired the old one -> the server
//      closes the private channel -> reconnect -> refetch. Fix: a proactive
//      forced mint (`skipCache`) PROACTIVE_LEAD_MS before expiry, followed by
//      an explicit `realtime.setAuth()` push.
//
//   2. Clerk's mint has no timeout and React Native's OkHttp client has no
//      socket timeouts. A half-open TCP connection could pin the in-flight
//      mint for as long as the dead socket lived; every REST call, the
//      Realtime socket's own reconnect (it awaits the token callback) and every
//      channel resubscribe path waited on that one promise. Fix: callers wait
//      at most MINT_DEADLINE_MS, then get the still-valid cached token (we
//      refresh REFRESH_MARGIN_MS early, so it usually is) and the next caller
//      starts a FRESH mint with `skipCache` (Clerk dedupes plain calls onto
//      the hung request).
//
// Realtime note: `setAuth()` must be called WITHOUT a token. Passing one flips
// realtime-js into "manual token" mode and it stops invoking the callback on
// heartbeats (RealtimeClient._performAuth / _isManualToken).

import * as Sentry from "@sentry/react-native";

export interface ClerkGetTokenOptions {
  skipCache?: boolean;
}
export type ClerkGetToken = (
  options?: ClerkGetTokenOptions,
) => Promise<string | null>;

/** The subset of SupabaseClient the cache needs to push a token to the socket. */
export interface RealtimeAuthTarget {
  realtime: { setAuth: () => Promise<void> };
}

/** Hand out only tokens with at least this much life left. */
export const REFRESH_MARGIN_MS = 40_000;
/** Force a fresh mint this long before expiry and push it to the socket. */
export const PROACTIVE_LEAD_MS = 35_000;
/** Longest any caller waits on a Clerk mint before falling back. */
export const MINT_DEADLINE_MS = 10_000;
/** Retry cadence for a failed proactive mint while the token is still alive. */
const PROACTIVE_RETRY_MS = 5_000;

let getTokenImpl: ClerkGetToken | null = null;
let realtimeTarget: RealtimeAuthTarget | null = null;

let cachedToken: string | null = null;
let cachedTokenExpMs = 0;
let inFlight: Promise<string | null> | null = null;
/** After a deadline/failure, the next mint bypasses Clerk's in-flight dedupe. */
let forceNextMint = false;
let mintStalledSince: number | null = null;
let proactiveTimer: ReturnType<typeof setTimeout> | null = null;

export function setClerkGetToken(fn: ClerkGetToken | null): void {
  getTokenImpl = fn;
}

export function hasClerkGetToken(): boolean {
  return getTokenImpl !== null;
}

export function setRealtimeAuthTarget(target: RealtimeAuthTarget | null): void {
  realtimeTarget = target;
}

/** Epoch ms of the cached token's `exp` (0 when nothing is cached). */
export function getCachedTokenExpMs(): number {
  return cachedTokenExpMs;
}

export function decodeJwtExpMs(token: string): number {
  try {
    const payload = token.split(".")[1];
    if (!payload) return 0;
    // base64url -> base64
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

function breadcrumb(
  message: string,
  level: "info" | "warning",
  data?: Record<string, unknown>,
): void {
  try {
    Sentry.addBreadcrumb({ category: "auth.token", level, message, data });
  } catch {
    /* telemetry must never break auth */
  }
}

function clearProactiveTimer(): void {
  if (proactiveTimer) {
    clearTimeout(proactiveTimer);
    proactiveTimer = null;
  }
}

function scheduleProactiveRefresh(delayMs?: number): void {
  clearProactiveTimer();
  if (!cachedToken || !cachedTokenExpMs) return;
  const delay =
    delayMs ?? Math.max(1_000, cachedTokenExpMs - PROACTIVE_LEAD_MS - Date.now());
  proactiveTimer = setTimeout(() => {
    proactiveTimer = null;
    void proactiveRefresh();
  }, delay);
}

/**
 * Store a mint result. A stalled mint that resolves late must never replace a
 * newer token, so an older `exp` is ignored.
 */
function cacheToken(token: string | null): void {
  if (token) {
    const exp = decodeJwtExpMs(token);
    if (cachedToken && exp !== 0 && exp < cachedTokenExpMs) return;
    cachedToken = token;
    // Undecodable exp -> treat as immediately stale (0) so we never pin a
    // token we can't reason about; the per-call path then re-mints each time.
    cachedTokenExpMs = exp;
    if (mintStalledSince !== null) {
      breadcrumb("mint_recovered", "info", {
        stalledForMs: Date.now() - mintStalledSince,
      });
      mintStalledSince = null;
    }
    scheduleProactiveRefresh();
  } else {
    // Signed out / no session: drop the dead token and stop refreshing.
    cachedToken = null;
    cachedTokenExpMs = 0;
    clearProactiveTimer();
  }
}

/** Start (or join) the single in-flight mint. */
function startMint(skipCache: boolean): Promise<string | null> {
  if (inFlight) return inFlight;
  const fn = getTokenImpl;
  // No Clerk hook wired yet (first render race): nothing to await, and we
  // must not park a resolved promise in the in-flight slot.
  if (!fn) return Promise.resolve(null);
  let attempt: Promise<string | null> | null = null;
  attempt = (async () => {
    try {
      const fresh = (await fn(skipCache ? { skipCache: true } : undefined)) ?? null;
      forceNextMint = false;
      cacheToken(fresh);
      return fresh;
    } finally {
      // `attempt` is assigned before the first await resolves, so it is
      // always set by the time we get here.
      if (attempt !== null && inFlight === attempt) inFlight = null;
    }
  })();
  inFlight = attempt;
  return attempt;
}

interface RaceResult {
  timedOut: boolean;
  value: string | null;
  error: unknown;
}

function raceWithDeadline(
  p: Promise<string | null>,
  ms: number,
): Promise<RaceResult> {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({ timedOut: true, value: null, error: null });
    }, ms);
    p.then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ timedOut: false, value, error: null });
      },
      (error: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ timedOut: false, value: null, error });
      },
    );
  });
}

/** Detach a stalled mint so the next caller can start a fresh one. */
function detachStalledMint(attempt: Promise<string | null>, reason: string): void {
  if (inFlight === attempt) inFlight = null;
  forceNextMint = true;
  if (mintStalledSince === null) mintStalledSince = Date.now();
  breadcrumb("mint_timeout", "warning", {
    reason,
    deadlineMs: MINT_DEADLINE_MS,
    cachedTokenLifeMs: cachedToken ? cachedTokenExpMs - Date.now() : null,
  });
}

function cachedIfStillValid(): string | null {
  return cachedToken && Date.now() < cachedTokenExpMs ? cachedToken : null;
}

/**
 * supabase-js `accessToken` callback. Returns a STABLE cached token (refreshed
 * REFRESH_MARGIN_MS before expiry) so back-to-back requests see the same
 * string, and never waits longer than MINT_DEADLINE_MS on Clerk.
 */
export async function getSupabaseAccessToken(): Promise<string | null> {
  const now = Date.now();
  if (cachedToken && now < cachedTokenExpMs - REFRESH_MARGIN_MS) {
    return cachedToken;
  }
  const attempt = startMint(forceNextMint);
  const result = await raceWithDeadline(attempt, MINT_DEADLINE_MS);
  if (result.timedOut) {
    detachStalledMint(attempt, "request");
    return cachedIfStillValid();
  }
  if (result.error) {
    forceNextMint = true;
    breadcrumb("mint_failed", "warning", {
      reason: "request",
      error: result.error instanceof Error ? result.error.message : String(result.error),
    });
    return cachedIfStillValid();
  }
  return result.value;
}

/**
 * Forced refresh PROACTIVE_LEAD_MS before expiry, then push to the socket.
 * Exported for tests and for an explicit "refresh now" (e.g. foreground).
 */
export async function proactiveRefresh(): Promise<void> {
  if (!getTokenImpl || !cachedToken) return;
  const attempt = startMint(true);
  const result = await raceWithDeadline(attempt, MINT_DEADLINE_MS);
  if (result.timedOut) {
    detachStalledMint(attempt, "proactive");
  } else if (result.error) {
    forceNextMint = true;
    breadcrumb("mint_failed", "warning", {
      reason: "proactive",
      error: result.error instanceof Error ? result.error.message : String(result.error),
    });
  } else if (result.value) {
    await pushTokenToRealtime();
    return;
  }
  // Failed: keep trying while the current token is still alive; once it has
  // expired the per-request path (heartbeat every 25 s) owns the retry.
  if (cachedToken && Date.now() < cachedTokenExpMs) {
    scheduleProactiveRefresh(PROACTIVE_RETRY_MS);
  }
}

/**
 * Ask realtime-js to re-read the callback and push the (changed) token to every
 * joined channel. No-arg on purpose — see the header. Never throws.
 */
export async function pushTokenToRealtime(): Promise<void> {
  const target = realtimeTarget;
  if (!target) return;
  try {
    await target.realtime.setAuth();
  } catch (err) {
    breadcrumb("realtime_setauth_failed", "warning", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/** Clear the cached JWT (sign-out) so the next call fetches fresh. */
export function clearSupabaseTokenCache(): void {
  cachedToken = null;
  cachedTokenExpMs = 0;
  inFlight = null;
  forceNextMint = false;
  mintStalledSince = null;
  clearProactiveTimer();
}

/** Test seam: full reset including the wiring. */
export function __resetSupabaseTokenCacheForTest(): void {
  clearSupabaseTokenCache();
  getTokenImpl = null;
  realtimeTarget = null;
}
