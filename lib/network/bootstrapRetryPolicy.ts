/**
 * Retry policy for the POS bootstrap (`pos_sync`).
 *
 * INCIDENT (prod, 2026-09-25). The bootstrap costs about 800 ms and tens of
 * thousands of buffers per call. One merchant's 17 stations refetched it on
 * every menu edit; once the database slowed, each call ran into the 8 s
 * statement timeout, and `retry: 4` turned every failure into five doomed
 * builds. Sixty attempts per ten minutes, 70% failing, slowed every location
 * for 90 minutes.
 *
 * The rule that falls out of it: a station that already has a menu on screen
 * has nothing to win by hammering. Only a station with an empty menu grid
 * keeps the full retry budget.
 *
 * Pure: no React, no Supabase, no timers. Classification is by Postgres /
 * PostgREST `code` first. A statement timeout (57014) arrives as an HTTP 5xx
 * (all 98 failed calls in the incident were 500), so going by status first
 * would file it under "server error" and retry it.
 */

export type BootstrapErrorKind =
  | "statement_timeout"
  | "build_in_progress"
  | "server_5xx"
  | "deadline"
  | "auth"
  | "missing_function"
  | "other";

/** An empty menu grid: the boot sync keeps its room. */
export const FIRST_LOAD_MAX_RETRIES = 4;
/** A menu is on screen: one more try, then wait for the next trigger. */
export const BACKGROUND_MAX_RETRIES = 1;

type ErrorLike = {
  name?: unknown;
  code?: unknown;
  status?: unknown;
};

export function classifyBootstrapError(error: unknown): BootstrapErrorKind {
  const e = (error ?? {}) as ErrorLike;
  const code = typeof e.code === "string" ? e.code : "";

  if (e.name === "DeadlineExceededError" || code === "DEADLINE_EXCEEDED") {
    return "deadline";
  }
  if (code === "57014") return "statement_timeout";
  // lock_not_available: another caller holds the build.
  if (code === "55P03") return "build_in_progress";
  if (code === "PGRST202" || code === "42883") return "missing_function";
  if (
    code === "42501" ||
    code === "42704" ||
    code === "PGRST301" ||
    code === "PGRST302"
  ) {
    return "auth";
  }

  const status = typeof e.status === "number" ? e.status : 0;
  if (status >= 500) return "server_5xx";
  return "other";
}

export function shouldRetryBootstrap(input: {
  /** TanStack's count BEFORE this decision: 0 on the first retry decision. */
  failureCount: number;
  error: unknown;
  /** A usable menu is already on screen, from any source. */
  hasData: boolean;
  /** The connection-quality state machine is in slow or probing. */
  isSlow: boolean;
}): boolean {
  const { failureCount, error, hasData, isSlow } = input;
  const kind = classifyBootstrapError(error);

  // Retrying cannot change either answer.
  if (kind === "auth" || kind === "missing_function") return false;
  // Someone else is building it: exactly one more look, in any mode.
  if (kind === "build_in_progress") return failureCount < 1;

  if (hasData) {
    // The server said it is overloaded. Asking again is the overload.
    if (kind === "statement_timeout") return false;
    if (kind === "server_5xx" && isSlow) return false;
    return failureCount < BACKGROUND_MAX_RETRIES;
  }

  return failureCount < FIRST_LOAD_MAX_RETRIES;
}

/**
 * Delay before retry number `failureCount + 1`. Jittered so stations that
 * failed together do not come back together.
 */
export function bootstrapRetryDelayMs(
  failureCount: number,
  error: unknown,
  rand: () => number = Math.random,
): number {
  if (classifyBootstrapError(error) === "build_in_progress") {
    return Math.round(2_000 + rand() * 3_000);
  }
  const base = Math.min(2_000 * 2 ** Math.max(0, failureCount), 30_000);
  return Math.round(base * (1 + rand() * 0.5));
}
