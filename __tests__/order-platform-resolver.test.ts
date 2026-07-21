import {
  normalizeOnlineOrderProvider,
  resolveOrderPlatformLogo,
} from "@/lib/orderPlatformResolver";

describe("order platform resolver", () => {
  it("normalizes marketplace casing and separators", () => {
    expect(normalizeOnlineOrderProvider("GrubHub")).toBe("grubhub");
    expect(normalizeOnlineOrderProvider("UBEREATS")).toBe("ubereats");
    expect(normalizeOnlineOrderProvider("uber_eats")).toBe("ubereats");
    expect(normalizeOnlineOrderProvider("Door Dash")).toBe("doordash");
  });

  it("prefers delivery_platform before metadata and online order fields", () => {
    expect(
      resolveOrderPlatformLogo({
        deliveryPlatform: "doordash",
        metadataDeliveryCompany: "grubhub",
        onlineOrderDeliveryCompany: "UBEREATS",
        onlineOrderProvider: "website",
        orderSource: "online",
      }),
    ).toMatchObject({
      provider: "doordash",
      kind: "marketplace",
      source: "delivery_platform",
    });
  });

  it("uses metadata delivery company when delivery_platform is missing", () => {
    expect(
      resolveOrderPlatformLogo({
        metadataDeliveryCompany: "UBEREATS",
        orderSource: "online",
      }),
    ).toMatchObject({
      provider: "ubereats",
      kind: "marketplace",
      source: "metadata_delivery_company",
    });
  });

  it("renders first-party providers as first-party badges", () => {
    expect(
      resolveOrderPlatformLogo({
        onlineOrderProvider: "website",
        orderSource: "online",
      }),
    ).toMatchObject({
      provider: "website",
      kind: "first_party",
      label: "Website",
    });
  });

  it("renders unresolved online orders as generic online", () => {
    expect(resolveOrderPlatformLogo({ orderSource: "online" })).toMatchObject({
      provider: "other",
      kind: "generic_online",
      label: "Online",
    });
  });

  it("renders POS orders as no logo", () => {
    expect(resolveOrderPlatformLogo({ orderSource: "pos" })).toMatchObject({
      provider: null,
      kind: "none",
      label: null,
    });
  });
});
