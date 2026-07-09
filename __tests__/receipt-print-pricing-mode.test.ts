import { buildReceiptCommands } from "@/services/printing/templates/ReceiptTemplate";
import { buildReceiptDocument } from "@/services/printing/templates/ReceiptDocumentTemplate";
import { ReceiptTemplateData } from "@/types/printer";

function makeReceiptData(
  overrides: Partial<ReceiptTemplateData> = {},
): ReceiptTemplateData {
  return {
    storeName: "Saucy",
    storeAddress: "1144 Hylan Blvd",
    storePhone: "(347) 659-1866",
    orderNumber: "#S5-0001",
    orderDate: "06/10/2026",
    orderTime: "11:32 AM",
    orderType: "Dine In",
    items: [
      {
        name: "Cheesesteak Sandwich",
        quantity: 1,
        price: 20.99,
        cashPrice: 20.5,
        isVoided: false,
        modifiers: [],
      },
    ],
    subtotal: 41.69,
    tax: 4.09,
    discount: 0,
    tip: 0,
    total: 51.23,
    pricingMode: "dual",
    cashSubtotal: 40.52,
    cashTax: 3.81,
    cashTotal: 50.06,
    payments: [{ method: "Cash", amount: 50.06 }],
    amountPaid: 50.06,
    amountDue: 0,
    footerMessage: "Thank you",
    maxCharsPerLine: 32,
    ...overrides,
  };
}

function extractDocumentLabels(data: ReceiptTemplateData): string[] {
  return buildReceiptDocument(data).nodes
    .filter((node) => node.type === "two_column")
    .map((node) => node.left);
}

function extractEscPosText(data: ReceiptTemplateData): string {
  return Buffer.from(buildReceiptCommands(data)).toString("latin1");
}

describe("printed receipt pricing mode", () => {
  it("shows only TOTAL (CASH) for cash-priced receipts", () => {
    const data = makeReceiptData({
      pricingMode: "cash",
      total: 50.06,
      cashTotal: undefined,
      cashSubtotal: undefined,
      cashTax: undefined,
      payments: [{ method: "Cash", amount: 50.06 }],
      amountPaid: 50.06,
    });

    const documentLabels = extractDocumentLabels(data);
    expect(documentLabels).toContain("TOTAL (CASH)");
    expect(documentLabels).not.toContain(" Card Total");
    expect(documentLabels).not.toContain(" Cash Total");

    const escPosText = extractEscPosText(data);
    expect(escPosText).toContain("TOTAL (CASH)");
    expect(escPosText).not.toContain("Card Total");
    expect(escPosText).not.toContain("Cash Total");
  });

  it("shows only TOTAL (CARD) for card-priced receipts", () => {
    const data = makeReceiptData({
      pricingMode: "card",
      payments: [{ method: "Card", amount: 51.23, last4: "4242" }],
      amountPaid: 51.23,
    });

    const documentLabels = extractDocumentLabels(data);
    expect(documentLabels).toContain("TOTAL (CARD)");
    expect(documentLabels).not.toContain(" Card Total");
    expect(documentLabels).not.toContain(" Cash Total");

    const escPosText = extractEscPosText(data);
    expect(escPosText).toContain("TOTAL (CARD)");
    expect(escPosText).not.toContain("Card Total");
    expect(escPosText).not.toContain("Cash Total");
  });
});
