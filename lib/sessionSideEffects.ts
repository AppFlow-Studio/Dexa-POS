/**
 * Session side-effect registration and dispatch infrastructure.
 *
 * Side effects are plain async functions registered at app startup — not React
 * hooks, not useEffects. They fire asynchronously (via queueMicrotask) after
 * the store commits an optimistic state update.
 */

import type { SessionAction, SessionActionType } from "@/lib/sessionActions";
import type { TableStatus } from "@/types/db-floor-plan-types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SideEffectContext {
  action: SessionAction;
  tableId: string;
  previousStatus: TableStatus | undefined;
  nextStatus: TableStatus | undefined;
  sessionId: string | undefined;
}

/**
 * Discriminated outcome of a kitchen send, returned by sendToKitchenEffect so
 * dispatchAction can carry the REAL result back to the caller (K6). Mirrors
 * KitchenSendCommitResult in useOrderStore.
 */
export type KitchenEffectOutcome =
  | { status: "sent" }
  | { status: "queued" }
  | { status: "rejected"; error: unknown }
  | { status: "skipped" };

export type SideEffectHandler = (ctx: SideEffectContext) => Promise<unknown>;

interface RegisteredEffect {
  actionTypes: Set<SessionActionType>;
  handler: SideEffectHandler;
  label: string;
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const registry: RegisteredEffect[] = [];

/**
 * Register a side effect handler for one or more action types.
 * Returns an unsubscribe function.
 */
export function registerSessionSideEffect(
  actionTypes: SessionActionType[],
  handler: SideEffectHandler,
  label: string,
): () => void {
  const entry: RegisteredEffect = {
    actionTypes: new Set(actionTypes),
    handler,
    label,
  };
  registry.push(entry);
  return () => {
    const idx = registry.indexOf(entry);
    if (idx >= 0) registry.splice(idx, 1);
  };
}

/**
 * Fire all registered effects whose actionTypes match the dispatched action.
 * Uses Promise.allSettled so one failing effect doesn't block others.
 *
 * Returns the fulfilled values (e.g. a KitchenEffectOutcome) so dispatchAction
 * can surface the real result when it opts in via `awaitEffects` (K6).
 */
export async function _fireEffects(ctx: SideEffectContext): Promise<unknown[]> {
  const matching = registry.filter((e) => e.actionTypes.has(ctx.action.type));
  if (matching.length === 0) return [];

  const results = await Promise.allSettled(
    matching.map(async (entry) => {
      try {
        return await entry.handler(ctx);
      } catch (err) {
        console.error(
          `[SessionSideEffect] "${entry.label}" failed for ${ctx.action.type}:`,
          err,
        );
        throw err; // re-throw so allSettled marks it rejected
      }
    }),
  );

  // Log any failures (non-fatal)
  for (let i = 0; i < results.length; i++) {
    if (results[i].status === "rejected") {
      console.warn(
        `[SessionSideEffect] "${matching[i].label}" rejected for ${ctx.action.type}`,
      );
    }
  }

  return results
    .filter(
      (r): r is PromiseFulfilledResult<unknown> => r.status === "fulfilled",
    )
    .map((r) => r.value);
}

/**
 * Clear all registered effects. For testing only.
 */
export function _clearAllEffects(): void {
  registry.length = 0;
}
