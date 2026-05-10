import type { OrderProfile } from "@/lib/types";
import {
  forceSetLocalSequence,
  generateLocalOrderNumbers,
  parseSequenceFromDisplayNumber,
} from "@/lib/localOrderSequence";

export function isReusableEmptyDraftOrder(
  order: OrderProfile | null | undefined,
): boolean {
  if (!order) return false;

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
): string | null {
  const reusableId = [...orderIds]
    .reverse()
    .find((orderId) => {
      if (excludeOrderId && orderId === excludeOrderId) return false;
      return isReusableEmptyDraftOrder(ordersById[orderId]);
    });

  return reusableId ?? null;
}

function getDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

export function getReliableTodaySequenceFloor(
  ordersById: Record<string, OrderProfile | undefined>,
  orderIds: string[],
  stationNumber: number | null,
): number {
  const allOrders = orderIds.map((id) => ordersById[id]).filter(Boolean) as OrderProfile[];
  const stationPrefix = stationNumber != null ? `S${stationNumber}` : null;
  const todayDateKey = getDateKey(new Date());
  const todayOrderPrefix = `ORD-${todayDateKey}-`;

  let reliableHighestSeq = 0;

  const isMeaningfulOrder = (order: OrderProfile) =>
    order.items.length > 0 ||
    order.service_location_id !== null ||
    !!order.customer_name ||
    !!order.customer_id ||
    order.order_status !== "draft" ||
    order.paid_status === "Paid";

  for (const order of allOrders) {
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

    if (!isMeaningfulOrder(order)) continue;

    const seq = parseSequenceFromDisplayNumber(displayNumber);
    if (seq > reliableHighestSeq) reliableHighestSeq = seq;
  }

  return reliableHighestSeq;
}

export function getRefreshedReusableDraftNumbers({
  draftId,
  ordersById,
  orderIds,
  locationId,
  stationNumber,
}: {
  draftId: string;
  ordersById: Record<string, OrderProfile | undefined>;
  orderIds: string[];
  locationId: string;
  stationNumber: number | null;
}): { displayNumber: string; orderNumber: string } | null {
  const draft = ordersById[draftId];
  if (!isReusableEmptyDraftOrder(draft)) return null;

  const reliableHighestSeq = getReliableTodaySequenceFloor(
    ordersById,
    orderIds,
    stationNumber,
  );
  const todayDateKey = getDateKey(new Date());
  const todayOrderPrefix = `ORD-${todayDateKey}-`;
  const takenDisplayNumbers = new Set(
    orderIds
      .filter((id) => id !== draftId)
      .map((id) => ordersById[id]?.display_number)
      .filter(Boolean),
  );
  const currentSeq = parseSequenceFromDisplayNumber(draft.display_number);

  const shouldRefreshLocalNumber =
    !draft.order_number ||
    !draft.order_number.startsWith(todayOrderPrefix) ||
    (!!draft.display_number && takenDisplayNumbers.has(draft.display_number)) ||
    currentSeq > reliableHighestSeq + 1;

  if (!shouldRefreshLocalNumber) return null;

  forceSetLocalSequence(locationId, stationNumber, reliableHighestSeq);
  return generateLocalOrderNumbers(locationId, stationNumber);
}
