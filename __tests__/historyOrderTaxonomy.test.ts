import {
  channelPredicate,
  classifyChannel,
  classifyProvider,
  matchesPredicate,
  normalizeOrderTypeToken,
  predicateToFilterString,
  providerPredicate,
  statusPredicate,
  PROVIDER_ORDER,
  type ChannelTab,
  type ProviderKey,
  type TaxonomyRow,
} from "@/services/historyOrderTaxonomy";

/**
 * A corpus of rows shaped like the ones that actually break this screen: every
 * casing and separator `delivery_platform` has been seen in, both online source
 * spellings, the `order_type` members the tabs don't name, and NULLs in the two
 * nullable columns.
 */
const CORPUS: TaxonomyRow[] = [
  // POS, every fulfilment type
  { order_type: "dine_in", order_source: "pos", delivery_platform: null },
  { order_type: "qr_dine_in", order_source: "pos", delivery_platform: null },
  { order_type: "takeout", order_source: "pos", delivery_platform: null },
  { order_type: "delivery", order_source: "pos", delivery_platform: null },
  { order_type: "catering", order_source: "pos", delivery_platform: null },
  { order_type: "online", order_source: "pos", delivery_platform: null },
  { order_type: "takeout", order_source: "in_store", delivery_platform: null },
  { order_type: "takeout", order_source: "phone", delivery_platform: null },
  // NULLs in both nullable columns
  { order_type: "takeout", order_source: null, delivery_platform: null },
  { order_type: null, order_source: null, delivery_platform: null },
  // Online, marketplaces — every spelling the ingestion paths write
  ...[
    "doordash",
    "DOORDASH",
    "DoorDash",
    "DOOR_DASH",
    "door_dash",
    "door-dash",
    "Door Dash",
    "Doordash ",
    "ubereats",
    "UBEREATS",
    "UberEats",
    "UBER_EATS",
    "Uber Eats",
    "uber-eats",
    "grubhub",
    "GRUBHUB",
    "Grubhub",
    "GrubHub",
    "GRUB_HUB",
    "grub-hub",
  ].map((delivery_platform) => ({
    order_type: "delivery",
    order_source: "orderout",
    delivery_platform,
  })),
  // Online, first-party
  {
    order_type: "takeout",
    order_source: "online_store",
    delivery_platform: null,
  },
  {
    order_type: "takeout",
    order_source: "online_store",
    delivery_platform: "website",
  },
  {
    order_type: "takeout",
    order_source: "online_store",
    delivery_platform: "WEBSITE",
  },
  { order_type: "takeout", order_source: "online", delivery_platform: "kiosk" },
  {
    order_type: "takeout",
    order_source: "online_store",
    delivery_platform: "online_store",
  },
  // Online, unknown integrations and unset platforms
  { order_type: "delivery", order_source: "orderout", delivery_platform: null },
  {
    order_type: "delivery",
    order_source: "orderout",
    delivery_platform: "postmates",
  },
  { order_type: "takeout", order_source: "online", delivery_platform: null },
];

const NON_ALL_CHANNELS: Exclude<ChannelTab, "all">[] = [
  "online",
  "dine_in",
  "takeout",
  "delivery",
];

describe("channel buckets", () => {
  it("puts every row in exactly one tab", () => {
    // The invariant behind "tab counts sum to All". When Takeaway was
    // `order_type.in.(takeout)`, a `catering` or `online`-typed row was counted
    // under Takeaway but returned by no tab's query.
    for (const row of CORPUS) {
      const hits = NON_ALL_CHANNELS.filter((channel) =>
        matchesPredicate(channelPredicate(channel)!, row),
      );
      expect({ row, hits }).toEqual({ row, hits: [classifyChannel(row)] });
    }
  });

  it("keeps a NULL order_source on a tab instead of dropping it", () => {
    // `NOT (source ILIKE …)` is NULL for a NULL source, which excluded the row
    // from every non-online tab while All still counted it.
    expect(
      classifyChannel({
        order_type: "takeout",
        order_source: null,
        delivery_platform: null,
      }),
    ).toBe("takeout");
  });

  it("routes an order_type the tabs don't name into Takeaway", () => {
    for (const order_type of ["catering", "online", null]) {
      expect(
        classifyChannel({ order_type, order_source: "pos" }),
      ).toBe("takeout");
    }
  });

  it("puts an online order on Online regardless of fulfilment type", () => {
    expect(
      classifyChannel({ order_type: "delivery", order_source: "orderout" }),
    ).toBe("online");
  });

  it("applies no predicate for All", () => {
    expect(channelPredicate("all")).toBeNull();
  });
});

describe("provider buckets", () => {
  const onlineRows = CORPUS.filter(
    (row) => classifyChannel(row) === "online",
  );

  it("puts every online row in exactly one provider bucket", () => {
    // This is what makes the chip counts sum to the Online tab count. The old
    // server-side House ("not a marketplace") swallowed Other as well, and
    // Other applied no predicate at all — so House and Other each returned far
    // more rows than their chip claimed.
    for (const row of onlineRows) {
      const hits = PROVIDER_ORDER.filter((provider) =>
        matchesPredicate(providerPredicate(provider)!, row),
      );
      expect({ row, hits }).toEqual({ row, hits: [classifyProvider(row)] });
    }
  });

  it("matches a marketplace in every casing and separator it is written in", () => {
    // The reported bug: the chip counted these (normalizing casing) while the
    // query matched a hardcoded list of literal spellings, so "DoorDash (3)"
    // returned nothing.
    const expected: Record<string, ProviderKey> = {
      doordash: "doordash",
      DOORDASH: "doordash",
      DoorDash: "doordash",
      DOOR_DASH: "doordash",
      "door-dash": "doordash",
      "Door Dash": "doordash",
      "Doordash ": "doordash",
      UberEats: "ubereats",
      UBER_EATS: "ubereats",
      "Uber Eats": "ubereats",
      "uber-eats": "ubereats",
      GrubHub: "grubhub",
      GRUB_HUB: "grubhub",
      "grub-hub": "grubhub",
    };
    for (const [delivery_platform, provider] of Object.entries(expected)) {
      expect(
        classifyProvider({ order_source: "orderout", delivery_platform }),
      ).toBe(provider);
    }
  });

  it("only calls an order House when it really is the merchant's own", () => {
    expect(
      classifyProvider({
        order_source: "online_store",
        delivery_platform: null,
      }),
    ).toBe("house");
    expect(
      classifyProvider({
        order_source: "online_store",
        delivery_platform: "WEBSITE",
      }),
    ).toBe("house");
    // An aggregator order with no platform recorded is NOT the house channel.
    expect(
      classifyProvider({ order_source: "orderout", delivery_platform: null }),
    ).toBe("other");
    expect(
      classifyProvider({
        order_source: "orderout",
        delivery_platform: "postmates",
      }),
    ).toBe("other");
  });

  it("returns null for rows that aren't online", () => {
    expect(
      classifyProvider({ order_source: "pos", delivery_platform: "doordash" }),
    ).toBeNull();
  });
});

describe("status buckets", () => {
  const paid = { status: "completed", payment_status: "paid" };
  const unpaid = { status: "pending", payment_status: "pending" };
  const partial = { status: "pending", payment_status: "partial" };
  const voided = { status: "void", payment_status: "pending" };
  const refunded = { status: "refunded", payment_status: "refunded" };
  const partRefund = { status: "completed", payment_status: "partially_refunded" };

  const matches = (row: any, status: any) =>
    matchesPredicate(statusPredicate(status)!, row);

  it("keeps voided orders out of paid and unpaid", () => {
    expect(matches(voided, "voided")).toBe(true);
    expect(matches(voided, "paid")).toBe(false);
    expect(matches(voided, "unpaid")).toBe(false);
  });

  it("treats a partially paid order as unpaid — money is still owed", () => {
    expect(matches(partial, "unpaid")).toBe(true);
    expect(matches(partial, "paid")).toBe(false);
  });

  it("keeps a fully refunded order out of Unpaid", () => {
    expect(matches(refunded, "refunded")).toBe(true);
    expect(matches(refunded, "unpaid")).toBe(false);
  });

  it("counts a partial refund as paid and as refunded", () => {
    expect(matches(partRefund, "paid")).toBe(true);
    expect(matches(partRefund, "refunded")).toBe(true);
    expect(matches(partRefund, "unpaid")).toBe(false);
  });

  it("passes everything through on All", () => {
    expect(statusPredicate("all")).toBeNull();
    for (const row of [paid, unpaid, voided, refunded]) {
      expect(row).toBeDefined();
    }
  });
});

describe("PostgREST serialization", () => {
  it("writes marketplace identity as a wildcard match, not a list of spellings", () => {
    expect(predicateToFilterString(providerPredicate("doordash")!)).toBe(
      "delivery_platform.ilike.%door%dash%",
    );
  });

  it("spells out the NULL arm rather than negating a group", () => {
    // `NOT (a OR b)` is NULL for a NULL column in SQL but `true` in JS — the
    // one construct that would let the count and the query disagree again.
    const takeout = predicateToFilterString(channelPredicate("takeout")!);
    expect(takeout).toContain("order_source.is.null");
    expect(takeout).toContain("order_source.not.ilike.orderout");
    expect(takeout).toContain("order_type.neq.dine_in");
    expect(takeout).not.toMatch(/not\.(and|or)\(/);
  });

  it("never emits a NOT over a compound group, on any bucket", () => {
    const every = [
      ...NON_ALL_CHANNELS.map((c) => channelPredicate(c)!),
      ...PROVIDER_ORDER.map((p) => providerPredicate(p)!),
      ...(["paid", "unpaid", "refunded", "voided"] as const).map(
        (s) => statusPredicate(s)!,
      ),
    ];
    for (const predicate of every) {
      expect(predicateToFilterString(predicate)).not.toMatch(/not\.(and|or)\(/);
    }
  });

  it("flattens a root OR, since or() is already a group", () => {
    expect(predicateToFilterString(providerPredicate("house")!)).toMatch(
      /^and\(.*\),and\(.*\)$/,
    );
  });
});

describe("normalizeOrderTypeToken", () => {
  it("collapses legacy display casing onto the enum token", () => {
    expect(normalizeOrderTypeToken("Dine In")).toBe("dine_in");
    expect(normalizeOrderTypeToken("Takeaway")).toBe("takeout");
    expect(normalizeOrderTypeToken("To Go")).toBe("takeout");
    expect(normalizeOrderTypeToken("Delivery")).toBe("delivery");
    expect(normalizeOrderTypeToken("qr_dine_in")).toBe("qr_dine_in");
  });

  it("passes an unknown type through so it lands in the Takeaway catch-all", () => {
    expect(normalizeOrderTypeToken("catering")).toBe("catering");
    expect(
      classifyChannel({
        order_type: normalizeOrderTypeToken("Catering"),
        order_source: "pos",
      }),
    ).toBe("takeout");
  });

  it("treats blank and null as absent", () => {
    expect(normalizeOrderTypeToken(null)).toBeNull();
    expect(normalizeOrderTypeToken("  ")).toBeNull();
  });
});
