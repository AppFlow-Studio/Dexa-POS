/**
 * Online Order Drawer Store
 *
 * Drives the global right-edge online-orders tab + slide-out drawer.
 *
 * "Seen" semantics: `seenOrderIds` is the set of active online orders this
 * station has viewed (keyed by `db_order_id ?? local id` — the same key the
 * Kanban uses). The edge-tab badge counts active online orders NOT in this
 * set. The set is DEVICE-LOCAL (MMKV) by design — each station tracks its
 * own unseen badge; accepting an order is still the only cross-station
 * acknowledgment.
 *
 * The edge tab's vertical position also lives here (`tabPositionY`, a 0..1
 * fraction of the draggable track) so staff can drag the tab clear of
 * whatever it covers and have it stay where they put it across restarts.
 *
 * Growth is self-limiting without a prune job: `openDrawer` REPLACES the set
 * with exactly the current active order keys (mark-all-seen + prune in one
 * write), and `markManySeen` only ever adds keys that are active at that
 * moment. The set therefore never exceeds the active online order count as
 * of the last drawer open.
 */

import { createLazyPersistStorage } from "@/lib/storage";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";

interface OnlineOrderDrawerState {
  isOpen: boolean;
  /** Active online orders this station has viewed. Key = db_order_id ?? id. */
  seenOrderIds: Record<string, true>;
  /**
   * Vertical position of the right-edge tab as a 0..1 fraction of the
   * draggable track (0 = top, 1 = bottom). A fraction rather than pixels so
   * the tab keeps its relative spot across screen sizes and UI scale changes.
   */
  tabPositionY: number;

  /**
   * Open the drawer and mark every currently-active online order as seen.
   * Replaces the seen set wholesale, which also prunes keys for orders that
   * are no longer active.
   */
  openDrawer: (activeOrderKeys: string[]) => void;
  closeDrawer: () => void;
  toggleDrawer: (activeOrderKeys: string[]) => void;
  /**
   * Mark orders seen while the drawer is already open (new arrivals the
   * staff member is looking at). Additive; no-ops (skips the set() entirely)
   * when every key is already present so callers can fire it from effects
   * without churning subscribers.
   */
  markManySeen: (orderKeys: string[]) => void;
  /** Persist a new tab position. Clamped to 0..1. */
  setTabPositionY: (fraction: number) => void;
}

/** Matches the tab's original hardcoded `top: "38%"` dock position. */
export const DEFAULT_TAB_POSITION_Y = 0.38;

export const useOnlineOrderDrawerStore = create<OnlineOrderDrawerState>()(
  persist(
    immer((set, get) => ({
      isOpen: false,
      seenOrderIds: {},
      tabPositionY: DEFAULT_TAB_POSITION_Y,

      openDrawer: (activeOrderKeys: string[]) => {
        const next: Record<string, true> = {};
        for (const key of activeOrderKeys) next[key] = true;
        set((state) => {
          state.isOpen = true;
          state.seenOrderIds = next;
        });
      },

      closeDrawer: () => {
        if (!get().isOpen) return;
        set((state) => {
          state.isOpen = false;
        });
      },

      toggleDrawer: (activeOrderKeys: string[]) => {
        if (get().isOpen) {
          get().closeDrawer();
        } else {
          get().openDrawer(activeOrderKeys);
        }
      },

      markManySeen: (orderKeys: string[]) => {
        const seen = get().seenOrderIds;
        let hasNew = false;
        for (const key of orderKeys) {
          if (!seen[key]) {
            hasNew = true;
            break;
          }
        }
        if (!hasNew) return; // no-op: keep reference stable for subscribers
        set((state) => {
          for (const key of orderKeys) {
            state.seenOrderIds[key] = true;
          }
        });
      },

      setTabPositionY: (fraction: number) => {
        const next = Math.max(0, Math.min(1, fraction));
        if (get().tabPositionY === next) return;
        set((state) => {
          state.tabPositionY = next;
        });
      },
    })),
    {
      name: "online-order-drawer-storage",
      storage: createLazyPersistStorage(),
      version: 1,
      migrate: (persistedState) => persistedState as any,
      // isOpen is intentionally NOT persisted — the drawer always boots closed.
      partialize: (state) => ({
        seenOrderIds: state.seenOrderIds,
        tabPositionY: state.tabPositionY,
      }),
    },
  ),
);

// ============================================================================
// GRANULAR SELECTORS
// ============================================================================

/** Selector for isOpen — use in the tab/drawer wrapper components. */
export const selectIsOpen = (state: OnlineOrderDrawerState) => state.isOpen;

/** Selector for the seen set — used by the unseen-count selector. */
export const selectSeenOrderIds = (state: OnlineOrderDrawerState) =>
  state.seenOrderIds;

/** Selector for the edge tab's dragged vertical position (0..1). */
export const selectTabPositionY = (state: OnlineOrderDrawerState) =>
  state.tabPositionY;
