/**
 * "Can this screen save an inventory change right now?" — Phase 5.
 *
 * Inventory reads come from the local mirror and work offline; inventory WRITES
 * do not, and will not until the outbox lands in Track B. The refusal itself is
 * enforced in `useInventoryStore` (one choke point, so no call site can forget
 * it) — this hook exists so the refusal is visible BEFORE someone fills in a
 * purchase order, rather than after.
 *
 * That is the whole reason it is worth a hook: these writes already failed
 * offline. What Phase 5 changes is *when* the operator finds out, and whether
 * the reason is "Failed to log payment" or "You're offline".
 *
 * `rawIsOnline`, deliberately, not the quality-adjusted `isOnline`: a slow
 * connection should keep working in the background rather than lock the screen,
 * which is the rule `useNetworkStatus` already documents for UI affordances.
 */
import { useCallback, useMemo, useSyncExternalStore } from "react";

import { toastService } from "@/lib/toastService";
import {
  getRawIsOnline,
  subscribeOnlineStatus,
} from "@/services/offlineSyncService";
import { InventoryOfflineError } from "@/stores/useInventoryStore";

export interface InventoryWriteGate {
  /** False while the device is offline. Disable submit controls on this. */
  canWrite: boolean;
  /**
   * Why not, ready to render — null when writes are allowed. Phrased for an
   * operator standing at the tablet, not for a log.
   */
  blockedReason: string | null;
  /**
   * Run a store write and surface an offline refusal as a toast instead of an
   * unhandled rejection.
   *
   * For the handlers that already `await` inside a `try/catch` this is
   * unnecessary — they report the failure themselves. It exists for the several
   * call sites that fire a write and never look at the promise, where the
   * refusal would otherwise be silent.
   *
   * Returns true when the write ran to completion.
   */
  runGuarded: (write: () => Promise<void> | void) => Promise<boolean>;
}

export const INVENTORY_OFFLINE_REASON =
  "You're offline. Inventory changes need a connection.";

export function useInventoryWriteGate(): InventoryWriteGate {
  const isOnline = useSyncExternalStore(
    subscribeOnlineStatus,
    getRawIsOnline,
    getRawIsOnline,
  );

  const runGuarded = useCallback(
    async (write: () => Promise<void> | void): Promise<boolean> => {
      try {
        await write();
        return true;
      } catch (error) {
        const offline = error instanceof InventoryOfflineError;
        toastService.show({
          type: offline ? "warning" : "error",
          title: offline ? "You're offline" : "Couldn't save",
          message: offline
            ? "Inventory changes need a connection. Nothing was saved."
            : ((error as Error)?.message ?? "Please try again."),
        });
        return false;
      }
    },
    [],
  );

  return useMemo(
    () => ({
      canWrite: isOnline,
      blockedReason: isOnline ? null : INVENTORY_OFFLINE_REASON,
      runGuarded,
    }),
    [isOnline, runGuarded],
  );
}
