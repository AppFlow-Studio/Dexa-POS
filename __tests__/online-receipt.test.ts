import { buildReceiptCommands } from "@/services/printing/templates/ReceiptTemplate";
import { buildReceiptDocument } from "@/services/printing/templates/ReceiptDocumentTemplate";
import { ReceiptTemplateData } from "@/types/printer";

function makeReceiptData(
  overrides: Partial<ReceiptTemplateData> = {},
): ReceiptTemplateData {
  return {
    storeName: "Charcoal Gardenia",
    storeAddress: "432 Manor Road, Staten Island, NY",
    storePhone: "+1 718 887 0100",
    orderNumber: "#0004",
    orderDate: "07/29/2026",
    orderTime: "12:31 PM",
    orderType: "Delivery",
    customerName: "Taylor M.",
    customerPhone: "3127666835",
    serverName: "Unknown",
    items: [
      {
        name: "Shakshouka",
        quantity: 1,
        price: 18.99,
        isVoided: false,
        modifiers: [],
      },
    ],
    subtotal: 22.97,
    tax: 2.04,
    discount: 0,
    tip: 0,
    total: 25.01,
    pricingMode: "card",
    payments: [{ method: "Card", amount: 25.01 }],
    amountPaid: 25.01,
    amountDue: 0,
    maxCharsPerLine: 32,
    printDate: "07/29/2026",
    printTime: "9:07 PM",
    ...overrides,
  };
}

const ONLINE: Partial<ReceiptTemplateData> = {
  isOnlineOrder: true,
  onlinePlatformLabel: "Uber Eats",
  platformShortCode: "C424D",
};

function textLines(data: ReceiptTemplateData): string[] {
  return buildReceiptDocument(data)
    .nodes.filter((n) => n.type === "text_line")
    .map((n) => (n as { content: string }).content);
}

function twoColLabels(data: ReceiptTemplateData): string[] {
  return buildReceiptDocument(data)
    .nodes.filter((n) => n.type === "two_column")
    .map((n) => (n as { left: string }).left);
}

function escPosText(data: ReceiptTemplateData): string {
  return Buffer.from(buildReceiptCommands(data)).toString("latin1");
}

describe("online-order receipt (IR / buildReceiptDocument)", () => {
  it("headlines the platform, customer, and short code", () => {
    const lines = textLines(makeReceiptData(ONLINE));
    expect(lines).toContain("UBER EATS");
    expect(lines).toContain("Taylor M.");
    expect(lines).toContain("Code: C424D");
    // The big Dexa order number is replaced by the bag-label header.
    expect(lines).not.toContain("#0004");
  });

  it("suppresses the tip write-in line (platform already collected)", () => {
    const labels = twoColLabels(makeReceiptData(ONLINE));
    expect(labels).not.toContain("Tip:");
    expect(labels).not.toContain("Total w/ Tip:");
  });

  it("trims metadata to Order Date + Phone", () => {
    const labels = twoColLabels(makeReceiptData(ONLINE));
    expect(labels).toContain("Order Date");
    expect(labels).toContain("Phone");
    expect(labels).not.toContain("Assignee");
    expect(labels).not.toContain("Type");
    expect(labels).not.toContain("Customer");
    expect(labels).not.toContain("Print Date");
  });

  it("leaves in-house orders unchanged (tip write-in + full metadata)", () => {
    const labels = twoColLabels(makeReceiptData({ isOnlineOrder: false }));
    expect(labels).toContain("Tip:");
    expect(labels).toContain("Total w/ Tip:");
    expect(labels).toContain("Assignee");
    expect(labels).toContain("Print Date");
    expect(textLines(makeReceiptData({ isOnlineOrder: false }))).toContain(
      "#0004",
    );
  });
});

describe("online-order receipt (ESC/POS / buildReceiptCommands)", () => {
  it("prints the bag-label header and no tip write-in", () => {
    const text = escPosText(makeReceiptData(ONLINE));
    expect(text).toContain("UBER EATS");
    expect(text).toContain("Code: C424D");
    expect(text).not.toContain("Total w/ Tip:");
  });

  it("keeps the tip write-in for in-house orders", () => {
    const text = escPosText(makeReceiptData({ isOnlineOrder: false }));
    expect(text).toContain("Total w/ Tip:");
  });
});
