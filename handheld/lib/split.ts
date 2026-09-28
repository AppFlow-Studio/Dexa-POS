import type { CartItem, OrderProfile } from "@/lib/types";
import { aggregateTaxByCategory, round2 } from "@/utils/money";

/**
 * Pure maths for the split screen: the even split, the unpaid lines, and a
 * group of lines priced the way the register's PayForItemsView prices a
 * selection (discounted subtotal, then tax aggregated per rate group and
 * rounded once per group). Display only — the amount a share is actually
 * charged is decided when the split is wired.
 */

/** A line with what is still unpaid on it. */
export interface OpenLine {
  item: CartItem;
  /** Units not yet covered by a payment. */
  quantity: number;
}

/** Unvoided lines with at least one unit left to pay, in check order. */
export function openLines(order: OrderProfile | null | undefined): OpenLine[] {
  if (!order) return [];
  const lines: OpenLine[] = [];
  for (const item of order.items) {
    if (item.is_voided) continue;
    const left = item.quantity - (item.paidQuantity ?? 0);
    if (left > 0) lines.push({ item, quantity: left });
  }
  return lines;
}

/** PayForItemsView's per-line subtotal: a pro-rated share of the line discount. */
function lineSubtotal({ item, quantity }: OpenLine): number {
  const discount = item.discount_amount ?? 0;
  if (quantity === item.quantity && discount > 0 && Number.isFinite(item.subtotal)) return item.subtotal;
  const gross = item.price * quantity;
  if (item.quantity > 0 && discount > 0) return round2(gross - round2((discount / item.quantity) * quantity));
  return round2(gross);
}

/** Subtotal + tax for a set of lines. */
export function linesDue(lines: readonly OpenLine[], taxRatesMap: Record<string, number>): number {
  let subtotal = 0;
  const taxLines = lines.map((line) => {
    const netSubtotal = lineSubtotal(line);
    subtotal += netSubtotal;
    return { netSubtotal, taxCategory: line.item.tax_category, isTaxExempt: line.item.is_tax_exempt };
  });
  return round2(round2(subtotal) + aggregateTaxByCategory(taxLines, taxRatesMap));
}

export interface SeatGroup {
  /** Seat number, or null for lines with no seat (shared). */
  seat: number | null;
  lines: OpenLine[];
}

/** Lines grouped by seat, seats ascending, shared lines last. */
export function groupBySeat(lines: readonly OpenLine[]): SeatGroup[] {
  const bySeat = new Map<number | null, OpenLine[]>();
  for (const line of lines) {
    const seat = line.item.seatNumber ?? null;
    const group = bySeat.get(seat);
    if (group) group.push(line);
    else bySeat.set(seat, [line]);
  }
  return [...bySeat.entries()]
    .sort(([a], [b]) => (a === null ? 1 : b === null ? -1 : a - b))
    .map(([seat, group]) => ({ seat, lines: group }));
}

/**
 * `total` in `ways` shares that add back to the cent: whole cents split
 * evenly, the leftover cents going one each to the first shares, so
 * $100.00 / 3 is $33.34, $33.33, $33.33.
 */
export function evenShares(total: number, ways: number): number[] {
  if (!Number.isFinite(total) || total <= 0 || ways < 1) return [];
  const cents = Math.round(total * 100);
  const base = Math.floor(cents / ways);
  const extra = cents - base * ways;
  return Array.from({ length: ways }, (_, i) => (base + (i < extra ? 1 : 0)) / 100);
}

/** Fewest and most ways the even split offers. */
export const MIN_WAYS = 2;
export const MAX_WAYS = 20;
