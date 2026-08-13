import {
  buildProviderRosterFromSummaries,
  countChannelsFromSummaries,
  countProvidersFromSummaries,
  getProviderKey,
  type OrderSummaryLike,
} from "@/lib/previousOrdersFilters";
import type { OrderProfile } from "@/lib/types";

function order(overrides: Partial<OrderProfile>): OrderProfile {
  return {
    id: "o1",
    order_status: "completed",
    check_status: "Closed",
    paid_status: "Paid",
    items: [],
    opened_at: "2026-07-28T12:00:00.000Z",
    amount_due: 0,
    total_amount: 10,
    ...overrides,
  } as OrderProfile;
}

describe("getProviderKey", () => {
  it("resolves a marketplace through the same patterns the query uses", () => {
    expect(
      getProviderKey(
        order({ _isOnlineOrder: true, delivery_platform: "DOOR_DASH" }),
      ),
    ).toBe("doordash");
    expect(
      getProviderKey(
        order({ _isOnlineOrder: true, delivery_platform: "Uber Eats" }),
      ),
    ).toBe("ubereats");
    expect(
      getProviderKey(
        order({ _isOnlineOrder: true, delivery_platform: "grubhub" }),
      ),
    ).toBe("grubhub");
  });

  it("maps first-party online channels to House", () => {
    expect(
      getProviderKey(
        order({ _isOnlineOrder: true, order_source: "online_store" }),
      ),
    ).toBe("house");
    expect(
      getProviderKey(
        order({ _isOnlineOrder: true, delivery_platform: "website" }),
      ),
    ).toBe("house");
  });

  it("buckets an unrecognized integration as Other rather than hiding it", () => {
    expect(
      getProviderKey(
        order({ _isOnlineOrder: true, delivery_platform: "postmates" }),
      ),
    ).toBe("other");
  });

  it("still names the provider when only the online_orders join says it's online", () => {
    // `_isOnlineOrder` is `order_source OR join row`; no SQL predicate over
    // `orders` can see the join, so such a row sits on Takeaway — but the badge
    // must still identify it rather than going blank.
    expect(
      getProviderKey(
        order({
          _isOnlineOrder: true,
          order_source: "pos",
          delivery_platform: "doordash",
        }),
      ),
    ).toBe("doordash");
  });

  it("returns null for in-store orders", () => {
    expect(getProviderKey(order({ order_source: "pos" }))).toBeNull();
  });
});

describe("window-wide counts from summaries", () => {
  function summary(o: Partial<OrderSummaryLike>): OrderSummaryLike {
    return {
      order_type: "takeout",
      order_source: "pos",
      delivery_platform: null,
      status: "completed",
      payment_status: "paid",
      ...o,
    };
  }

  // Mirrors the reported bug: a wide date window whose online orders sit
  // outside the first page. Counts must come from the window, not the page.
  const window: OrderSummaryLike[] = [
    ...Array.from({ length: 40 }, () => summary({})),
    ...Array.from({ length: 9 }, () =>
      summary({ order_source: "online_store", order_type: "qr_dine_in" }),
    ),
    ...Array.from({ length: 4 }, () =>
      summary({ order_source: "orderout", delivery_platform: "DOORDASH" }),
    ),
    summary({ order_type: "dine_in" }),
    summary({ order_type: "delivery" }),
  ];

  it("counts every online order in the window, not just the loaded page", () => {
    const counts = countChannelsFromSummaries(window, "all");
    expect(counts.online).toBe(13);
    expect(counts.all).toBe(55);
    // Tabs still partition All exactly.
    expect(
      counts.online + counts.dine_in + counts.takeout + counts.delivery,
    ).toBe(counts.all);
  });

  it("keeps the partition when order_type is one the tabs don't name", () => {
    // `order_type` also carries `online` and `catering`, and a row can have a
    // NULL order_source. Every one of them has to land in some tab, or the tab
    // counts stop summing to All and the row is reachable from no tab at all.
    const odd = [
      summary({ order_type: "catering" }),
      summary({ order_type: "online" }),
      summary({ order_source: null }),
      summary({ order_type: null as any }),
    ];
    const counts = countChannelsFromSummaries(odd, "all");
    expect(counts.all).toBe(4);
    expect(counts.takeout).toBe(4);
    expect(
      counts.online + counts.dine_in + counts.takeout + counts.delivery,
    ).toBe(counts.all);
  });

  it("respects the active status filter", () => {
    const counts = countChannelsFromSummaries(
      [
        summary({ order_source: "online_store", payment_status: "pending" }),
        summary({ order_source: "online_store", payment_status: "paid" }),
        summary({ order_source: "online_store", status: "void" }),
      ],
      "paid",
    );
    expect(counts.online).toBe(1);
    expect(counts.all).toBe(1);
  });

  it("excludes voided orders from paid and unpaid alike", () => {
    const rows = [summary({ status: "void", payment_status: "pending" })];
    expect(countChannelsFromSummaries(rows, "voided").all).toBe(1);
    expect(countChannelsFromSummaries(rows, "unpaid").all).toBe(0);
    expect(countChannelsFromSummaries(rows, "paid").all).toBe(0);
  });

  it("keeps a refunded order out of Unpaid — nothing is owed on it", () => {
    const rows = [summary({ payment_status: "refunded" })];
    expect(countChannelsFromSummaries(rows, "refunded").all).toBe(1);
    expect(countChannelsFromSummaries(rows, "unpaid").all).toBe(0);
  });

  it("counts a partial refund as both paid and refunded", () => {
    const rows = [summary({ payment_status: "partially_refunded" })];
    expect(countChannelsFromSummaries(rows, "paid").all).toBe(1);
    expect(countChannelsFromSummaries(rows, "refunded").all).toBe(1);
    expect(countChannelsFromSummaries(rows, "unpaid").all).toBe(0);
  });

  it("buckets providers across the window", () => {
    expect(countProvidersFromSummaries(window, "all")).toEqual({
      house: 9,
      doordash: 4,
    });
  });

  it("builds the chip roster from the window", () => {
    expect(buildProviderRosterFromSummaries(window)).toEqual([
      "doordash",
      "house",
    ]);
  });

  it("chip counts sum to the Online tab count", () => {
    // The invariant the merchant actually reads: "All Sources (13)" over chips
    // that add up to 13. It only holds because the five provider buckets
    // partition the online rows.
    const channels = countChannelsFromSummaries(window, "all");
    const providers = countProvidersFromSummaries(window, "all");
    const summed = Object.values(providers).reduce((a, b) => a + b, 0);
    expect(summed).toBe(channels.online);
  });
});
