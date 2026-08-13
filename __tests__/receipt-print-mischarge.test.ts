// Regression suite for the printed-check footer mischarge (#S1-0003): the footer
// TOTAL trusted a stale persisted `order.total_amount` scalar while the summary
// rows were computed fresh from the live item array, so a check could undercharge
// (printed Subtotal+Tax+SC = $66.61 but TOTAL = $48.85). The fix derives the footer
// from the same fresh components the summary prints, so footer == Σ(rows) always.
//
// Native printer drivers pull react-native-star-io10 / @/native/LandiPrinter, which
// aren't available under jest. buildReceiptTemplateData never touches the driver
// layer, so stub the factory to keep the import graph load-safe.
jest.mock("@/services/printing/DriverFactory", () => ({
  getDriver: () => null,
}));

// uuid v13 ships ESM that jest-expo doesn't transform; the store/service import
// chain pulls it transitively. Stub it (established pattern across the suite).
jest.mock("uuid", () => ({
  v4: () => "00000000-0000-4000-8000-000000000000",
  v5: () => "00000000-0000-5000-8000-000000000000",
}));

import {
  buildReceiptTemplateData,
  reconcileReceiptTotals,
  resolveFullOrder,
} from "@/services/printing/PrinterService";
import { useOrderStore } from "@/stores/useOrderStore";
import { CartItem, OrderProfile } from "@/lib/types";
import { PrinterConfig } from "@/types/printer";
import {
  SelectedLocation,
  useStoreSettingsStore,
} from "@/stores/useStoreSettingsStore";
import { useServiceChargeRulesStore } from "@/stores/useServiceChargeRulesStore";
import { useSeatingStore } from "@/stores/useSeatingStore";

const LOCATION = {
  id: "loc-1",
  name: "Charcoal Gardenia",
  phone: "+17188870100",
  address_line1: "432 Manor Road",
  address_line2: null,
  city: "Staten Island",
  state: "NY",
  postal_code: "10314-2956",
} as unknown as SelectedLocation;

const PRINTER = {
  id: "printer-1",
  printerType: "landi",
  maxCharsPerLine: 48,
  graphicsOnly: false,
  receiptFooter: "Thank you",
} as unknown as PrinterConfig;

function mkItem(o: Partial<CartItem> & { subtotal: number }): CartItem {
  const qty = o.quantity ?? 1;
  const cashSubtotal = o.cashSubtotal ?? o.subtotal;
  return {
    id: "item",
    name: "Item",
    quantity: 1,
    taxRate: 0,
    taxAmount: 0,
    discount_amount: 0,
    discount_cash_amount: 0,
    is_voided: false,
    customizations: {},
    ...o,
    // Derived fields set AFTER the spread so they reflect the final o values.
    cashSubtotal,
    unitPrice: o.unitPrice ?? o.subtotal / qty,
    baseCardPrice: o.baseCardPrice ?? o.subtotal / qty,
    baseCashPrice: o.baseCashPrice ?? cashSubtotal / qty,
    cashTaxAmount: o.cashTaxAmount ?? o.taxAmount ?? 0,
  } as unknown as CartItem;
}

// The four #S1-0003 items. Card subtotal 52.50, cash 50.46; card tax Σ 4.66,
// cash tax Σ 4.48 — set per-item so the builder's sumItemCard/CashTax path runs.
const S1_0003_ITEMS = (): CartItem[] => [
  mkItem({ id: "i1", name: "Dubai Brownie", quantity: 2, subtotal: 26.0, cashSubtotal: 25.0, taxAmount: 2.31, cashTaxAmount: 2.22 }),
  mkItem({ id: "i2", name: "Single Scoop Ice Cream", quantity: 1, subtotal: 3.5, cashSubtotal: 3.36, taxAmount: 0.31, cashTaxAmount: 0.3 }),
  mkItem({ id: "i3", name: "Water Bottle", quantity: 3, subtotal: 9.0, cashSubtotal: 8.64, taxAmount: 0.8, cashTaxAmount: 0.77 }),
  mkItem({ id: "i4", name: "Strawberry Cheesecake Crepe", quantity: 1, subtotal: 14.0, cashSubtotal: 13.46, taxAmount: 1.24, cashTaxAmount: 1.19 }),
];

function baseOrder(overrides: Partial<OrderProfile>): OrderProfile {
  return {
    id: "ord-1",
    display_number: "#S1-0003",
    order_number: "ORD-20260804-S1-0003",
    order_type: "dine_in",
    opened_at: "2026-08-04T00:36:13Z",
    items: [],
    payments: [],
    amount_paid: 0,
    ...overrides,
  } as unknown as OrderProfile;
}

beforeEach(() => {
  useStoreSettingsStore.setState({
    taxRatesMap: { standard: 8.875, alcohol: 12, exempt: 0 },
  } as any);
  useServiceChargeRulesStore.getState().setRules([]);
  useSeatingStore.setState({ byOrderId: {} } as any);
});

describe("buildReceiptTemplateData — footer mischarge", () => {
  it("open dine-in check ignores the stale total_amount scalar (repro #S1-0003)", () => {
    // Open, unpaid; stale scalars hold the pre-crepe 3-item totals the buggy
    // footer trusted; the item array is fresh (4 items → 52.50 subtotal).
    const order = baseOrder({
      paid_status: "Pending",
      items: S1_0003_ITEMS(),
      service_charge_is_manual: true,
      service_charge: 9.45,
      total_amount: 48.85,
      total_cash_amount: 47.21,
    });

    const d = buildReceiptTemplateData(order, LOCATION, PRINTER);

    // Summary rows are fresh:
    expect(d.subtotal).toBeCloseTo(52.5, 2);
    expect(d.tax).toBeCloseTo(4.66, 2);
    expect(d.serviceCharge ?? 0).toBeCloseTo(9.45, 2);

    // Footer equals Σ(rows), NOT the stale 48.85 / 47.21:
    expect(d.total).toBeCloseTo(66.61, 2);
    expect(d.total).not.toBeCloseTo(48.85, 2);
    expect(d.cashTotal).toBeCloseTo(64.39, 2);
    expect(d.cashTotal).not.toBeCloseTo(47.21, 2);

    // The reconciliation identity that was violated now holds by construction:
    expect(d.subtotal - d.discount + d.tax + (d.serviceCharge ?? 0)).toBeCloseTo(
      d.total,
      2,
    );
  });

  it("finalized reprint trusts the persisted total to the cent", () => {
    const order = baseOrder({
      paid_status: "Paid",
      closed_at: "2026-08-04T01:00:00Z",
      items: S1_0003_ITEMS(),
      service_charge_is_manual: true,
      service_charge: 9.45,
      total_tax: 4.66,
      total_discount: 0,
      total_amount: 66.61,
      total_cash_amount: 64.39,
      payments: [{ id: "p1", method: "Card", amount: 66.61, isVoided: false }],
    } as Partial<OrderProfile>);

    const d = buildReceiptTemplateData(order, LOCATION, PRINTER);
    expect(d.total).toBe(66.61);
  });

  it("excludes voided items from the subtotal and total", () => {
    const order = baseOrder({
      paid_status: "Pending",
      order_type: "takeout", // isolate: no service charge
      items: [
        mkItem({ id: "real", name: "Real", subtotal: 52.5, cashSubtotal: 50.46, taxAmount: 4.66, cashTaxAmount: 4.48 }),
        mkItem({ id: "void", name: "Voided", subtotal: 20, taxAmount: 1.78, is_voided: true }),
      ],
      total_amount: 30.0, // stale, must be ignored
    });

    const d = buildReceiptTemplateData(order, LOCATION, PRINTER);
    expect(d.items.length).toBe(1);
    expect(d.subtotal).toBeCloseTo(52.5, 2);
    expect(d.total).toBeCloseTo(52.5 + 4.66, 2); // 57.16 — voided value dropped
  });

  it("cash tax equals the per-item cashTaxAmount sum, not a rate re-derivation", () => {
    const order = baseOrder({
      paid_status: "Pending",
      order_type: "takeout",
      items: [
        mkItem({ id: "a", subtotal: 30, cashSubtotal: 29.3, taxAmount: 2.66, cashTaxAmount: 2.6 }),
        mkItem({ id: "b", subtotal: 22.5, cashSubtotal: 22.0, taxAmount: 2.0, cashTaxAmount: 1.95 }),
      ],
      total_amount: 10, // stale
    });

    const d = buildReceiptTemplateData(order, LOCATION, PRINTER);
    expect(d.cashTax).toBeCloseTo(2.6 + 1.95, 2); // == Σ cashTaxAmount
  });

  it("is idempotent — building twice yields the same totals (no post-fire drift)", () => {
    const order = baseOrder({
      paid_status: "Paid",
      closed_at: "2026-08-04T01:00:00Z",
      items: S1_0003_ITEMS(),
      service_charge_is_manual: true,
      service_charge: 9.45,
      total_tax: 4.66,
      total_amount: 66.61,
      total_cash_amount: 64.39,
      payments: [{ id: "p1", method: "Card", amount: 66.61, isVoided: false }],
    } as Partial<OrderProfile>);

    const a = buildReceiptTemplateData(order, LOCATION, PRINTER);
    const b = buildReceiptTemplateData(order, LOCATION, PRINTER);
    expect(b.total).toBe(a.total);
    expect(b.subtotal).toBe(a.subtotal);
    expect(b.items).toEqual(a.items);
  });

  it("open order uses the live-recomputed service charge, not a stale persisted scalar (repro #S2-0001)", () => {
    // Live SC rule: 18%, min party 2, dine_in, pre_discount.
    useServiceChargeRulesStore.getState().setRules([
      {
        id: "scr-1",
        merchant_id: "m1",
        location_id: "loc-1",
        name: "Service Charge",
        rate_percent: 18,
        min_party_size: 2,
        applies_to_order_types: ["dine_in"],
        applies_on: "pre_discount",
        is_taxable: false,
        auto_apply: true,
        is_active: true,
        updated_at: "2026-08-01T00:00:00Z",
      } as any,
    ]);

    const order = baseOrder({
      id: "ord-s2-0001",
      display_number: "#S2-0001",
      paid_status: "Pending", // OPEN
      session_id: "sess-1",
      items: [
        mkItem({ id: "a", subtotal: 40, cashSubtotal: 38, taxAmount: 3.93, cashTaxAmount: 3.74 }),
        mkItem({ id: "b", subtotal: 30, cashSubtotal: 28.5, taxAmount: 2.95, cashTaxAmount: 2.8 }),
      ], // card subtotal 70.00, tax Σ 6.88
      service_charge_rate: 18,
      service_charge_applies_on: "pre_discount",
      service_charge_is_manual: false,
      // STALE persisted SC (18% of an earlier $42 base) — must be ignored while open:
      service_charge: 7.56,
      total_amount: 84.44, // stale, consistent with the stale SC
    });
    // Party size 2 (>= rule min) resolves via the seating store.
    useSeatingStore.setState({
      byOrderId: {
        [order.id]: {
          activeSeat: null,
          itemSeatMap: {},
          dbIdToSeatMap: {},
          seatCount: 2,
          syncing: false,
        },
      },
    } as any);

    const d = buildReceiptTemplateData(order, LOCATION, PRINTER);

    expect(d.subtotal).toBeCloseTo(70, 2);
    // Live SC = 18% * 70 = 12.60, NOT the stale 7.56:
    expect(d.serviceCharge ?? 0).toBeCloseTo(12.6, 2);
    expect(d.serviceCharge ?? 0).not.toBeCloseTo(7.56, 2);
    // Total reflects the fresh SC (70 + 6.88 + 12.60 = 89.48), not the stale 84.44:
    expect(d.total).toBeCloseTo(70 + d.tax + 12.6, 2);
    expect(d.total).not.toBeCloseTo(84.44, 2);
  });
});

describe("resolveFullOrder — uniform order source across print surfaces", () => {
  afterEach(() => {
    useOrderStore.setState({ ordersById: {}, dbOrderIdIndex: {} } as any);
  });

  it("prefers the hydrated store order (by local id) over a lossy list object", () => {
    const full = baseOrder({ id: "ord-x", items: S1_0003_ITEMS() });
    useOrderStore.setState({ ordersById: { "ord-x": full } } as any);
    // Previous-Orders passes a stripped object with empty items:
    const lossy = { id: "ord-x", items: [] } as any;
    expect(resolveFullOrder(lossy)).toBe(full);
  });

  it("resolves via db_order_id when the local id is not a store key", () => {
    const full = baseOrder({ id: "local-1", items: S1_0003_ITEMS() });
    useOrderStore.setState({
      ordersById: { "local-1": full },
      dbOrderIdIndex: { "db-1": "local-1" },
    } as any);
    const lossy = { id: "db-1", db_order_id: "db-1", items: [] } as any;
    expect(resolveFullOrder(lossy)).toBe(full);
  });

  it("falls back to the passed order when not held in the store (archived)", () => {
    useOrderStore.setState({ ordersById: {}, dbOrderIdIndex: {} } as any);
    const archived = baseOrder({ id: "old-1", items: [] });
    expect(resolveFullOrder(archived)).toBe(archived);
  });
});

describe("reconcileReceiptTotals", () => {
  it("flags a footer that undercharges vs its own rows (#S1-0003 shape)", () => {
    const v = reconcileReceiptTotals({
      lineSum: 52.5, subtotal: 52.5, discount: 0, tax: 4.66, serviceCharge: 9.45,
      total: 48.85, track: "card",
    });
    expect(v.some((x) => x.code === "components_vs_total")).toBe(true);
  });

  it("passes when the footer equals Σ(rows)", () => {
    const v = reconcileReceiptTotals({
      lineSum: 52.5, subtotal: 52.5, discount: 0, tax: 4.66, serviceCharge: 9.45,
      total: 66.61, track: "card",
    });
    expect(v).toHaveLength(0);
  });

  it("tolerates a sub-cent rounding drift", () => {
    const v = reconcileReceiptTotals({
      lineSum: 52.5, subtotal: 52.5, discount: 0, tax: 4.66, serviceCharge: 9.45,
      total: 66.615, track: "card",
    });
    expect(v).toHaveLength(0);
  });

  it("flags a line-sum vs subtotal mismatch", () => {
    const v = reconcileReceiptTotals({
      lineSum: 50.0, subtotal: 52.5, discount: 0, tax: 4.66, serviceCharge: 9.45,
      total: 66.61, track: "card",
    });
    expect(v.some((x) => x.code === "line_vs_subtotal")).toBe(true);
  });
});
