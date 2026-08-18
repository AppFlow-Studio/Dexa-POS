import {
  buildRefundReceiptDocument,
  RefundReceiptData,
} from "@/services/printing/templates/RefundReceiptDocumentTemplate";

function baseData(overrides: Partial<RefundReceiptData> = {}): RefundReceiptData {
  return {
    locationId: "loc-1",
    orderId: "order-1",
    reversalId: "reversal-1",
    storeName: "Test Store",
    refundNumber: "RS1-000001",
    orderNumber: "#S1-0007",
    orderDate: "08/18/2026, 01:00 PM",
    refundDate: "08/18/2026, 01:15 PM",
    items: [{ name: "Burger", quantity: 1, amount: 12.5 }],
    totalRefunded: 12.5,
    paymentMethod: "CARD",
    cardBrand: "VISA",
    cardLast4: "4242",
    approvalStatus: "APPROVED",
    refundRrn: "refund-rrn",
    batchNumber: "12",
    invoiceNumber: "99",
    originalRrn: "sale-rrn",
    originalPaymentAmount: 20,
    refundedToDate: 12.5,
    remainingRefundable: 7.5,
    ...overrides,
  };
}

function contents(data: RefundReceiptData): string[] {
  return buildRefundReceiptDocument(data).nodes
    .map((node: any) =>
      node.type === "two_column"
        ? `${node.left} ${node.right}`
        : node.content,
    )
    .filter(Boolean);
}

describe("buildRefundReceiptDocument", () => {
  it("renders the refund identity, negative totals, and processor proof", () => {
    const text = contents(baseData()).join("\n");

    expect(text).toContain("*** REFUND ***");
    expect(text).toContain("RS1-000001");
    expect(text).toContain("1x Burger -$12.50");
    expect(text).toContain("TOTAL REFUNDED -$12.50");
    expect(text).toContain("Refund RRN refund-rrn");
    expect(text).toContain("Original RRN sale-rrn");
  });

  it("marks reprints and suppresses card-only rows for cash", () => {
    const text = contents(
      baseData({
        paymentMethod: "CASH",
        cardBrand: null,
        cardLast4: null,
        refundRrn: null,
        batchNumber: null,
        invoiceNumber: null,
        originalRrn: null,
        isReprint: true,
      }),
    ).join("\n");

    expect(text).toContain("*** REPRINT ***");
    expect(text).not.toContain("Card ");
    expect(text).not.toContain("Credit timing depends");
    expect(text).not.toContain("Refund RRN");
  });
});
