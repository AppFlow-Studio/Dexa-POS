/**
 * supabaseTokenCache — the single token source for REST + Realtime.
 *
 * Timing contract exercised with fake timers (no Clerk, no network):
 *   - a cached token is served until REFRESH_MARGIN_MS before exp, then a
 *     new mint happens (one Clerk call per rotation, not per request)
 *   - a HUNG mint never pins callers longer than MINT_DEADLINE_MS: they get
 *     the still-valid cached token, and the next call starts a FRESH mint
 *     with skipCache (Clerk dedupes plain calls onto the hung request)
 *   - a proactive forced mint fires PROACTIVE_LEAD_MS before exp and pushes
 *     the new token to the Realtime socket via setAuth() (no-arg)
 *   - a null token (signed out) clears the cache and stops the timer
 */

jest.mock("@sentry/react-native", () => ({
  addBreadcrumb: jest.fn(),
  captureException: jest.fn(),
  setTag: jest.fn(),
}));

import {
  __resetSupabaseTokenCacheForTest,
  getCachedTokenExpMs,
  getSupabaseAccessToken,
  MINT_DEADLINE_MS,
  PROACTIVE_LEAD_MS,
  REFRESH_MARGIN_MS,
  setClerkGetToken,
  setRealtimeAuthTarget,
} from "../lib/auth/supabaseTokenCache";

const TOKEN_LIFETIME_MS = 60_000;

function makeJwt(expMs: number, tag: string): string {
  const payload = Buffer.from(
    JSON.stringify({ exp: Math.floor(expMs / 1000), sub: "user_1", tag }),
  )
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `hdr.${payload}.sig`;
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date("2026-09-26T12:00:00Z"));
  __resetSupabaseTokenCacheForTest();
});

afterEach(() => {
  __resetSupabaseTokenCacheForTest();
  jest.useRealTimers();
});

describe("supabaseTokenCache", () => {
  it("serves the cached token until REFRESH_MARGIN before exp, then re-mints once", async () => {
    let mints = 0;
    const getToken = jest.fn(async () => {
      mints += 1;
      return makeJwt(Date.now() + TOKEN_LIFETIME_MS, `t${mints}`);
    });
    setClerkGetToken(getToken);

    const first = await getSupabaseAccessToken();
    const again = await getSupabaseAccessToken();
    expect(first).toBe(again);
    expect(getToken).toHaveBeenCalledTimes(1);
    expect(getCachedTokenExpMs()).toBe(Date.now() + TOKEN_LIFETIME_MS);

    // Still inside the margin-safe window: no new mint.
    jest.advanceTimersByTime(TOKEN_LIFETIME_MS - REFRESH_MARGIN_MS - 1_000);
    expect(await getSupabaseAccessToken()).toBe(first);
    expect(getToken).toHaveBeenCalledTimes(1);

    // Cross into the margin: exactly one new mint, new string.
    jest.advanceTimersByTime(2_000);
    const fresh = await getSupabaseAccessToken();
    expect(fresh).not.toBe(first);
    expect(getToken).toHaveBeenCalledTimes(2);
  });

  it("bounds a hung mint: caller gets the still-valid cached token, next call retries with skipCache", async () => {
    const calls: ({ skipCache?: boolean } | undefined)[] = [];
    let hang = false;
    const getToken = jest.fn(async (options?: { skipCache?: boolean }) => {
      calls.push(options);
      if (hang) {
        return new Promise<string | null>(() => {
          /* never resolves: half-open socket */
        });
      }
      return makeJwt(Date.now() + TOKEN_LIFETIME_MS, `t${calls.length}`);
    });
    setClerkGetToken(getToken);

    const initial = await getSupabaseAccessToken();
    expect(initial).not.toBeNull();

    // Move inside the refresh margin and make Clerk hang.
    jest.advanceTimersByTime(TOKEN_LIFETIME_MS - REFRESH_MARGIN_MS + 1_000);
    hang = true;

    const pending = getSupabaseAccessToken();
    await jest.advanceTimersByTimeAsync(MINT_DEADLINE_MS + 10);
    const fallback = await pending;
    // The old token still has ~39 s of life: hand it out rather than hang.
    expect(fallback).toBe(initial);
    expect(calls).toHaveLength(2);
    expect(calls[1]).toBeUndefined();

    // The stalled attempt is detached: the next caller starts a FRESH mint
    // and asks Clerk to bypass its in-flight cache.
    hang = false;
    const recovered = await getSupabaseAccessToken();
    expect(recovered).not.toBe(initial);
    expect(calls).toHaveLength(3);
    expect(calls[2]).toEqual({ skipCache: true });
  });

  it("returns null (not a hang) when Clerk stays stuck past the cached token's expiry", async () => {
    let hang = false;
    const getToken = jest.fn(async () => {
      if (hang) return new Promise<string | null>(() => {});
      return makeJwt(Date.now() + TOKEN_LIFETIME_MS, "t");
    });
    setClerkGetToken(getToken);
    await getSupabaseAccessToken();

    // Clerk wedges right after the first mint: the proactive refresh (and its
    // 5 s retries) all hang and are detached, none can produce a token.
    hang = true;
    await jest.advanceTimersByTimeAsync(TOKEN_LIFETIME_MS + 1_000);
    expect(getToken.mock.calls.length).toBeGreaterThan(1);

    const pending = getSupabaseAccessToken();
    await jest.advanceTimersByTimeAsync(MINT_DEADLINE_MS + 10);
    // Expired + stuck: surface null (a visible 401) rather than hanging the
    // request, the Realtime reconnect, and every resubscribe path behind it.
    expect(await pending).toBeNull();
  });

  it("proactively force-mints PROACTIVE_LEAD_MS before exp and pushes to the socket", async () => {
    const calls: ({ skipCache?: boolean } | undefined)[] = [];
    const getToken = jest.fn(async (options?: { skipCache?: boolean }) => {
      calls.push(options);
      return makeJwt(Date.now() + TOKEN_LIFETIME_MS, `t${calls.length}`);
    });
    const setAuth = jest.fn(async () => {});
    setClerkGetToken(getToken);
    setRealtimeAuthTarget({ realtime: { setAuth } });

    const first = await getSupabaseAccessToken();
    const expMs = getCachedTokenExpMs();

    // Just before the lead time: nothing yet.
    await jest.advanceTimersByTimeAsync(expMs - PROACTIVE_LEAD_MS - Date.now() - 500);
    expect(calls).toHaveLength(1);
    expect(setAuth).not.toHaveBeenCalled();

    // At exp − lead: forced mint + one setAuth() push, no-arg.
    await jest.advanceTimersByTimeAsync(600);
    expect(calls).toHaveLength(2);
    expect(calls[1]).toEqual({ skipCache: true });
    expect(setAuth).toHaveBeenCalledTimes(1);
    expect(setAuth).toHaveBeenCalledWith();

    // Callers now see the fresh token without another Clerk call.
    const now = await getSupabaseAccessToken();
    expect(now).not.toBe(first);
    expect(calls).toHaveLength(2);
  });

  it("re-arms the proactive refresh for the new token (one mint per rotation)", async () => {
    let mints = 0;
    const getToken = jest.fn(async () => {
      mints += 1;
      return makeJwt(Date.now() + TOKEN_LIFETIME_MS, `t${mints}`);
    });
    setClerkGetToken(getToken);
    setRealtimeAuthTarget({ realtime: { setAuth: jest.fn(async () => {}) } });

    await getSupabaseAccessToken();
    // Three full rotations, no requests in between: the proactive timer alone
    // keeps the token fresh — one mint per (lifetime − lead) window.
    await jest.advanceTimersByTimeAsync(3 * (TOKEN_LIFETIME_MS - PROACTIVE_LEAD_MS) + 100);
    expect(mints).toBe(4);
  });

  it("drops the cache and the timer when Clerk reports no session", async () => {
    let signedOut = false;
    const getToken = jest.fn(async () =>
      signedOut ? null : makeJwt(Date.now() + TOKEN_LIFETIME_MS, "t"),
    );
    const setAuth = jest.fn(async () => {});
    setClerkGetToken(getToken);
    setRealtimeAuthTarget({ realtime: { setAuth } });

    await getSupabaseAccessToken();
    signedOut = true;
    jest.advanceTimersByTime(TOKEN_LIFETIME_MS - REFRESH_MARGIN_MS + 1_000);
    expect(await getSupabaseAccessToken()).toBeNull();
    expect(getCachedTokenExpMs()).toBe(0);

    // No proactive push for a dead session.
    await jest.advanceTimersByTimeAsync(TOKEN_LIFETIME_MS);
    expect(setAuth).not.toHaveBeenCalled();
  });
});
