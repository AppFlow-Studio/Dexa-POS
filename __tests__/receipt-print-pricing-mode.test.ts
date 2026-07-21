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

function extractDocumentTextLines(data: ReceiptTemplateData): string[] {
  return buildReceiptDocument(data)
    .nodes.filter((node) => node.type === "text_line")
    .map((node) => (node as { content: string }).content);
}

describe("printed receipt modifier upcharge", () => {
  const mensaf = {
    name: "Mensaf",
    quantity: 1,
    price: 170.0,
    isVoided: false,
    // Priced modifier whose per-option price didn't round-trip: name renders
    // with no inline price, and the upcharge is recovered in aggregate.
    modifiers: [{ name: "Family Size Mensaf", price: 0 }],
  };

  it("prints an aggregate Modifiers line when the upcharge is not itemized", () => {
    const data = makeReceiptData({
      pricingMode: "card",
      items: [{ ...mensaf, modifiersUpcharge: 140 }],
    });

    const textLines = extractDocumentTextLines(data);
    expect(textLines.some((l) => l.includes("Modifiers") && l.includes("140.00")))
      .toBe(true);

    const escPosText = extractEscPosText(data);
    expect(escPosText).toContain("Modifiers");
    expect(escPosText).toContain("140.00");
  });

  it("does not print an aggregate line when there is no un-itemized upcharge", () => {
    const data = makeReceiptData({
      pricingMode: "card",
      items: [
        {
          name: "Mensaf",
          quantity: 1,
          price: 170.0,
          isVoided: false,
          // Option price round-tripped intact → shows inline, no aggregate line.
          modifiers: [{ name: "Family Size Mensaf", price: 140 }],
          modifiersUpcharge: 0,
        },
      ],
    });

    const textLines = extractDocumentTextLines(data);
    expect(textLines.some((l) => l.trim().startsWith("Modifiers"))).toBe(false);
    // The itemized option price still renders.
    const escPosText = extractEscPosText(data);
    expect(escPosText).toContain("Family Size Mensaf");
    expect(escPosText).toContain("140.00");
  });
});
