/**
 * THE totals API for React. One hook, derived, never mirrored.
 *
 * docs/engineering/architecture/local-first-orders-seating.md §4.3
 *
 * ── The problem ────────────────────────────────────────────────────────────
 *
 * `useOrderStore` keeps TEN top-level mirrors of the current order's totals:
 * `activeOrderSubtotal`, `activeOrderTax`, `activeOrderTotal`,
 * `activeOrderDiscount`, `activeOrderOutstandingSubtotal`,
 * `activeOrderOutstandingTax`, `activeOrderOutstandingTotal`,
 * `activeOrderTotalCash`, `activeOrderOutstandingCash` (+ order-level fields).
 *
 * Each of the 17 `calculateOrderTotals` call sites writes all of them, and
 * **143 references across 15 files** subscribe. Adding one item therefore
 * re-renders all fifteen.
 *
 * Measured (§4.0.1): the arithmetic is ~0.6 ms for a 50-item order on a dev
 * machine. That does not explain a visible stall — which is what promoted this
 * fan-out from "cleanup" to the prime suspect for the lag the operator feels.
 *
 * ── Why derived state fixes more than performance ──────────────────────────
 *
 * Mirrored totals are a SECOND source of truth for money. Any path that writes
 * items without also writing all ten mirrors leaves the cart and its total
 * disagreeing, and that is a whole bug class — not a hypothetical one, it is
 * why `recalculateOrder` exists as a backstop and why the store re-runs totals
 * after a rekey.
 *
 * Derive them and they cannot disagree, because there is nothing to disagree
 * with. Adding an item writes ONE thing — the item array — and totals fall out.
 *
 * ── Why this also unblocks Phase 4 ─────────────────────────────────────────
 *
 * Phase 4 makes the Zustand store a projection of SQLite. A projection cannot
 * own derived money state; it has to be computed from whatever the query
 * returned. So this boundary is required work regardless of the perf result,
 * which is the argument for building it now rather than after a device
 * measurement.
 */
import { useMemo } from "react";

import type { CartItem } from "@/lib/types";
import { useOrder, useActiveOrder } from "@/stores/selectors/orderSelectors";
import { calculateOrderTotalsForOrder } from "@/stores/useOrderStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import type { OrderTotals } from "@/types/order-calculations";

/**
 * Totals for one order, derived from its items.
 *
 * MEMOIZATION: on the identity of `items`, `checkDiscount`, `payments` and
 * `taxRatesMap` — an O(1) key, not the O(n) `JSON.stringify` the calculator's
 * internal cache builds on every call.
 *
 * That works because the store uses Immer: mutating an order produces a NEW
 * `items` array, and leaves it referentially identical when nothing changed.
 * So a re-render caused by an unrelated field costs one reference comparison,
 * while a genuine item change recomputes exactly once.
 *
 * The calculator's own 2-second TTL cache is left alone deliberately. Measured
 * at 1.8% of a cold call, removing it is not the win — and removing it WITHOUT
 * a replacement would be a 37× regression on the re-render path (17 µs → 626 µs
 * at 50 items), which is precisely the path this hook serves.
 */
export function useOrderTotals(orderId: string | undefined): OrderTotals | null {
  const order = useOrder(orderId ?? "");
  const taxRatesMap = useStoreSettingsStore((s) => s.taxRatesMap);

  return useMemo(() => {
    if (!order) return null;
    // ── Equivalence by CONSTRUCTION, not by inspection. ────────────────────
    //
    // This deliberately calls the store's own wrapper rather than the module
    // calculator directly. The first version of this hook passed a hand-picked
    // subset of the service-charge inputs and was NOT equivalent: the store
    // resolves the active rule from useServiceChargeRulesStore, the party size
    // from the table session, and a server-confirmed SC fallback, then also
    // sets `preserveItemLevelOutstanding` from `_reopenedForOrdering`.
    //
    // Missing any of those produces a total that differs from the one the
    // store shows — on payment surfaces, that is a guest charged the wrong
    // amount. The staging incident referenced in the calculator's
    // `serverConfirmedServiceCharge` comment ($7.43 on the CFD vs $5.72
    // collected) is exactly this failure.
    //
    // Sharing the wrapper makes the two impossible to drift apart, which is
    // the precondition for migrating any payment view off the mirrored fields.
    return calculateOrderTotalsForOrder(
      (order.items ?? []) as CartItem[],
      order.checkDiscount ?? null,
      order.payments ?? [],
      taxRatesMap,
      order,
    );
    // Reference-identity deps only. Adding a computed value here (a .filter(),
    // a .map()) would produce a new reference every render and defeat the memo
    // entirely — the failure would be invisible, just slow.
  }, [
    order,
    order?.items,
    order?.checkDiscount,
    order?.payments,
    taxRatesMap,
  ]);
}

/** Totals for the active order — the common case. */
export function useActiveOrderTotals(): OrderTotals | null {
  const active = useActiveOrder();
  return useOrderTotals(active?.id);
}

/**
 * Migration note for whoever replaces the ten mirrored fields.
 *
 * Do it one screen at a time and MEASURE each one — `startInteraction`
 * ("pos.add_to_cart", useOrderStore.ts:8455) already reports tap→paint. The
 * mirrors cannot be deleted from the store until every one of the 143
 * references is gone, so the two representations coexist during the migration;
 * that is safe (both derive from the same items) but it is not finished until
 * the store fields are actually removed.
 *
 * Order to migrate, cheapest first:
 *   1. Read-only displays (bill totals, CFD) — pure swap, no behaviour.
 *   2. Payment surfaces — verify against `usePaymentStore` before/after.
 *   3. Anything writing the mirrors — those are the 17 calculator call sites.
 */
