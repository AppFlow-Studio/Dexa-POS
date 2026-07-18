/**
 * H2 Wave 1 — canonical raw-DB-row → OrderProfilePayment mapper.
 *
 * `mapFetchedPaymentsToProfile` composes normalizeFetchedPayments +
 * transformBroadcastPaymentsToProfile. This suite is the safety net that lands
 * BEFORE the two inline mappers (syncOrderFromDatabase, syncOrderFromBackendComplete)
 * are swapped onto it — it pins the exact output shape for every payment scenario
 * so a call-site swap can't silently change behavior.
 *
 * Rows are the `order_payments` shape the get_order_details RPC returns
 * (row_to_json(op.*)), which is exactly FetchedOrderPayment.
 */

import {
  mapFetchedPaymentsToProfile,
  normalizeFetchedPayment,
  type FetchedOrderPayment,
} from "@/utils/orderTransformers";

// Minimal order_payments row with sane defaults; override per test.
function makeRow(o: Partial<FetchedOrderPayment>): FetchedOrderPayment {
  return {
    id: "pay-1",
    order_id: "ord-1",
    payment_method: "card",
    amount: 10,
    tip_amount: 0,
    total_amount: 10,
    status: "captured",
    subtotal_portion: null,
    tax_portion: null,
    discount_portion: null,
    amount_tendered: null,
    change_given: null,
    is_cash_priced: null,
    cash_discount_applied: null,
    original_amount: null,
    split_portion_index: null,
    split_count: null,
    covers_items: null,
    terminal_type: null,
    terminal_id: null,
    card_type: null,
    card_last_four: null,
    transaction_id: null,
    authorization_code: null,
    processor_response: null,
    reference_number: null,
    dejavoo_response_code: null,
    dejavoo_batch_number: null,
    dejavoo_invoice_number: null,
    auth_code: null,
    rrn: null,
    result_code: null,
    result_message: null,
    batch_number: null,
    is_voided: null,
    voided_at: null,
    voided_by: null,
    void_reason: null,
    refunded_amount: null,
    refunded_at: null,
    service_charge: null,
    service_charge_refunded: null,
    is_returned: null,
    returned_at: null,
    returned_by: null,
    return_amount: null,
    return_rrn: null,
    return_auth_code: null,
    return_reference_id: null,
    return_number: null,
    return_reason: null,
    is_settled: null,
    settled_at: null,
    created_at: "2026-07-18T00:00:00Z",
    ...(o as any),
  } as unknown as FetchedOrderPayment;
}

const map = (rows: FetchedOrderPayment[], opts?: any) =>
  mapFetchedPaymentsToProfile(
    rows,
    opts?.orderItems,
    opts?.paymentItems,
    opts?.cardTotal ?? null,
    opts?.cashTotal ?? null,
  );

describe("H2 mapFetchedPaymentsToProfile — identity & method", () => {
  it("prefixes id with payment_ and keeps db_payment_id = raw id (parity with broadcast/eager)", () => {
    const [p] = map([makeRow({ id: "abc" })]);
    expect(p.id).toBe("payment_abc");
    expect(p.db_payment_id).toBe("abc");
  });

  it("maps method: cash → Cash, anything else → Card", () => {
    expect(map([makeRow({ payment_method: "cash" })])[0].method).toBe("Cash");
    expect(map([makeRow({ payment_method: "card" })])[0].method).toBe("Card");
  });

  it("returns [] for empty/undefined input", () => {
    expect(map([])).toEqual([]);
    expect(mapFetchedPaymentsToProfile(undefined)).toEqual([]);
  });
});

describe("H2 mapFetchedPaymentsToProfile — captured card", () => {
  it("populates card details and transactionDetails", () => {
    const [p] = map([
      makeRow({
        payment_method: "card",
        status: "captured",
        card_type: "Visa",
        card_last_four: "4242",
        terminal_type: "dejavoo",
        authorization_code: "AUTH9",
        batch_number: "B7",
        rrn: "RRN123",
      }),
    ]);
    expect(p.status).toBe("captured");
    expect(p.cardBrand).toBe("Visa");
    expect(p.last4).toBe("4242");
    expect(p.transactionDetails?.authorizationCode).toBe("AUTH9");
    expect(p.transactionDetails?.rrn).toBe("RRN123");
    expect(p.transactionDetails?.isCash).toBe(false);
  });
});

describe("H2 mapFetchedPaymentsToProfile — cash with change", () => {
  it("carries amountTendered / changeGiven and derives cashSavings", () => {
    const [p] = map(
      [
        makeRow({
          payment_method: "cash",
          amount: 9,
          total_amount: 9,
          amount_tendered: 20,
          change_given: 11,
          is_cash_priced: true,
          original_amount: 10, // card-equivalent → $1 saving
        }),
      ],
      { cardTotal: 10, cashTotal: 9 },
    );
    expect(p.method).toBe("Cash");
    expect(p.amountTendered).toBe(20);
    expect(p.changeGiven).toBe(11);
    expect(p.isCashPriced).toBe(true);
    expect(p.cashSavings).toBeGreaterThan(0);
    expect(p.transactionDetails?.isCash).toBe(true);
  });
});

describe("H2 mapFetchedPaymentsToProfile — voided (status='void')", () => {
  it("maps DB 'void' spelling to voided + isVoided (does not resurrect as pending)", () => {
    const [p] = map([
      makeRow({ status: "void", is_voided: true, void_reason: "manager void" }),
    ]);
    expect(p.status).toBe("voided");
    expect(p.isVoided).toBe(true);
    expect(p.voidReason).toBe("manager void");
  });

  it("normalizeFetchedPayment translates 'void' → 'voided' at the seam", () => {
    expect(normalizeFetchedPayment(makeRow({ status: "void" })).status).toBe(
      "voided",
    );
  });
});

describe("H2 mapFetchedPaymentsToProfile — pre-auth (authorized)", () => {
  it("emits the pre-auth block", () => {
    const [p] = map([
      makeRow({
        status: "authorized",
        amount: 50,
        terminal_type: "castles",
        processor_response: { terminal_vendor: "castles" } as any,
        rrn: "RRN-PA",
        authorization_code: "PA-AUTH",
      }),
    ]);
    expect(p.status).toBe("authorized");
    expect(p.isPreAuth).toBe(true);
    expect(p.preAuthAmount).toBe(50);
    expect(p.preAuthRrn).toBe("RRN-PA");
  });
});

describe("H2 mapFetchedPaymentsToProfile — refunded / returned", () => {
  it("carries refundedAmount + return tracking straight through (no local merge in the mapper)", () => {
    const [p] = map([
      makeRow({
        status: "refunded",
        refunded_amount: 5,
        is_returned: true,
        return_amount: 5,
        returned_by: "staff-9",
      }),
    ]);
    expect(p.status).toBe("refunded");
    expect(p.refundedAmount).toBe(5);
    expect(p.isReturned).toBe(true);
    expect(p.returnAmount).toBe(5);
    expect(p.returnedBy).toBe("staff-9");
  });
});

describe("H2 mapFetchedPaymentsToProfile — split payment", () => {
  it("builds splitInfo from split_count / split_portion_index", () => {
    const [p] = map([
      makeRow({ split_count: 3, split_portion_index: 1 }),
    ]);
    expect(p.splitInfo).toEqual(
      expect.objectContaining({ portionIndex: 1, totalPortions: 3 }),
    );
  });
});

describe("H2 mapFetchedPaymentsToProfile — junction item coverage", () => {
  it("uses real per-payment quantities/prices from payment_items and resolves item names from orderItems", () => {
    const [p] = map([makeRow({ id: "pay-cov" })], {
      orderItems: [{ id: "item-1", item_name: "Latte" }] as any,
      paymentItems: [
        {
          order_payment_id: "pay-cov",
          order_item_id: "item-1",
          quantity_paid: 2,
          unit_price_paid: 4.5,
          subtotal_paid: 9,
        },
      ] as any,
    });
    expect(p.itemsCovered).toEqual([
      expect.objectContaining({
        itemId: "item-1",
        itemName: "Latte",
        quantity: 2,
        unitPrice: 4.5,
        subtotal: 9,
      }),
    ]);
  });
});

describe("H2 mapFetchedPaymentsToProfile — settlement", () => {
  it("carries settlement tracking fields", () => {
    const [p] = map([
      makeRow({ is_settled: true, settled_at: "2026-07-18T01:00:00Z" }),
    ]);
    expect(p.is_settled).toBe(true);
    expect(p.settled_at).toBe("2026-07-18T01:00:00Z");
  });
});
