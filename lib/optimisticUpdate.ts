/**
 * Optimistic Update Helper for Zustand Stores
 *
 * Provides utilities for implementing optimistic updates with proper revert
 * handling and race condition prevention.
 */

interface OptimisticContext<T> {
  previousState: T;
  revert: () => void;
  mutationKey: string;
  timestamp: number;
}

// Track pending mutations to cancel stale ones and handle race conditions
const pendingMutations = new Map<string, AbortController>();

/**
 * Creates an optimistic update context with automatic revert capability.
 *
 * @param mutationKey - Unique key for this mutation (e.g., "order:123:addItem")
 * @param getState - Function to get current state
 * @param setState - Function to set state (for revert)
 * @returns Context with revert function and previous state
 *
 * @example
 * ```ts
 * const context = createOptimisticUpdate(
 *   `order:${orderId}:addItem`,
 *   () => get().ordersById[orderId].items,
 *   (items) => set(state => ({
 *     ordersById: {
 *       ...state.ordersById,
 *       [orderId]: { ...state.ordersById[orderId], items }
 *     }
 *   }))
 * );
 *
 * try {
 *   await apiCall();
 *   clearMutation(context.mutationKey);
 * } catch (error) {
 *   context.revert();
 *   showError("Failed to update");
 * }
 * ```
 */
export function createOptimisticUpdate<T>(
  mutationKey: string,
  getState: () => T,
  setState: (state: T) => void
): OptimisticContext<T> {
  // Cancel any pending mutation for this key (handle race conditions)
  const existingController = pendingMutations.get(mutationKey);
  if (existingController) {
    existingController.abort();
  }

  // Deep clone the previous state for safe revert
  const previousState = structuredClone(getState());
  const timestamp = Date.now();
  const abortController = new AbortController();

  // Track this mutation
  pendingMutations.set(mutationKey, abortController);

  return {
    previousState,
    timestamp,
    mutationKey,
    revert: () => {
      // Only revert if this is still the latest mutation for this key
      if (pendingMutations.get(mutationKey) === abortController) {
        setState(previousState);
        pendingMutations.delete(mutationKey);
      }
    },
  };
}

/**
 * Clears a completed mutation from tracking.
 * Call this after successful API response.
 */
export function clearMutation(mutationKey: string): void {
  pendingMutations.delete(mutationKey);
}

/**
 * Checks if a mutation for the given key is currently pending.
 */
export function isMutationPending(mutationKey: string): boolean {
  return pendingMutations.has(mutationKey);
}

// Debounce timers for quantity/value updates
const debounceTimers = new Map<string, NodeJS.Timeout>();

/**
 * Debounced sync helper for rapid value changes (e.g., quantity updates).
 *
 * @param key - Unique key for this debounce group
 * @param fn - Function to call after debounce
 * @param delay - Debounce delay in ms (default 500)
 *
 * @example
 * ```ts
 * // Update quantity optimistically, debounce backend sync
 * set(state => ({ quantity: state.quantity + 1 }));
 * debouncedSync(`item:${itemId}:quantity`, () => syncQuantityToBackend(itemId), 500);
 * ```
 */
export function debouncedSync(
  key: string,
  fn: () => void,
  delay = 500
): void {
  const existing = debounceTimers.get(key);
  if (existing) {
    clearTimeout(existing);
  }

  debounceTimers.set(
    key,
    setTimeout(() => {
      debounceTimers.delete(key);
      fn();
    }, delay)
  );
}

/**
 * Cancels a pending debounced sync.
 */
export function cancelDebouncedSync(key: string): void {
  const timer = debounceTimers.get(key);
  if (timer) {
    clearTimeout(timer);
    debounceTimers.delete(key);
  }
}
