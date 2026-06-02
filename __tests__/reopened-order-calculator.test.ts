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
    customizations: {},
    subtotal: 10,
    cashSubtotal: 10,
    ...overrides,
  };
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
});
