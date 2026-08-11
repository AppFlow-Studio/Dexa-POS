import { getOrderBalanceDue, hasOrderBalanceDue } from "@/lib/orderBalance";
import type { OrderProfile } from "@/lib/types";

// Only the payment-status fields matter to these helpers; the rest of
// OrderProfile is irrelevant here, so build the narrow shape and cast.
function order(overrides: Partial<OrderProfile>): OrderProfile {
  return { id: "order_1", ...overrides } as OrderProfile;
}

describe("getOrderBalanceDue", () => {
  it("reports the outstanding amount on a partially paid check", () => {
    // The reported bug: $100 bill, $50 collected via custom-amount split.
    expect(
      getOrderBalanceDue(order({ paid_status: "Partial", amount_due: 50 })),
    ).toBe(50);
  });

  it("reports nothing once the backend marks the order Paid", () => {
    // paid_status wins even if a stale amount_due lingers.
    expect(
      getOrderBalanceDue(order({ paid_status: "Paid", amount_due: 12.5 })),
    ).toBe(0);
  });

  it("treats a sub-cent residual as settled, not as a balance", () => {
    // Proportional tax splitting across portions leaves these; asking the
    // operator to collect $0.004 would be a dead-end CTA.
    expect(
      getOrderBalanceDue(order({ paid_status: "Partial", amount_due: 0.004 })),
    ).toBe(0);
  });

  describe("conservative defaults — unknown resolves to 'no balance'", () => {
    // These four cases are the contract that keeps a partial-payment UI from
    // hijacking the normal post-payment flow. Callers block the auto-created
    // next order on this predicate, so guessing "balance" when we cannot tell
    // would strand the operator with no way forward.
    it("returns 0 for a missing order", () => {
      expect(getOrderBalanceDue(undefined)).toBe(0);
      expect(getOrderBalanceDue(null)).toBe(0);
    });

    it("returns 0 when amount_due never arrived (offline/queued payment)", () => {
      expect(getOrderBalanceDue(order({ paid_status: "Partial" }))).toBe(0);
    });

    it("returns 0 for a non-finite amount_due", () => {
      expect(
        getOrderBalanceDue(order({ paid_status: "Partial", amount_due: NaN })),
      ).toBe(0);
    });

    it("returns 0 for a negative amount_due (overpayment)", () => {
      expect(
        getOrderBalanceDue(order({ paid_status: "Partial", amount_due: -5 })),
      ).toBe(0);
    });
  });
});

describe("hasOrderBalanceDue", () => {
  // This predicate is used for EXISTENCE only — the success screen shows no
  // balance figure, because right after a payment `amount_due` still holds the
  // pre-payment total (a $5 payment against a $1087.66 check left it reading
  // 1087.66). Existence survives that staleness; the amount does not.
  it("still detects a balance from an undecremented amount_due", () => {
    expect(
      hasOrderBalanceDue(
        order({ paid_status: "Partial", amount_due: 1087.66 }),
      ),
    ).toBe(true);
  });

  it("reports no balance on a settled check even with a stale amount_due", () => {
    // paid_status is the guard that keeps a "Pay Remaining" CTA off a closed
    // sale when the outstanding figure hasn't caught up yet.
    expect(
      hasOrderBalanceDue(order({ paid_status: "Paid", amount_due: 1087.66 })),
    ).toBe(false);
  });

  it("mirrors getOrderBalanceDue as a boolean", () => {
    expect(
      hasOrderBalanceDue(order({ paid_status: "Partial", amount_due: 50 })),
    ).toBe(true);
    expect(
      hasOrderBalanceDue(order({ paid_status: "Paid", amount_due: 0 })),
    ).toBe(false);
    expect(hasOrderBalanceDue(undefined)).toBe(false);
  });
});
