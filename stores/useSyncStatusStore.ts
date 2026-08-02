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

import { toastService } from '@/lib/toastService'
import React, { useCallback } from 'react'
import { create } from 'zustand'

export type SyncStatus = 'pending' | 'syncing' | 'synced' | 'failed'

interface SyncStatusState {
  // Maps item ID to sync status
  itemSyncStatus: Map<string, SyncStatus>

  // Maps item ID to error message (for failed syncs)
  itemSyncErrors: Map<string, string>

  // PR E.1: timestamp (epoch ms) when an item transitioned to 'failed'.
  // The broadcast-merge filter uses this to evict items whose failure has
  // been visible to the user long enough that they've had a chance to hit
  // Retry / Remove (>5s window).
  itemFailedAt: Map<string, number>

  // Actions
  setSyncStatus: (itemId: string, status: SyncStatus, error?: string) => void

  getSyncStatus: (itemId: string) => SyncStatus | undefined

  getError: (itemId: string) => string | undefined

  clearSyncStatus: (itemId: string) => void

  clearAllForOrder: (itemIds: string[]) => void

  // Bulk operations for performance
  setSyncStatusBatch: (
    updates: Array<{ itemId: string; status: SyncStatus; error?: string }>
  ) => void

  // Derived count selector — returns primitive counts so callers don't
  // need to subscribe to the full Map (avoids re-render on every item sync change)
  getOrderSyncCounts: (itemIds: string[]) => {
    pending: number
    failed: number
    synced: number
  }
}

// PR D.4: per-item de-dup so a single item failing 5× over 30s only toasts
// once. Module-scoped because it's UX-only (no need to drive re-renders).
const _recentlyToastedFailures = new Set<string>()
const TOAST_DEDUP_TTL_MS = 30_000

function _maybeFireFailureToast (itemId: string): void {
  if (_recentlyToastedFailures.has(itemId)) return
  _recentlyToastedFailures.add(itemId)
  setTimeout(
    () => _recentlyToastedFailures.delete(itemId),
    TOAST_DEDUP_TTL_MS
  )
  toastService.show({
    title: "Couldn't save item",
    message: 'Tap Retry on the cart line to try again.',
    type: 'warning',
    duration: 5000
  })
}

export const useSyncStatusStore = create<SyncStatusState>((set, get) => ({
  itemSyncStatus: new Map(),
  itemSyncErrors: new Map(),
  itemFailedAt: new Map(),

  setSyncStatus: (itemId, status, error) => {
    // PR D.4: fire a debounced toast on the first transition to 'failed'
    // for this item. Captured BEFORE the set() call so we read the prior
    // status, not the new one.
    const prevStatus = get().itemSyncStatus.get(itemId)
    const transitioningToFailed = status === 'failed' && prevStatus !== 'failed'

    set(state => {
      const newStatusMap = new Map(state.itemSyncStatus)
      const newErrorMap = new Map(state.itemSyncErrors)
      const newFailedAtMap = new Map(state.itemFailedAt)

      newStatusMap.set(itemId, status)

      if (error) {
        newErrorMap.set(itemId, error)
      } else if (status !== 'failed') {
        // Clear any stale error on every non-failed transition, not just
        // 'synced'. Cart item ids are deterministic
        // (generateCartItemId(menuItemId, customizations)), so re-adding the
        // same item+modifier combo on a new order reuses an old id and would
        // otherwise inherit that id's previous error string.
        //
        // Covering 'pending' here is what lets addItemToActiveOrder drop its
        // separate clearSyncStatus() call: that call cloned all three Maps and
        // committed the store purely to be overwritten by this setSyncStatus a
        // few lines later — two commits and six Map clones per added item, on
        // the DONE press.
        newErrorMap.delete(itemId)
      }

      // PR E.1: stamp / clear failure timestamp so the broadcast merge can
      // evict stale-failed items after the 5s grace window.
      if (status === 'failed') {
        if (!newFailedAtMap.has(itemId)) {
          newFailedAtMap.set(itemId, Date.now())
        }
      } else {
        newFailedAtMap.delete(itemId)
      }

      return {
        itemSyncStatus: newStatusMap,
        itemSyncErrors: newErrorMap,
        itemFailedAt: newFailedAtMap
      }
    })

    if (transitioningToFailed) {
      _maybeFireFailureToast(itemId)
    }
  },

  getSyncStatus: itemId => {
    return get().itemSyncStatus.get(itemId)
  },

  getError: itemId => {
    return get().itemSyncErrors.get(itemId)
  },

  clearSyncStatus: itemId => {
    set(state => {
      const newStatusMap = new Map(state.itemSyncStatus)
      const newErrorMap = new Map(state.itemSyncErrors)
      const newFailedAtMap = new Map(state.itemFailedAt)

      newStatusMap.delete(itemId)
      newErrorMap.delete(itemId)
      newFailedAtMap.delete(itemId)

      return {
        itemSyncStatus: newStatusMap,
        itemSyncErrors: newErrorMap,
        itemFailedAt: newFailedAtMap
      }
    })
  },

  clearAllForOrder: itemIds => {
    if (itemIds.length === 0) return

    set(state => {
      const newStatusMap = new Map(state.itemSyncStatus)
      const newErrorMap = new Map(state.itemSyncErrors)
      const newFailedAtMap = new Map(state.itemFailedAt)

      for (const itemId of itemIds) {
        newStatusMap.delete(itemId)
        newErrorMap.delete(itemId)
        newFailedAtMap.delete(itemId)
      }

      return {
        itemSyncStatus: newStatusMap,
        itemSyncErrors: newErrorMap,
        itemFailedAt: newFailedAtMap
      }
    })
  },

  getOrderSyncCounts: itemIds => {
    const { itemSyncStatus } = get()
    let pending = 0,
      failed = 0,
      synced = 0
    for (const id of itemIds) {
      const status = itemSyncStatus.get(id)
      if (status === 'pending' || status === 'syncing') pending++
      else if (status === 'failed') failed++
      else synced++
    }
    return { pending, failed, synced }
  },

  setSyncStatusBatch: updates => {
    if (updates.length === 0) return

    // PR D.4: collect items transitioning to 'failed' so we toast after the
    // set() call commits, not during reducer execution.
    const transitioningToFailed: string[] = []
    const prevStatusSnapshot = get().itemSyncStatus

    set(state => {
      const newStatusMap = new Map(state.itemSyncStatus)
      const newErrorMap = new Map(state.itemSyncErrors)
      const newFailedAtMap = new Map(state.itemFailedAt)
      const now = Date.now()

      for (const { itemId, status, error } of updates) {
        const prev = prevStatusSnapshot.get(itemId)
        if (status === 'failed' && prev !== 'failed') {
          transitioningToFailed.push(itemId)
        }
        newStatusMap.set(itemId, status)

        if (error) {
          newErrorMap.set(itemId, error)
        } else if (status === 'synced') {
          newErrorMap.delete(itemId)
        }

        if (status === 'failed') {
          if (!newFailedAtMap.has(itemId)) {
            newFailedAtMap.set(itemId, now)
          }
        } else {
          newFailedAtMap.delete(itemId)
        }
      }

      return {
        itemSyncStatus: newStatusMap,
        itemSyncErrors: newErrorMap,
        itemFailedAt: newFailedAtMap
      }
    })

    for (const id of transitioningToFailed) _maybeFireFailureToast(id)
  }
}))

// Selectors for individual item sync status
// These create stable references for use with useSyncStatusStore

/**
 * Hook to get sync status for a specific item.
 * Returns undefined if item has no tracked sync status (treated as "synced").
 */
export function useItemSyncStatus (itemId: string): SyncStatus | undefined {
  return useSyncStatusStore(state => state.itemSyncStatus.get(itemId))
}

/**
 * Hook to get sync error for a specific item.
 */
export function useItemSyncError (itemId: string): string | undefined {
  return useSyncStatusStore(state => state.itemSyncErrors.get(itemId))
}

/**
 * Hook to get both sync status and error for a specific item in a single subscription.
 * Prefer this over calling useItemSyncStatus + useItemSyncError separately.
 */
export function useItemSyncInfo (itemId: string): {
  status: SyncStatus | undefined
  error: string | undefined
} {
  const cacheRef = React.useRef<{
    status: SyncStatus | undefined
    error: string | undefined
  }>({
    status: undefined,
    error: undefined
  })

  return useSyncStatusStore(
    useCallback(
      state => {
        const status = state.itemSyncStatus.get(itemId)
        const error = state.itemSyncErrors.get(itemId)
        const prev = cacheRef.current

        if (prev.status === status && prev.error === error) {
          return prev
        }

        const next = { status, error }
        cacheRef.current = next
        return next
      },
      [itemId]
    )
  )
}

const ZERO_COUNTS = { pending: 0, failed: 0, synced: 0 }

/**
 * Hook to get aggregate sync counts for a list of item IDs.
 * Only re-renders when the actual pending/failed/synced counts change,
 * not on every individual item sync status update.
 *
 * Returns a stable cached reference so Zustand's getSnapshot doesn't loop.
 */
export function useOrderSyncCounts (itemIds: string[]): {
  pending: number
  failed: number
  synced: number
} {
  const cacheRef = React.useRef(ZERO_COUNTS)

  return useSyncStatusStore(state => {
    let pending = 0,
      failed = 0,
      synced = 0
    for (const id of itemIds) {
      const status = state.itemSyncStatus.get(id)
      if (status === 'pending' || status === 'syncing') pending++
      else if (status === 'failed') failed++
      else synced++
    }
    const prev = cacheRef.current
    if (
      prev.pending === pending &&
      prev.failed === failed &&
      prev.synced === synced
    ) {
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
export function isItemPending (itemId: string): boolean {
  const status = useSyncStatusStore.getState().itemSyncStatus.get(itemId)
  return status === 'pending' || status === 'syncing'
}

/**
 * Check if any items in the given list have pending sync status.
 * Used for broadcast merge logic - items without db_order_item_id
 * that are pending should not be overwritten.
 */
export function hasAnyPendingSyncs (itemIds: string[]): boolean {
  const store = useSyncStatusStore.getState()
  return itemIds.some(id => {
    const status = store.itemSyncStatus.get(id)
    return status === 'pending' || status === 'syncing'
  })
}
