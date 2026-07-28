import { resolveFetchedOrderPlatform } from "@/lib/fetchedOrderPlatform";
import { getProviderKey } from "@/lib/previousOrdersFilters";
import type { OrderProfile } from "@/lib/types";

/**
 * Modelled on two production rows (ORD-20260722-0001 / -0002): a Grubhub and a
 * DoorDash order placed through the web storefront. The marketplace lives on
 * `orders.delivery_platform`; the `online_orders` join only records HOW the
 * order was ingested (`provider: 'website'`, `delivery_company: null`).
 */
const WEBSITE_JOIN = [
  {
    order_id: "b235bf9a-7486-434e-8d62-d7435864d348",
    provider: "website",
    delivery_company: null,
  },
];

/** End-to-end check: DB columns → transform → the chip a row renders. */
function providerFor(
  columns: { order_source?: string | null; delivery_platform?: string | null },
  joinRows: typeof WEBSITE_JOIN | [] = WEBSITE_JOIN,
) {
  const { isOnlineOrder, deliveryPlatform } = resolveFetchedOrderPlatform(
    columns,
    joinRows,
  );
  return getProviderKey({
    _isOnlineOrder: isOnlineOrder,
    delivery_platform: deliveryPlatform,
    order_source: columns.order_source,
  } as OrderProfile);
}

describe("resolveFetchedOrderPlatform", () => {
  it("keeps the marketplace from orders.delivery_platform when the join only knows the ingestion channel", () => {
    const result = resolveFetchedOrderPlatform(
      { order_source: "online_store", delivery_platform: "doordash" },
      WEBSITE_JOIN,
    );
    expect(result.isOnlineOrder).toBe(true);
    // Was 'website' before the precedence fix, which rendered as House.
    expect(result.deliveryPlatform).toBe("doordash");
  });

  it("still prefers delivery_company when the join names the fulfilling marketplace", () => {
    const result = resolveFetchedOrderPlatform(
      { order_source: "orderout", delivery_platform: "doordash" },
      [{ order_id: "x", provider: "orderout", delivery_company: "UBER_EATS" }],
    );
    expect(result.deliveryPlatform).toBe("UBER_EATS");
  });

  it("falls back to the join's provider when the order carries no platform", () => {
    const result = resolveFetchedOrderPlatform(
      { order_source: "online_store", delivery_platform: null },
      WEBSITE_JOIN,
    );
    expect(result.deliveryPlatform).toBe("website");
  });

  it("classifies a website order with no online_orders join row as online", () => {
    const result = resolveFetchedOrderPlatform(
      { order_source: "online_store", delivery_platform: "doordash" },
      [],
    );
    expect(result.isOnlineOrder).toBe(true);
    expect(result.deliveryPlatform).toBe("doordash");
  });

  it("leaves POS orders alone", () => {
    const result = resolveFetchedOrderPlatform(
      { order_source: "pos", delivery_platform: null },
      [],
    );
    expect(result.isOnlineOrder).toBe(false);
    expect(result.deliveryPlatform).toBeNull();
  });
});

describe("row chip matches the provider filter chip", () => {
  it("renders DoorDash, not House, for the storefront-placed DoorDash order", () => {
    expect(
      providerFor({
        order_source: "online_store",
        delivery_platform: "doordash",
      }),
    ).toBe("doordash");
  });

  it("renders Grubhub, not House, for the storefront-placed Grubhub order", () => {
    expect(
      providerFor({
        order_source: "online_store",
        delivery_platform: "grubhub",
      }),
    ).toBe("grubhub");
  });

  it("still says House for a genuine first-party order with no platform", () => {
    expect(
      providerFor({ order_source: "online_store", delivery_platform: null }, []),
    ).toBe("house");
  });
});
