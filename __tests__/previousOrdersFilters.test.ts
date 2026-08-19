import {
  buildProviderRoster,
  buildProviderRosterFromSummaries,
  compareOrders,
  countChannelsFromSummaries,
  countProvidersFromSummaries,
  type OrderSummaryLike,
  getChannelTab,
  getProviderKey,
  matchesSearch,
  matchesStatus,
  normalizeOrderType,
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

describe("normalizeOrderType", () => {
  it("collapses backend enum and legacy display casing onto one key", () => {
    expect(normalizeOrderType("dine_in")).toBe("dine_in");
    expect(normalizeOrderType("Dine In")).toBe("dine_in");
    expect(normalizeOrderType("Takeaway")).toBe("takeout");
    expect(normalizeOrderType("takeout")).toBe("takeout");
    expect(normalizeOrderType("Delivery")).toBe("delivery");
  });

  it("treats the QR table-ordering type as dine-in, not takeaway", () => {
    expect(normalizeOrderType("qr_dine_in")).toBe("dine_in");
  });
});

describe("getChannelTab", () => {
  it("puts online orders on the Online tab regardless of fulfilment type", () => {
    expect(
      getChannelTab(order({ _isOnlineOrder: true, order_type: "delivery" })),
    ).toBe("online");
  });

  it("partitions non-online orders by type so tab counts sum to All", () => {
    const orders = [
      order({ _isOnlineOrder: true, order_type: "delivery" }),
      order({ order_type: "Dine In" }),
      order({ order_type: "takeout" }),
      order({ order_type: "delivery" }),
    ];
    const tabs = orders.map(getChannelTab);
    expect(tabs).toEqual(["online", "dine_in", "takeout", "delivery"]);
  });
});

describe("getProviderKey", () => {
  it("resolves provider identity through the shared casing-normalized resolver", () => {
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

  it("requires an explicit first-party platform before showing House", () => {
    expect(
      getProviderKey(
        order({ _isOnlineOrder: true, order_source: "online_store" }),
      ),
    ).toBeNull();
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

  it("does not invent a provider chip for a missing integration value", () => {
    expect(
      getProviderKey(
        order({
          _isOnlineOrder: true,
          order_source: "orderout",
          delivery_platform: null,
        }),
      ),
    ).toBeNull();
    expect(
      getProviderKey(
        order({
          _isOnlineOrder: true,
          order_source: "orderout",
          delivery_platform: "",
        }),
      ),
    ).toBeNull();
  });

  it("returns null for in-store orders", () => {
    expect(getProviderKey(order({ order_source: "pos" }))).toBeNull();
  });
});

describe("buildProviderRoster", () => {
  it("lists observed providers in canonical order and drops the rest", () => {
    const roster = buildProviderRoster([
      order({ _isOnlineOrder: true, delivery_platform: "grubhub" }),
      order({ _isOnlineOrder: true, delivery_platform: "DOORDASH" }),
      order({ order_source: "pos" }),
    ]);
    expect(roster).toEqual(["doordash", "grubhub"]);
  });

  it("is empty for a merchant with no online orders", () => {
    expect(buildProviderRoster([order({ order_source: "pos" })])).toEqual([]);
  });
});

describe("matchesStatus", () => {
  it("treats voided orders as their own bucket, not unpaid", () => {
    const voided = order({ order_status: "void", paid_status: "Unpaid" });
    expect(matchesStatus(voided, "voided")).toBe(true);
    expect(matchesStatus(voided, "unpaid")).toBe(false);
    expect(matchesStatus(voided, "paid")).toBe(false);
  });

  it("matches refunds from either the order status or a payment reversal", () => {
    expect(matchesStatus(order({ order_status: "refunded" }), "refunded")).toBe(
      true,
    );
    expect(
      matchesStatus(
        order({ payments: [{ refundedAmount: 5 }] as any }),
        "refunded",
      ),
    ).toBe(true);
  });

  it("passes everything through on All", () => {
    expect(matchesStatus(order({ order_status: "void" }), "all")).toBe(true);
  });
});

describe("matchesSearch", () => {
  const target = order({
    display_number: "#10424",
    customer_name: "Kenji Watanabe",
    customer_phone: "(650) 555-0198",
    _isOnlineOrder: true,
    delivery_platform: "DOORDASH",
  });

  it("matches order number, customer and provider name", () => {
    expect(matchesSearch(target, "10424")).toBe(true);
    expect(matchesSearch(target, "kenji")).toBe(true);
    expect(matchesSearch(target, "doordash")).toBe(true);
    expect(matchesSearch(target, "grubhub")).toBe(false);
  });

  it("matches a formatted phone from a digits-only query", () => {
    expect(matchesSearch(target, "6505550198")).toBe(true);
  });

  it("matches 'ubereats' typed without the space", () => {
    const ue = order({ _isOnlineOrder: true, delivery_platform: "UBER_EATS" });
    expect(matchesSearch(ue, "ubereats")).toBe(true);
  });
});

describe("compareOrders", () => {
  const early = order({
    opened_at: "2026-07-28T10:00:00.000Z",
    total_amount: 5,
  });
  const late = order({
    opened_at: "2026-07-28T18:00:00.000Z",
    total_amount: 50,
  });

  it("defaults to newest first", () => {
    expect(
      [early, late].sort((a, b) => compareOrders(a, b, "date_desc"))[0],
    ).toBe(late);
  });

  it("sorts by amount in both directions", () => {
    expect(
      [early, late].sort((a, b) => compareOrders(a, b, "amount_desc"))[0],
    ).toBe(late);
    expect(
      [late, early].sort((a, b) => compareOrders(a, b, "amount_asc"))[0],
    ).toBe(early);
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
  // outside the first 30-row page. Counts must come from the window, not the
  // loaded page.
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

  it("buckets providers across the window", () => {
    expect(countProvidersFromSummaries(window, "all")).toEqual({
      doordash: 4,
    });
  });

  it("builds the chip roster from the window", () => {
    expect(buildProviderRosterFromSummaries(window)).toEqual(["doordash"]);
  });

  it("counts unknown providers as Other but omits missing providers", () => {
    const rows = [
      summary({
        order_source: "orderout",
        delivery_platform: "mystery_market",
      }),
      summary({ order_source: "orderout", delivery_platform: null }),
      summary({ order_source: "orderout", delivery_platform: "" }),
    ];

    expect(countProvidersFromSummaries(rows, "all")).toEqual({ other: 1 });
    expect(buildProviderRosterFromSummaries(rows)).toEqual(["other"]);
  });
});
