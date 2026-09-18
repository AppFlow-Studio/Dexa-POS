import type { OrderProfile } from "@/lib/types";
import {
  generateLocalOrderNumbers,
  parseSequenceFromDisplayNumber,
} from "@/lib/localOrderSequence";

function getDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

/**
 * Is this order's number from an earlier business day?
 *
 * `order_number` carries the date it was minted (ORD-20260908-S1-0003), so it
 * answers this on its own. Orders that have a display number but no order
 * number (legacy rows) fall back to when they were opened. An order with no
 * number at all is not stale — it has nothing to carry over — and will be
 * numbered when its row is written.
 */
function hasPreviousDayNumber(order: OrderProfile): boolean {
  if (!order.display_number && !order.order_number) return false;

  const todayKey = getDateKey(new Date());
  if (order.order_number) {
    return !order.order_number.startsWith(`ORD-${todayKey}-`);
  }

  if (!order.opened_at) return false;
  const openedAt = new Date(order.opened_at);
  if (Number.isNaN(openedAt.getTime())) return false;
  return getDateKey(openedAt) !== todayKey;
}

export function isReusableEmptyDraftOrder(
  order: OrderProfile | null | undefined,
  currentStationId?: string | null,
): order is OrderProfile {
  if (!order) return false;

  // Drafts owned by another station are read-only here; reusing one would
  // leave the user stuck on a locked order (the "New Order button does
  // nothing after switching stations" bug).
  if (
    currentStationId &&
    order.station_id != null &&
    order.station_id !== currentStationId
  ) {
    return false;
  }

  // Yesterday's leftover draft keeps yesterday's number, and that number is
  // already on the server (every draft is written the moment it goes active).
  // Reusing it would either show a stale date on today's ticket or force a
  // local renumber that the server never hears about. Start a fresh order
  // instead and let the stale draft be reaped.
  if (hasPreviousDayNumber(order)) return false;

  const hasNonVoidedPayments =
    order.payments?.some((payment) => !payment.isVoided) ?? false;
  const totalAmount = Number(order.total_amount ?? 0);
  const amountDue = Number(order.amount_due ?? 0);
  const cashAmountDue = Number(order.cash_amount_due ?? 0);
  const amountPaid = Number(order.amount_paid ?? 0);
  const hasFinancialFootprint =
    totalAmount > 0.001 ||
    amountDue > 0.001 ||
    cashAmountDue > 0.001 ||
    amountPaid > 0.001;

  return (
    order.order_status === "draft" &&
    Array.isArray(order.items) &&
    order.items.length === 0 &&
    order.service_location_id === null &&
    order.paid_status !== "Paid" &&
    !order.customer_name &&
    !order.customer_id &&
    !order.notes?.trim() &&
    !hasNonVoidedPayments &&
    !hasFinancialFootprint
  );
}

export function findLatestReusableEmptyDraftId(
  ordersById: Record<string, OrderProfile | undefined>,
  orderIds: string[],
  excludeOrderId?: string | null,
  currentStationId?: string | null,
): string | null {
  const reusableId = [...orderIds]
    .reverse()
    .find((orderId) => {
      if (excludeOrderId && orderId === excludeOrderId) return false;
      return isReusableEmptyDraftOrder(ordersById[orderId], currentStationId);
    });

  return reusableId ?? null;
}

/**
 * The highest sequence number this device can still SEE for today + station.
 *
 * ── Why empty drafts count ─────────────────────────────────────────────────
 *
 * This used to have a sibling that skipped "not meaningful" orders (empty
 * drafts) so an abandoned draft would not push the counter up, and
 * `startNewOrder` used that one. The result was a floor BELOW a number an
 * order on screen was still displaying, so the next order could be handed a
 * duplicate of it. A number stops being available the moment something holds
 * it — whether or not anything has been rung onto it yet — so there is only
 * one floor and drafts count toward it.
 *
 * Scoped to today and to this station because the counter itself is
 * (location, day, station): a historical high from yesterday, or station 2's
 * numbering, must not bump station 1's next order.
 */
export function getTodaySequenceFloor(
  ordersById: Record<string, OrderProfile | undefined>,
  orderIds: string[],
  stationNumber: number | null,
): number {
  const stationPrefix = stationNumber != null ? `S${stationNumber}` : null;
  const todayDateKey = getDateKey(new Date());
  const todayOrderPrefix = `ORD-${todayDateKey}-`;

  let highest = 0;

  for (const orderId of orderIds) {
    const order = ordersById[orderId];
    if (!order) continue;

    const displayNumber = order.display_number;
    if (!displayNumber) continue;

    if (order.order_number) {
      if (!order.order_number.startsWith(todayOrderPrefix)) continue;
    } else if (order.opened_at) {
      const openedAtDate = new Date(order.opened_at);
      if (Number.isNaN(openedAtDate.getTime())) continue;
      if (getDateKey(openedAtDate) !== todayDateKey) continue;
    }

    if (stationPrefix) {
      if (!displayNumber.startsWith(`#${stationPrefix}-`)) continue;
    } else if (displayNumber.match(/^#S\d+-/)) {
      continue;
    }

    const seq = parseSequenceFromDisplayNumber(displayNumber);
    if (seq > highest) highest = seq;
  }

  return highest;
}

/**
 * Allocate the next order number for this device.
 *
 * THE single entry point for minting a number from the store's point of view.
 * Every order — takeout, dine-in seating, kiosk — takes its number from here
 * exactly once, at creation, and keeps it for life. Nothing renumbers an order
 * afterwards: the number is already in SQLite, already in the outbox op, and
 * under Decision 0.1 it is what the server stores.
 */
export function allocateOrderNumbers({
  ordersById,
  orderIds,
  locationId,
  stationNumber,
}: {
  ordersById: Record<string, OrderProfile | undefined>;
  orderIds: string[];
  locationId: string;
  stationNumber: number | null;
}): { displayNumber: string; orderNumber: string } {
  const floor = getTodaySequenceFloor(ordersById, orderIds, stationNumber);
  return generateLocalOrderNumbers(locationId, stationNumber, floor);
}
