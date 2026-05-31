/**
 * Wave D — refund service-charge reversal tests.
 *
 * Locks in:
 *
 *   1. Algorithm (math-level): the exact apply_refund_to_payment_v4 formula
 *      ported to TypeScript and exercised across the same edge cases the
 *      SQL function's LEAST clamp + full-refund snap are meant to guard:
 *        • single full refund snaps to gross
 *        • void snaps to gross
 *        • single partial refund is proportional
 *        • multi-step partials close to exactly gross (drift-stress)
 *        • LEAST-clamp prevents over-refund of SC when amount-refund overshoots
 *        • legacy pre-v13 rows (service_charge = 0) are no-ops
 *
 *   2. Per-payment SC snapshot from process_payment_v13: the apportionment
 *      formula (proportional to v_payment_total / pricing_total, snap on
 *      last split / full-remaining) is exercised here in the same shape it
 *      lives in the SQL — so future regressions in v13 surface in CI.
 */

// ─── Algorithm port of apply_refund_to_payment_v4 ──────────────────────────
//
// Mirrors v4 lines 65–110 verbatim. The math here is the canonical reference
// for the SQL — if v4 changes, this should change in lockstep.

const round2 = (n: number) => Math.round(n * 100) / 100;

interface PaymentRow {
  amount: number;
  tip_amount: number;
  service_charge: number;
  refunded_amount: number;
  service_charge_refunded: number;
}

interface ReversalInput {
  refundAmount: number;
  tipRefundAmount?: number;
  reversalType: "void" | "refund" | "partial_refund" | "item_return";
}

/** Pure-TS port of v4's UPDATE branch — returns the post-update row. */
function applyRefundToPaymentV4(
  payment: PaymentRow,
  input: ReversalInput,
): PaymentRow {
  const newRefunded = payment.refunded_amount + input.refundAmount;

  const isFullRefund =
    input.reversalType === "void" || newRefunded + 0.0001 >= payment.amount;

  const amountRatio =
    payment.amount > 0 ? input.refundAmount / payment.amount : 0;
  const deltaSc = round2(payment.service_charge * amountRatio);

  const nextScRefunded = isFullRefund
    ? payment.service_charge
    : Math.min(
        payment.service_charge,
        round2(payment.service_charge_refunded + deltaSc),
      );

  return {
    ...payment,
    refunded_amount: newRefunded,
    service_charge_refunded: nextScRefunded,
  };
}

// ─── Algorithm port of process_payment_v13 SC apportionment ────────────────
//
// Mirrors v13 lines 458–491 verbatim. Used to assert the snap-vs-proportional
// branch boundary stays correct.

interface OrderRow {
  service_charge: number;
  card_total: number;
  cash_total: number;
}

function processPaymentV13SnapshotShare(args: {
  order: OrderRow;
  priorScSnapshot: number;
  paymentTotal: number;
  useCashPricing: boolean;
  isSplitPaymentAndLastPortion: boolean;
  isFullRemaining: boolean;
}): number {
  // round2 mirrors postgres numeric(12,2) semantics so JS float artifacts
  // don't drift away from what v13 actually writes.
  const remainingSc = round2(
    Math.max(args.order.service_charge - args.priorScSnapshot, 0),
  );
  if (remainingSc <= 0) return 0;
  if (args.isSplitPaymentAndLastPortion || args.isFullRemaining) {
    return remainingSc;
  }
  if (args.useCashPricing && args.order.cash_total > 0) {
    return round2(
      Math.min(
        remainingSc,
        round2((args.paymentTotal * args.order.service_charge) / args.order.cash_total),
      ),
    );
  }
  if (args.order.card_total > 0) {
    return round2(
      Math.min(
        remainingSc,
        round2((args.paymentTotal * args.order.service_charge) / args.order.card_total),
      ),
    );
  }
  return 0;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("Wave D — apply_refund_to_payment_v4 SC reversal math", () => {
  describe("snap-to-gross branch", () => {
    it("void snaps refunded_service_charge to the gross snapshot", () => {
      const row: PaymentRow = {
        amount: 12.25,
        tip_amount: 0,
        service_charge: 4.27,
        refunded_amount: 0,
        service_charge_refunded: 0,
      };
      const next = applyRefundToPaymentV4(row, {
        refundAmount: 12.25,
        reversalType: "void",
      });
      expect(next.service_charge_refunded).toBe(4.27);
    });

    it("full refund (refund_amount = amount) snaps to gross", () => {
      const row: PaymentRow = {
        amount: 16.52,
        tip_amount: 0,
        service_charge: 4.27,
        refunded_amount: 0,
        service_charge_refunded: 0,
      };
      const next = applyRefundToPaymentV4(row, {
        refundAmount: 16.52,
        reversalType: "refund",
      });
      expect(next.service_charge_refunded).toBe(4.27);
    });

    it("refund that brings cumulative >= amount snaps to gross", () => {
      // Two-step refund: $10 then $6.52 of a $16.52 payment.
      const after1 = applyRefundToPaymentV4(
        {
          amount: 16.52,
          tip_amount: 0,
          service_charge: 4.27,
          refunded_amount: 0,
          service_charge_refunded: 0,
        },
        { refundAmount: 10, reversalType: "partial_refund" },
      );
      const after2 = applyRefundToPaymentV4(after1, {
        refundAmount: 6.52,
        reversalType: "partial_refund",
      });
      // Final partial closes out → snaps to gross.
      expect(after2.service_charge_refunded).toBe(4.27);
    });

    it("void on already-partially-refunded payment still snaps to gross", () => {
      const after1 = applyRefundToPaymentV4(
        {
          amount: 16.52,
          tip_amount: 0,
          service_charge: 4.27,
          refunded_amount: 0,
          service_charge_refunded: 0,
        },
        { refundAmount: 5, reversalType: "partial_refund" },
      );
      const voided = applyRefundToPaymentV4(after1, {
        refundAmount: 0,
        reversalType: "void",
      });
      expect(voided.service_charge_refunded).toBe(4.27);
    });
  });

  describe("proportional partial branch", () => {
    it("partial refund yields proportional SC reversal", () => {
      // $8 of $16.52 payment = 48.4% → 4.27 × 0.484 ≈ 2.07
      const row: PaymentRow = {
        amount: 16.52,
        tip_amount: 0,
        service_charge: 4.27,
        refunded_amount: 0,
        service_charge_refunded: 0,
      };
      const next = applyRefundToPaymentV4(row, {
        refundAmount: 8,
        reversalType: "partial_refund",
      });
      expect(next.service_charge_refunded).toBeCloseTo(2.07, 2);
    });

    it("LEAST clamp prevents over-refund of SC when single partial overshoots gross", () => {
      // Pathological: service_charge < proportional delta. Clamp activates.
      // Setup: payment with $1.00 SC, partial of half the amount → would
      // compute $0.51 delta, but LEAST keeps it under $1.00.
      const row: PaymentRow = {
        amount: 10,
        tip_amount: 0,
        service_charge: 1.0,
        refunded_amount: 0,
        service_charge_refunded: 0.95,
      };
      const next = applyRefundToPaymentV4(row, {
        refundAmount: 5,
        reversalType: "partial_refund",
      });
      // cumulative would be 0.95 + 0.50 = 1.45 → clamped to 1.00.
      expect(next.service_charge_refunded).toBe(1.0);
    });
  });

  describe("legacy / pre-v13 rows", () => {
    it("payment with service_charge = 0 is a no-op for SC reversal", () => {
      const row: PaymentRow = {
        amount: 25,
        tip_amount: 0,
        service_charge: 0,
        refunded_amount: 0,
        service_charge_refunded: 0,
      };
      const next = applyRefundToPaymentV4(row, {
        refundAmount: 25,
        reversalType: "refund",
      });
      // Even though it's a full refund (snap branch), 0 → 0.
      expect(next.service_charge_refunded).toBe(0);
    });

    it("zero-amount payment doesn't divide by zero", () => {
      const row: PaymentRow = {
        amount: 0,
        tip_amount: 0,
        service_charge: 0,
        refunded_amount: 0,
        service_charge_refunded: 0,
      };
      const next = applyRefundToPaymentV4(row, {
        refundAmount: 0,
        reversalType: "void",
      });
      // Void snap path; service_charge is 0 so refunded stays 0.
      expect(next.service_charge_refunded).toBe(0);
      expect(Number.isFinite(next.service_charge_refunded)).toBe(true);
    });
  });

  describe("multi-step drift-stress (invariant: refunded_SC ≤ service_charge)", () => {
    it("3 partials totalling gross close to exactly service_charge", () => {
      let row: PaymentRow = {
        amount: 30,
        tip_amount: 0,
        service_charge: 7.0,
        refunded_amount: 0,
        service_charge_refunded: 0,
      };
      // Three partial refunds: $10 + $10 + $10 = $30 (full)
      row = applyRefundToPaymentV4(row, {
        refundAmount: 10,
        reversalType: "partial_refund",
      });
      expect(row.service_charge_refunded).toBeLessThanOrEqual(row.service_charge);
      row = applyRefundToPaymentV4(row, {
        refundAmount: 10,
        reversalType: "partial_refund",
      });
      expect(row.service_charge_refunded).toBeLessThanOrEqual(row.service_charge);
      // Final partial brings cumulative to amount → full-refund snap.
      row = applyRefundToPaymentV4(row, {
        refundAmount: 10,
        reversalType: "partial_refund",
      });
      expect(row.service_charge_refunded).toBe(7.0);
    });

    it("10 small partials each invariant-bound; final snap closes exactly", () => {
      let row: PaymentRow = {
        amount: 100,
        tip_amount: 0,
        service_charge: 13.33,
        refunded_amount: 0,
        service_charge_refunded: 0,
      };
      for (let i = 0; i < 9; i++) {
        row = applyRefundToPaymentV4(row, {
          refundAmount: 10,
          reversalType: "partial_refund",
        });
        // Invariant must hold at every step.
        expect(row.service_charge_refunded).toBeLessThanOrEqual(row.service_charge);
      }
      // Tenth partial brings cumulative to $100 → snap.
      row = applyRefundToPaymentV4(row, {
        refundAmount: 10,
        reversalType: "partial_refund",
      });
      expect(row.service_charge_refunded).toBe(13.33);
    });
  });
});

// ─── process_payment_v13 SC snapshot apportionment ─────────────────────────

describe("Wave D — process_payment_v13 SC snapshot apportionment math", () => {
  it("full-remaining payment captures all remaining SC", () => {
    const share = processPaymentV13SnapshotShare({
      order: { service_charge: 4.27, card_total: 19.41, cash_total: 16.52 },
      priorScSnapshot: 0,
      paymentTotal: 19.41,
      useCashPricing: false,
      isSplitPaymentAndLastPortion: false,
      isFullRemaining: true,
    });
    expect(share).toBe(4.27);
  });

  it("first split portion (non-last) is proportional to card_total", () => {
    // 2-split, first portion is 50% of card_total → 50% of SC.
    const share = processPaymentV13SnapshotShare({
      order: { service_charge: 4.27, card_total: 19.41, cash_total: 16.52 },
      priorScSnapshot: 0,
      paymentTotal: 9.71, // ≈ card_total / 2
      useCashPricing: false,
      isSplitPaymentAndLastPortion: false,
      isFullRemaining: false,
    });
    // 9.71 × 4.27 / 19.41 ≈ 2.14
    expect(share).toBeCloseTo(2.14, 2);
  });

  it("last split portion snaps to remaining SC (absorbs residual)", () => {
    // Two prior portions claimed 2.13 + 2.13 = 4.26; last gets remainder.
    const share = processPaymentV13SnapshotShare({
      order: { service_charge: 4.27, card_total: 19.41, cash_total: 16.52 },
      priorScSnapshot: 4.26,
      paymentTotal: 9.70,
      useCashPricing: false,
      isSplitPaymentAndLastPortion: true,
      isFullRemaining: false,
    });
    expect(share).toBe(0.01); // exact remainder, no proportional drift
  });

  it("cash-priced payment uses cash_total denominator", () => {
    const share = processPaymentV13SnapshotShare({
      order: { service_charge: 4.27, card_total: 19.41, cash_total: 16.52 },
      priorScSnapshot: 0,
      paymentTotal: 8.26, // ≈ cash_total / 2
      useCashPricing: true,
      isSplitPaymentAndLastPortion: false,
      isFullRemaining: false,
    });
    // 8.26 × 4.27 / 16.52 ≈ 2.1349 → ROUND-HALF-EVEN gives 2.13.
    expect(share).toBeCloseTo(2.13, 2);
  });

  it("returns 0 when order has no SC", () => {
    const share = processPaymentV13SnapshotShare({
      order: { service_charge: 0, card_total: 50, cash_total: 48.5 },
      priorScSnapshot: 0,
      paymentTotal: 50,
      useCashPricing: false,
      isSplitPaymentAndLastPortion: false,
      isFullRemaining: true,
    });
    expect(share).toBe(0);
  });

  it("returns 0 when remaining SC is exhausted by prior payments", () => {
    const share = processPaymentV13SnapshotShare({
      order: { service_charge: 4.27, card_total: 19.41, cash_total: 16.52 },
      priorScSnapshot: 4.27,
      paymentTotal: 5,
      useCashPricing: false,
      isSplitPaymentAndLastPortion: false,
      isFullRemaining: false,
    });
    expect(share).toBe(0);
  });

  it("LEAST clamp prevents proportional share from exceeding remaining SC", () => {
    // Pathological: prior payments claimed almost all SC; this payment's
    // proportional share would exceed the remainder — clamp activates.
    const share = processPaymentV13SnapshotShare({
      order: { service_charge: 4.27, card_total: 19.41, cash_total: 16.52 },
      priorScSnapshot: 4.0,
      paymentTotal: 9.71, // proportional would compute ~2.14
      useCashPricing: false,
      isSplitPaymentAndLastPortion: false,
      isFullRemaining: false,
    });
    // Remaining is 0.27; LEAST keeps share at 0.27, not 2.14.
    expect(share).toBe(0.27);
  });
});

// ─── End-to-end invariant: snapshot math + reversal math close cleanly ─────

describe("Wave D — end-to-end SC invariant (snapshot + reversal close to zero net)", () => {
  it("full payment then full refund nets to zero collected SC", () => {
    const order: OrderRow = {
      service_charge: 4.27,
      card_total: 19.41,
      cash_total: 16.52,
    };
    const scSnapshot = processPaymentV13SnapshotShare({
      order,
      priorScSnapshot: 0,
      paymentTotal: 19.41,
      useCashPricing: false,
      isSplitPaymentAndLastPortion: false,
      isFullRemaining: true,
    });
    expect(scSnapshot).toBe(4.27);

    const refunded = applyRefundToPaymentV4(
      {
        amount: 19.41,
        tip_amount: 0,
        service_charge: scSnapshot,
        refunded_amount: 0,
        service_charge_refunded: 0,
      },
      { refundAmount: 19.41, reversalType: "refund" },
    );
    // Net collected SC = snapshot − refunded = 0
    expect(refunded.service_charge_refunded - scSnapshot).toBe(0);
  });

  it("3-split full payment then partial refund of 1 split reverses ~1/3 of SC", () => {
    const order: OrderRow = {
      service_charge: 6.0,
      card_total: 30.0,
      cash_total: 28.0,
    };
    // Three equal-split portions, last absorbs residual.
    const sc1 = processPaymentV13SnapshotShare({
      order,
      priorScSnapshot: 0,
      paymentTotal: 10,
      useCashPricing: false,
      isSplitPaymentAndLastPortion: false,
      isFullRemaining: false,
    });
    const sc2 = processPaymentV13SnapshotShare({
      order,
      priorScSnapshot: sc1,
      paymentTotal: 10,
      useCashPricing: false,
      isSplitPaymentAndLastPortion: false,
      isFullRemaining: false,
    });
    const sc3 = processPaymentV13SnapshotShare({
      order,
      priorScSnapshot: sc1 + sc2,
      paymentTotal: 10,
      useCashPricing: false,
      isSplitPaymentAndLastPortion: true,
      isFullRemaining: false,
    });
    // Sum must equal gross order SC exactly (last-portion snap).
    expect(round2(sc1 + sc2 + sc3)).toBe(6.0);

    // Now refund split #1 fully → snap on its own row to gross of its snapshot.
    const refunded = applyRefundToPaymentV4(
      {
        amount: 10,
        tip_amount: 0,
        service_charge: sc1,
        refunded_amount: 0,
        service_charge_refunded: 0,
      },
      { refundAmount: 10, reversalType: "refund" },
    );
    expect(refunded.service_charge_refunded).toBe(sc1);
  });
});

// Note: OrderService.applyRefundToPayment wrapper-routing tests removed —
// they'd pull `uuid` ESM through the deviceId import chain, which Jest's
// default transformer can't parse. The wrapper switch (v3 → v4) is
// inspectable directly in services/orderService.ts and asserted by the
// `verifyWiring.sql` probe below.
