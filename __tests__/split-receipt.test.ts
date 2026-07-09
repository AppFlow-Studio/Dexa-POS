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
        isVoided: false,
        modifiers: [],
      },
    ],
    subtotal: 20.99,
    tax: 2.05,
    discount: 0,
    tip: 0,
    total: 23.04,
    pricingMode: "card",
    payments: [{ method: "Card", amount: 23.04, last4: "4242" }],
    amountPaid: 23.04,
    footerMessage: "Thank you",
    maxCharsPerLine: 32,
    ...overrides,
  };
}

// Collect every printable text fragment from the document IR (text_line +
// both columns of two_column rows).
function extractDocumentText(data: ReceiptTemplateData): string {
  return buildReceiptDocument(data)
    .nodes.map((node) => {
      if (node.type === "text_line") return node.content;
      if (node.type === "two_column") return `${node.left} ${node.right}`;
      return "";
    })
    .join("\n");
}

function extractEscPosText(data: ReceiptTemplateData): string {
  return Buffer.from(buildReceiptCommands(data)).toString("latin1");
}

describe("split-payment receipt header", () => {
  it("renders the split label + payer name on per-portion receipts", () => {
    const data = makeReceiptData({
      splitLabel: "Split 2 of 3",
      splitPayerName: "Alex",
    });

    const docText = extractDocumentText(data);
    expect(docText).toContain("Split 2 of 3");
    expect(docText).toContain("Alex");

    const escPosText = extractEscPosText(data);
    expect(escPosText).toContain("Split 2 of 3");
    expect(escPosText).toContain("Alex");
  });

  it("shows the partial-payment note for even/custom splits", () => {
    const data = makeReceiptData({
      splitLabel: "Split 1 of 4",
      isPartialSplitReceipt: true,
    });

    const docText = extractDocumentText(data);
    expect(docText).toContain("Split 1 of 4");
    expect(docText).toContain("Partial payment - full check below");

    const escPosText = extractEscPosText(data);
    expect(escPosText).toContain("Partial payment - full check below");
  });

  it("omits the partial note for by-item splits", () => {
    const data = makeReceiptData({
      splitLabel: "Split 1 of 2",
      isPartialSplitReceipt: false,
    });

    const docText = extractDocumentText(data);
    expect(docText).toContain("Split 1 of 2");
    expect(docText).not.toContain("Partial payment");
  });

  it("renders no split header on a normal (combined) receipt", () => {
    const data = makeReceiptData();

    const docText = extractDocumentText(data);
    expect(docText).not.toContain("Split ");
    expect(docText).not.toContain("Partial payment");

    const escPosText = extractEscPosText(data);
    expect(escPosText).not.toContain("Partial payment");
  });
});
