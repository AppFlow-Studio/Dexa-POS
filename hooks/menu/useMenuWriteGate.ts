/**
 * "Can this screen change menu data right now?" — menu management offline gate.
 *
 * Menu management reads come from the local cache and work offline; menu WRITES
 * (add / edit / delete / reorder / toggles) hit Supabase directly via
 * MenuService and do not. This hook makes that refusal visible BEFORE an
 * operator fills in a form or taps a toggle, rather than surfacing a failed
 * write afterwards.
 *
 * Mirrors `hooks/inventory/useInventoryWriteGate.ts` (same rule, same signal).
 *
 * `rawIsOnline`, deliberately, not the quality-adjusted `isOnline`: a slow
 * connection should keep working in the background rather than lock the screen,
 * which is the rule `useNetworkStatus` already documents for UI affordances.
 */
import { useSyncExternalStore } from "react";

import {
    getRawIsOnline,
    subscribeOnlineStatus,
} from "@/services/offlineSyncService";

export interface MenuWriteGate {
  /** False while the device is offline. Disables all add/edit/remove in menu management. */
  canWrite: boolean;
  /**
   * Why not, ready to render — null when writes are allowed. Phrased for an
   * operator standing at the tablet, not for a log.
   */
  blockedReason: string | null;
}

export const MENU_OFFLINE_REASON =
  "You're offline. Menu changes need a connection.";

export function useMenuWriteGate(): MenuWriteGate {
  const isOnline = useSyncExternalStore(
    subscribeOnlineStatus,
    getRawIsOnline,
    getRawIsOnline,
  );

  return {
    canWrite: isOnline,
    blockedReason: isOnline ? null : MENU_OFFLINE_REASON,
  };
}
