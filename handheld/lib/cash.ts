import { round2 } from "@/utils/money";

/**
 * Pure helpers for the cash screen: the quick amounts a guest is likely to
 * hand over, and the change owed. Display only — recording cash is not wired
 * (see `screens/pay/unwired.ts`).
 */

/** Bills a guest rounds up to, smallest first. */
const ROUND_UP_TO = [5, 10, 20, 50, 100] as const;

/**
 * "Exact" plus the next multiple of each bill size above the balance,
 * deduplicated, at most `limit` in total: $37.40 offers $37.40, $40, $50,
 * $100.
 */
export function quickCashAmounts(due: number, limit = 4): number[] {
  if (!Number.isFinite(due) || due <= 0) return [];
  const out: number[] = [round2(due)];
  for (const bill of ROUND_UP_TO) {
    const next = Math.ceil(due / bill) * bill;
    if (next > due + 0.004 && !out.includes(next)) out.push(next);
    if (out.length >= limit) break;
  }
  return out;
}

/** Change owed, or 0 when the amount handed over does not cover the balance. */
export function changeDue(due: number, tendered: number): number {
  if (!Number.isFinite(due) || !Number.isFinite(tendered)) return 0;
  return tendered >= due ? round2(tendered - due) : 0;
}

/** Still owed after what was handed over; 0 once it is covered. */
export function stillOwed(due: number, tendered: number): number {
  if (!Number.isFinite(due)) return 0;
  const t = Number.isFinite(tendered) ? tendered : 0;
  return t >= due ? 0 : round2(due - t);
}
