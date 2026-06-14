/**
 * `mergePayments` must preserve local refund evidence when a stale broadcast
 * snapshot (taken before the refund commit) arrives after our post-refund
 * force-sync. Without this guard the "Refunded" badge in Pay for Items
 * flashes off and the chip reverts to a plain "Paid" row.
 *
 * Refunds don't always advance payment.status (apply_refund_to_payment can
 * leave status='captured' while bumping refunded_amount + is_returned), so
 * the existing status-precedence check is not enough — we rely on the
 * monotonic refund-amount preservation added in mergePayments.
 *
 * This file mirrors the production helper as a pure-function copy (same
 * approach as __tests__/payment-store-sc-distribution.test.ts) because
 * mergePayments isn't exported from useOrderStore.ts.
 */

type Payment = {
  id?: string;
  db_payment_id?: string;
  amount: number;
  method: string;
  status?: string;
  refundedAmount?: number;
  refundedAt?: string;
  isReturned?: boolean;
  returnedAt?: string;
  returnedBy?: string;
  returnAmount?: number;
  last4?: string;
  cardBrand?: string;
  amountTendered?: number;
  changeGiven?: number;
  transactionDetails?: any;
  timestamp?: string;
  sync_status?: string;
  isPreAuth?: boolean;
  isVoided?: boolean;
};

// Mirror of stores/useOrderStore.ts mergePayments (post-fix).
function mergePayments(
  localPayments: Payment[],
  broadcastPayments: Payment[],
): Payment[] {
  const PAYMENT_STATUS_ORDER: Record<string, number> = {
    authorized: 0,
    pending: 1,
    captured: 2,
    partially_refunded: 3,
    refunded: 4,
    voided: 4,
    void: 4,
  };

  const localByDbId = new Map<string, Payment>();
  for (const lp of localPayments) {
    if (lp.db_payment_id) localByDbId.set(lp.db_payment_id, lp);
  }
  const broadcastDbIds = new Set(
    broadcastPayments.map((bp) => bp.db_payment_id).filter(Boolean) as string[],
  );

  const mergedFromBroadcast = broadcastPayments.map((bp) => {
    if (!bp.db_payment_id) return bp;
    const lp = localByDbId.get(bp.db_payment_id);
    if (
      lp &&
      (PAYMENT_STATUS_ORDER[lp.status ?? ""] ?? -1) >
        (PAYMENT_STATUS_ORDER[bp.status ?? ""] ?? -1)
    ) {
      return lp;
    }
    if (lp) {
      const lpRefunded = lp.refundedAmount ?? 0;
      const bpRefunded = bp.refundedAmount ?? 0;
      const localHasMoreRefund = lpRefunded > bpRefunded;
      return {
        ...bp,
        last4: bp.last4 ?? lp.last4,
        cardBrand: bp.cardBrand ?? lp.cardBrand,
        amountTendered: bp.amountTendered ?? lp.amountTendered,
        changeGiven: bp.changeGiven ?? lp.changeGiven,
        refundedAmount: Math.max(lpRefunded, bpRefunded),
        refundedAt: localHasMoreRefund
          ? (lp.refundedAt ?? bp.refundedAt)
          : (bp.refundedAt ?? lp.refundedAt),
        isReturned: localHasMoreRefund
          ? (lp.isReturned ?? bp.isReturned)
          : (bp.isReturned ?? lp.isReturned),
        returnedAt: localHasMoreRefund
          ? (lp.returnedAt ?? bp.returnedAt)
          : (bp.returnedAt ?? lp.returnedAt),
        returnedBy: localHasMoreRefund
          ? (lp.returnedBy ?? bp.returnedBy)
          : (bp.returnedBy ?? lp.returnedBy),
        returnAmount: Math.max(lp.returnAmount ?? 0, bp.returnAmount ?? 0),
      };
    }
    return bp;
  });

  return mergedFromBroadcast;
}

describe("mergePayments refund-state preservation", () => {
  it("preserves local refundedAmount when stale broadcast arrives with refunded_amount=0", () => {
    // Scenario: cash refund just ran, our force-sync wrote refundedAmount=7.75
    // into local state. Then a delayed broadcast (snapshot taken before the
    // refund commit) arrives with refunded_amount=0 — must not flash off.
    const local: Payment[] = [
      {
        db_payment_id: "pay-1",
        amount: 7.75,
        method: "Cash",
        status: "captured", // refund didn't advance status
        refundedAmount: 7.75,
        refundedAt: "2026-05-30T20:08:46Z",
        isReturned: true,
      },
    ];
    const broadcast: Payment[] = [
      {
        db_payment_id: "pay-1",
        amount: 7.75,
        method: "Cash",
        status: "captured",
        refundedAmount: 0,
      },
    ];

    const merged = mergePayments(local, broadcast);

    expect(merged).toHaveLength(1);
    expect(merged[0].refundedAmount).toBe(7.75);
    expect(merged[0].isReturned).toBe(true);
    expect(merged[0].refundedAt).toBe("2026-05-30T20:08:46Z");
  });

  it("takes the larger refund when both sides report (broadcast > local)", () => {
    const local: Payment[] = [
      {
        db_payment_id: "pay-1",
        amount: 10,
        method: "Cash",
        status: "captured",
        refundedAmount: 3,
      },
    ];
    const broadcast: Payment[] = [
      {
        db_payment_id: "pay-1",
        amount: 10,
        method: "Cash",
        status: "captured",
        refundedAmount: 5, // later partial refund came through here
        refundedAt: "2026-05-30T21:00:00Z",
        isReturned: true,
      },
    ];

    const merged = mergePayments(local, broadcast);

    expect(merged[0].refundedAmount).toBe(5);
    expect(merged[0].isReturned).toBe(true);
    expect(merged[0].refundedAt).toBe("2026-05-30T21:00:00Z");
  });

  it("returnAmount picks the max across local/broadcast", () => {
    const local: Payment[] = [
      {
        db_payment_id: "pay-1",
        amount: 10,
        method: "Card",
        status: "captured",
        returnAmount: 6,
      },
    ];
    const broadcast: Payment[] = [
      {
        db_payment_id: "pay-1",
        amount: 10,
        method: "Card",
        status: "captured",
        returnAmount: 2,
      },
    ];

    const merged = mergePayments(local, broadcast);
    expect(merged[0].returnAmount).toBe(6);
  });

  it("does not invent a refund when neither side has one", () => {
    const local: Payment[] = [
      {
        db_payment_id: "pay-1",
        amount: 10,
        method: "Cash",
        status: "captured",
      },
    ];
    const broadcast: Payment[] = [
      {
        db_payment_id: "pay-1",
        amount: 10,
        method: "Cash",
        status: "captured",
      },
    ];
    const merged = mergePayments(local, broadcast);
    expect(merged[0].refundedAmount).toBe(0);
    expect(merged[0].isReturned).toBeUndefined();
  });

  it("respects status precedence when local is more advanced", () => {
    // If local is voided and broadcast is captured, broadcast must NOT win.
    const local: Payment[] = [
      {
        db_payment_id: "pay-1",
        amount: 10,
        method: "Cash",
        status: "voided",
        refundedAmount: 10,
        isReturned: true,
      },
    ];
    const broadcast: Payment[] = [
      {
        db_payment_id: "pay-1",
        amount: 10,
        method: "Cash",
        status: "captured",
        refundedAmount: 0,
      },
    ];
    const merged = mergePayments(local, broadcast);
    // Local wins entire row, refund evidence preserved.
    expect(merged[0].status).toBe("voided");
    expect(merged[0].refundedAmount).toBe(10);
    expect(merged[0].isReturned).toBe(true);
  });
});
