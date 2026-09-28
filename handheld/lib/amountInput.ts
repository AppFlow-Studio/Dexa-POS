import type { KeypadKey } from "../primitives";

/**
 * One keypad press on a typed dollar amount: digits with at most one point,
 * two decimals and seven whole digits — CustomDiscountSheet's rule, amounts
 * only. Shared by every amount sheet (custom tip, cash, refund, tip adjust).
 */
export function typeAmount(current: string, key: KeypadKey): string {
  if (key === ".") return current.includes(".") ? current : current ? `${current}.` : "0.";
  const [whole, decimals] = current.split(".");
  if (decimals !== undefined && decimals.length >= 2) return current;
  if (decimals === undefined && whole.length >= 7) return current;
  if (current === "0" && key !== "00") return key;
  return current + key;
}

/** The typed string as a number; empty or "0." reads as 0. */
export function amountOf(raw: string): number {
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}
