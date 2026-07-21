import {
  calculateOrderTotals,
  invalidateCalculationCache,
} from "@/lib/order-calculator";
import { CartItem } from "@/lib/types";

function item(overrides: Partial<CartItem>): CartItem {
  return {
    id: "item",
    menuItemId: "menu-item",
    name: "Cappuccino",
    quantity: 1,
    paidQuantity: 0,
    originalPrice: 10,
    price: 10,
    unitPrice: 10,
    cashPrice: 10,
    baseCardPrice: 10,
    baseCashPrice: 10,
    taxRate: 0,
    customizations: {},
    subtotal: 10,
    cashSubtotal: 10,
    taxAmount: 0,
    cashTaxAmount: 0,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mirror of the (module-private) outstanding-resolution helpers in
// stores/selectors/orderSelectors.ts (isOutstandingLocalEditAhead +
// resolveOutstandingAmount). Following the same "mirror production logic as a
// pure function" convention used by __tests__/pricing-breakdown-paid-amount.test.ts
// and __tests__/recalculate-sc-drift-gate.test.ts. If the selector logic changes,
// this mirror diverges and must be re-synced (and tableReopenCheckWiring.test.ts
// already guards the real source strings).
// ---------------------------------------------------------------------------
type OrderLike = {
  items: CartItem[];
  check_status?: string | null;
  _reopenedForOrdering?: boolean;
};

function isOutstandingLocalEditAhead(
  order: OrderLike,
  backendAmount: number | null | undefined,
  calculatedAmount: number,
): boolean {
  const hasPendingCartEdit = order.items.some(
    (it) =>
      !it.isDraft && (!it.db_order_item_id || it.sync_status === "pending"),
  );
  return (
    order.check_status === "Opened" &&
    (order._reopenedForOrdering || hasPendingCartEdit) &&
    calculatedAmount > (backendAmount ?? 0) + 0.01
  );
}

function resolveOutstandingAmount(
  order: OrderLike,
  backendAmount: number | null | undefined,
  calculatedAmount: number,
): number {
  if (isOutstandingLocalEditAhead(order, backendAmount, calculatedAmount)) {
    return calculatedAmount;
  }
  return backendAmount ?? calculatedAmount;
}

describe("reopened order outstanding totals", () => {
  beforeEach(() => {
    invalidateCalculationCache();
  });

  it("preserves unpaid item quantities when a historical payment exceeds the hydrated total", () => {
    const input = {
      items: [
        item({ id: "paid", paidQuantity: 1 }),
        item({ id: "new", quantity: 2, paidQuantity: 0 }),
      ],
      checkDiscount: null,
      taxRatesMap: { standard: 8.875 },
      payments: [{ amount: 100 }],
    };

    expect(calculateOrderTotals(input).outstanding_total).toBe(0);
    expect(
      calculateOrderTotals({
        ...input,
        preserveItemLevelOutstanding: true,
      }).outstanding_total,
    ).toBe(21.78);
  });

  // Test 1 — ORD-S2-0001 repro: a fully-collected mixed card+cash split-by-item
  // order, reopened. Every item is paid (paidQuantity === quantity) so item-level
  // outstanding is 0, but the cash payment's cashSavings under-counts the true
  // card-equivalent (8 + 1.08 = 9.08 vs the real 10), so paymentBasedOutstanding
  // resolves to exactly the reported $0.92. Pre-Fix-A that $0.92 was added as
  // customRefundBalance (NOT clamped back under preserve mode) → phantom balance.
  // Fix A forces customRefundBalance to 0 under preserveItemLevelOutstanding.
  it("zeroes the phantom balance on a fully-paid mixed card+cash reopened order", () => {
    const totals = calculateOrderTotals({
      items: [
        item({
          id: "a",
          unitPrice: 10,
          baseCashPrice: 8,
          quantity: 1,
          paidQuantity: 1,
        }),
        item({
          id: "b",
          unitPrice: 10,
          baseCashPrice: 8,
          quantity: 1,
          paidQuantity: 1,
        }),
      ],
      checkDiscount: null,
      taxRatesMap: { standard: 0 },
      payments: [
        { amount: 10, isCashPriced: false }, // card pays item A (card-equiv 10)
        { amount: 8, isCashPriced: true, cashSavings: 1.08 }, // cash pays item B; cashSavings understated → card-equiv 9.08
      ],
      preserveItemLevelOutstanding: true,
    });

    // Pre-Fix-A: outstanding_total / cash_outstanding_total were ~0.92.
    expect(totals.outstanding_total).toBe(0);
    expect(totals.cash_outstanding_total).toBe(0);
  });

  // Test 2 — adding an item after reopen still surfaces a real balance. The new
  // (unsynced) item must remain outstanding; Fix A only removes the
  // payment-reconstruction phantom, never the genuine item-level balance.
  // (Here the cash payment also under-counts, so pre-Fix-A this read 11.78 —
  // item 10.89 + 0.89 phantom; post-fix it is exactly the new item's 10.89.)
  it("keeps a newly added (unsynced) item outstanding after reopen", () => {
    const totals = calculateOrderTotals({
      items: [
        item({ id: "paid", quantity: 1, paidQuantity: 1 }),
        item({ id: "new", quantity: 1, paidQuantity: 0 }), // no db_order_item_id → unsynced
      ],
      checkDiscount: null,
      taxRatesMap: { standard: 8.875 },
      payments: [{ amount: 10, isCashPriced: true, cashSavings: 0 }],
      preserveItemLevelOutstanding: true,
    });

    expect(totals.outstanding_total).toBe(10.89); // new item subtotal 10 + tax 0.89
    expect(totals.cash_outstanding_total).toBe(10.89);
  });

  // Test 3 — B3 guard (selector intentionally left intact). A reopened order with
  // a newly added item that HAS already synced (db_order_item_id set,
  // sync_status 'synced') while the backend header is still a stale 0. With
  // _reopenedForOrdering retained, the selector surfaces the new balance. Had the
  // dropped "Fix B" shipped (removing _reopenedForOrdering), hasPendingCartEdit
  // would be false for the synced item and the gate would close → $0 shown for a
  // genuinely unpaid item (money-losing). The second assertion proves that.
  it("surfaces a synced new item's balance on reopen (proves dropping Fix B was correct)", () => {
    const paidItem = item({
      id: "paid",
      quantity: 1,
      paidQuantity: 1,
      db_order_item_id: "db-paid",
      sync_status: "synced",
    });
    const newItem = item({
      id: "new",
      quantity: 1,
      paidQuantity: 0,
      db_order_item_id: "db-new",
      sync_status: "synced",
    });

    const totals = calculateOrderTotals({
      items: [paidItem, newItem],
      checkDiscount: null,
      taxRatesMap: { standard: 8.875 },
      payments: [{ amount: 10.89, isCashPriced: false }],
      preserveItemLevelOutstanding: true,
    });
    expect(totals.outstanding_total).toBe(10.89);

    const backendAmountDue = 0; // stale header before re-pull lands
    const reopened: OrderLike = {
      items: [paidItem, newItem],
      check_status: "Opened",
      _reopenedForOrdering: true,
    };
    expect(
      resolveOutstandingAmount(
        reopened,
        backendAmountDue,
        totals.outstanding_total,
      ),
    ).toBe(10.89);

    // If Fix B had shipped (drop _reopenedForOrdering): synced item →
    // hasPendingCartEdit false → gate closes → stale backend 0 wins. Money hidden.
    const fixBShipped: OrderLike = { ...reopened, _reopenedForOrdering: false };
    expect(
      resolveOutstandingAmount(
        fixBShipped,
        backendAmountDue,
        totals.outstanding_total,
      ),
    ).toBe(0);
  });

  // Test 4 — a reopened order with a genuine backend balance (e.g. a custom
  // refund re-opened money owed). Item-level calc is 0 (all items paid, phantom
  // removed by Fix A), but the backend amount_due is authoritative and must win;
  // Fix A's 0 must NOT hide it.
  it("prefers the authoritative backend balance on a reopened order with a real custom-refund due", () => {
    const paidA = item({
      id: "a",
      quantity: 1,
      paidQuantity: 1,
      db_order_item_id: "da",
      sync_status: "synced",
    });
    const paidB = item({
      id: "b",
      quantity: 1,
      paidQuantity: 1,
      db_order_item_id: "dbb",
      sync_status: "synced",
    });

    const totals = calculateOrderTotals({
      items: [paidA, paidB],
      checkDiscount: null,
      taxRatesMap: { standard: 8.875 },
      payments: [{ amount: 21.78, isCashPriced: false }],
      preserveItemLevelOutstanding: true,
    });
    expect(totals.outstanding_total).toBe(0); // fully paid, no phantom

    const backendAmountDue = 5; // custom refund reopened a real $5 balance
    const reopened: OrderLike = {
      items: [paidA, paidB],
      check_status: "Opened",
      _reopenedForOrdering: true,
    };
    expect(
      resolveOutstandingAmount(
        reopened,
        backendAmountDue,
        totals.outstanding_total,
      ),
    ).toBe(5);
  });
});
