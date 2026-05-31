/**
 * Service-charge distribution on Split-By-Item and Pay-For-Items.
 *
 * Why this exists: with `process_payment_v14` wired in
 * (`services/orderService.ts`, `stores/useOrderStore.ts:2721-2722`), the
 * server bakes the SC slice into v_payment_total for item payments and
 * computes change_given AFTER the bake-in. The cashier-facing prompt and
 * tendered amount must therefore include the proportional SC share, or
 * the cash drawer ends short.
 *
 * Two client paths already scale items+tax up by the SC share:
 *   - Split-By-Item: `stores/usePaymentStore.ts:793-852` (the source ===
 *     "split-by-item" branch inside `startSplitPaymentFlow`). Distributes
 *     `activeOrderOutstandingTotal − itemsOnlyCardTotal` across splits,
 *     last split absorbs the rounding remainder.
 *   - Pay-For-Items: `components/bill/paymentView/PayForItemsView.tsx:486-509`
 *     scales by `remainingAmount / allUnpaidCardTotals.total` and writes
 *     into `splits[0].amount`/`cashAmount`.
 *
 * These tests mirror the two production formulas as pure functions (same
 * pattern as `__tests__/recalculate-sc-drift-gate.test.ts`). If the
 * production code drifts, the mirrors diverge here and need to be
 * re-checked by hand against the new code.
 */

import { round2 } from "@/lib/order-calculator";

type SplitInput = { amount: number; cashAmount: number; itemCount: number };
type SplitOutput = { amount: number; cashAmount: number };

/**
 * Mirror of `stores/usePaymentStore.ts:804-852` (the
 * `source === "split-by-item"` block inside `startSplitPaymentFlow`).
 *
 * Inputs:
 *   splits — each entry's `amount`/`cashAmount` is the per-split items+tax
 *            (no SC). `itemCount` mirrors `split.items.length` and decides
 *            whether the split participates in the distribution.
 *   activeOrderOutstandingTotal — order-level card outstanding (SC-inclusive).
 *   activeOrderOutstandingCash  — order-level cash outstanding (SC-inclusive).
 *
 * Uses ONE shared ratio (per-split card items+tax / total card items+tax)
 * for both cardShare and cashShare so cash ≤ card per-split is preserved
 * under cash discount. Last item-split absorbs rounding on both sides.
 */
function distributeSplitByItemSC(args: {
  splits: SplitInput[];
  activeOrderOutstandingTotal: number;
  activeOrderOutstandingCash: number;
}): SplitOutput[] {
  const { splits, activeOrderOutstandingTotal, activeOrderOutstandingCash } =
    args;
  const itemSplitIndexes = splits
    .map((s, i) => (s.itemCount > 0 ? i : -1))
    .filter((i) => i >= 0);
  const itemsOnlyCardTotal = itemSplitIndexes.reduce(
    (sum, i) => sum + splits[i].amount,
    0,
  );
  const itemsOnlyCashTotal = itemSplitIndexes.reduce(
    (sum, i) => sum + splits[i].cashAmount,
    0,
  );
  void itemsOnlyCashTotal;
  const cardRemainder = Math.max(
    0,
    activeOrderOutstandingTotal - itemsOnlyCardTotal,
  );
  const cashRemainder = Math.max(
    0,
    activeOrderOutstandingCash - itemsOnlyCashTotal,
  );
  let distributedCard = 0;
  let distributedCash = 0;
  return splits.map((s, i) => {
    if (!itemSplitIndexes.includes(i)) return { amount: s.amount, cashAmount: s.cashAmount };
    const isLast = i === itemSplitIndexes[itemSplitIndexes.length - 1];
    const splitRatio =
      itemsOnlyCardTotal > 0 ? s.amount / itemsOnlyCardTotal : 0;
    const cardShare = isLast
      ? round2(cardRemainder - distributedCard)
      : round2(cardRemainder * splitRatio);
    const cashShare = isLast
      ? round2(cashRemainder - distributedCash)
      : round2(cashRemainder * splitRatio);
    distributedCard = round2(distributedCard + cardShare);
    distributedCash = round2(distributedCash + cashShare);
    return {
      amount: round2(s.amount + cardShare),
      cashAmount: round2(s.cashAmount + cashShare),
    };
  });
}

/**
 * Mirror of the SC-share computation now in
 * `components/bill/paymentView/PayForItemsView.tsx` near line ~410
 * (single items-ratio applied to both card and cash SC residual).
 */
function payForItemsScale(args: {
  selectedCardTotal: number;
  selectedCashTotal: number;
  allUnpaidCardTotal: number;
  allUnpaidCashTotal: number;
  remainingAmount: number;
  remainingCashAmount: number;
}): { amount: number; cashAmount: number } {
  const selectedItemsRatio =
    args.allUnpaidCardTotal > 0
      ? args.selectedCardTotal / args.allUnpaidCardTotal
      : 0;
  const cardScResidual = Math.max(0, args.remainingAmount - args.allUnpaidCardTotal);
  const cashScResidual = Math.max(
    0,
    args.remainingCashAmount - args.allUnpaidCashTotal,
  );
  return {
    amount: round2(args.selectedCardTotal + cardScResidual * selectedItemsRatio),
    cashAmount: round2(
      args.selectedCashTotal + cashScResidual * selectedItemsRatio,
    ),
  };
}

describe("Split-By-Item SC distribution", () => {
  test("N=2, SC>0: both splits sum exactly to order outstanding (card+cash)", () => {
    // Order: items+tax = $40, SC = $7.20, card outstanding = $47.20.
    // Cash pricing identical here for clarity (no dual-pricing delta).
    const splits = distributeSplitByItemSC({
      splits: [
        { amount: 20, cashAmount: 20, itemCount: 1 },
        { amount: 20, cashAmount: 20, itemCount: 1 },
      ],
      activeOrderOutstandingTotal: 47.2,
      activeOrderOutstandingCash: 47.2,
    });

    expect(splits[0].amount + splits[1].amount).toBeCloseTo(47.2, 2);
    expect(splits[0].cashAmount + splits[1].cashAmount).toBeCloseTo(47.2, 2);
    // Each split carries ≥ items+tax (i.e. SC share is added, not subtracted).
    expect(splits[0].amount).toBeGreaterThanOrEqual(20);
    expect(splits[1].amount).toBeGreaterThanOrEqual(20);
  });

  test("N=3 last split absorbs the rounding remainder", () => {
    // 3 splits × proportional shares would round to $16.67 each = $50.01,
    // overshooting the $50.00 outstanding by a cent. The last split takes
    // the negative-cent adjustment so the SUM equals outstanding exactly.
    const splits = distributeSplitByItemSC({
      splits: [
        { amount: 15, cashAmount: 15, itemCount: 1 },
        { amount: 15, cashAmount: 15, itemCount: 1 },
        { amount: 15, cashAmount: 15, itemCount: 1 },
      ],
      activeOrderOutstandingTotal: 50,
      activeOrderOutstandingCash: 50,
    });
    const sumCard = round2(
      splits.reduce((s, x) => s + x.amount, 0),
    );
    expect(sumCard).toBe(50);
    // First two splits share the proportional remainder; the third gets the
    // residual delta. The last split must differ from the first by the
    // rounding adjustment.
    expect(splits[0].amount).not.toBe(splits[2].amount);
  });

  test("N=2 with dual-pricing: card and cash distribute against separate outstandings", () => {
    // Items+tax card = $40; items+tax cash = $36 (10% cash discount).
    // SC card = $7.20; SC cash matches dollar-for-dollar = $7.20.
    // card outstanding = $47.20; cash outstanding = $43.20.
    const splits = distributeSplitByItemSC({
      splits: [
        { amount: 20, cashAmount: 18, itemCount: 1 },
        { amount: 20, cashAmount: 18, itemCount: 1 },
      ],
      activeOrderOutstandingTotal: 47.2,
      activeOrderOutstandingCash: 43.2,
    });
    expect(splits[0].amount + splits[1].amount).toBeCloseTo(47.2, 2);
    expect(splits[0].cashAmount + splits[1].cashAmount).toBeCloseTo(43.2, 2);
  });

  test("empty-item splits do not receive any SC share", () => {
    // Split B has no items (e.g. cashier hasn't assigned yet). Only split A
    // participates in the distribution. A absorbs the whole SC.
    const splits = distributeSplitByItemSC({
      splits: [
        { amount: 20, cashAmount: 20, itemCount: 1 },
        { amount: 0, cashAmount: 0, itemCount: 0 },
      ],
      activeOrderOutstandingTotal: 23.6,
      activeOrderOutstandingCash: 23.6,
    });
    expect(splits[0].amount).toBeCloseTo(23.6, 2);
    expect(splits[1].amount).toBe(0);
  });
});

describe("Pay-For-Items SC scaling", () => {
  test("half items: split amount strictly exceeds items+tax (carries SC share)", () => {
    // Order: items+tax = $44.00 across 4 items, SC = $7.92, outstanding = $51.92.
    // Selecting 2 items (items+tax = $22.00) should yield a split worth more
    // than $22 — exactly $22 × ($51.92 / $44.00) = $25.96.
    const r = payForItemsScale({
      selectedCardTotal: 22,
      selectedCashTotal: 22,
      allUnpaidCardTotal: 44,
      allUnpaidCashTotal: 44,
      remainingAmount: 51.92,
      remainingCashAmount: 51.92,
    });
    expect(r.amount).toBeCloseTo(25.96, 2);
    expect(r.amount).toBeGreaterThan(22);
  });

  test("all remaining items: split amount equals outstanding to the cent (closes order)", () => {
    // Selecting every unpaid item → scale = 1 + (SC/itemsOnly), and the
    // result equals the full outstanding. This is the v14 "closes_with_items"
    // case where the server snaps the SC residual onto this payment.
    const r = payForItemsScale({
      selectedCardTotal: 44,
      selectedCashTotal: 44,
      allUnpaidCardTotal: 44,
      allUnpaidCashTotal: 44,
      remainingAmount: 51.92,
      remainingCashAmount: 51.92,
    });
    expect(r.amount).toBeCloseTo(51.92, 2);
    expect(r.cashAmount).toBeCloseTo(51.92, 2);
  });

  test("no unpaid items (zero denominator): scale collapses to 1, no SC added", () => {
    // Edge case — `allUnpaidCardTotal = 0` (cashier opened pay-for-items on
    // an already-paid order). `selectedCardTotal` is also 0 in practice, so
    // the result is $0; the production fallback (`: 1`) is exercised but
    // doesn't materialize SC out of thin air.
    const r = payForItemsScale({
      selectedCardTotal: 0,
      selectedCashTotal: 0,
      allUnpaidCardTotal: 0,
      allUnpaidCashTotal: 0,
      remainingAmount: 0,
      remainingCashAmount: 0,
    });
    expect(r.amount).toBe(0);
    expect(r.cashAmount).toBe(0);
  });

  test("screenshot fixture: Mocha+Cappuccino, all selected → button shows SC-inclusive (matches cash sheet)", () => {
    // From the 2026-05-30 Pay-For-Items screenshot:
    //   Order total $21.52 (SC ~ $3.28), items+tax = $18.24 across both items,
    //   cash equivalent of remaining = $15.26 (cash discount $6.26).
    // Both items selected → selectedCardTotal == allUnpaidCardTotal == $18.24.
    // The bug we just fixed: pre-scale the strip + button showed $18.24 while
    // CashPaymentView then opened with $21.52. After the fix the scaled values
    // must equal the order's remaining (card $21.52 / cash $15.26).
    const r = payForItemsScale({
      selectedCardTotal: 18.24,
      selectedCashTotal: 11.98,
      allUnpaidCardTotal: 18.24,
      allUnpaidCashTotal: 11.98,
      remainingAmount: 21.52,
      remainingCashAmount: 15.26,
    });
    expect(r.amount).toBeCloseTo(21.52, 2);
    expect(r.cashAmount).toBeCloseTo(15.26, 2);
    // Card label strictly exceeds items+tax — SC share is present, not stripped.
    expect(r.amount).toBeGreaterThan(18.24);
  });

  test("dual-pricing: same items-ratio drives both sides; cash stays ≤ card", () => {
    // Items+tax card = $44, cash = $39.60 (10% cash discount). SC = $7.92
    // dollar-for-dollar on both. card outstanding = $51.92; cash outstanding
    // = $47.52. Selecting half (card $22 / cash $19.80).
    // Shared ratio = 22 / 44 = 0.5; cardRes = cashRes = 7.92.
    const r = payForItemsScale({
      selectedCardTotal: 22,
      selectedCashTotal: 19.8,
      allUnpaidCardTotal: 44,
      allUnpaidCashTotal: 39.6,
      remainingAmount: 51.92,
      remainingCashAmount: 47.52,
    });
    // card: 22 + 7.92 × 0.5 = 25.96
    expect(r.amount).toBeCloseTo(25.96, 2);
    // cash: 19.80 + 7.92 × 0.5 = 23.76 — same SC share, but cash starts
    // lower so cash stays strictly below card.
    expect(r.cashAmount).toBeCloseTo(23.76, 2);
    expect(r.cashAmount).toBeLessThan(r.amount);
  });

  test("Mocha-only screenshot fixture: cash stays ≤ card (Bug 2 regression)", () => {
    // From the 2026-05-30 trace: single Mocha selected (a fraction of all
    // unpaid items). Mocha card items+tax = $6.80; cash items+tax = $6.53.
    // All-unpaid card = $18.24; all-unpaid cash = $11.98. Order outstanding
    // = $21.52 card / $15.26 cash; SC residual = $3.28 on both sides.
    // Old formula gave Cash $8.32 > Card $8.02 (inverted cash discount).
    // New formula: ratio = 6.80/18.24 ≈ 0.373 used for BOTH sides.
    const r = payForItemsScale({
      selectedCardTotal: 6.8,
      selectedCashTotal: 6.53,
      allUnpaidCardTotal: 18.24,
      allUnpaidCashTotal: 11.98,
      remainingAmount: 21.52,
      remainingCashAmount: 15.26,
    });
    // card: 6.80 + 3.28 × 0.373 ≈ 8.02
    expect(r.amount).toBeCloseTo(8.02, 2);
    // cash: 6.53 + 3.28 × 0.373 ≈ 7.75 (was buggy $8.32 under old formula)
    expect(r.cashAmount).toBeCloseTo(7.75, 2);
    expect(r.cashAmount).toBeLessThan(r.amount);
  });
});

/**
 * Mirror of the SplitByItemView preview math (`components/bill/paymentView/
 * SplitByItemView.tsx:354-393`) that drives the bottom Card/Cash strip
 * during item-assignment (before the cashier taps "Start Payment").
 *
 *   activeSplitRatio = activeSplitItemTotal_cardTax / allItemsCardTotals_cardTax
 *   activeSplitCard.total = activeSplitItemTotal + cardRemainder * ratio
 *   activeSplitCash.total = activeSplitCashItemTotal + cashRemainder * ratio
 */
function previewSplitByItemSC(args: {
  activeSplitCardItemsTax: number;
  activeSplitCashItemsTax: number;
  allItemsCardTotal: number;
  allItemsCashTotal: number;
  cardRemainder: number;
  cashRemainder: number;
}): { card: number; cash: number } {
  const activeSplitRatio =
    args.allItemsCardTotal > 0
      ? args.activeSplitCardItemsTax / args.allItemsCardTotal
      : 0;
  return {
    card: round2(args.activeSplitCardItemsTax + args.cardRemainder * activeSplitRatio),
    cash: round2(args.activeSplitCashItemsTax + args.cashRemainder * activeSplitRatio),
  };
}

describe("Split-By-Item view preview (bottom Card/Cash strip)", () => {
  test("Mocha screenshot fixture: cash ≤ card per-guest (Bug 2 redux fix)", () => {
    // Live data from 2026-05-30 8:23 PM screenshot.
    // Seat 1 has Mocha; Shared has Cappuccino. Active = Seat 1.
    // Card residual = $3.28, cash residual = $3.28 (SC + tax-on-SC).
    // Mocha card items+tax = $6.80; Mocha cash items+tax = $6.53.
    // All-items card = $18.24; all-items cash = $11.98.
    // Pre-fix the cash side used a cash-ratio (0.545) which gave $8.32.
    // Post-fix uses the shared card-ratio (0.373) → $7.75, preserving
    // cash ≤ card per-guest.
    const r = previewSplitByItemSC({
      activeSplitCardItemsTax: 6.8,
      activeSplitCashItemsTax: 6.53,
      allItemsCardTotal: 18.24,
      allItemsCashTotal: 11.98,
      cardRemainder: 3.28,
      cashRemainder: 3.28,
    });
    expect(r.card).toBeCloseTo(8.02, 2);
    expect(r.cash).toBeCloseTo(7.75, 2);
    expect(r.cash).toBeLessThan(r.card);
  });

  test("Cappuccino (larger card share, bigger cash discount) also preserves cash ≤ card", () => {
    const r = previewSplitByItemSC({
      activeSplitCardItemsTax: 11.44,
      activeSplitCashItemsTax: 5.45,
      allItemsCardTotal: 18.24,
      allItemsCashTotal: 11.98,
      cardRemainder: 3.28,
      cashRemainder: 3.28,
    });
    // Card: 11.44 + 3.28 × (11.44/18.24) ≈ 13.50
    expect(r.card).toBeCloseTo(13.5, 2);
    // Cash: 5.45 + 3.28 × (11.44/18.24) ≈ 7.51 — much less than card $13.50,
    // matching the Cappuccino cash-discount magnitude.
    expect(r.cash).toBeCloseTo(7.51, 2);
    expect(r.cash).toBeLessThan(r.card);
  });

  test("the two guests sum to the order outstandings (no money lost in preview)", () => {
    const mocha = previewSplitByItemSC({
      activeSplitCardItemsTax: 6.8,
      activeSplitCashItemsTax: 6.53,
      allItemsCardTotal: 18.24,
      allItemsCashTotal: 11.98,
      cardRemainder: 3.28,
      cashRemainder: 3.28,
    });
    const cappuccino = previewSplitByItemSC({
      activeSplitCardItemsTax: 11.44,
      activeSplitCashItemsTax: 5.45,
      allItemsCardTotal: 18.24,
      allItemsCashTotal: 11.98,
      cardRemainder: 3.28,
      cashRemainder: 3.28,
    });
    // Card sum ≈ 21.52 (full card outstanding); cash sum ≈ 15.26 (full
    // cash outstanding). Per-cent rounding may shift by <= 1¢ in the
    // mirror; the production `startSplitPaymentFlow` snaps the last split
    // to absorb residual rounding (covered by separate test above).
    expect(mocha.card + cappuccino.card).toBeCloseTo(21.52, 1);
    expect(mocha.cash + cappuccino.cash).toBeCloseTo(15.26, 1);
  });
});

describe("Cash-discount invariant (cash ≤ card per split, all paths)", () => {
  test("split-by-item N=2 with cash discount preserves cash ≤ card on every split", () => {
    // Mocha+Cappuccino splits, dual-priced. Cash discount per item, SC flat
    // $3.28 in both pricing modes. Each split's cashAmount must remain at
    // or below its amount.
    const splits = distributeSplitByItemSC({
      splits: [
        { amount: 6.8, cashAmount: 6.53, itemCount: 1 }, // Mocha items+tax
        { amount: 11.44, cashAmount: 5.45, itemCount: 1 }, // Cappuccino items+tax
      ],
      activeOrderOutstandingTotal: 21.52,
      activeOrderOutstandingCash: 15.26,
    });
    for (const s of splits) {
      expect(s.cashAmount).toBeLessThanOrEqual(s.amount);
    }
    expect(splits[0].amount + splits[1].amount).toBeCloseTo(21.52, 2);
    expect(splits[0].cashAmount + splits[1].cashAmount).toBeCloseTo(15.26, 2);
  });

  test("pay-for-items single discounted item preserves cash ≤ card", () => {
    const r = payForItemsScale({
      selectedCardTotal: 6.8,
      selectedCashTotal: 6.53,
      allUnpaidCardTotal: 18.24,
      allUnpaidCashTotal: 11.98,
      remainingAmount: 21.52,
      remainingCashAmount: 15.26,
    });
    expect(r.cashAmount).toBeLessThanOrEqual(r.amount);
  });
});
