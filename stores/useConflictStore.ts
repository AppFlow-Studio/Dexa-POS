// stores/useConflictStore.ts
// DEXA POS Phase 6: Conflict Management Store
// Manages conflict state, payment locks, and conflict resolution

import { create } from 'zustand';
import {
  ConflictInfo,
  ConflictResolution,
  PaymentLock,
  SessionConflict,
  isConflictExpired,
  isPaymentLockExpired,
} from '@/types/conflict-resolution';

// ============================================================================
// STORE STATE INTERFACE
// ============================================================================

interface ConflictState {
  // Recent conflicts (auto-expire after 5 minutes)
  recentConflicts: ConflictInfo[];

  // Critical conflicts requiring user action (payment-related)
  paymentConflicts: ConflictInfo[];

  // Session-level conflicts (table lifecycle conflicts)
  sessionConflicts: SessionConflict[];

  // Active payment locks (tracked locally for quick checks)
  paymentLocks: Record<string, PaymentLock>;

  // Orders recently updated by other stations (for UI indicator)
  recentlyUpdatedOrderIds: Set<string>;

  // ============= CONFLICT ACTIONS =============

  /**
   * Record a conflict (auto-resolved via Last Write Wins)
   * Stores for audit/debugging and triggers toast notification
   */
  recordConflict: (conflict: ConflictInfo) => void;

  /**
   * Add a critical payment conflict requiring user resolution
   */
  addPaymentConflict: (conflict: ConflictInfo) => void;

  /**
   * Resolve a payment conflict with user's choice
   */
  resolvePaymentConflict: (orderId: string, resolution: ConflictResolution) => void;

  /**
   * Get conflict history for a specific order
   */
  getConflictHistory: (orderId: string) => ConflictInfo[];

  /**
   * Clear expired conflicts (call periodically)
   */
  clearExpiredConflicts: () => void;

  /**
   * Check if an order has an unresolved payment conflict
   */
  hasPaymentConflict: (orderId: string) => boolean;

  /**
   * Get the current payment conflict for an order if any
   */
  getPaymentConflict: (orderId: string) => ConflictInfo | undefined;

  // ============= SESSION CONFLICT ACTIONS =============

  /**
   * Add a session-level conflict
   */
  addSessionConflict: (conflict: SessionConflict) => void;

  /**
   * Resolve a session conflict for a table
   */
  resolveSessionConflict: (tableId: string) => void;

  // ============= PAYMENT LOCK ACTIONS =============

  /**
   * Set a payment lock for an order
   */
  setPaymentLock: (lock: PaymentLock) => void;

  /**
   * Clear a payment lock for an order
   */
  clearPaymentLock: (orderId: string) => void;

  /**
   * Check if an order is locked locally
   */
  isOrderLockedLocally: (orderId: string) => boolean;

  /**
   * Get payment lock info for an order
   */
  getPaymentLock: (orderId: string) => PaymentLock | undefined;

  /**
   * Clear expired payment locks
   */
  clearExpiredLocks: () => void;

  // ============= RECENTLY UPDATED TRACKING =============

  /**
   * Mark an order as recently updated by another station
   * Auto-clears after 5 seconds
   */
  markOrderAsUpdated: (orderId: string) => void;

  /**
   * Check if an order was recently updated by another station
   */
  wasRecentlyUpdated: (orderId: string) => boolean;

  /**
   * Clear the recently updated flag for an order
   */
  clearRecentlyUpdated: (orderId: string) => void;
}

// ============================================================================
// STORE IMPLEMENTATION
// ============================================================================

// Per-order auto-clear timers for markOrderAsUpdated. Tracked so repeated
// marks on the same order (multi-station churn on a hot order) don't each
// spawn an independent uncancelled timer — we reset the existing one instead.
const _recentlyUpdatedTimers = new Map<string, ReturnType<typeof setTimeout>>();

export const useConflictStore = create<ConflictState>((set, get) => ({
  // Initial state
  recentConflicts: [],
  paymentConflicts: [],
  sessionConflicts: [],
  paymentLocks: {},
  recentlyUpdatedOrderIds: new Set(),

  // ============= CONFLICT ACTIONS =============

  recordConflict: (conflict: ConflictInfo) => {
    set((state) => ({
      recentConflicts: [
        conflict,
        ...state.recentConflicts.slice(0, 99), // Keep last 100
      ],
    }));

    // If non-critical, mark order as recently updated for UI indicator
    if (conflict.severity !== 'critical') {
      get().markOrderAsUpdated(conflict.orderId);
    }
  },

  addPaymentConflict: (conflict: ConflictInfo) => {
    set((state) => {
      // Don't add duplicate conflicts for same order
      const existing = state.paymentConflicts.find(
        (c) => c.orderId === conflict.orderId
      );
      if (existing) {
        return state;
      }

      return {
        paymentConflicts: [conflict, ...state.paymentConflicts],
        recentConflicts: [conflict, ...state.recentConflicts.slice(0, 99)],
      };
    });
  },

  resolvePaymentConflict: (orderId: string, resolution: ConflictResolution) => {
    set((state) => ({
      paymentConflicts: state.paymentConflicts.filter(
        (c) => c.orderId !== orderId
      ),
      recentConflicts: state.recentConflicts.map((c) =>
        c.orderId === orderId
          ? { ...c, resolution, resolvedAt: new Date().toISOString() }
          : c
      ),
    }));
  },

  getConflictHistory: (orderId: string) => {
    return get().recentConflicts.filter((c) => c.orderId === orderId);
  },

  clearExpiredConflicts: () => {
    const maxAgeMs = 5 * 60 * 1000; // 5 minutes

    set((state) => ({
      recentConflicts: state.recentConflicts.filter(
        (c) => !isConflictExpired(c, maxAgeMs)
      ),
    }));
  },

  hasPaymentConflict: (orderId: string) => {
    return get().paymentConflicts.some((c) => c.orderId === orderId);
  },

  getPaymentConflict: (orderId: string) => {
    return get().paymentConflicts.find((c) => c.orderId === orderId);
  },

  // ============= SESSION CONFLICT ACTIONS =============

  addSessionConflict: (conflict: SessionConflict) => {
    set((state) => {
      // Don't add duplicate conflicts for same table
      const existing = state.sessionConflicts.find(
        (c) => c.tableId === conflict.tableId
      );
      if (existing) return state;

      return {
        sessionConflicts: [conflict, ...state.sessionConflicts.slice(0, 49)],
      };
    });
  },

  resolveSessionConflict: (tableId: string) => {
    set((state) => ({
      sessionConflicts: state.sessionConflicts.filter(
        (c) => c.tableId !== tableId
      ),
    }));
  },

  // ============= PAYMENT LOCK ACTIONS =============

  setPaymentLock: (lock: PaymentLock) => {
    set((state) => ({
      paymentLocks: {
        ...state.paymentLocks,
        [lock.orderId]: lock,
      },
    }));
  },

  clearPaymentLock: (orderId: string) => {
    set((state) => {
      const { [orderId]: _, ...rest } = state.paymentLocks;
      return { paymentLocks: rest };
    });
  },

  isOrderLockedLocally: (orderId: string) => {
    const lock = get().paymentLocks[orderId];
    if (!lock) return false;
    return !isPaymentLockExpired(lock);
  },

  getPaymentLock: (orderId: string) => {
    const lock = get().paymentLocks[orderId];
    if (!lock) return undefined;
    if (isPaymentLockExpired(lock)) {
      // Clean up expired lock
      get().clearPaymentLock(orderId);
      return undefined;
    }
    return lock;
  },

  clearExpiredLocks: () => {
    set((state) => {
      const validLocks: Record<string, PaymentLock> = {};
      Object.entries(state.paymentLocks).forEach(([orderId, lock]) => {
        if (!isPaymentLockExpired(lock)) {
          validLocks[orderId] = lock;
        }
      });
      return { paymentLocks: validLocks };
    });
  },

  // ============= RECENTLY UPDATED TRACKING =============

  markOrderAsUpdated: (orderId: string) => {
    set((state) => {
      const updated = new Set(state.recentlyUpdatedOrderIds);
      updated.add(orderId);
      return { recentlyUpdatedOrderIds: updated };
    });

    // Auto-clear after 5 seconds. Reset any in-flight timer for this order so
    // repeated marks don't accumulate uncancelled timers.
    const existing = _recentlyUpdatedTimers.get(orderId);
    if (existing !== undefined) clearTimeout(existing);
    const handle = setTimeout(() => {
      _recentlyUpdatedTimers.delete(orderId);
      get().clearRecentlyUpdated(orderId);
    }, 5000);
    _recentlyUpdatedTimers.set(orderId, handle);
  },

  wasRecentlyUpdated: (orderId: string) => {
    return get().recentlyUpdatedOrderIds.has(orderId);
  },

  clearRecentlyUpdated: (orderId: string) => {
    const existing = _recentlyUpdatedTimers.get(orderId);
    if (existing !== undefined) {
      clearTimeout(existing);
      _recentlyUpdatedTimers.delete(orderId);
    }
    set((state) => {
      const updated = new Set(state.recentlyUpdatedOrderIds);
      updated.delete(orderId);
      return { recentlyUpdatedOrderIds: updated };
    });
  },
}));

// ============================================================================
// CLEANUP INTERVAL
// ============================================================================

// Run cleanup every minute
let cleanupInterval: ReturnType<typeof setInterval> | null = null;

export function startConflictCleanup() {
  if (cleanupInterval) return;

  cleanupInterval = setInterval(() => {
    const store = useConflictStore.getState();
    store.clearExpiredConflicts();
    store.clearExpiredLocks();
  }, 60 * 1000);
}

export function stopConflictCleanup() {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
}

// ============================================================================
// SELECTORS
// ============================================================================

/**
 * Get count of unresolved payment conflicts
 */
export function usePaymentConflictCount(): number {
  return useConflictStore((state) => state.paymentConflicts.length);
}

/**
 * Check if any payment conflicts exist
 */
export function useHasPaymentConflicts(): boolean {
  return useConflictStore((state) => state.paymentConflicts.length > 0);
}

/**
 * Get all payment conflicts
 */
export function usePaymentConflicts(): ConflictInfo[] {
  return useConflictStore((state) => state.paymentConflicts);
}

/**
 * Check if a specific order was recently updated
 */
export function useWasOrderRecentlyUpdated(orderId: string): boolean {
  return useConflictStore((state) =>
    state.recentlyUpdatedOrderIds.has(orderId)
  );
}

/**
 * Check if a specific order is locked for payment
 */
export function useIsOrderLocked(orderId: string): boolean {
  return useConflictStore((state) => {
    const lock = state.paymentLocks[orderId];
    return lock ? !isPaymentLockExpired(lock) : false;
  });
}

// ============================================================================
// SESSION CONFLICT SELECTORS
// ============================================================================

/**
 * Get all session conflicts
 */
export function useSessionConflicts(): SessionConflict[] {
  return useConflictStore((state) => state.sessionConflicts);
}

/**
 * Check if any session conflicts exist
 */
export function useHasSessionConflicts(): boolean {
  return useConflictStore((state) => state.sessionConflicts.length > 0);
}
