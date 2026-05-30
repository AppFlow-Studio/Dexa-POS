/**
 * Service Charge math tests for calculateOrderTotals.
 *
 * Covers: eligibility matrix, pre/post discount base, snapshot durability,
 * outstanding proportion, cash = card flat SC, hashCalculationInput
 * cache invalidation.
 */

import {
  calculateOrderTotals,
  hashCalculationInput,
} from "@/lib/order-calculator";
import { CartItem, Discount } from "@/lib/types";
import {
  OrderCalculationInput,
} from "@/types/order-calculations";
import type { ServiceChargeRule } from "@/stores/useServiceChargeRulesStore";
import { TaxRatesMap } from "@/types/menu";

const NO_TAX: TaxRatesMap = { standard: 0, alcohol: 0, exempt: 0 };

const item = (price: number, qty = 1): CartItem =>
  ({
    id: `i_${price}_${qty}_${Math.random().toString(36).slice(2)}`,
    menuItemId: "m1",
    name: "Item",
    quantity: qty,
    paidQuantity: 0,
    originalPrice: price,
    price,
    unitPrice: price,
    cashPrice: price,
    baseCardPrice: price,
    baseCashPrice: price,
    customizations: {},
    subtotal: price * qty,
    cashSubtotal: price * qty,
    taxRate: 0,
    taxAmount: 0,
    cashTaxAmount: 0,
  }) as unknown as CartItem;

const rule = (overrides: Partial<ServiceChargeRule> = {}): ServiceChargeRule => ({
  id: "rule_1",
  merchant_id: "m1",
  location_id: null,
  name: "Service Charge",
  rate_percent: 18,
  min_party_size: 4,
  applies_to_order_types: ["dine_in"],
  applies_on: "pre_discount",
  is_taxable: false,
  auto_apply: true,
  is_active: true,
  updated_at: "2026-05-29T00:00:00Z",
  ...overrides,
});

const baseInput = (
  overrides: Partial<OrderCalculationInput> = {},
): OrderCalculationInput => ({
  items: [item(50)],
  checkDiscount: null,
  taxRatesMap: NO_TAX,
  serviceChargeRule: rule(),
  partySize: 4,
  orderType: "dine_in",
  ...overrides,
});

describe("Service Charge — eligibility matrix", () => {
  it("applies when party_size >= threshold and order_type matches", () => {
    const r = calculateOrderTotals(baseInput());
    expect(r.service_charge).toBe(9);
    expect(r.cash_service_charge).toBe(9);
    expect(r.service_charge_name).toBe("Service Charge");
    expect(r.total_amount).toBe(59);
    expect(r.cash_total_amount).toBe(59);
  });

  it("does not apply when party_size below threshold", () => {
    const r = calculateOrderTotals(baseInput({ partySize: 3 }));
    expect(r.service_charge).toBe(0);
    expect(r.total_amount).toBe(50);
  });

  it("does not apply for non-matching order_type", () => {
    const r = calculateOrderTotals(baseInput({ orderType: "takeout" }));
    expect(r.service_charge).toBe(0);
  });

  it("does not apply when rule is inactive", () => {
    const r = calculateOrderTotals(
      baseInput({ serviceChargeRule: rule({ is_active: false }) }),
    );
    expect(r.service_charge).toBe(0);
  });

  it("does not apply when auto_apply is false", () => {
    const r = calculateOrderTotals(
      baseInput({ serviceChargeRule: rule({ auto_apply: false }) }),
    );
    expect(r.service_charge).toBe(0);
  });

  it("does not apply when no rule is provided", () => {
    const r = calculateOrderTotals(baseInput({ serviceChargeRule: null }));
    expect(r.service_charge).toBe(0);
  });

  it("does not apply when partySize is null", () => {
    const r = calculateOrderTotals(baseInput({ partySize: null }));
    expect(r.service_charge).toBe(0);
  });

  it("applies at party_size == min_party_size (off-by-one)", () => {
    const r = calculateOrderTotals(
      baseInput({ partySize: 4, serviceChargeRule: rule({ min_party_size: 4 }) }),
    );
    expect(r.service_charge).toBe(9);
  });
});

describe("Service Charge — pre vs post discount base", () => {
  const discount: Discount = {
    id: "d",
    name: "10%",
    label: "10%",
    type: "percentage",
    value: 0.1,
  } as unknown as Discount;

  it("pre_discount: SC = rate × gross subtotal", () => {
    const r = calculateOrderTotals(
      baseInput({
        checkDiscount: discount,
        serviceChargeRule: rule({ applies_on: "pre_discount" }),
      }),
    );
    expect(r.service_charge).toBe(9); // 18% of $50, not $45
  });

  it("post_discount: SC = rate × net subtotal", () => {
    const r = calculateOrderTotals(
      baseInput({
        checkDiscount: discount,
        serviceChargeRule: rule({ applies_on: "post_discount" }),
      }),
    );
    expect(r.service_charge).toBe(8.1); // 18% of $45
  });
});

describe("Service Charge — snapshot durability", () => {
  it("snapshotted rate wins over live rule rate", () => {
    const r = calculateOrderTotals(
      baseInput({
        serviceChargeRule: rule({ rate_percent: 20 }),
        snapshottedRate: 18,
      }),
    );
    expect(r.service_charge).toBe(9); // snapshotted 18% × 50, not live 20%
  });

  it("snapshotted applies_on wins over live rule applies_on", () => {
    const discount = {
      id: "d",
      name: "10%",
      label: "10%",
      type: "percentage" as const,
      value: 0.1,
    } as unknown as Discount;
    const r = calculateOrderTotals(
      baseInput({
        checkDiscount: discount,
        serviceChargeRule: rule({ applies_on: "post_discount" }),
        snapshottedAppliesOn: "pre_discount",
      }),
    );
    expect(r.service_charge).toBe(9); // pre-discount wins
  });

  it("snapshotted name wins over live rule name", () => {
    const r = calculateOrderTotals(
      baseInput({
        serviceChargeRule: rule({ name: "Gratuity" }),
        snapshottedName: "Service Charge",
      }),
    );
    expect(r.service_charge_name).toBe("Service Charge");
  });
});

describe("Service Charge — outstanding proportion", () => {
  it("full SC outstanding when nothing paid", () => {
    const r = calculateOrderTotals(baseInput());
    expect(r.outstanding_total).toBe(59);
  });

  it("outstanding_total = total - paid (payment-based)", () => {
    const items = [item(25), item(25)];
    items[0].paidQuantity = 1; // half paid by item
    const r = calculateOrderTotals(
      baseInput({ items, payments: [{ amount: 25 }] }),
    );
    // Subtotal $50, SC $9, total $59. Customer paid $25. Owes $34.
    // (Payment-level handler reconciles item-level outstanding $29.50
    // up to the payment-based outstanding $34 — what the customer
    // actually still owes including the unpaid SC slice.)
    expect(r.total_amount).toBe(59);
    expect(r.outstanding_total).toBe(34);
  });
});

describe("Service Charge — dual pricing", () => {
  it("same flat $ on card and cash totals", () => {
    const cardCashItem = item(50);
    (cardCashItem as any).baseCashPrice = 48; // 4% cash discount
    const r = calculateOrderTotals(baseInput({ items: [cardCashItem] }));
    // Card subtotal 50, card SC 9 (18% of 50).
    // Cash subtotal 48 but SC stays flat $9 (matches backend math).
    expect(r.service_charge).toBe(9);
    expect(r.cash_service_charge).toBe(9);
    expect(r.cash_total_amount).toBe(57); // 48 + 9
  });
});

describe("Service Charge — hashCalculationInput cache invalidation", () => {
  it("differs when rule rate changes", () => {
    const a = hashCalculationInput(baseInput());
    const b = hashCalculationInput(
      baseInput({ serviceChargeRule: rule({ rate_percent: 20 }) }),
    );
    expect(a).not.toBe(b);
  });

  it("differs when party_size changes", () => {
    const a = hashCalculationInput(baseInput({ partySize: 4 }));
    const b = hashCalculationInput(baseInput({ partySize: 5 }));
    expect(a).not.toBe(b);
  });

  it("differs when applies_on changes", () => {
    const a = hashCalculationInput(
      baseInput({ serviceChargeRule: rule({ applies_on: "pre_discount" }) }),
    );
    const b = hashCalculationInput(
      baseInput({ serviceChargeRule: rule({ applies_on: "post_discount" }) }),
    );
    expect(a).not.toBe(b);
  });

  it("differs when snapshottedRate is set", () => {
    const a = hashCalculationInput(baseInput());
    const b = hashCalculationInput(baseInput({ snapshottedRate: 20 }));
    expect(a).not.toBe(b);
  });

  it("matches when SC inputs are identical", () => {
    const fixedItem = { ...item(50), id: "fixed_id" };
    const a = hashCalculationInput(baseInput({ items: [fixedItem] }));
    const b = hashCalculationInput(baseInput({ items: [fixedItem] }));
    expect(a).toBe(b);
  });
});

describe("Service Charge — existing callers unaffected", () => {
  it("returns service_charge=0 with no rule/partySize (default)", () => {
    const r = calculateOrderTotals({
      items: [item(10)],
      checkDiscount: null,
      taxRatesMap: NO_TAX,
    });
    expect(r.service_charge).toBe(0);
    expect(r.cash_service_charge).toBe(0);
    expect(r.service_charge_name).toBe("");
  });
});
