/**
 * Versioned-RPC fallback.
 *
 * Migrations stop at staging (repo convention — the team promotes to prod by
 * hand), so a newer RPC reliably exists in one environment before the other.
 * A client that hard-cuts over to the new name breaks every device pointed at
 * the environment that hasn't received the migration yet.
 *
 * The established idiom for this lives in hooks/pos/useOrdersQuery.ts
 * (get_active_orders_v1 -> PostgREST embed). This module generalises it so the
 * "is the function missing?" test isn't hand-rolled at each new call site —
 * it was already duplicated across useOrdersQuery, floorPlanService,
 * orderService and offlineSyncInit.
 *
 * The absent-function memo matters: without it every poll pays a wasted
 * round-trip forever. The KDS board polls every 15-30s per station, so on an
 * environment missing the new RPC that would be a permanent tax on the hot path
 * — the exact thing this work exists to remove.
 */

/**
 * True when the error means "that function isn't deployed here".
 *
 * 42883  = Postgres  undefined_function
 * PGRST202 = PostgREST "function not found in schema cache" (same root cause,
 *            surfaced before the statement ever reaches Postgres)
 *
 * Any other code is a REAL error and must propagate — never silently fall back
 * on a permission error, a deadline, or a constraint violation.
 */
export function isMissingFunctionError(error: unknown): boolean {
  const code = (error as { code?: string } | null | undefined)?.code;
  return code === "PGRST202" || code === "42883";
}

/** Function names already proven absent in this environment, per session. */
const knownAbsent = new Set<string>();

/** Test seam — jest has no way to restart the module otherwise. */
export function __resetRpcFallbackMemo(): void {
  knownAbsent.clear();
}

export interface RpcResult<T> {
  data: T | null;
  error: unknown;
}

export interface RpcFallbackResult<T> extends RpcResult<T> {
  /** True when the legacy path produced this result. Useful for telemetry. */
  usedFallback: boolean;
}

/**
 * Call `preferred`; on "function not deployed", call `legacy` instead and
 * remember the absence so later calls skip the doomed probe entirely.
 *
 * Both callbacks should apply the same deadline/abort signal as the caller
 * would have applied to a single call — this helper deliberately does not wrap
 * them, so it composes with runWithDeadline/withDeadline rather than competing
 * with them.
 */
export async function rpcWithVersionFallback<T>(
  preferredName: string,
  preferred: () => Promise<RpcResult<T>>,
  legacy: () => Promise<RpcResult<T>>,
): Promise<RpcFallbackResult<T>> {
  if (!knownAbsent.has(preferredName)) {
    const res = await preferred();

    if (!res.error) return { ...res, usedFallback: false };

    // A real failure (permissions, deadline, bad args) must NOT be masked by
    // silently retrying the old function — that would hide the actual fault
    // and double the latency of every failure.
    if (!isMissingFunctionError(res.error)) {
      return { ...res, usedFallback: false };
    }

    knownAbsent.add(preferredName);
    if (__DEV__) {
      console.log(
        `[rpcVersionFallback] ${preferredName} not deployed here — using legacy path for the rest of this session`,
      );
    }
  }

  const res = await legacy();
  return { ...res, usedFallback: true };
}
