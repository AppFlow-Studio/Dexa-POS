/**
 * Re-fires order recalculation when a table session's party_size changes.
 *
 * Service charge eligibility depends on `table_sessions.party_size` ≥ threshold.
 * The calculator hashes party_size as a cache-invalidation input, but the order
 * store only recomputes on cart/discount/payment mutations — a pure party_size
 * change (staff seats more guests at an already-seated table) wouldn't fire a
 * recompute on its own.
 *
 * This subscriber bridges that gap: when any session's party_size diffs from
 * the prior snapshot, look up the linked order and call `recalculateOrder`.
 *
 * Initialize once in root layout after the table session store hydrates.
 */

import { useOrderStore } from "@/stores/useOrderStore";
import { useTableSessionStore } from "@/stores/useTableSessionStore";

let _unsubscribe: (() => void) | null = null;

export function setupServiceChargeSubscriber() {
  if (_unsubscribe) return;

  _unsubscribe = useTableSessionStore.subscribe(
    // Selector: { orderId -> party_size } map. Stable across renders.
    (state) => {
      const out: Record<string, number> = {};
      for (const s of Object.values(state.sessions)) {
        if (s.order_id && typeof s.party_size === "number") {
          out[s.order_id] = s.party_size;
        }
      }
      return out;
    },
    (next, prev) => {
      const changed: string[] = [];
      for (const [orderId, partySize] of Object.entries(next)) {
        if (prev[orderId] !== partySize) changed.push(orderId);
      }
      if (changed.length === 0) return;

      const orderState = useOrderStore.getState();
      queueMicrotask(() => {
        for (const orderId of changed) {
          // Resolve local store key from db_order_id if needed.
          const localId =
            orderState.dbOrderIdIndex[orderId] ?? orderId;
          if (orderState.ordersById[localId]) {
            try {
              orderState.recalculateOrder(localId);
            } catch (err) {
              if (__DEV__) {
                console.warn(
                  "[service_charge_subscriber] recalculate failed",
                  orderId,
                  err,
                );
              }
            }
          }
        }
      });
    },
    {
      equalityFn: (a, b) => {
        const ak = Object.keys(a);
        const bk = Object.keys(b);
        if (ak.length !== bk.length) return false;
        for (const k of ak) {
          if (a[k] !== b[k]) return false;
        }
        return true;
      },
    },
  );
}

export function teardownServiceChargeSubscriber() {
  _unsubscribe?.();
  _unsubscribe = null;
}
