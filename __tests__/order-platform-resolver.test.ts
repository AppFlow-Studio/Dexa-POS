import {
  getOnlineOrderProviderQueryAliases,
  normalizeOnlineOrderProvider,
  resolveOrderPlatformLogo,
} from "@/lib/orderPlatformResolver";

describe("order platform resolver", () => {
  it("normalizes marketplace casing and separators", () => {
    const cases = [
      ["Ubereats", "ubereats"],
      ["Uber Eats", "ubereats"],
      ["uber_eats", "ubereats"],
      ["UBEREATS", "ubereats"],
      ["Doordash", "doordash"],
      ["DoorDash", "doordash"],
      ["Door Dash", "doordash"],
      ["Grubhub", "grubhub"],
      ["GRUB_HUB", "grubhub"],
    ] as const;

    for (const [raw, provider] of cases) {
      expect(normalizeOnlineOrderProvider(raw)).toBe(provider);
    }
  });

  it("derives query aliases from the same resolver vocabulary", () => {
    const cases = [
      ["ubereats", ["ubereats", "uber eats", "uber_eats"]],
      ["doordash", ["doordash", "door dash", "door_dash"]],
      ["grubhub", ["grubhub", "grub hub", "grub_hub"]],
    ] as const;

    for (const [provider, expectedAliases] of cases) {
      const aliases = getOnlineOrderProviderQueryAliases(provider);
      expect(aliases).toEqual(expect.arrayContaining(expectedAliases));
      for (const alias of aliases) {
        expect(normalizeOnlineOrderProvider(alias)).toBe(provider);
      }
    }
  });

  it("keeps missing values unresolved and buckets unknown values as other", () => {
    expect(normalizeOnlineOrderProvider(null)).toBeNull();
    expect(normalizeOnlineOrderProvider("")).toBeNull();
    expect(normalizeOnlineOrderProvider("mystery_market")).toBe("other");
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
