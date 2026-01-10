/**
 * Order Calculator Tests
 *
 * Test suite for the bulletproof order calculation system.
 * Covers 16 scenarios for complete calculation verification.
 */

import {
  round2,
  calculateItemEffectiveCashPrice,
  calculateOrderTotals,
  calculateOrderTotalsWithDetails,
  distributeDiscountToItems,
  calculatePaidStatus,
  calculateEvenSplit,
  calculatePaymentPreview,
  applyPaymentToItems,
} from "@/lib/order-calculator";
import { CartItem, Discount } from "@/lib/types";
import { TaxRatesMap } from "@/types/menu";
import { PaymentPreviewInput } from "@/types/order-calculations";

// ============================================================================
// TEST FIXTURES
// ============================================================================

const createMockItem = (overrides: Partial<CartItem> = {}): CartItem => ({
  id: `item_${Math.random().toString(36).slice(2)}`,
  menuItemId: "menu_1",
  name: "Test Item",
  quantity: 1,
  paidQuantity: 0,
  originalPrice: 10.0,
  price: 10.0,
  unitPrice: 10.0,
  cashPrice: 10.0,
  image: undefined,
  customizations: {},
  subtotal: 10.0,
  cashSubtotal: 10.0,
  taxRate: 8.875,
  taxAmount: 0.89,
  cashTaxAmount: 0.89,
  ...overrides,
});

const defaultTaxRates: TaxRatesMap = {
  standard: 8.875,
  alcohol: 12.0,
  exempt: 0,
};

// ============================================================================
// SCENARIO 1: Basic Single Item Order
// ============================================================================

describe("Scenario 1: Basic Single Item Order", () => {
  it("calculates totals for single item", () => {
    const items = [createMockItem({ price: 10.0 })];
    const result = calculateOrderTotals({
      items,
      checkDiscount: null,
      taxRatesMap: defaultTaxRates,
    });

    expect(result.subtotal).toBe(10.0);
    expect(result.tax_amount).toBe(0.89); // 10 * 8.875%
    expect(result.total_amount).toBe(10.89);
    expect(result.outstanding_total).toBe(10.89);
  });
});

// ============================================================================
// SCENARIO 2: Multiple Items Different Quantities
// ============================================================================

describe("Scenario 2: Multiple Items Different Quantities", () => {
  it("calculates totals for multiple items", () => {
    const items = [
      createMockItem({ id: "i1", price: 10.0, quantity: 2 }),
      createMockItem({ id: "i2", price: 5.0, quantity: 3 }),
    ];
    const result = calculateOrderTotals({
      items,
      checkDiscount: null,
      taxRatesMap: defaultTaxRates,
    });

    // Subtotal: (10*2) + (5*3) = 35
    expect(result.subtotal).toBe(35.0);
    // Tax: 35 * 8.875% = 3.10625 -> 3.11
    expect(result.tax_amount).toBe(3.11);
    expect(result.total_amount).toBe(38.11);
  });
});

// ============================================================================
// SCENARIO 3: Percentage Check Discount
// ============================================================================

describe("Scenario 3: Percentage Check Discount", () => {
  it("applies percentage discount correctly", () => {
    const items = [createMockItem({ price: 100.0 })];
    const discount: Discount = {
      id: "d1",
      label: "10% Off",
      value: 0.1,
      type: "percentage",
    };

    const result = calculateOrderTotals({
      items,
      checkDiscount: discount,
      taxRatesMap: defaultTaxRates,
    });

    expect(result.subtotal).toBe(100.0);
    expect(result.discount_amount).toBe(10.0);
    // Tax on discounted: 90 * 8.875% = 7.9875 -> 7.99
    expect(result.tax_amount).toBe(7.99);
    expect(result.total_amount).toBe(97.99);
  });
});

// ============================================================================
// SCENARIO 4: Fixed Amount Discount
// ============================================================================

describe("Scenario 4: Fixed Amount Discount", () => {
  it("applies fixed discount correctly", () => {
    const items = [createMockItem({ price: 50.0 })];
    const discount: Discount = {
      id: "d2",
      label: "$5 Off",
      value: 5.0,
      type: "fixed",
    };

    const result = calculateOrderTotals({
      items,
      checkDiscount: discount,
      taxRatesMap: defaultTaxRates,
    });

    expect(result.subtotal).toBe(50.0);
    expect(result.discount_amount).toBe(5.0);
    // Tax on 45: 45 * 8.875% = 3.99375 -> 3.99
    expect(result.tax_amount).toBe(3.99);
    expect(result.total_amount).toBe(48.99);
  });

  it("caps fixed discount at subtotal", () => {
    const items = [createMockItem({ price: 10.0 })];
    const discount: Discount = {
      id: "d3",
      label: "$20 Off",
      value: 20.0, // More than subtotal
      type: "fixed",
    };

    const result = calculateOrderTotals({
      items,
      checkDiscount: discount,
      taxRatesMap: defaultTaxRates,
    });

    // Discount should be capped at subtotal
    expect(result.discount_amount).toBe(10.0);
    expect(result.total_amount).toBe(0.0);
  });
});

// ============================================================================
// SCENARIO 5: Item with Modifiers
// ============================================================================

describe("Scenario 5: Item with Modifiers", () => {
  it("includes modifier prices in cash price calculation", () => {
    const item = createMockItem({
      price: 13.5, // Card price includes everything
      originalPrice: 10.0, // Base cash price
      customizations: {
        size: { id: "lg", name: "Large", priceModifier: 2.0 },
        modifiers: [
          {
            categoryId: "c1",
            categoryName: "Extras",
            options: [{ id: "o1", name: "Extra Cheese", price: 1.5 }],
          },
        ],
      },
    });

    const cashPrice = calculateItemEffectiveCashPrice(item);
    // 10 (base) + 2 (size) + 1.50 (modifier) = 13.50
    expect(cashPrice).toBe(13.5);
  });

  it("includes add-ons in cash price calculation", () => {
    const item = createMockItem({
      price: 15.0,
      originalPrice: 10.0,
      customizations: {
        addOns: [
          { id: "a1", name: "Bacon", price: 3.0, quantity: 1 },
          { id: "a2", name: "Avocado", price: 2.0, quantity: 1 },
        ],
      },
    });

    const cashPrice = calculateItemEffectiveCashPrice(item);
    // 10 (base) + 3 (bacon) + 2 (avocado) = 15
    expect(cashPrice).toBe(15.0);
  });
});

// ============================================================================
// SCENARIO 6: Partially Paid Order
// ============================================================================

describe("Scenario 6: Partially Paid Order", () => {
  it("calculates outstanding amount for partially paid items", () => {
    const items = [createMockItem({ price: 10.0, quantity: 3, paidQuantity: 1 })];

    const result = calculateOrderTotals({
      items,
      checkDiscount: null,
      taxRatesMap: defaultTaxRates,
    });

    expect(result.subtotal).toBe(30.0);
    // Total: 30 + tax = 30 + 2.66 = 32.66
    expect(result.total_amount).toBe(32.66);
    // Outstanding: 2 items * 10 = 20
    expect(result.outstanding_subtotal).toBe(20.0);
    // Outstanding with tax proportionally
    expect(result.outstanding_total).toBeCloseTo(21.78, 1);
  });

  it("shows zero outstanding when fully paid", () => {
    const items = [createMockItem({ price: 10.0, quantity: 2, paidQuantity: 2 })];

    const result = calculateOrderTotals({
      items,
      checkDiscount: null,
      taxRatesMap: defaultTaxRates,
    });

    expect(result.outstanding_subtotal).toBe(0);
    expect(result.outstanding_total).toBe(0);
  });
});

// ============================================================================
// SCENARIO 7: Mixed Tax Categories
// ============================================================================

describe("Scenario 7: Mixed Tax Categories", () => {
  it("applies different tax rates per category", () => {
    const items = [
      createMockItem({ id: "i1", price: 10.0, tax_category: "standard" }),
      createMockItem({ id: "i2", price: 10.0, tax_category: "alcohol" }),
    ];

    const result = calculateOrderTotals({
      items,
      checkDiscount: null,
      taxRatesMap: defaultTaxRates,
    });

    expect(result.subtotal).toBe(20.0);
    // Tax: 10*8.875% + 10*12% = 0.8875 + 1.20 = 2.0875 -> 2.09
    expect(result.tax_amount).toBe(2.09);
    expect(result.total_amount).toBe(22.09);
  });
});

// ============================================================================
// SCENARIO 8: Tax Exempt Items
// ============================================================================

describe("Scenario 8: Tax Exempt Items", () => {
  it("excludes tax exempt items from tax calculation", () => {
    const items = [
      createMockItem({ id: "i1", price: 10.0, is_tax_exempt: false }),
      createMockItem({ id: "i2", price: 10.0, is_tax_exempt: true }),
    ];

    const result = calculateOrderTotals({
      items,
      checkDiscount: null,
      taxRatesMap: defaultTaxRates,
    });

    expect(result.subtotal).toBe(20.0);
    // Only first item taxed: 10 * 8.875% = 0.89
    expect(result.tax_amount).toBe(0.89);
    expect(result.total_amount).toBe(20.89);
  });
});

// ============================================================================
// SCENARIO 9: Voided Items
// ============================================================================

describe("Scenario 9: Voided Items", () => {
  it("excludes voided items from totals", () => {
    const items = [
      createMockItem({ id: "i1", price: 10.0, is_voided: false }),
      createMockItem({ id: "i2", price: 50.0, is_voided: true }),
    ];

    const result = calculateOrderTotals({
      items,
      checkDiscount: null,
      taxRatesMap: defaultTaxRates,
    });

    // Only non-voided item counted
    expect(result.subtotal).toBe(10.0);
    expect(result.total_amount).toBe(10.89);
  });
});

// ============================================================================
// SCENARIO 10: Dual Pricing (Card vs Cash)
// ============================================================================

describe("Scenario 10: Dual Pricing", () => {
  it("calculates both card and cash totals", () => {
    const items = [
      createMockItem({
        price: 10.0, // Card price
        originalPrice: 9.65, // Cash price (3.5% discount)
        cashPrice: 9.65,
      }),
    ];

    const result = calculateOrderTotals({
      items,
      checkDiscount: null,
      taxRatesMap: defaultTaxRates,
    });

    expect(result.subtotal).toBe(10.0);
    expect(result.cash_subtotal).toBe(9.65);
    expect(result.total_amount).toBe(10.89);
    // Cash total: 9.65 + (9.65 * 8.875%) = 9.65 + 0.86 = 10.51
    expect(result.cash_total_amount).toBe(10.51);
  });
});

// ============================================================================
// SCENARIO 11: Discount Distribution
// ============================================================================

describe("Scenario 11: Discount Distribution", () => {
  it("distributes discount proportionally across items", () => {
    const items = [
      createMockItem({ id: "i1", price: 30.0, quantity: 1 }),
      createMockItem({ id: "i2", price: 10.0, quantity: 1 }),
    ];

    const distributed = distributeDiscountToItems(items, 10.0);

    // 30/40 = 75% -> $7.50 discount
    expect(distributed[0].discount_amount).toBe(7.5);
    // 10/40 = 25% -> $2.50 discount
    expect(distributed[1].discount_amount).toBe(2.5);
  });

  it("handles rounding remainder on last item", () => {
    const items = [
      createMockItem({ id: "i1", price: 33.33, quantity: 1 }),
      createMockItem({ id: "i2", price: 33.33, quantity: 1 }),
      createMockItem({ id: "i3", price: 33.34, quantity: 1 }),
    ];

    const distributed = distributeDiscountToItems(items, 10.0);
    const totalDistributed =
      (distributed[0].discount_amount ?? 0) +
      (distributed[1].discount_amount ?? 0) +
      (distributed[2].discount_amount ?? 0);

    // Sum should equal original discount
    expect(round2(totalDistributed)).toBe(10.0);
  });
});

// ============================================================================
// SCENARIO 12: Even Split Payment
// ============================================================================

describe("Scenario 12: Even Split Payment", () => {
  it("splits total evenly with rounding adjustment", () => {
    const split = calculateEvenSplit(100.0, 3);

    expect(split.perPerson).toBe(33.33);
    expect(split.lastPerson).toBe(33.34);
    expect(split.amounts).toEqual([33.33, 33.33, 33.34]);

    // Sum should equal total
    const sum = split.amounts.reduce((a, b) => a + b, 0);
    expect(round2(sum)).toBe(100.0);
  });

  it("handles 2-way split", () => {
    const split = calculateEvenSplit(100.0, 2);

    expect(split.perPerson).toBe(50.0);
    expect(split.lastPerson).toBe(50.0);
  });

  it("handles odd amounts", () => {
    const split = calculateEvenSplit(100.01, 3);

    const sum = split.amounts.reduce((a, b) => a + b, 0);
    expect(round2(sum)).toBe(100.01);
  });

  it("handles single person (no split)", () => {
    const split = calculateEvenSplit(100.0, 1);

    expect(split.perPerson).toBe(100.0);
    expect(split.amounts).toEqual([100.0]);
  });
});

// ============================================================================
// SCENARIO 13: Payment Preview - Full Payment
// ============================================================================

describe("Scenario 13: Payment Preview - Full Payment", () => {
  it("previews full card payment correctly", () => {
    const items = [createMockItem({ price: 100.0 })];
    const totals = calculateOrderTotals({
      items,
      checkDiscount: null,
      taxRatesMap: defaultTaxRates,
    });

    const preview = calculatePaymentPreview(totals, 0, {
      type: "full",
      paymentMethod: "card",
    });

    expect(preview.amountToCharge).toBe(totals.outstanding_total);
    expect(preview.orderFullyPaidAfter).toBe(true);
    expect(preview.isValid).toBe(true);
  });

  it("previews full cash payment correctly", () => {
    const items = [
      createMockItem({
        price: 100.0,
        originalPrice: 96.5, // 3.5% cash discount
        cashPrice: 96.5,
      }),
    ];
    const totals = calculateOrderTotals({
      items,
      checkDiscount: null,
      taxRatesMap: defaultTaxRates,
    });

    const preview = calculatePaymentPreview(totals, 0, {
      type: "full",
      paymentMethod: "cash",
    });

    expect(preview.amountToCharge).toBe(totals.cash_outstanding_total);
    expect(preview.orderFullyPaidAfter).toBe(true);
  });
});

// ============================================================================
// SCENARIO 14: Paid Status Calculation
// ============================================================================

describe("Scenario 14: Paid Status Calculation", () => {
  it("returns correct status for various payment states", () => {
    expect(calculatePaidStatus([], 100)).toBe("Pending");
    expect(calculatePaidStatus([{ amount: 50 }], 100)).toBe("Partial");
    expect(calculatePaidStatus([{ amount: 100 }], 100)).toBe("Paid");
    expect(calculatePaidStatus([{ amount: 99.99 }], 100)).toBe("Paid"); // Within tolerance
    expect(calculatePaidStatus([{ amount: 50, isVoided: true }], 100)).toBe(
      "Pending"
    );
  });

  it("handles multiple payments", () => {
    const payments = [{ amount: 30 }, { amount: 30 }, { amount: 40 }];
    expect(calculatePaidStatus(payments, 100)).toBe("Paid");
  });

  it("excludes voided payments", () => {
    const payments = [
      { amount: 50 },
      { amount: 50, isVoided: true },
    ];
    expect(calculatePaidStatus(payments, 100)).toBe("Partial");
  });
});

// ============================================================================
// SCENARIO 15: Mark Items Paid
// ============================================================================

describe("Scenario 15: Mark Items Paid", () => {
  it("updates paidQuantity correctly", () => {
    const items = [
      createMockItem({ id: "i1", quantity: 3, paidQuantity: 0 }),
      createMockItem({ id: "i2", quantity: 2, paidQuantity: 0 }),
    ];

    const updated = applyPaymentToItems(items, [
      { itemId: "i1", quantityPaid: 2, amountPaid: 20 },
    ]);

    expect(updated[0].paidQuantity).toBe(2);
    expect(updated[1].paidQuantity).toBe(0);
  });

  it("caps paidQuantity at item quantity", () => {
    const items = [createMockItem({ id: "i1", quantity: 2, paidQuantity: 1 })];

    const updated = applyPaymentToItems(items, [
      { itemId: "i1", quantityPaid: 5, amountPaid: 50 }, // More than available
    ]);

    // Should be capped at quantity
    expect(updated[0].paidQuantity).toBe(2);
  });

  it("handles multiple allocations", () => {
    const items = [
      createMockItem({ id: "i1", quantity: 3, paidQuantity: 0 }),
      createMockItem({ id: "i2", quantity: 2, paidQuantity: 0 }),
    ];

    const updated = applyPaymentToItems(items, [
      { itemId: "i1", quantityPaid: 1, amountPaid: 10 },
      { itemId: "i2", quantityPaid: 2, amountPaid: 20 },
    ]);

    expect(updated[0].paidQuantity).toBe(1);
    expect(updated[1].paidQuantity).toBe(2);
  });
});

// ============================================================================
// SCENARIO 16: Rounding Edge Cases
// ============================================================================

describe("Scenario 16: Rounding Edge Cases", () => {
  it("handles floating point precision correctly", () => {
    // Classic floating point issue: 0.1 + 0.2 = 0.30000000000000004
    expect(round2(0.1 + 0.2)).toBe(0.3);
  });

  it("rounds 0.005 up to 0.01 (banker's rounding)", () => {
    // Math.round with EPSILON should handle this
    expect(round2(10.005)).toBe(10.01);
    expect(round2(10.004)).toBe(10.0);
  });

  it("handles tax calculation edge cases", () => {
    // Tax calculation edge case
    const tax = round2(10.33 * 0.08875);
    expect(tax).toBe(0.92);
  });

  it("handles large numbers", () => {
    expect(round2(9999.994)).toBe(9999.99);
    expect(round2(9999.995)).toBe(10000.0);
  });

  it("handles negative numbers", () => {
    expect(round2(-10.005)).toBe(-10.0); // Note: different from positive due to Math.round
    expect(round2(-10.006)).toBe(-10.01);
  });
});

// ============================================================================
// BONUS: Empty Order
// ============================================================================

describe("Empty Order", () => {
  it("returns zero totals for empty order", () => {
    const result = calculateOrderTotals({
      items: [],
      checkDiscount: null,
      taxRatesMap: defaultTaxRates,
    });

    expect(result.subtotal).toBe(0);
    expect(result.total_amount).toBe(0);
    expect(result.outstanding_total).toBe(0);
  });

  it("returns zero totals for order with only voided items", () => {
    const items = [
      createMockItem({ id: "i1", price: 100.0, is_voided: true }),
    ];

    const result = calculateOrderTotals({
      items,
      checkDiscount: null,
      taxRatesMap: defaultTaxRates,
    });

    expect(result.subtotal).toBe(0);
    expect(result.total_amount).toBe(0);
  });
});

// ============================================================================
// BONUS: Extended Calculation with Details
// ============================================================================

describe("Extended Calculation with Details", () => {
  it("provides per-item breakdown", () => {
    const items = [
      createMockItem({ id: "i1", price: 20.0, quantity: 2 }),
      createMockItem({ id: "i2", price: 10.0, quantity: 1 }),
    ];

    const result = calculateOrderTotalsWithDetails({
      items,
      checkDiscount: null,
      taxRatesMap: defaultTaxRates,
    });

    expect(result.items).toHaveLength(2);
    expect(result.items[0].subtotal).toBe(40.0);
    expect(result.items[1].subtotal).toBe(10.0);
    expect(result.calculatedAt).toBeDefined();
  });

  it("calculates unit totals for split by item", () => {
    const items = [createMockItem({ id: "i1", price: 10.0, quantity: 3 })];

    const result = calculateOrderTotalsWithDetails({
      items,
      checkDiscount: null,
      taxRatesMap: defaultTaxRates,
    });

    // Per-unit should include proportional tax
    expect(result.items[0].unitTotalWithTax).toBeCloseTo(10.89, 2);
  });
});

// ============================================================================
// BONUS: Payment Preview Edge Cases
// ============================================================================

describe("Payment Preview Edge Cases", () => {
  it("validates split count minimum", () => {
    const totals = calculateOrderTotals({
      items: [createMockItem({ price: 100.0 })],
      checkDiscount: null,
      taxRatesMap: defaultTaxRates,
    });

    const preview = calculatePaymentPreview(totals, 0, {
      type: "split_even",
      paymentMethod: "card",
      splitCount: 1, // Invalid - must be at least 2
    });

    expect(preview.isValid).toBe(false);
    expect(preview.validationErrors).toContain("Split count must be at least 2");
  });

  it("validates custom amount bounds", () => {
    const totals = calculateOrderTotals({
      items: [createMockItem({ price: 100.0 })],
      checkDiscount: null,
      taxRatesMap: defaultTaxRates,
    });

    const preview = calculatePaymentPreview(totals, 0, {
      type: "custom_amount",
      paymentMethod: "card",
      customAmount: 500.0, // More than outstanding
    });

    expect(preview.isValid).toBe(false);
  });

  it("calculates change for cash payments", () => {
    const totals = calculateOrderTotals({
      items: [createMockItem({ price: 10.0 })],
      checkDiscount: null,
      taxRatesMap: defaultTaxRates,
    });

    const preview = calculatePaymentPreview(totals, 0, {
      type: "full",
      paymentMethod: "cash",
      amountTendered: 20.0,
    });

    // Total is 10.89, tendered 20, change is 9.11
    expect(preview.changeToGive).toBe(9.11);
  });

  it("includes tip in total to collect", () => {
    const totals = calculateOrderTotals({
      items: [createMockItem({ price: 100.0 })],
      checkDiscount: null,
      taxRatesMap: defaultTaxRates,
    });

    const preview = calculatePaymentPreview(totals, 0, {
      type: "full",
      paymentMethod: "card",
      tipAmount: 20.0,
    });

    expect(preview.tipAmount).toBe(20.0);
    expect(preview.totalToCollect).toBe(
      round2(preview.amountToCharge + 20.0)
    );
  });
});
