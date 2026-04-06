/**
 * Order Selectors for Station-Based Order Management
 *
 * Phase 5: Shared Visibility & Working Set
 *
 * These selectors filter orders for different views based on station context,
 * view_scope settings, and working set membership.
 *
 * Guiding Principle: "The store holds everything; selectors decide what each component sees."
 */

import { calculateOrderTotals } from "@/lib/order-calculator";
import type { OrderProfile, OrderProfilePayment } from "@/lib/types";
import { useMemo, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import { useOrderStore } from "../useOrderStore";
import { useSettingsStore } from "../useSettingsStore";
import { useStoreSettingsStore } from "../useStoreSettingsStore";

/**
 * Shallow-compare two arrays of order IDs (string[]).
 * Returns true if the arrays are referentially or value-equal.
 */
// Stable empty references for disabled selectors (avoids useSyncExternalStore infinite loop)
const EMPTY_TAX_RATES_MAP: Record<string, any> = {};

function orderIdsEqual(a: string[], b: string[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return h;
}

/**
 * Stable equality for filtered order arrays.
 * Uses a numeric hash instead of string concatenation to avoid O(N)
 * string allocations on every call.
 */
function useStableOrderList(orders: OrderProfile[]): OrderProfile[] {
  const prev = useRef<OrderProfile[]>(orders);
  const prevHash = useRef<number>(0);

  let hash = orders.length;
  for (let i = 0; i < orders.length; i++) {
    const o = orders[i];
    hash = ((hash << 5) - hash + hashStr(o.id)) | 0;
    hash = ((hash << 5) - hash + (o.sync_version ?? 0)) | 0;
  }

  if (hash !== prevHash.current) {
    prev.current = orders;
    prevHash.current = hash;
  }

  return prev.current;
}

// ═══════════════════════════════════════════════════════════════════════════
// SELECTOR: Active Order Totals (Phase 7 - Derived State)
// ═══════════════════════════════════════════════════════════════════════════
// Replaces 9 activeOrder* state fields with a single derived computation.
// Uses memoization and calculation caching for performance.

export interface ActiveOrderTotals {
  subtotal: number;
  tax: number;
  total: number;
  discount: number;
  itemCount: number;
  tip: number;
  // Outstanding amounts (what's left to pay)
  amountDue: number;
  cashAmountDue: number;
  // Full breakdown if needed
  outstandingSubtotal: number;
  outstandingTax: number;
  cashSubtotal: number;
  cashTax: number;
  cashTotal: number;
}

/**
 * Derived selector for active order totals.
 *
 * Replaces 9 separate state fields with computed values:
 * - activeOrderSubtotal → subtotal
 * - activeOrderTax → tax
 * - activeOrderTotal → total
 * - activeOrderDiscount → discount
 * - activeOrderItemCount → itemCount
 * - activeOrderTip → tip
 * - activeOrderAmountDue → amountDue
 * - activeOrderCashAmountDue → cashAmountDue
 *
 * Uses calculateOrderTotals with TTL caching (order-calculator.ts).
 * Hybrid authority: uses frontend calculator before first payment for real-time
 * accuracy, switches to backend amount_due after payments for authoritative values.
 */
export function useActiveOrderTotals(enabled = true): ActiveOrderTotals | null {
  const activeOrderId = useOrderStore((s) => enabled ? s.activeOrderId : null);
  const activeOrder = useOrderStore((s) =>
    enabled && s.activeOrderId ? s.ordersById[s.activeOrderId] : null
  );
  const taxRatesMap = useStoreSettingsStore((s) => enabled ? s.taxRatesMap : EMPTY_TAX_RATES_MAP);

  return useMemo(() => {
    if (!activeOrderId || !activeOrder) return null;

    const activeItems = activeOrder.items.filter((item) => !item.is_voided);

    // Calculate totals (uses TTL cache internally)
    const totals = calculateOrderTotals({
      items: activeOrder.items,
      checkDiscount: activeOrder.checkDiscount ?? null,
      taxRatesMap,
      payments: activeOrder.payments ?? [],
    });

    // Get tip from payments array (sum of all non-voided payment tips)
    const tip = (activeOrder.payments ?? [])
      .filter((p) => !p.isVoided)
      .reduce((sum, p) => sum + (p.tip_amount ?? 0), 0);

    // Backend values (authoritative after payments)
    const backendAmountDue = activeOrder.amount_due;
    const backendCashAmountDue = activeOrder.cash_amount_due;
    const hasPayments = (activeOrder.payments ?? []).some((p) => !p.isVoided);

    // Authority logic: frontend before first payment, backend after
    // Before payment: use frontend calculations for real-time accuracy
    // After payment: use backend values as source of truth for payment state
    const amountDue = hasPayments
      ? (backendAmountDue ?? totals.outstanding_total)
      : totals.outstanding_total;

    const cashAmountDue = hasPayments
      ? (backendCashAmountDue ?? totals.cash_outstanding_total)
      : totals.cash_outstanding_total;

    // Diagnostic: warn when frontend and backend values diverge
    if (hasPayments && backendAmountDue !== undefined &&
        Math.abs(backendAmountDue - totals.outstanding_total) > 0.02) {
      console.warn('[useActiveOrderTotals] Frontend/backend mismatch:', {
        frontend: totals.outstanding_total,
        backend: backendAmountDue,
        orderId: activeOrderId,
        // Diagnostic: dump payment cashSavings to verify derivation
        payments: (activeOrder.payments ?? []).map(p => ({
          id: p.id, amount: p.amount, isCashPriced: p.isCashPriced, cashSavings: p.cashSavings,
        })),
      });
    }

    // Helper to count query items accurately
    const itemCount = activeOrder.items
      .filter((item) => !item.is_voided)
      .reduce((sum, item) => sum + item.quantity, 0);

    return {
      subtotal: totals.subtotal,
      tax: totals.tax_amount,
      cashTax: totals.cash_tax_amount,
      total: totals.total_amount,
      discount: totals.discount_amount,
      itemCount,
      tip,
      amountDue,
      cashAmountDue,
      outstandingSubtotal: totals.outstanding_subtotal,
      outstandingTax: totals.outstanding_tax,
      cashSubtotal: totals.cash_subtotal,
      cashTotal: totals.cash_total_amount,
    };
  }, [activeOrderId, activeOrder, taxRatesMap]);
}

/**
 * Generalized order totals selector for any order ID.
 *
 * Phase 3.1: Fine Dining Table Management
 * Enables payment display for any table/order without needing it to be the active order.
 *
 * Uses the same hybrid authority logic as useActiveOrderTotals:
 * - Frontend calculator before first payment, backend amount_due after payments
 *
 * @param orderId - Local order ID (not db_order_id) to calculate totals for
 * @returns Order totals or null if order not found
 */
export function useOrderTotals(
  orderId: string | null,
): ActiveOrderTotals | null {
  const order = useOrderStore((s) => orderId ? s.ordersById[orderId] : null);
  const taxRatesMap = useStoreSettingsStore((s) => s.taxRatesMap);

  return useMemo(() => {
    if (!orderId || !order) return null;

    const activeItems = order.items.filter((item) => !item.is_voided);

    // Calculate totals (uses TTL cache internally)
    const totals = calculateOrderTotals({
      items: order.items,
      checkDiscount: order.checkDiscount ?? null,
      taxRatesMap,
      payments: order.payments ?? [],
    });

    // Get tip from payments array (sum of all non-voided payment tips)
    const tip = (order.payments ?? [])
      .filter((p) => !p.isVoided)
      .reduce((sum, p) => sum + (p.tip_amount ?? 0), 0);

    // Backend values (authoritative after payments)
    const backendAmountDue = order.amount_due;
    const backendCashAmountDue = order.cash_amount_due;
    const hasPayments = (order.payments ?? []).some((p) => !p.isVoided);

    // Authority logic: frontend before first payment, backend after
    const amountDue = hasPayments
      ? (backendAmountDue ?? totals.outstanding_total)
      : totals.outstanding_total;

    const cashAmountDue = hasPayments
      ? (backendCashAmountDue ?? totals.cash_outstanding_total)
      : totals.cash_outstanding_total;

    // Diagnostic: warn when frontend and backend values diverge
    if (hasPayments && backendAmountDue !== undefined &&
        Math.abs(backendAmountDue - totals.outstanding_total) > 0.02) {
      console.warn('[useOrderTotals] Frontend/backend mismatch:', {
        frontend: totals.outstanding_total,
        backend: backendAmountDue,
        orderId,
      });
    }

    return {
      subtotal: totals.subtotal,
      tax: totals.tax_amount,
      cashTax: totals.cash_tax_amount,
      total: totals.total_amount,
      discount: totals.discount_amount,
      itemCount: activeItems.reduce((sum, item) => sum + item.quantity, 0),
      tip,
      amountDue,
      cashAmountDue,
      outstandingSubtotal: totals.outstanding_subtotal,
      outstandingTax: totals.outstanding_tax,
      cashSubtotal: totals.cash_subtotal,
      cashTotal: totals.cash_total_amount,
    };
  }, [orderId, order, taxRatesMap]);
}

// ═══════════════════════════════════════════════════════════════════════════
// SELECTOR: Working Set Orders (Phase 5)
// ═══════════════════════════════════════════════════════════════════════════
// Orders the user is actively working on (persisted across restarts)

export function useWorkingSetOrders(): OrderProfile[] {
  const workingSetOrderIds = useOrderStore((s) => s.workingSetOrderIds);
  const ordersById = useOrderStore((s) => s.ordersById);

  const sorted = useMemo(() => {
    const result: OrderProfile[] = [];
    for (const dbId of workingSetOrderIds) {
      const order = ordersById[dbId];
      if (order) result.push(order);
    }
    result.sort((a, b) => {
      const aTime = new Date(a.opened_at || 0).getTime();
      const bTime = new Date(b.opened_at || 0).getTime();
      return bTime - aTime;
    });
    return result;
  }, [workingSetOrderIds, ordersById]);

  return useStableOrderList(sorted);
}

// ═══════════════════════════════════════════════════════════════════════════
// SELECTOR: Station Orders (for OrderLineSection)
// ═══════════════════════════════════════════════════════════════════════════
// Returns orders for this station's active order line:
// - Working set orders OR orders from this station
// - Excludes Dine In orders (handled by table/floor plan flow)
// - order_status NOT IN ('completed', 'voided', 'cancelled', 'void')
// - Must have items

const INACTIVE_STATUSES = new Set(["completed", "voided", "cancelled", "void"]);
const DINE_IN_TYPES = new Set(["Dine In", "dine_in"]);

export function useStationOrders(): OrderProfile[] {
  const ordersById = useOrderStore((s) => s.ordersById);
  const currentStationId = useOrderStore((s) => s.currentStationId);
  const workingSetOrderIds = useOrderStore((s) => s.workingSetOrderIds);
  const daysToShow = useSettingsStore((s) => s.orderLineSettings.daysToShow);

  const cutoffTime = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - daysToShow);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }, [daysToShow]);

  const filtered = useMemo(() => {
    if (!currentStationId) return [];

    const workingSet = new Set(workingSetOrderIds);

    const result: OrderProfile[] = [];
    const keys = Object.keys(ordersById);
    for (let i = 0; i < keys.length; i++) {
      const order = ordersById[keys[i]];
      if (DINE_IN_TYPES.has(order.order_type ?? "")) continue;
      if (INACTIVE_STATUSES.has(order.order_status ?? "")) continue;
      if (!order.items || order.items.length === 0) continue;
      if (order.order_status === "draft") continue;

      const orderTime = new Date(order.opened_at || 0).getTime();
      if (orderTime < cutoffTime) continue;

      const isInWorkingSet =
        order.db_order_id && workingSet.has(order.db_order_id);
      const isOurStationOrder = order.station_id === currentStationId;
      if (isInWorkingSet || isOurStationOrder) {
        result.push(order);
      }
    }

    result.sort((a, b) => {
      const aTime = new Date(a.opened_at || 0).getTime();
      const bTime = new Date(b.opened_at || 0).getTime();
      return bTime - aTime;
    });
    return result;
  }, [ordersById, currentStationId, workingSetOrderIds, cutoffTime]);

  return useStableOrderList(filtered);
}

// ═══════════════════════════════════════════════════════════════════════════
// SELECTOR: Station Order Count (for badge)
// ═══════════════════════════════════════════════════════════════════════════

export function useStationOrderCount(): number {
  const stationOrders = useStationOrders();
  return stationOrders.length;
}

// ═══════════════════════════════════════════════════════════════════════════
// SELECTOR: Other Station Orders
// ═══════════════════════════════════════════════════════════════════════════
// Orders from other stations (for "From Other Stations" view)
// Phase 5: These are visible orders not from our station and not in working set

export function useOtherStationOrders(): OrderProfile[] {
  const ordersById = useOrderStore((s) => s.ordersById);
  const currentStationId = useOrderStore((s) => s.currentStationId);
  const workingSetOrderIds = useOrderStore((s) => s.workingSetOrderIds);

  const filtered = useMemo(() => {
    if (!currentStationId) return [];

    const workingSet = new Set(workingSetOrderIds);
    const result: OrderProfile[] = [];
    const keys = Object.keys(ordersById);

    for (let i = 0; i < keys.length; i++) {
      const order = ordersById[keys[i]];
      if (order.station_id === currentStationId) continue;
      if (order.db_order_id && workingSet.has(order.db_order_id)) continue;
      if (INACTIVE_STATUSES.has(order.order_status ?? "")) continue;
      result.push(order);
    }

    result.sort((a, b) => {
      const aTime = new Date(a.opened_at || 0).getTime();
      const bTime = new Date(b.opened_at || 0).getTime();
      return bTime - aTime;
    });
    return result;
  }, [ordersById, currentStationId, workingSetOrderIds]);

  return useStableOrderList(filtered);
}

// ═══════════════════════════════════════════════════════════════════════════
// SELECTOR: Order Type Counts (for filter tabs in OrderLineSection)
// ═══════════════════════════════════════════════════════════════════════════

export function useOrderTypeCounts(): Record<string, number> {
  const stationOrders = useStationOrders();
  return useMemo(() => {
    // Single-pass counting instead of 1 filter + 2 sub-filters
    let all = 0, takeaway = 0, delivery = 0;
    for (const o of stationOrders) {
      if (o.check_status === "Closed") continue;
      if (o.order_status === "completed" && o.paid_status === "Paid") continue;
      all++;
      if (o.order_type === "takeout") takeaway++;
      else if (o.order_type === "delivery") delivery++;
    }
    return { All: all, Takeaway: takeaway, Delivery: delivery };
  }, [stationOrders]);
}

// ═══════════════════════════════════════════════════════════════════════════
// SELECTOR: Previous Orders (for Previous Orders / History views)
// ═══════════════════════════════════════════════════════════════════════════
// Orders visible based on view_scope that are NOT in OrderLineSection
// Used by both PreviousOrdersSection and previous-orders.tsx page

export interface OrdersFilterState {
  orderTypes?: string[];
  status?: string[];
  showCompleted?: boolean;
}

export function usePreviousOrders(filters?: OrdersFilterState): OrderProfile[] {
  const ordersById = useOrderStore((s) => s.ordersById);
  const currentStationId = useOrderStore((s) => s.currentStationId);
  const currentStation = useOrderStore((s) => s.currentStation);
  const workingSetOrderIds = useOrderStore((s) => s.workingSetOrderIds);

  const filtered = useMemo(() => {
    if (!currentStationId || !currentStation) return [];

    const inactiveStatuses = new Set([
      "completed",
      "voided",
      "cancelled",
      "void",
    ]);
    const dineInTypes = new Set(["Dine In", "dine_in"]);
    const workingSet = new Set(workingSetOrderIds);

    // Get IDs that are in OrderLineSection to exclude (avoid duplicates)
    // Optimize: Single pass to build exclusion set
    const stationOrderIds = new Set<string>();

    const allOrders = Object.values(ordersById);

    // First pass mainly to identify station orders for exclusion
    for (const o of allOrders) {
      if (
        !dineInTypes.has(o.order_type ?? "") &&
        !inactiveStatuses.has(o.order_status ?? "") &&
        o.order_status !== "draft" &&
        o.items &&
        o.items.length > 0
      ) {
        const isInWorkingSet = o.db_order_id && workingSet.has(o.db_order_id);
        const isOurStationOrder = o.station_id === currentStationId;
        if (isInWorkingSet || isOurStationOrder) {
          stationOrderIds.add(o.id);
        }
      }
    }

    const viewScope = currentStation.view_scope || "own";
    const onlineTypes = new Set([
      "delivery",
      "takeout",
      "Delivery",
      "Takeaway",
    ]);

    let result = allOrders.filter((order) => {
      // Exclude orders already in OrderLineSection
      if (stationOrderIds.has(order.id)) return false;

      // Apply view_scope rules
      switch (viewScope) {
        case "own":
          // Only our station's orders
          if (order.station_id !== currentStationId) return false;
          break;

        case "location":
          // All orders allowed (already filtered by location in fetch)
          break;

        case "online":
          // Only online order types
          if (!onlineTypes.has(order.order_type ?? "")) return false;
          break;
      }

      return true;
    });

    // Apply user filters
    if (filters?.orderTypes?.length) {
      result = result.filter((o) =>
        filters.orderTypes!.includes(o.order_type as string),
      );
    }

    if (filters?.status?.length) {
      result = result.filter((o) =>
        filters.status!.includes(o.order_status as string),
      );
    }

    // Filter completed orders unless explicitly requested
    if (!filters?.showCompleted) {
      result = result.filter(
        (o) => !inactiveStatuses.has(o.order_status ?? ""),
      );
    }

    // Sort by created_at descending (most recent first)
    result.sort((a, b) => {
      const aTime = new Date(a.opened_at || 0).getTime();
      const bTime = new Date(b.opened_at || 0).getTime();
      return bTime - aTime;
    });
    return result;
  }, [
    ordersById,
    currentStationId,
    currentStation,
    workingSetOrderIds,
    filters,
  ]);

  return useStableOrderList(filtered);
}

// ═══════════════════════════════════════════════════════════════════════════
// SELECTOR: Other Station Order Count
// ═══════════════════════════════════════════════════════════════════════════
// Count of visible orders from other stations (for badge display)

export function useOtherStationOrderCount(): number {
  const otherOrders = useOtherStationOrders();
  return otherOrders.length;
}

// ═══════════════════════════════════════════════════════════════════════════
// @deprecated - use useOtherStationOrders instead
// ═══════════════════════════════════════════════════════════════════════════

export const useRemoteOrders = useOtherStationOrders;
export const useRemoteOrderCount = useOtherStationOrderCount;

// ═══════════════════════════════════════════════════════════════════════════
// SELECTOR: Order Line Filtered Orders (with structural memoization)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Filtered orders for order line display (non-dine-in, by daysToShow).
 * Uses useStableOrderList for referential stability when content unchanged.
 */
export function useOrderLineFilteredOrders(daysToShow: number): OrderProfile[] {
  const raw = useOrderStore(
    useShallow((state) => {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToShow);
      cutoffDate.setHours(0, 0, 0, 0);
      const cutoffTime = cutoffDate.getTime();
      const result: OrderProfile[] = [];
      for (let i = state.orderIds.length - 1; i >= 0; i--) {
        const o = state.ordersById[state.orderIds[i]];
        if (!o) continue;
        if (
          new Date(o.opened_at || 0).getTime() >= cutoffTime &&
          o.order_type !== "Dine In" &&
          o.order_type !== "dine_in" &&
          (((o.order_status === "preparing" || o.order_status === "sent_to_kitchen") && o.items.length > 0) ||
            ((o.paid_status === "Unpaid" || o.paid_status === "Pending" || o.paid_status === "Partial") &&
              o.order_status !== "completed" &&
              o.order_status !== "draft" &&
              o.order_status !== "void" &&
              o.check_status !== "Closed") ||
            (o.order_status === "ready" && o.paid_status === "Paid" && o.items.length > 0))
        ) {
          result.push(o);
        }
      }
      result.sort((a, b) =>
        new Date(b.opened_at || 0).getTime() - new Date(a.opened_at || 0).getTime()
      );
      return result;
    })
  );
  return useStableOrderList(raw);
}

// ═══════════════════════════════════════════════════════════════════════════
// SELECTOR: Single Order by ID (granular - benefits from immer structural sharing)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Subscribe to a specific order by its local ID.
 * With immer middleware, this returns a referentially stable object
 * for orders that haven't been mutated, preventing unnecessary re-renders.
 */
export function useOrder(orderId: string | null | undefined): OrderProfile | null {
  return useOrderStore((s) =>
    orderId ? s.ordersById[orderId] ?? null : null
  );
}

/**
 * Subscribe to a specific order by local ID or database UUID.
 * Resolves through dbOrderIdIndex for cross-station scenarios
 * (table sessions store DB UUIDs as order_id).
 */
export function useOrderByAnyId(
  idOrDbId: string | null | undefined,
): OrderProfile | null {
  return useOrderStore((s) => {
    if (!idOrDbId) return null;
    const localKey = s.dbOrderIdIndex[idOrDbId] ?? idOrDbId;
    return s.ordersById[localKey] ?? null;
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// SELECTOR: Active Order (granular - replaces ordersById[activeOrderId] pattern)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Subscribe to only the active order.
 * Replaces the common pattern: `const ordersById = useOrderStore(s => s.ordersById); ordersById[activeOrderId]`
 * With immer, only re-renders when the active order itself changes, not when other orders change.
 */
export function useActiveOrder(): OrderProfile | null {
  return useOrderStore((s) =>
    s.activeOrderId ? s.ordersById[s.activeOrderId] ?? null : null
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER: Check if order is from current station
// ═══════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════
// PRE-AUTH SELECTORS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Returns the active pre-auth payment for an order, if any.
 */
export function useOrderPreAuth(orderId?: string): OrderProfilePayment | undefined {
  return useOrderStore((s) => {
    if (!orderId) return undefined;
    const order = s.ordersById[orderId];
    if (!order?.payments) return undefined;
    return order.payments.find(
      (p) => p.status === "authorized" && p.isPreAuth && !p.isVoided
    );
  });
}

/**
 * Returns true if the order has an active (non-voided) pre-auth.
 */
export function useHasActivePreAuth(orderId?: string): boolean {
  return useOrderStore((s) => {
    if (!orderId) return false;
    const order = s.ordersById[orderId];
    if (!order?.payments) return false;
    return order.payments.some(
      (p) => p.status === "authorized" && p.isPreAuth && !p.isVoided
    );
  });
}

export function useIsOwnStationOrder(order: OrderProfile | null): boolean {
  const currentStationId = useOrderStore((s) => s.currentStationId);

  return useMemo(() => {
    if (!order || !currentStationId) return false;
    return order.station_id === currentStationId;
  }, [order, currentStationId]);
}
