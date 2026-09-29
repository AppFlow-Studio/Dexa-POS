import type { PerPaymentRefundDetail } from "@/hooks/orders/useRefundMutation";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { round2 } from "@/utils/money";
import Decimal from "decimal.js";
import { DateTime, Info } from "luxon";

/**
 * Data shapes and pure helpers for Kiosk Settings → Orders
 * (KioskOrdersPanel / KioskOrderDetail). No React here.
 */

export const PAGE_SIZE = 25;

/** Payment rows the refund pipeline treats as collected money. */
const COLLECTED_STATUSES = new Set(["captured", "refunded", "partially_refunded"]);

/** Same presets as the POS refund pane, so reports read the same. */
export const REFUND_REASONS = [
  "Customer request",
  "Incorrect amount",
  "Missing item",
  "Paid by other means",
  "Returned/cancelled order",
];

export const LIST_SELECT = `id, order_number, display_number, created_at, status, order_type,
  customer_name, total_amount,
  order_payments(id, amount, refunded_amount, status, is_voided)`;

export const DETAIL_SELECT = `id, order_number, display_number, created_at, status, order_type,
  customer_name, subtotal, tax_amount, discount_amount, service_charge, tip_amount,
  total_amount,
  order_items(id, item_name, is_open_item, open_item_name, quantity, subtotal,
    unit_price, is_voided, refunded_quantity, kitchen_status,
    order_item_modifiers(modifier_name, is_no, quantity)),
  order_payments(id, amount, tip_amount, refunded_amount, payment_method, status,
    is_voided, card_type, card_last_four, reference_number, transaction_id,
    initiated_at, is_settled, terminal_type)`;

export interface PaymentRow {
  id: string;
  amount: number | null;
  refunded_amount: number | null;
  status: string | null;
  is_voided: boolean | null;
  tip_amount?: number | null;
  payment_method?: string | null;
  card_type?: string | null;
  card_last_four?: string | null;
  reference_number?: string | null;
  transaction_id?: string | null;
  initiated_at?: string | null;
  /** True once the payment's batch is closed (batched out). */
  is_settled?: boolean | null;
  terminal_type?: string | null;
}

export interface OrderRow {
  id: string;
  order_number: string | null;
  display_number: string | null;
  created_at: string;
  status: string | null;
  order_type: string | null;
  customer_name: string | null;
  total_amount: number | null;
  order_payments: PaymentRow[] | null;
}

export interface ItemRow {
  id: string;
  item_name: string | null;
  is_open_item: boolean | null;
  open_item_name: string | null;
  quantity: number | null;
  subtotal: number | null;
  unit_price: number | null;
  is_voided: boolean | null;
  refunded_quantity: number | null;
  kitchen_status?: string | null;
  order_item_modifiers:
    | { modifier_name: string; is_no: boolean | null; quantity: number | null }[]
    | null;
}

export interface OrderDetailRow extends OrderRow {
  subtotal: number | null;
  tax_amount: number | null;
  discount_amount: number | null;
  service_charge: number | null;
  tip_amount: number | null;
  order_items: ItemRow[] | null;
}

// ── Money / status ───────────────────────────────────────────────────

export const isCollected = (p: PaymentRow) =>
  !p.is_voided && COLLECTED_STATUSES.has(p.status ?? "");

const remainingOf = (p: PaymentRow) =>
  Decimal.max(0, new Decimal(p.amount ?? 0).minus(p.refunded_amount ?? 0));

export function summarizePayments(payments: PaymentRow[] | null) {
  let paid = new Decimal(0);
  let refunded = new Decimal(0);
  let refundable = new Decimal(0);
  for (const p of payments ?? []) {
    if (!isCollected(p)) continue;
    paid = paid.plus(p.amount ?? 0);
    refunded = refunded.plus(p.refunded_amount ?? 0);
    refundable = refundable.plus(remainingOf(p));
  }
  return {
    paid: round2(paid),
    refunded: round2(refunded),
    refundable: round2(refundable),
  };
}

export type Tone = "green" | "amber" | "red" | "gray";

export const isVoidedOrder = (order: OrderRow) =>
  ["void", "voided", "cancelled"].includes((order.status ?? "").toLowerCase());

export function orderState(order: OrderRow): { label: string; tone: Tone } {
  if (isVoidedOrder(order)) return { label: "Voided", tone: "gray" };
  const { paid, refunded } = summarizePayments(order.order_payments);
  if (paid > 0 && refunded >= paid) return { label: "Refunded", tone: "red" };
  if (refunded > 0) return { label: "Partly refunded", tone: "amber" };
  if (paid > 0) return { label: "Paid", tone: "green" };
  return { label: "Unpaid", tone: "gray" };
}

/** Kitchen statuses after which there is nothing left for the kitchen to do. */
const KITCHEN_DONE = new Set(["served", "done", "completed", "voided"]);

/**
 * True while the kitchen still has work on this order: an item that isn't
 * voided, isn't fully refunded, and hasn't been served. A refund alone leaves
 * those tickets on the kitchen screen; cancelling the order clears them.
 */
export function isStillInKitchen(order: OrderDetailRow): boolean {
  if (isVoidedOrder(order)) return false;
  if ((order.status ?? "").toLowerCase() === "completed") return false;
  return (order.order_items ?? []).some(
    (item) =>
      !item.is_voided &&
      (item.refunded_quantity ?? 0) < (item.quantity ?? 1) &&
      !KITCHEN_DONE.has((item.kitchen_status ?? "").toLowerCase()),
  );
}

/** Reason recorded on an order cancelled together with its refund. */
export const refundCancelReason = (reason: string) => `Refunded: ${reason}`;

/**
 * CodePay cancels (voids) a payment that isn't batched out yet instead of
 * refunding it, and a void gives back the whole charge, tip included. Returns
 * what a full refund will really put back on the card(s) when that applies,
 * or null when the refund amount is all that goes back. `amount` excludes the
 * tip. RefundService makes the same call (processCodePayTerminalRefund).
 */
export function wholeChargeCancelTotal(payments: PaymentRow[]): number | null {
  let total = new Decimal(0);
  let tips = new Decimal(0);
  for (const p of payments) {
    if (!isCollected(p) || remainingOf(p).lte(0)) continue;
    const cancels =
      p.terminal_type === "codepay" &&
      !p.is_settled &&
      new Decimal(p.refunded_amount ?? 0).lte(0);
    const tip = cancels ? new Decimal(p.tip_amount ?? 0) : new Decimal(0);
    tips = tips.plus(tip);
    total = total.plus(remainingOf(p)).plus(tip);
  }
  return tips.gt(0) ? round2(total) : null;
}

/**
 * Splits a refund across the order's collected payments, oldest first. A full
 * refund takes every payment's remaining balance; a custom amount fills each
 * payment in turn until it is used up.
 */
export function buildRefundDetails(
  payments: PaymentRow[],
  amount: number,
  full: boolean,
): PerPaymentRefundDetail[] {
  let left = new Decimal(amount);
  const details: PerPaymentRefundDetail[] = [];
  payments.forEach((p, index) => {
    const remaining = remainingOf(p);
    if (!isCollected(p) || remaining.lte(0) || left.lte(0)) return;
    const take = full ? remaining : Decimal.min(remaining, left);
    left = left.minus(take);
    // Earlier refunds come off the order portion first, then the tip — the
    // same split the POS refund pane shows.
    const tip = new Decimal(p.tip_amount ?? 0);
    const orderPortion = new Decimal(p.amount ?? 0).minus(tip);
    const tipRefunded = Decimal.max(
      0,
      new Decimal(p.refunded_amount ?? 0).minus(orderPortion),
    );
    const tipToRefund = full ? Decimal.max(0, tip.minus(tipRefunded)) : new Decimal(0);
    details.push({
      paymentIndex: index,
      originalPaymentId: p.id,
      dbPaymentId: p.id,
      method: p.payment_method ?? "card",
      orderAmountToRefund: round2(take.minus(tipToRefund)),
      tipAmountToRefund: round2(tipToRefund),
      totalRefund: round2(take),
      referenceId: p.reference_number || p.transaction_id || undefined,
      last4: p.card_last_four ?? undefined,
      cardBrand: p.card_type ?? undefined,
    });
  });
  return details;
}

// ── Labels ───────────────────────────────────────────────────────────

/** Display numbers may already carry the "#" (kiosk ones read "#S10-0001"). */
export const orderNumber = (o: OrderRow) => {
  const n = o.display_number || o.order_number || o.id.slice(0, 6);
  return n.startsWith("#") ? n : `#${n}`;
};

const titleCase = (s: string) =>
  s
    .replace(/_/g, " ")
    .toLowerCase()
    .replace(/^\w/, (c) => c.toUpperCase());

export function orderTypeLabel(type: string | null) {
  if (type === "dine_in") return "Dine in";
  if (type === "takeout") return "Takeout";
  return type ? titleCase(type) : "";
}

export function paymentLabel(p: PaymentRow) {
  if (p.card_last_four) {
    const brand = p.card_type ? titleCase(p.card_type) : "Card";
    return `${brand} •••• ${p.card_last_four}`;
  }
  return titleCase(p.payment_method || "payment");
}

export function paymentStatusLabel(p: PaymentRow) {
  // Cancelling an order flags every payment voided, refunded ones included.
  // What happened to the money is that it was refunded.
  if (p.status === "refunded") return "Refunded";
  if (p.is_voided) return "Voided";
  if (p.status === "captured") return "Approved";
  return titleCase(p.status || "unknown");
}

/** Letters, digits and dashes only, so a search can't break the PostgREST `or` filter. */
export const cleanSearch = (s: string) => s.replace(/[^0-9A-Za-z-]/g, "");

// ── Dates (always in the store's timezone) ───────────────────────────

/**
 * The location's IANA zone, so "Today" means the store's day even if the
 * tablet's clock zone is set differently. Falls back to the device zone.
 */
function storeZone(): string {
  const tz = useStoreSettingsStore.getState().selectedStore?.timezone;
  return tz && Info.isValidIANAZone(tz) ? tz : "local";
}

export const storeToday = () => DateTime.now().setZone(storeZone()).startOf("day");

const inStoreZone = (iso: string) => DateTime.fromISO(iso).setZone(storeZone());

export const timeLabel = (iso: string) => inStoreZone(iso).toFormat("h:mm a");

export const dateTimeLabel = (iso: string) =>
  inStoreZone(iso).toFormat("ccc, LLL d · h:mm a");

/** "yyyy-MM-dd" of the store day an order was placed on. */
export const storeDayOf = (iso: string) => inStoreZone(iso).toISODate() ?? "";

/** "Sep 12" for a "yyyy-MM-dd" day. */
export const shortDay = (isoDate: string) =>
  DateTime.fromISO(isoDate).toFormat("LLL d");

/** Heading for a day group: Today, Yesterday, or "Monday, Sep 22". */
export function dayHeading(isoDate: string) {
  const today = storeToday();
  if (isoDate === today.toISODate()) return "Today";
  if (isoDate === today.minus({ days: 1 }).toISODate()) return "Yesterday";
  const d = DateTime.fromISO(isoDate);
  return d.toFormat(d.year === today.year ? "cccc, LLL d" : "cccc, LLL d, yyyy");
}

export type DatePreset = "today" | "yesterday" | "last7" | "last30" | "custom";

/** `start`/`end` are "yyyy-MM-dd" store days, set for "custom" only. */
export interface DateFilter {
  preset: DatePreset;
  start?: string;
  end?: string;
}

export const DATE_PRESETS: {
  preset: Exclude<DatePreset, "custom">;
  label: string;
  /** Empty-state wording: "No orders {phrase}". */
  phrase: string;
  fromDaysAgo: number;
  toDaysAgo: number;
}[] = [
  { preset: "today", label: "Today", phrase: "today", fromDaysAgo: 0, toDaysAgo: 0 },
  { preset: "yesterday", label: "Yesterday", phrase: "yesterday", fromDaysAgo: 1, toDaysAgo: 1 },
  { preset: "last7", label: "Last 7 days", phrase: "in the last 7 days", fromDaysAgo: 6, toDaysAgo: 0 },
  { preset: "last30", label: "Last 30 days", phrase: "in the last 30 days", fromDaysAgo: 29, toDaysAgo: 0 },
];

export interface DateRange {
  /** Inclusive UTC lower bound for `created_at`. */
  from: string;
  /** Exclusive UTC upper bound for `created_at`. */
  to: string;
  startDay: string;
  endDay: string;
  multiDay: boolean;
}

export function resolveDateRange(filter: DateFilter): DateRange {
  const zone = storeZone();
  const today = storeToday();
  let start = today;
  let end = today;
  if (filter.preset === "custom" && filter.start) {
    start = DateTime.fromISO(filter.start, { zone }).startOf("day");
    end = DateTime.fromISO(filter.end ?? filter.start, { zone }).startOf("day");
  } else {
    const p = DATE_PRESETS.find((x) => x.preset === filter.preset) ?? DATE_PRESETS[0];
    start = today.minus({ days: p.fromDaysAgo });
    end = today.minus({ days: p.toDaysAgo });
  }
  const startDay = start.toISODate() ?? "";
  const endDay = end.toISODate() ?? "";
  return {
    from: start.toUTC().toISO() ?? "",
    to: end.plus({ days: 1 }).toUTC().toISO() ?? "",
    startDay,
    endDay,
    multiDay: startDay !== endDay,
  };
}

/** "Sep 12" or "Sep 12 – Sep 14" for a custom range. */
export const customRangeLabel = (start: string, end?: string) =>
  !end || end === start ? shortDay(start) : `${shortDay(start)} – ${shortDay(end)}`;

/** Empty-state wording for the active filter: "today", "on Sep 12", … */
export function dateFilterPhrase(filter: DateFilter) {
  if (filter.preset === "custom" && filter.start) {
    return filter.end && filter.end !== filter.start
      ? `from ${customRangeLabel(filter.start, filter.end)}`
      : `on ${shortDay(filter.start)}`;
  }
  return DATE_PRESETS.find((p) => p.preset === filter.preset)?.phrase ?? "";
}
