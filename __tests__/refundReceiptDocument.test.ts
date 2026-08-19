import {
  buildRefundReceiptDocument,
  RefundReceiptData,
} from "@/services/printing/templates/RefundReceiptDocumentTemplate";

function baseData(
  overrides: Partial<RefundReceiptData> = {},
): RefundReceiptData {
  return {
    locationId: "loc-1",
    orderId: "order-1",
    reversalId: "reversal-1",
    storeName: "Mario's Pizza & Grill",
    storeAddress: "1234 Ocean Ave., Brooklyn, NY 11230",
    storePhone: "(718) 555-0198",
    refundNumber: "RS1-000195",
    orderNumber: "000187",
    orderDate: "08/18/2026, 01:00 PM",
    refundDate: "08/18/2026",
    refundTime: "02:45 PM",
    cashierName: "Admin",
    posCode: "01",
    items: [
      { name: "Buffalo Chicken Wrap", quantity: 1, amount: 14.99 },
      { name: "Fountain Drink", quantity: 1, amount: 2.5 },
    ],
    subtotal: 17.49,
    tax: 1.56,
    totalRefunded: 19.05,
    paymentMethod: "CARD",
    cardBrand: "VISA",
    cardLast4: "1234",
    approvalStatus: "APPROVED",
    approvalCode: "089123",
    transactionId: "RS1-000195",
    refundRrn: "623000499605",
    batchNumber: "072",
    invoiceNumber: "1909",
    terminalId: "T1",
    originalRrn: "sale-rrn",
    reason: "customer request",
    originalPaymentAmount: 19.05,
    refundedToDate: 19.05,
    remainingRefundable: 0,
    ...overrides,
  };
}

function contents(data: RefundReceiptData): string {
  return buildRefundReceiptDocument(data)
    .nodes.map((node: any) =>
      node.type === "two_column"
        ? `${node.left} ${node.right}`
        : node.content,
    )
    .filter(Boolean)
    .join("\n");
}

describe("buildRefundReceiptDocument", () => {
  it("renders the hybrid card layout for an itemized (full/per-item) refund", () => {
    const text = contents(baseData());

    // Identity / meta
    expect(text).toContain("*** REFUND RECEIPT ***");
    expect(text).toContain("Date: 08/18/2026 02:45 PM");
    expect(text).toContain("Receipt #: RS1-000195");
    expect(text).toContain("Original Receipt #: 000187");
    expect(text).toContain("Cashier: Admin POS: 01");

    // Items print as POSITIVE amounts
    expect(text).toContain("REFUNDED ITEMS");
    expect(text).toContain("1 Buffalo Chicken Wrap $14.99");
    expect(text).toContain("1 Fountain Drink $2.50");

    // Totals
    expect(text).toContain("Subtotal $17.49");
    expect(text).toContain("Tax $1.56");
    expect(text).toContain("REFUND TOTAL $19.05");

    // Refunded-to proof
    expect(text).toContain("REFUNDED TO: VISA ****1234");
    expect(text).toContain("Approval Code: 089123");
    expect(text).toContain("Refund RRN: 623000499605");
    expect(text).toContain("Batch: 072   Invoice: 1909");
    expect(text).toContain("Transaction ID: RS1-000195");
    expect(text).toContain("Refund Amount $19.05");

    // Footer + barcode
    expect(text).toContain("THANK YOU!");
    expect(text).toContain("Refunds may take 3-5 business days");

    // Customer copy hides merchant-only audit
    expect(text).not.toContain("Original RRN");
    expect(text).not.toContain("Remaining Refundable");
    expect(text).not.toContain("Customer Signature");
  });

  it("renders a single custom line for a custom-amount refund (no items)", () => {
    const text = contents(
      baseData({
        items: [],
        customAmountLabel: "Custom partial refund",
        subtotal: 4.63,
        tax: 0.37,
        totalRefunded: 5.0,
      }),
    );

    expect(text).toContain("Custom partial refund $5.00");
    expect(text).toContain("Subtotal $4.63");
    expect(text).toContain("Tax $0.37");
    expect(text).toContain("REFUND TOTAL $5.00");
    expect(text).not.toContain("Buffalo Chicken Wrap");
  });

  it("suppresses card-only proof and statement timing for cash refunds", () => {
    const text = contents(
      baseData({
        paymentMethod: "CASH",
        cardBrand: null,
        cardLast4: null,
        approvalCode: null,
        refundRrn: null,
        batchNumber: null,
        invoiceNumber: null,
      }),
    );

    expect(text).toContain("REFUNDED TO: CASH");
    expect(text).toContain("Transaction ID: RS1-000195");
    expect(text).toContain("Refund Amount $19.05");
    expect(text).not.toContain("Approval Code");
    expect(text).not.toContain("Refund RRN");
    expect(text).not.toContain("Batch:");
    expect(text).not.toContain("Refunds may take 3-5 business days");
  });

  it("marks reprints and prints merchant-only audit on the merchant copy", () => {
    const text = contents(
      baseData({ isReprint: true, copyLabel: "Merchant Copy" }),
    );

    expect(text).toContain("*** REPRINT ***");
    expect(text).toContain("Merchant Copy");
    expect(text).toContain("Original RRN: sale-rrn");
    expect(text).toContain("Reason: customer request");
    expect(text).toContain("Remaining Refundable $0.00");
    expect(text).toContain("Customer Signature:");
  });

  it("omits Subtotal/Tax rows when no breakdown is available", () => {
    const text = contents(baseData({ subtotal: null, tax: null }));

    expect(text).not.toContain("Subtotal");
    expect(text).not.toContain("Tax ");
    expect(text).toContain("REFUND TOTAL $19.05");
  });
});
