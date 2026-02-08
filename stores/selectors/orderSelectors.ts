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
import type { OrderProfile } from "@/lib/types";
import { useMemo } from "react";
import { useOrderStore } from "../useOrderStore";
import { useSettingsStore } from "../useSettingsStore";
import { useStoreSettingsStore } from "../useStoreSettingsStore";

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
export function useActiveOrderTotals(): ActiveOrderTotals | null {
  const activeOrderId = useOrderStore((s) => s.activeOrderId);
  const activeOrder = useOrderStore((s) =>
    s.activeOrderId ? s.ordersById[s.activeOrderId] : null
  );
  const taxRatesMap = useStoreSettingsStore((s) => s.taxRatesMap);

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
  const ordersById = useOrderStore((s) => s.ordersById);
  const workingSetOrderIds = useOrderStore((s) => s.workingSetOrderIds);

  return useMemo(() => {
    return workingSetOrderIds
      .map((dbId) => ordersById[dbId])
      .filter(Boolean)
      .sort((a, b) => {
        const aTime = new Date(a.opened_at || 0).getTime();
        const bTime = new Date(b.opened_at || 0).getTime();
        return bTime - aTime;
      });
  }, [ordersById, workingSetOrderIds]);
}

// ═══════════════════════════════════════════════════════════════════════════
// SELECTOR: Station Orders (for OrderLineSection)
// ═══════════════════════════════════════════════════════════════════════════
// Returns orders for this station's active order line:
// - Working set orders OR orders from this station
// - Excludes Dine In orders (handled by table/floor plan flow)
// - order_status NOT IN ('completed', 'voided', 'cancelled', 'void')
// - Must have items

export function useStationOrders(): OrderProfile[] {
  const ordersById = useOrderStore((s) => s.ordersById);
  const currentStationId = useOrderStore((s) => s.currentStationId);
  const workingSetOrderIds = useOrderStore((s) => s.workingSetOrderIds);
  const daysToShow = useSettingsStore((s) => s.orderLineSettings.daysToShow);

  return useMemo(() => {
    if (!currentStationId) return [];

    const inactiveStatuses = new Set([
      "completed",
      "voided",
      "cancelled",
      "void",
    ]);
    const dineInTypes = new Set(["Dine In", "dine_in"]);
    const workingSet = new Set(workingSetOrderIds);

    // Calculate the cutoff date based on daysToShow setting
    // 0 = today only, 1 = today + yesterday, etc.
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToShow);
    cutoffDate.setHours(0, 0, 0, 0);
    const cutoffTime = cutoffDate.getTime();

    // Filter relevant orders directly
    return Object.values(ordersById)
      .filter((order) => {
        // Exclude Dine In orders (handled by table/floor plan flow)
        if (dineInTypes.has(order.order_type ?? "")) return false;

        // Must not be inactive
        if (inactiveStatuses.has(order.order_status ?? "")) return false;

        // Must have items
        if (!order.items || order.items.length === 0) return false;

        // Must not be draft status
        if (order.order_status === "draft") return false;

        // Filter by date - only show orders within the configured day range
        const orderTime = new Date(order.opened_at || 0).getTime();
        if (orderTime < cutoffTime) return false;

        // Include if: in working set OR our station's order
        const isInWorkingSet =
          order.db_order_id && workingSet.has(order.db_order_id);
        const isOurStationOrder = order.station_id === currentStationId;

        return isInWorkingSet || isOurStationOrder;
      })
      .sort((a, b) => {
        // Most recent first
        const aTime = new Date(a.opened_at || 0).getTime();
        const bTime = new Date(b.opened_at || 0).getTime();
        return bTime - aTime;
      });
  }, [ordersById, currentStationId, workingSetOrderIds, daysToShow]);
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

  return useMemo(() => {
    if (!currentStationId) return [];

    const workingSet = new Set(workingSetOrderIds);
    const inactiveStatuses = new Set([
      "completed",
      "voided",
      "cancelled",
      "void",
    ]);

    return Object.values(ordersById)
      .filter((order) => {
        // Must be from another station
        if (order.station_id === currentStationId) return false;

        // Must not be in working set (those show in StationOrders)
        if (order.db_order_id && workingSet.has(order.db_order_id))
          return false;

        // Must not be inactive
        if (inactiveStatuses.has(order.order_status ?? "")) return false;

        return true;
      })
      .sort((a, b) => {
        const aTime = new Date(a.opened_at || 0).getTime();
        const bTime = new Date(b.opened_at || 0).getTime();
        return bTime - aTime;
      });
  }, [ordersById, currentStationId, workingSetOrderIds]);
}

// ═══════════════════════════════════════════════════════════════════════════
// SELECTOR: Order Type Counts (for filter tabs in OrderLineSection)
// ═══════════════════════════════════════════════════════════════════════════

export function useOrderTypeCounts(): Record<string, number> {
  const stationOrders = useStationOrders();
  const OnlyUncomplete = stationOrders.filter(
    (o) =>
      o.order_status !== "completed" &&
      o.order_status !== "ready" &&
      o.paid_status !== "Paid",
  );
  return useMemo(() => {
    return {
      All: OnlyUncomplete.length,
      Takeaway: OnlyUncomplete.filter(
        (o) => o.order_type === "takeout" || o.order_type === "Takeaway",
      ).length,
      Delivery: OnlyUncomplete.filter(
        (o) => o.order_type === "delivery" || o.order_type === "Delivery",
      ).length,
    };
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

  return useMemo(() => {
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
    return result.sort((a, b) => {
      const aTime = new Date(a.opened_at || 0).getTime();
      const bTime = new Date(b.opened_at || 0).getTime();
      return bTime - aTime;
    });
  }, [
    ordersById,
    currentStationId,
    currentStation,
    workingSetOrderIds,
    filters,
  ]);
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
// HELPER: Check if order is from current station
// ═══════════════════════════════════════════════════════════════════════════

export function useIsOwnStationOrder(order: OrderProfile | null): boolean {
  const currentStationId = useOrderStore((s) => s.currentStationId);

  return useMemo(() => {
    if (!order || !currentStationId) return false;
    return order.station_id === currentStationId;
  }, [order, currentStationId]);
}
