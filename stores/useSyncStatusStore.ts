/**
 * Sync Status Store
 *
 * Phase 7D: Separate sync status from order items to prevent render cascades.
 *
 * Problem: When sync_status lives on CartItem, every status change causes
 * ordersById to update, triggering 30+ component re-renders.
 *
 * Solution: Move sync_status to a dedicated store. Only BillItem subscribes
 * to this store, so sync status changes only re-render the affected BillItem.
 *
 * Cross-device sync is NOT affected because:
 * - sync_status was always LOCAL-only state
 * - Broadcast merge logic uses db_order_item_id (not sync_status)
 * - Backend never stored sync_status
 */

import React from "react";
import { create } from "zustand";

export type SyncStatus = "pending" | "syncing" | "synced" | "failed";

interface SyncStatusState {
  // Maps item ID to sync status
  itemSyncStatus: Map<string, SyncStatus>;

  // Maps item ID to error message (for failed syncs)
  itemSyncErrors: Map<string, string>;

  // Actions
  setSyncStatus: (
    itemId: string,
    status: SyncStatus,
    error?: string
  ) => void;

  getSyncStatus: (itemId: string) => SyncStatus | undefined;

  getError: (itemId: string) => string | undefined;

  clearSyncStatus: (itemId: string) => void;

  clearAllForOrder: (itemIds: string[]) => void;

  // Bulk operations for performance
  setSyncStatusBatch: (
    updates: Array<{ itemId: string; status: SyncStatus; error?: string }>
  ) => void;

  // Derived count selector — returns primitive counts so callers don't
  // need to subscribe to the full Map (avoids re-render on every item sync change)
  getOrderSyncCounts: (itemIds: string[]) => { pending: number; failed: number; synced: number };
}

export const useSyncStatusStore = create<SyncStatusState>((set, get) => ({
  itemSyncStatus: new Map(),
  itemSyncErrors: new Map(),

  setSyncStatus: (itemId, status, error) => {
    set((state) => {
      const newStatusMap = new Map(state.itemSyncStatus);
      const newErrorMap = new Map(state.itemSyncErrors);

      newStatusMap.set(itemId, status);

      if (error) {
        newErrorMap.set(itemId, error);
      } else if (status === "synced") {
        // Clear error when synced
        newErrorMap.delete(itemId);
      }

      return {
        itemSyncStatus: newStatusMap,
        itemSyncErrors: newErrorMap,
      };
    });
  },

  getSyncStatus: (itemId) => {
    return get().itemSyncStatus.get(itemId);
  },

  getError: (itemId) => {
    return get().itemSyncErrors.get(itemId);
  },

  clearSyncStatus: (itemId) => {
    set((state) => {
      const newStatusMap = new Map(state.itemSyncStatus);
      const newErrorMap = new Map(state.itemSyncErrors);

      newStatusMap.delete(itemId);
      newErrorMap.delete(itemId);

      return {
        itemSyncStatus: newStatusMap,
        itemSyncErrors: newErrorMap,
      };
    });
  },

  clearAllForOrder: (itemIds) => {
    if (itemIds.length === 0) return;

    set((state) => {
      const newStatusMap = new Map(state.itemSyncStatus);
      const newErrorMap = new Map(state.itemSyncErrors);

      for (const itemId of itemIds) {
        newStatusMap.delete(itemId);
        newErrorMap.delete(itemId);
      }

      return {
        itemSyncStatus: newStatusMap,
        itemSyncErrors: newErrorMap,
      };
    });
  },

  getOrderSyncCounts: (itemIds) => {
    const { itemSyncStatus } = get()
    let pending = 0, failed = 0, synced = 0
    for (const id of itemIds) {
      const status = itemSyncStatus.get(id)
      if (status === 'pending' || status === 'syncing') pending++
      else if (status === 'failed') failed++
      else synced++
    }
    return { pending, failed, synced }
  },

  setSyncStatusBatch: (updates) => {
    if (updates.length === 0) return;

    set((state) => {
      const newStatusMap = new Map(state.itemSyncStatus);
      const newErrorMap = new Map(state.itemSyncErrors);

      for (const { itemId, status, error } of updates) {
        newStatusMap.set(itemId, status);

        if (error) {
          newErrorMap.set(itemId, error);
        } else if (status === "synced") {
          newErrorMap.delete(itemId);
        }
      }

      return {
        itemSyncStatus: newStatusMap,
        itemSyncErrors: newErrorMap,
      };
    });
  },
}));

// Selectors for individual item sync status
// These create stable references for use with useSyncStatusStore

/**
 * Hook to get sync status for a specific item.
 * Returns undefined if item has no tracked sync status (treated as "synced").
 */
export function useItemSyncStatus(itemId: string): SyncStatus | undefined {
  return useSyncStatusStore((state) => state.itemSyncStatus.get(itemId));
}

/**
 * Hook to get sync error for a specific item.
 */
export function useItemSyncError(itemId: string): string | undefined {
  return useSyncStatusStore((state) => state.itemSyncErrors.get(itemId));
}

const ZERO_COUNTS = { pending: 0, failed: 0, synced: 0 }

/**
 * Hook to get aggregate sync counts for a list of item IDs.
 * Only re-renders when the actual pending/failed/synced counts change,
 * not on every individual item sync status update.
 *
 * Returns a stable cached reference so Zustand's getSnapshot doesn't loop.
 */
export function useOrderSyncCounts(itemIds: string[]): { pending: number; failed: number; synced: number } {
  const cacheRef = React.useRef(ZERO_COUNTS)

  return useSyncStatusStore((state) => {
    let pending = 0, failed = 0, synced = 0
    for (const id of itemIds) {
      const status = state.itemSyncStatus.get(id)
      if (status === 'pending' || status === 'syncing') pending++
      else if (status === 'failed') failed++
      else synced++
    }
    const prev = cacheRef.current
    if (prev.pending === pending && prev.failed === failed && prev.synced === synced) {
      return prev // same reference — no re-render, no infinite loop
    }
    const next = { pending, failed, synced }
    cacheRef.current = next
    return next
  })
}

/**
 * Check if an item has pending or syncing status.
 * Items without tracked status are considered synced.
 */
export function isItemPending(itemId: string): boolean {
  const status = useSyncStatusStore.getState().itemSyncStatus.get(itemId);
  return status === "pending" || status === "syncing";
}

/**
 * Check if any items in the given list have pending sync status.
 * Used for broadcast merge logic - items without db_order_item_id
 * that are pending should not be overwritten.
 */
export function hasAnyPendingSyncs(itemIds: string[]): boolean {
  const store = useSyncStatusStore.getState();
  return itemIds.some((id) => {
    const status = store.itemSyncStatus.get(id);
    return status === "pending" || status === "syncing";
  });
}
