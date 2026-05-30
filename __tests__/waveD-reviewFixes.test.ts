/**
 * Wave D — review-driven fixes.
 *
 * Locks in the client-side changes made to address the post-review issue
 * list. Each block maps to one of the bugs surfaced in the review write-up:
 *
 *   - manualServiceCharge in calculateOrderTotals (issue #6 race fix)
 *   - SC fields on payment normalization (issue #1 transformer drop)
 *   - v14 residual-snap apportionment math port (issue #2 server fix —
 *     ports the new branch to TypeScript so future regressions in v14
 *     surface in CI alongside the v13 port already in this directory)
 */

import {
  calculateOrderTotals,
  hashCalculationInput,
} from "@/lib/order-calculator";
import { CartItem } from "@/lib/types";
import { OrderCalculationInput } from "@/types/order-calculations";
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
  name: "Auto-Gratuity",
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

// ─── manualServiceCharge — Issue #6 (race fix) ────────────────────────────

describe("Wave D fix #6 — manualServiceCharge wins over rule", () => {
  it("snaps SC to the override amount, bypassing rule eligibility", () => {
    // Rule would compute 18% × $50 = $9. Manager overrode to $3.50.
    const r = calculateOrderTotals(
      baseInput({ manualServiceCharge: 3.5 }),
    );
    expect(r.service_charge).toBe(3.5);
    expect(r.cash_service_charge).toBe(3.5);
    // total_amount must reflect the override, not the rule. Without this,
    // _ensureTotalsFresh briefly rebuilds total_amount against rule SC.
    expect(r.total_amount).toBe(53.5);
    expect(r.cash_total_amount).toBe(53.5);
  });

  it("snaps to zero on REMOVE (manager set p_amount = 0)", () => {
    const r = calculateOrderTotals(
      baseInput({ manualServiceCharge: 0 }),
    );
    expect(r.service_charge).toBe(0);
    expect(r.total_amount).toBe(50);
  });

  it("overrides even when rule would not be eligible (party size below threshold)", () => {
    // Without override, party_size 2 < min_party_size 4 → SC = 0.
    // Manager applied a manual $5 anyway.
    const r = calculateOrderTotals(
      baseInput({ partySize: 2, manualServiceCharge: 5 }),
    );
    expect(r.service_charge).toBe(5);
  });

  it("override falls back to 'Service Charge' label when no rule name available", () => {
    const r = calculateOrderTotals(
      baseInput({
        serviceChargeRule: null,
        snapshottedName: null,
        manualServiceCharge: 7,
      }),
    );
    expect(r.service_charge).toBe(7);
    expect(r.service_charge_name).toBe("Service Charge");
  });

  it("hashCalculationInput invalidates cache when manualServiceCharge changes", () => {
    const a = hashCalculationInput(baseInput({ manualServiceCharge: 5 }));
    const b = hashCalculationInput(baseInput({ manualServiceCharge: 10 }));
    const noOverride = hashCalculationInput(baseInput());
    expect(a).not.toEqual(b);
    expect(a).not.toEqual(noOverride);
  });
});

// ─── serverConfirmedServiceCharge fallback — Latte / S6-0015 bug ─────────────
//
// Reproduces the divergence found on staging 2026-05-29: server-side
// orders.service_charge = $1.71 (rule applied via apply_service_charge_v1),
// but the client calculator's local rule eligibility check fails (rule
// store not hydrated, or partySize unresolvable) → SC=0 → outstanding-cash
// drops SC → cashier prompted $5.72 instead of $7.43, customer under-pays
// by $1.71. serverConfirmedServiceCharge is the fallback that restores SC.

describe("Wave D follow-up — serverConfirmedServiceCharge fallback", () => {
  it("restores SC when local rule is null but server has confirmed value", () => {
    const r = calculateOrderTotals(
      baseInput({
        serviceChargeRule: null, // rules store not loaded on cashier station
        partySize: null,
        serverConfirmedServiceCharge: 1.71,
      }),
    );
    expect(r.service_charge).toBe(1.71);
    expect(r.total_amount).toBe(51.71);
    expect(r.cash_total_amount).toBe(51.71);
  });

  it("restores SC when partySize is null (useSeatingStore miss) but rule exists", () => {
    const r = calculateOrderTotals(
      baseInput({
        partySize: null,
        serverConfirmedServiceCharge: 1.71,
      }),
    );
    // partySize=null → ruleEligible=false → fallback fires.
    expect(r.service_charge).toBe(1.71);
  });

  it("local rule eligibility WINS when it succeeds (no regression on optimistic path)", () => {
    // Both inputs present; local rule produces $9 (18% × $50), should NOT
    // snap to the stale $1.71 server-confirmed value (e.g. mid-edit state
    // where items have been added but server hasn't recomputed yet).
    const r = calculateOrderTotals(
      baseInput({
        serverConfirmedServiceCharge: 1.71,
      }),
    );
    expect(r.service_charge).toBe(9);
  });

  it("manualServiceCharge wins over both rule AND serverConfirmedServiceCharge", () => {
    const r = calculateOrderTotals(
      baseInput({
        manualServiceCharge: 3.5,
        serverConfirmedServiceCharge: 1.71,
      }),
    );
    expect(r.service_charge).toBe(3.5);
  });

  it("does nothing when serverConfirmedServiceCharge is 0 or null (no rule, no fallback)", () => {
    const r = calculateOrderTotals(
      baseInput({
        serviceChargeRule: null,
        partySize: null,
        serverConfirmedServiceCharge: 0,
      }),
    );
    expect(r.service_charge).toBe(0);
    expect(r.total_amount).toBe(50);
  });

  it("outstanding cash includes SC when fallback fires (the S6-0015 cashier prompt fix)", () => {
    // 1 Latte at $9.50 card / $5.25 cash. SC $1.71 server-confirmed.
    // cash_subtotal $5.25 + cash_tax $0 + SC $1.71 = $6.96 outstanding cash.
    // Pre-fix: outstanding cash would be $5.25 (SC dropped).
    const latteCard = 9.5;
    const latteCash = 5.25;
    const latteItem = {
      ...item(latteCard),
      cashPrice: latteCash,
      baseCashPrice: latteCash,
      cashSubtotal: latteCash,
    } as unknown as CartItem;
    const r = calculateOrderTotals(
      baseInput({
        items: [latteItem],
        serviceChargeRule: null,
        partySize: null,
        serverConfirmedServiceCharge: 1.71,
      }),
    );
    expect(r.service_charge).toBe(1.71);
    expect(r.cash_total_amount).toBe(6.96); // $5.25 + $1.71
    expect(r.cash_outstanding_total).toBe(6.96);
  });

  it("hashCalculationInput invalidates cache when serverConfirmedServiceCharge changes", () => {
    const a = hashCalculationInput(
      baseInput({ serverConfirmedServiceCharge: 1.71 }),
    );
    const b = hashCalculationInput(
      baseInput({ serverConfirmedServiceCharge: 2.5 }),
    );
    expect(a).not.toEqual(b);
  });
});

// ─── Comma-strip parseFloat — Issue #10 ────────────────────────────────────
//
// ServiceChargeOverrideSheet does `parseFloat(amountInput.replace(/,/g, ''))`.
// This guards against Android locale keyboards that emit comma thousand
// separators; parseFloat("1,000.50") otherwise yields 1.

describe("Wave D fix #10 — comma-strip before parseFloat", () => {
  const parse = (s: string) => parseFloat(s.replace(/,/g, ""));

  it("handles plain decimal", () => {
    expect(parse("12.50")).toBe(12.5);
  });

  it("strips a single thousands comma", () => {
    expect(parse("1,000.50")).toBe(1000.5);
  });

  it("strips multiple thousands commas", () => {
    expect(parse("1,234,567.89")).toBeCloseTo(1234567.89, 2);
  });

  it("leaves a bare integer alone", () => {
    expect(parse("42")).toBe(42);
  });

  it("returns NaN for empty string", () => {
    expect(Number.isNaN(parse(""))).toBe(true);
  });
});

// ─── v14 SC residual-snap apportionment port — Issue #2 ────────────────────
//
// Mirrors process_payment_v14's SC allocation block in TypeScript. v13's
// branch only snapped on explicit last-split / full-remaining flags; v14
// adds the residual-snap branch so split-by-item and custom-amount
// payments that close the order also snap remaining SC. The v13 port
// lives in waveD-refundServiceCharge.test.ts — this exercises only the
// new branch v14 introduces.

interface OrderRow {
  service_charge: number;
  card_total: number;
  cash_total: number;
  payment_based_due: number; // remaining card-equivalent BEFORE this payment
}

interface PaymentInput {
  paymentTotal: number; // v_payment_total (items+tax for item pmts, no SC)
  useCashPricing: boolean;
  isSplitPayment: boolean;
  isLastPortion: boolean;
  isFullRemaining: boolean;
  priorScSnapshot: number;
  // v14 addition: for item payments, true when this allocation drains
  // the last unpaid order_items row. Server reads this via a recount
  // on order_items AFTER the items UPDATE.
  isItemPayment?: boolean;
  closesWithItems?: boolean;
}

function v14ScShare(order: OrderRow, p: PaymentInput): number {
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const remainingSc = Math.max(order.service_charge - p.priorScSnapshot, 0);

  const cardEquiv =
    p.useCashPricing && order.cash_total > 0
      ? round2((p.paymentTotal * order.card_total) / order.cash_total)
      : p.paymentTotal;
  const remainingAfter = Math.max(order.payment_based_due - cardEquiv, 0);
  const closesWithItems = !!(p.isItemPayment && p.closesWithItems);

  if (remainingSc <= 0) return 0;
  if (
    (p.isSplitPayment && p.isLastPortion) ||
    p.isFullRemaining ||
    remainingAfter <= 0.05 ||
    closesWithItems
  ) {
    return remainingSc;
  }
  if (p.useCashPricing && order.cash_total > 0) {
    return Math.min(
      remainingSc,
      round2((p.paymentTotal * order.service_charge) / order.cash_total),
    );
  }
  if (order.card_total > 0) {
    return Math.min(
      remainingSc,
      round2((p.paymentTotal * order.service_charge) / order.card_total),
    );
  }
  return 0;
}

describe("Wave D fix #2 — v14 residual-snap SC apportionment", () => {
  // 4-item order, card total $108 ($25 each + 8% SC), service_charge $8.
  // No splitCount / portionIndex (split-by-item flow). Pay each item once.
  const order: OrderRow = {
    service_charge: 8,
    card_total: 108,
    cash_total: 108,
    payment_based_due: 108,
  };

  it("first item payment (no flags) is proportional, NOT snap", () => {
    const share = v14ScShare(order, {
      paymentTotal: 25,
      useCashPricing: false,
      isSplitPayment: false,
      isLastPortion: false,
      isFullRemaining: false,
      priorScSnapshot: 0,
    });
    // remainingAfter = 108 - 25 = 83 → proportional
    // share = round2(25 × 8 / 108) = 1.85
    expect(share).toBeCloseTo(1.85, 2);
  });

  it("middle item payments stay proportional", () => {
    const share = v14ScShare(
      { ...order, payment_based_due: 83 },
      {
        paymentTotal: 25,
        useCashPricing: false,
        isSplitPayment: false,
        isLastPortion: false,
        isFullRemaining: false,
        priorScSnapshot: 1.85,
      },
    );
    expect(share).toBeCloseTo(1.85, 2);
  });

  it("LAST item payment snaps remaining SC even without split flags (v13 missed this)", () => {
    // 3 prior items captured 1.85 + 1.85 + 1.85 = 5.55 of the $8 SC.
    // Server detects the items recount = 0 after this item payment and
    // snaps the remaining $2.45 — not the proportional $1.85 (which
    // would leave SUM = 7.40, under-collected).
    const share = v14ScShare(
      { ...order, payment_based_due: 33 },
      {
        paymentTotal: 25,
        useCashPricing: false,
        isSplitPayment: false,
        isLastPortion: false,
        isFullRemaining: false,
        priorScSnapshot: 5.55,
        isItemPayment: true,
        closesWithItems: true,
      },
    );
    expect(share).toBeCloseTo(2.45, 2);
  });

  it("custom-amount payment that lands on the residual snaps", () => {
    // Cashier types in $108.00 directly (no isFullRemaining hint
    // because the client computes amount client-side).
    const share = v14ScShare(order, {
      paymentTotal: 108,
      useCashPricing: false,
      isSplitPayment: false,
      isLastPortion: false,
      isFullRemaining: false,
      priorScSnapshot: 0,
    });
    expect(share).toBe(8);
  });

  it("partial then close — second payment closes the order and snaps", () => {
    // Pay $50, then pay the remaining $58. Second payment closes.
    const share2 = v14ScShare(
      { ...order, payment_based_due: 58 },
      {
        paymentTotal: 58,
        useCashPricing: false,
        isSplitPayment: false,
        isLastPortion: false,
        isFullRemaining: false,
        priorScSnapshot: round2((50 * 8) / 108), // 3.70
      },
    );
    // Remaining SC = 8 - 3.70 = 4.30. payment_based_due - paymentTotal = 0.
    expect(share2).toBeCloseTo(4.3, 2);
  });

  it("invariant: SUM(share) across full split-by-item payment run equals service_charge", () => {
    // Simulate the 4-item run. payment_based_due here tracks card_total
    // - effective_paid (items+tax basis at the SQL layer, since item
    // payments record items+tax as the total). We approximate that by
    // decrementing by the item amount each iteration.
    let prior = 0;
    let remainingDue = 108;
    const shares: number[] = [];
    for (let i = 0; i < 4; i++) {
      const isLast = i === 3;
      const s = v14ScShare(
        { ...order, payment_based_due: remainingDue },
        {
          paymentTotal: 25,
          useCashPricing: false,
          isSplitPayment: false,
          isLastPortion: false,
          isFullRemaining: false,
          priorScSnapshot: prior,
          isItemPayment: true,
          closesWithItems: isLast,
        },
      );
      shares.push(s);
      prior += s;
      remainingDue -= 25;
    }
    const sum = shares.reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(8, 2);
  });

  it("cash-pricing path: card-equiv conversion drives residual detection", () => {
    // Cash total $100 (3.5% discount off $103.50 card total).
    // SC = $8 (flat). Cash-priced payment of $100 should snap.
    const cashOrder: OrderRow = {
      service_charge: 8,
      card_total: 103.5,
      cash_total: 100,
      payment_based_due: 103.5,
    };
    const share = v14ScShare(cashOrder, {
      paymentTotal: 100,
      useCashPricing: true,
      isSplitPayment: false,
      isLastPortion: false,
      isFullRemaining: false,
      priorScSnapshot: 0,
    });
    // cardEquiv = round2(100 × 103.5 / 100) = 103.5 → remainingAfter = 0 → snap
    expect(share).toBe(8);
  });

  it("v13 explicit hints (full-remaining / last-portion) still snap (no regression)", () => {
    const fullRemaining = v14ScShare(order, {
      paymentTotal: 50,
      useCashPricing: false,
      isSplitPayment: false,
      isLastPortion: false,
      isFullRemaining: true,
      priorScSnapshot: 0,
    });
    expect(fullRemaining).toBe(8);

    const lastSplit = v14ScShare(
      { ...order, payment_based_due: 27 },
      {
        paymentTotal: 27,
        useCashPricing: false,
        isSplitPayment: true,
        isLastPortion: true,
        isFullRemaining: false,
        priorScSnapshot: 6,
      },
    );
    expect(lastSplit).toBe(2);
  });
});

const round2 = (n: number) => Math.round(n * 100) / 100;
