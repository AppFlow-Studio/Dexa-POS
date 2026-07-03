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
import type { CartItem, OrderProfile, OrderProfilePayment } from "@/lib/types";
import { useMemo, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import {
  selectSeenOrderIds,
  useOnlineOrderDrawerStore,
} from "../useOnlineOrderDrawerStore";
import { useOrderStore } from "../useOrderStore";
import { useSeatingStore } from "../useSeatingStore";
import { useServiceChargeRulesStore } from "../useServiceChargeRulesStore";
import { useSettingsStore } from "../useSettingsStore";
import { useStoreSettingsStore } from "../useStoreSettingsStore";
import { useTableSessionStore } from "../useTableSessionStore";

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

function hashNumber(value: number | null | undefined): number {
  if (value == null || !Number.isFinite(value)) return 0;
  return Math.round(value * 100);
}

function getOrderTime(value: string | null | undefined): number {
  if (!value) return 0;
  const time = Date.parse(value);
  return Number.isNaN(time) ? 0 : time;
}

function isOutstandingLocalEditAhead(
  order: OrderProfile,
  backendAmount: number | null | undefined,
  calculatedAmount: number,
): boolean {
  // Reopened checks can receive new local items before the backend header
  // catches up. Do not let the historical paid snapshot hide that new balance.
  const hasPendingCartEdit = order.items.some(
    (item) =>
      !item.isDraft &&
      (!item.db_order_item_id || item.sync_status === "pending"),
  );
  return (
    order.check_status === "Opened" &&
    (order._reopenedForOrdering || hasPendingCartEdit) &&
    calculatedAmount > (backendAmount ?? 0) + 0.01
  );
}

function resolveOutstandingAmount(
  order: OrderProfile,
  backendAmount: number | null | undefined,
  calculatedAmount: number,
): number {
  if (isOutstandingLocalEditAhead(order, backendAmount, calculatedAmount)) {
    return calculatedAmount;
  }
  return backendAmount ?? calculatedAmount;
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
    hash = ((hash << 5) - hash + hashStr(o.order_status ?? "")) | 0;
    hash = ((hash << 5) - hash + hashStr(o.paid_status ?? "")) | 0;
    hash = ((hash << 5) - hash + hashStr(o.check_status ?? "")) | 0;
    hash = ((hash << 5) - hash + hashStr(o.order_type ?? "")) | 0;
    hash = ((hash << 5) - hash + hashStr(o.customer_name ?? "")) | 0;
    hash = ((hash << 5) - hash + hashStr(o.customer_id ?? "")) | 0;
    hash = ((hash << 5) - hash + hashStr(o.service_location_id ?? "")) | 0;
    hash = ((hash << 5) - hash + hashStr(o.display_number ?? "")) | 0;
    hash = ((hash << 5) - hash + hashStr(o.order_number ?? "")) | 0;
    hash = ((hash << 5) - hash + getOrderTime(o.opened_at)) | 0;
    hash = ((hash << 5) - hash + (o.items?.length ?? 0)) | 0;
    hash = ((hash << 5) - hash + (o._broadcastItemCount ?? 0)) | 0;
    hash = ((hash << 5) - hash + (o.payments?.length ?? 0)) | 0;
    hash = ((hash << 5) - hash + hashNumber(o.total_amount)) | 0;
    hash = ((hash << 5) - hash + hashNumber(o.amount_due)) | 0;
    hash = ((hash << 5) - hash + hashNumber(o.cash_amount_due)) | 0;
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
  cashDiscount: number;
  itemCount: number;
  tip: number;
  // Outstanding amounts (what's left to pay)
  amountDue: number;
  cashAmountDue: number;
  // Full breakdown if needed
  outstandingSubtotal: number;
  outstandingTax: number;
  cashOutstandingSubtotal: number;
  cashOutstandingTax: number;
  cashSubtotal: number;
  cashTax: number;
  cashTotal: number;
  // Service charge (folded into total / cashTotal). Snapshot rate is preferred
  // (so live rule edits don't shift open orders); falls back to live rule.
  serviceCharge: number;
  cashServiceCharge: number;
  // Remaining (unpaid) SC for partially-paid orders. Equals serviceCharge when
  // nothing is paid. Lets the breakdown UI reconcile rows to balance due.
  outstandingServiceCharge: number;
  cashOutstandingServiceCharge: number;
  serviceChargeName: string;
  serviceChargeRate: number | null;
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
  const activeOrderId = useOrderStore((s) =>
    enabled ? s.activeOrderId : null,
  );
  const activeOrder = useOrderStore((s) =>
    enabled && s.activeOrderId ? s.ordersById[s.activeOrderId] : null,
  );
  const taxRatesMap = useStoreSettingsStore((s) =>
    enabled ? s.taxRatesMap : EMPTY_TAX_RATES_MAP,
  );

  // Service charge: rule (location-scoped) + party_size (session-scoped).
  // Subscribed so the totals re-derive when staff bumps the seat stepper or
  // the rules sync hook receives a fresh payload.
  const scLocationId = useStoreSettingsStore((s) =>
    enabled ? (s.selectedStore?.id ?? null) : null,
  );
  const serviceChargeRule = useServiceChargeRulesStore((s) =>
    enabled ? s.resolveRule(scLocationId) : null,
  );
  const sessionPartySize = useTableSessionStore((s) => {
    // O(1) lookup: useTableSessionStore.sessions is keyed by tableId, and an
    // order's service_location_id IS its tableId. The `sx.id === sessionId`
    // guard preserves the previous full-scan semantics exactly (including the
    // reseat/stale-session miss → null). Assumes tableId === service_location_id.
    const sessionId = activeOrder?.session_id;
    if (!enabled || !sessionId) return null;
    const locationId = activeOrder?.service_location_id;
    if (!locationId) return null;
    const sx = s.sessions[locationId];
    return sx && sx.id === sessionId ? sx.party_size ?? null : null;
  });
  // seatCount is the local UI truth (SeatSelector stepper), session.party_size
  // is the backend-authoritative fallback. order.guest_count intentionally not
  // read — it's a write-only mirror and gets wiped by broadcast hydration.
  const seatCount = useSeatingStore((s) =>
    enabled && activeOrderId ? (s.byOrderId[activeOrderId]?.seatCount ?? null) : null,
  );

  return useMemo(() => {
    if (!activeOrderId || !activeOrder) return null;

    const activeItems = activeOrder.items.filter((item) => !item.is_voided);

    // Fallback for order-processing dine-in orders: no seating store entry and
    // no table session means guest_count is the only available party size signal.
    const guestCountFallback =
      seatCount == null && sessionPartySize == null && !activeOrder.session_id &&
      typeof activeOrder.guest_count === "number" && activeOrder.guest_count > 0
        ? activeOrder.guest_count
        : null;
    const partySize = seatCount ?? sessionPartySize ?? guestCountFallback ?? null;

    // Calculate totals (uses TTL cache internally)
    const totals = calculateOrderTotals({
      items: activeOrder.items,
      checkDiscount: activeOrder.checkDiscount ?? null,
      taxRatesMap,
      payments: activeOrder.payments ?? [],
      preserveItemLevelOutstanding: activeOrder._reopenedForOrdering === true,
      serviceChargeRule,
      partySize,
      orderType: activeOrder.order_type ?? null,
      snapshottedRate: activeOrder.service_charge_rate ?? null,
      snapshottedAppliesOn: activeOrder.service_charge_applies_on ?? null,
      snapshottedName: activeOrder.service_charge_name ?? null,
      manualServiceCharge: activeOrder.service_charge_is_manual === true
        ? (activeOrder.service_charge ?? 0)
        : null,
      manualServiceChargeTaxable: activeOrder.service_charge_is_taxable ?? null,
      serverConfirmedServiceCharge: activeOrder.service_charge_is_manual !== true
        ? (activeOrder.service_charge ?? null)
        : null,
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
      ? resolveOutstandingAmount(
          activeOrder,
          backendAmountDue,
          totals.outstanding_total,
        )
      : totals.outstanding_total;

    const cashAmountDue = hasPayments
      ? resolveOutstandingAmount(
          activeOrder,
          backendCashAmountDue,
          totals.cash_outstanding_total,
        )
      : totals.cash_outstanding_total;

    // Diagnostic: warn when frontend and backend values diverge
    if (
      hasPayments &&
      backendAmountDue !== undefined &&
      !isOutstandingLocalEditAhead(
        activeOrder,
        backendAmountDue,
        totals.outstanding_total,
      ) &&
      Math.abs(backendAmountDue - totals.outstanding_total) > 0.02
    ) {
      console.warn("[useActiveOrderTotals] Frontend/backend mismatch:", {
        frontend: totals.outstanding_total,
        backend: backendAmountDue,
        orderId: activeOrderId,
        // Diagnostic: dump payment cashSavings to verify derivation
        payments: (activeOrder.payments ?? []).map((p) => ({
          id: p.id,
          amount: p.amount,
          isCashPriced: p.isCashPriced,
          cashSavings: p.cashSavings,
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
      cashDiscount: totals.cash_discount_amount,
      itemCount,
      tip,
      amountDue,
      cashAmountDue,
      outstandingSubtotal: totals.outstanding_subtotal,
      outstandingTax: totals.outstanding_tax,
      cashOutstandingSubtotal: totals.cash_outstanding_subtotal,
      cashOutstandingTax: totals.cash_outstanding_tax,
      cashSubtotal: totals.cash_subtotal,
      cashTotal: totals.cash_total_amount,
      serviceCharge: totals.service_charge,
      cashServiceCharge: totals.cash_service_charge,
      outstandingServiceCharge: totals.outstanding_service_charge,
      cashOutstandingServiceCharge: totals.cash_outstanding_service_charge,
      serviceChargeName: totals.service_charge_name,
      // Amount-mode manual overrides have a flat dollar SC with no rate —
      // showing the auto-rule rate as a fallback misleads the cashier (the SC
      // shown is the manager's flat amount, not rule × subtotal).
      serviceChargeRate:
        activeOrder.service_charge_rate ??
        (activeOrder.service_charge_is_manual
          ? null
          : serviceChargeRule?.rate_percent ?? null),
    };
  }, [
    activeOrderId,
    activeOrder,
    taxRatesMap,
    serviceChargeRule,
    sessionPartySize,
    seatCount,
  ]);
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
  const order = useOrderStore((s) => (orderId ? s.ordersById[orderId] : null));
  const taxRatesMap = useStoreSettingsStore((s) => s.taxRatesMap);

  const scLocationId = useStoreSettingsStore(
    (s) => s.selectedStore?.id ?? null,
  );
  const serviceChargeRule = useServiceChargeRulesStore((s) =>
    s.resolveRule(scLocationId),
  );
  const sessionPartySize = useTableSessionStore((s) => {
    // O(1) lookup keyed by tableId (= order.service_location_id); the
    // `sx.id === sessionId` guard preserves the old full-scan semantics.
    const sessionId = order?.session_id;
    if (!sessionId) return null;
    const locationId = order?.service_location_id;
    if (!locationId) return null;
    const sx = s.sessions[locationId];
    return sx && sx.id === sessionId ? sx.party_size ?? null : null;
  });
  const seatCount = useSeatingStore((s) =>
    orderId ? (s.byOrderId[orderId]?.seatCount ?? null) : null,
  );

  return useMemo(() => {
    if (!orderId || !order) return null;

    const activeItems = order.items.filter((item) => !item.is_voided);

    const guestCountFallback =
      seatCount == null && sessionPartySize == null && !order.session_id &&
      typeof order.guest_count === "number" && order.guest_count > 0
        ? order.guest_count
        : null;
    const partySize = seatCount ?? sessionPartySize ?? guestCountFallback ?? null;

    // Calculate totals (uses TTL cache internally)
    const totals = calculateOrderTotals({
      items: order.items,
      checkDiscount: order.checkDiscount ?? null,
      taxRatesMap,
      payments: order.payments ?? [],
      preserveItemLevelOutstanding: order._reopenedForOrdering === true,
      serviceChargeRule,
      partySize,
      orderType: order.order_type ?? null,
      snapshottedRate: order.service_charge_rate ?? null,
      snapshottedAppliesOn: order.service_charge_applies_on ?? null,
      snapshottedName: order.service_charge_name ?? null,
      manualServiceCharge: order.service_charge_is_manual === true
        ? (order.service_charge ?? 0)
        : null,
      manualServiceChargeTaxable: order.service_charge_is_taxable ?? null,
      serverConfirmedServiceCharge: order.service_charge_is_manual !== true
        ? (order.service_charge ?? null)
        : null,
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
      ? resolveOutstandingAmount(order, backendAmountDue, totals.outstanding_total)
      : totals.outstanding_total;

    const cashAmountDue = hasPayments
      ? resolveOutstandingAmount(
          order,
          backendCashAmountDue,
          totals.cash_outstanding_total,
        )
      : totals.cash_outstanding_total;

    // Diagnostic: warn when frontend and backend values diverge
    if (
      hasPayments &&
      backendAmountDue !== undefined &&
      !isOutstandingLocalEditAhead(
        order,
        backendAmountDue,
        totals.outstanding_total,
      ) &&
      Math.abs(backendAmountDue - totals.outstanding_total) > 0.02
    ) {
      console.warn("[useOrderTotals] Frontend/backend mismatch:", {
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
      cashDiscount: totals.cash_discount_amount,
      itemCount: activeItems.reduce((sum, item) => sum + item.quantity, 0),
      tip,
      amountDue,
      cashAmountDue,
      outstandingSubtotal: totals.outstanding_subtotal,
      outstandingTax: totals.outstanding_tax,
      cashOutstandingSubtotal: totals.cash_outstanding_subtotal,
      cashOutstandingTax: totals.cash_outstanding_tax,
      cashSubtotal: totals.cash_subtotal,
      cashTotal: totals.cash_total_amount,
      serviceCharge: totals.service_charge,
      cashServiceCharge: totals.cash_service_charge,
      outstandingServiceCharge: totals.outstanding_service_charge,
      cashOutstandingServiceCharge: totals.cash_outstanding_service_charge,
      serviceChargeName: totals.service_charge_name,
      serviceChargeRate:
        order.service_charge_rate ??
        (order.service_charge_is_manual
          ? null
          : serviceChargeRule?.rate_percent ?? null),
    };
  }, [orderId, order, taxRatesMap, serviceChargeRule, sessionPartySize, seatCount]);
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
// - order_status NOT IN ('completed', 'voided', 'cancelled', 'void')
// - Must have items

const INACTIVE_STATUSES = new Set([
  "completed",
  "voided",
  "cancelled",
  "void",
  "declined", // online-order manual-decline is terminal
]);
export function useStationOrders(): OrderProfile[] {
  const ordersById = useOrderStore((s) => s.ordersById);
  const orderIds = useOrderStore((s) => s.orderIds);
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
    // Iterate the pre-maintained orderIds array instead of allocating a fresh
    // Object.keys(ordersById) on every evaluation.
    for (let i = 0; i < orderIds.length; i++) {
      const order = ordersById[orderIds[i]];
      if (!order) continue;
      if (INACTIVE_STATUSES.has(order.order_status ?? "")) continue;
      if (!order.items || order.items.length === 0) continue;

      const orderTime = new Date(order.opened_at || 0).getTime();
      if (orderTime < cutoffTime) continue;

      const isInWorkingSet =
        order.db_order_id && workingSet.has(order.db_order_id);
      const isOurStationOrder = order.station_id === currentStationId;

      // Draft orders: only show if they belong to this station (don't show
      // remote drafts — they aren't visible until sent to kitchen).
      if (order.order_status === "draft" && !isOurStationOrder) continue;

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
  }, [ordersById, orderIds, currentStationId, workingSetOrderIds, cutoffTime]);

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
  const orderIds = useOrderStore((s) => s.orderIds);
  const currentStationId = useOrderStore((s) => s.currentStationId);
  const workingSetOrderIds = useOrderStore((s) => s.workingSetOrderIds);

  const filtered = useMemo(() => {
    if (!currentStationId) return [];

    const workingSet = new Set(workingSetOrderIds);
    const result: OrderProfile[] = [];

    // Iterate the pre-maintained orderIds array instead of Object.keys(ordersById).
    for (let i = 0; i < orderIds.length; i++) {
      const order = ordersById[orderIds[i]];
      if (!order) continue;
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
  }, [ordersById, orderIds, currentStationId, workingSetOrderIds]);

  return useStableOrderList(filtered);
}

// ═══════════════════════════════════════════════════════════════════════════
// SELECTOR: Order Type Counts (for filter tabs in OrderLineSection)
// ═══════════════════════════════════════════════════════════════════════════

export function useOrderTypeCounts(): Record<string, number> {
  const stationOrders = useStationOrders();
  return useMemo(() => {
    // Single-pass counting instead of 1 filter + 2 sub-filters
    let all = 0,
      takeaway = 0,
      delivery = 0;
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
  const orderIds = useOrderStore((s) => s.orderIds);
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
      "declined",
    ]);
    const dineInTypes = new Set(["Dine In", "dine_in"]);
    const workingSet = new Set(workingSetOrderIds);

    // Get IDs that are in OrderLineSection to exclude (avoid duplicates)
    // Optimize: Single pass to build exclusion set
    const stationOrderIds = new Set<string>();

    // Build from the pre-maintained orderIds array instead of Object.values.
    const allOrders: OrderProfile[] = [];
    for (let i = 0; i < orderIds.length; i++) {
      const o = ordersById[orderIds[i]];
      if (o) allOrders.push(o);
    }

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
    orderIds,
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
 * Filtered orders for order line display (today, all active with items).
 * Uses useStableOrderList for referential stability when content unchanged.
 */
export function useOrderLineFilteredOrders(): OrderProfile[] {
  const raw = useOrderStore(
    useShallow((state) => {
      const now = new Date();
      const startTime = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
      ).getTime();
      const endTime = startTime + 86_400_000 - 1;

      const myStationId = state.currentStationId;

      const result: OrderProfile[] = [];
      const seenOrderIds = new Set<string>();
      for (let i = state.orderIds.length - 1; i >= 0; i--) {
        const o = state.ordersById[state.orderIds[i]];
        if (!o) continue;

        const openedAt = getOrderTime(o.opened_at);
        if (openedAt < startTime || openedAt > endTime) continue;
        if (INACTIVE_STATUSES.has(o.order_status ?? "")) continue;
        if (!(o.items.length > 0 || (o._broadcastItemCount ?? 0) > 0)) continue;

        // Drafts are station-private. station_id == null lets external/online
        // drafts (e.g. order_source='online') through.
        if (
          o.order_status === "draft" &&
          o.station_id != null &&
          myStationId != null &&
          o.station_id !== myStationId
        )
          continue;

        const canonicalId = o.db_order_id ?? o.id;
        if (seenOrderIds.has(canonicalId)) continue;
        seenOrderIds.add(canonicalId);
        result.push(o);
      }
      result.sort(
        (a, b) => getOrderTime(b.opened_at) - getOrderTime(a.opened_at),
      );
      return result;
    }),
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
export function useOrder(
  orderId: string | null | undefined,
): OrderProfile | null {
  return useOrderStore((s) => (orderId ? (s.getOrder(orderId) ?? null) : null));
}

/**
 * Subscribe to a single item in a local order.
 * Immer keeps untouched item references stable when sibling items change.
 */
export function useOrderItem(
  orderId: string | null | undefined,
  itemId: string,
): CartItem | null {
  return useOrderStore((s) => {
    if (!orderId) return null;
    return s.getOrder(orderId)?.items.find((item) => item.id === itemId) ?? null;
  });
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
    s.activeOrderId ? (s.ordersById[s.activeOrderId] ?? null) : null,
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
export function useOrderPreAuth(
  orderId?: string,
): OrderProfilePayment | undefined {
  return useOrderStore((s) => {
    if (!orderId) return undefined;
    const order = s.ordersById[orderId];
    if (!order?.payments) return undefined;
    return order.payments.find(
      (p) => p.status === "authorized" && p.isPreAuth && !p.isVoided,
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
      (p) => p.status === "authorized" && p.isPreAuth && !p.isVoided,
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

// ═══════════════════════════════════════════════════════════════════════════
// SELECTOR: Pending Online Orders (online-orders Kanban "New" column)
// ═══════════════════════════════════════════════════════════════════════════
// Incoming online/QR orders awaiting manual Accept/Decline.
//
// Keyed on order_source==='online' + order_status==='pending' — NOT order_type.
// QR dine-in orders transform to order_type='takeout' (mapOrderType has no
// qr_dine_in case), so order_type cannot distinguish them. order_source is set
// to 'online' by process_online_order for ALL ingress paths (website/QR +
// Orderout aggregators), so this queue surfaces every pending online order.
// Auto-accepted aggregator orders are never 'pending', so they won't appear.

export function usePendingOnlineOrders(): OrderProfile[] {
  const ordersById = useOrderStore((s) => s.ordersById);
  const orderIds = useOrderStore((s) => s.orderIds);

  const filtered = useMemo(() => {
    const result: OrderProfile[] = [];
    for (let i = 0; i < orderIds.length; i++) {
      const o = ordersById[orderIds[i]];
      if (!o) continue;
      if (o.order_source !== "online") continue;
      if (o.order_status !== "pending") continue;
      result.push(o);
    }
    // Newest first
    result.sort((a, b) => getOrderTime(b.opened_at) - getOrderTime(a.opened_at));
    return result;
  }, [ordersById, orderIds]);

  return useStableOrderList(filtered);
}

// Online orders we never show on the Kanban (terminal / dropped).
// `completed` is intentionally KEPT so it can fill the "Done" column.
const ONLINE_EXCLUDED_STATUSES = new Set([
  "declined",
  "cancelled",
  "void",
  "voided",
  "refunded",
]);

/**
 * All active online orders (any non-terminal status), newest first.
 * The Kanban buckets these into its columns by order_status. Stable reference
 * via useStableOrderList so unrelated store mutations don't churn the board.
 */
export function useOnlineOrders(): OrderProfile[] {
  const ordersById = useOrderStore((s) => s.ordersById);
  const orderIds = useOrderStore((s) => s.orderIds);

  const filtered = useMemo(() => {
    const result: OrderProfile[] = [];
    for (let i = 0; i < orderIds.length; i++) {
      const o = ordersById[orderIds[i]];
      if (!o) continue;
      if (o.order_source !== "online") continue;
      if (ONLINE_EXCLUDED_STATUSES.has(o.order_status ?? "")) continue;
      result.push(o);
    }
    result.sort((a, b) => getOrderTime(b.opened_at) - getOrderTime(a.opened_at));
    return result;
  }, [ordersById, orderIds]);

  return useStableOrderList(filtered);
}

/**
 * Count of pending online orders for the nav/header badge.
 * Returns a primitive number, so subscribers re-render only when the count
 * changes — not when any order in the store mutates.
 */
export function usePendingOnlineOrderCount(): number {
  return useOrderStore((s) => {
    let n = 0;
    for (let i = 0; i < s.orderIds.length; i++) {
      const o = s.ordersById[s.orderIds[i]];
      if (o && o.order_source === "online" && o.order_status === "pending") n++;
    }
    return n;
  });
}

// Statuses that make an online order "active" for the right-edge drawer tab.
// Positive allowlist (unlike ONLINE_EXCLUDED_STATUSES): `completed` orders
// stay on the Kanban's Done column but don't keep the edge tab visible.
const TAB_ACTIVE_ONLINE_STATUSES = new Set([
  "pending",
  "accepted",
  "sent_to_kitchen",
  "preparing",
  "ready",
]);

function isTabActiveOnlineOrder(o: OrderProfile | undefined): o is OrderProfile {
  return (
    !!o &&
    o.order_source === "online" &&
    TAB_ACTIVE_ONLINE_STATUSES.has(o.order_status ?? "")
  );
}

/** The stable key used for online-order seen-tracking (matches the Kanban). */
export function getOnlineOrderKey(o: OrderProfile): string {
  return o.db_order_id ?? o.id;
}

/**
 * Count of active (pending → ready) online orders. Drives edge-tab
 * visibility. Primitive return — subscribers re-render only on count change.
 */
export function useActiveOnlineOrderCount(): number {
  return useOrderStore((s) => {
    let n = 0;
    for (let i = 0; i < s.orderIds.length; i++) {
      if (isTabActiveOnlineOrder(s.ordersById[s.orderIds[i]])) n++;
    }
    return n;
  });
}

/**
 * Count of active online orders NOT yet seen on this station (drawer store's
 * seen set). Drives the edge-tab badge. Two-store combine: subscribing to the
 * seen map re-renders on seen writes, and the order-store selector closure
 * re-evaluates with the fresh map on that render.
 */
export function useUnseenOnlineOrderCount(): number {
  const seen = useOnlineOrderDrawerStore(selectSeenOrderIds);
  return useOrderStore((s) => {
    let n = 0;
    for (let i = 0; i < s.orderIds.length; i++) {
      const o = s.ordersById[s.orderIds[i]];
      if (isTabActiveOnlineOrder(o) && !seen[getOnlineOrderKey(o)]) n++;
    }
    return n;
  });
}

/**
 * Non-hook snapshot of active online order keys. Used by the edge tab's
 * press handler to feed openDrawer/toggleDrawer without subscribing the tab
 * to the full order list.
 */
export function getActiveOnlineOrderKeys(): string[] {
  const s = useOrderStore.getState();
  const keys: string[] = [];
  for (let i = 0; i < s.orderIds.length; i++) {
    const o = s.ordersById[s.orderIds[i]];
    if (isTabActiveOnlineOrder(o)) keys.push(getOnlineOrderKey(o));
  }
  return keys;
}
