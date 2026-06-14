import { round2 } from "@/utils/money";

export function calculateCustomSplitCashAmount(
  cardAmount: number,
  cardOutstanding: number,
  cashOutstanding: number,
): number {
  const cashRatio =
    cardOutstanding > 0 ? cashOutstanding / cardOutstanding : 1;
  return round2(cardAmount * cashRatio);
}
