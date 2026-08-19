import { round2 } from "@/utils/money";

export function calculateCustomSplitCashAmount(
  cardAmount: number,
  cardOutstanding: number,
  cashOutstanding: number,
): number {
  const cashRatio = cardOutstanding > 0 ? cashOutstanding / cardOutstanding : 1;
  return round2(cardAmount * cashRatio);
}

// Inverse of calculateCustomSplitCashAmount: given the CASH amount entered in
// the custom split view, derive the card (list-price) amount for that portion.
export function calculateCustomSplitCardAmount(
  cashAmount: number,
  cardOutstanding: number,
  cashOutstanding: number,
): number {
  const cashRatio = cardOutstanding > 0 ? cashOutstanding / cardOutstanding : 1;
  return round2(cashRatio > 0 ? cashAmount / cashRatio : cashAmount);
}
