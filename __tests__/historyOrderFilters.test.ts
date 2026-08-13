import {
  DEFAULT_HISTORY_FILTERS,
  EMPTY_DRAFT_EXCLUSION_OR,
  buildHistoryOrderQuery,
  historyFilterKey,
  historyPageCount,
  isDefaultHistoryFilters,
  type HistoryOrderFilters,
} from "@/services/historyOrderFilters";

/**
 * Minimal stand-in for a PostgREST query builder. Every filter method records
 * the call and returns `this`, so a test can assert exactly which predicates
 * were applied without needing a live Supabase client.
 */
function fakeQuery() {
  const calls: { method: string; args: any[] }[] = [];
  const builder: any = {};
  for (const method of [
    "eq",
    "neq",
    "in",
    "not",
    "or",
    "gte",
    "lt",
    "order",
    "range",
    "limit",
  ]) {
    builder[method] = (...args: any[]) => {
      calls.push({ method, args });
      return builder;
    };
  }
  builder.__calls = calls;
  builder.__find = (method: string) => calls.filter((c) => c.method === method);
  return builder;
}

function filters(patch: Partial<HistoryOrderFilters> = {}): HistoryOrderFilters {
  return { ...DEFAULT_HISTORY_FILTERS, ...patch };
}

describe("historyFilterKey", () => {
  it("ignores the provider unless the Online tab is active", () => {
    // Provider is only meaningful on Online, so a stale provider behind another
    // tab must not create a distinct result set (and a wasted refetch).
    const a = historyFilterKey(filters({ channel: "dine_in", provider: "doordash" }));
    const b = historyFilterKey(filters({ channel: "dine_in", provider: "all" }));
    expect(a).toBe(b);
  });

  it("distinguishes provider on the Online tab", () => {
    const a = historyFilterKey(filters({ channel: "online", provider: "doordash" }));
    const b = historyFilterKey(filters({ channel: "online", provider: "all" }));
    expect(a).not.toBe(b);
  });

  it("normalizes search whitespace and case", () => {
    expect(historyFilterKey(filters({ search: "  Kenji " }))).toBe(
      historyFilterKey(filters({ search: "kenji" })),
    );
  });

  it("changes when the sort changes, so paging resets", () => {
    expect(historyFilterKey(filters({ sort: "amount_desc" }))).not.toBe(
      historyFilterKey(filters({ sort: "date_desc" })),
    );
  });
});

describe("isDefaultHistoryFilters", () => {
  it("is true for the default set and false once anything narrows it", () => {
    expect(isDefaultHistoryFilters(filters())).toBe(true);
    expect(isDefaultHistoryFilters(filters({ status: "refunded" }))).toBe(false);
    expect(isDefaultHistoryFilters(filters({ channel: "online" }))).toBe(false);
    expect(isDefaultHistoryFilters(filters({ search: "abc" }))).toBe(false);
  });
});

describe("historyPageCount", () => {
  it("never reports zero pages, so the pager reads 'Page 1 of 1' when empty", () => {
    expect(historyPageCount(0, 50)).toBe(1);
  });

  it("rounds partial pages up", () => {
    expect(historyPageCount(50, 50)).toBe(1);
    expect(historyPageCount(51, 50)).toBe(2);
    expect(historyPageCount(312, 50)).toBe(7);
  });
});

/** Every filter expression the builder produced, joined for substring checks. */
function clausesOf(q: any): string {
  return q.__find("or").map((c: any) => c.args[0]).join(" || ");
}

describe("buildHistoryOrderQuery — channel", () => {
  it("selects online orders by order_source", () => {
    const q = fakeQuery();
    buildHistoryOrderQuery(q, filters({ channel: "online" }));
    const clauses = clausesOf(q);
    for (const source of ["online", "orderout", "online_store"]) {
      expect(clauses).toContain(`order_source.ilike.${source}`);
    }
  });

  it("excludes online sources from the non-online tabs, keeping tabs a partition", () => {
    for (const channel of ["dine_in", "takeout", "delivery"] as const) {
      const clauses = (() => {
        const q = fakeQuery();
        buildHistoryOrderQuery(q, filters({ channel }));
        return clausesOf(q);
      })();
      expect(clauses).toContain("order_source.not.ilike.orderout");
      // A NULL order_source is a POS order. `not.ilike` alone is NULL for it,
      // which dropped it from every non-online tab while All still counted it.
      expect(clauses).toContain("order_source.is.null");
    }
  });

  it("counts QR dine-in as dine-in", () => {
    const q = fakeQuery();
    buildHistoryOrderQuery(q, filters({ channel: "dine_in" }));
    const clauses = clausesOf(q);
    expect(clauses).toContain("order_type.eq.dine_in");
    expect(clauses).toContain("order_type.eq.qr_dine_in");
  });

  it("makes Takeaway the catch-all, so no order_type is unreachable", () => {
    // The enum also carries `online` and `catering`. `order_type.in.(takeout)`
    // counted those under Takeaway and then returned none of them.
    const q = fakeQuery();
    buildHistoryOrderQuery(q, filters({ channel: "takeout" }));
    const clauses = clausesOf(q);
    expect(clauses).toContain("order_type.neq.dine_in");
    expect(clauses).toContain("order_type.neq.delivery");
    expect(clauses).not.toContain("order_type.eq.takeout");
  });

  it("applies no channel predicate on All", () => {
    const q = fakeQuery();
    buildHistoryOrderQuery(q, filters({ channel: "all" }));
    // Only the unconditional empty-draft exclusion remains.
    expect(q.__find("or")).toHaveLength(1);
    expect(q.__find("or")[0].args[0]).toBe(EMPTY_DRAFT_EXCLUSION_OR);
  });
});

describe("buildHistoryOrderQuery — provider", () => {
  it("matches a marketplace by pattern, not by a list of spellings", () => {
    // A literal list is what made the chip read "DoorDash (3)" over an empty
    // list: any casing outside it was counted but never returned.
    const q = fakeQuery();
    buildHistoryOrderQuery(
      q,
      filters({ channel: "online", provider: "doordash" }),
    );
    expect(clausesOf(q)).toContain("delivery_platform.ilike.%door%dash%");
  });

  it("treats House as first-party only, not as everything non-marketplace", () => {
    const q = fakeQuery();
    buildHistoryOrderQuery(q, filters({ channel: "online", provider: "house" }));
    const clauses = clausesOf(q);
    // A genuine storefront order has no platform recorded…
    expect(clauses).toContain("delivery_platform.is.null");
    expect(clauses).toContain("order_source.ilike.online_store");
    // …and a named first-party channel counts too.
    expect(clauses).toContain("delivery_platform.ilike.website");
  });

  it("gives Other a real predicate instead of returning every online order", () => {
    const q = fakeQuery();
    buildHistoryOrderQuery(q, filters({ channel: "online", provider: "other" }));
    const clauses = clausesOf(q);
    expect(clauses).toContain("delivery_platform.not.ilike.%door%dash%");
    expect(clauses).toContain("delivery_platform.not.ilike.website");
  });

  it("ignores the provider when the tab is not Online", () => {
    const q = fakeQuery();
    buildHistoryOrderQuery(
      q,
      filters({ channel: "all", provider: "doordash" }),
    );
    expect(clausesOf(q)).not.toContain("delivery_platform");
  });
});

describe("buildHistoryOrderQuery — status", () => {
  it("excludes voided orders from both paid and unpaid", () => {
    for (const status of ["paid", "unpaid"] as const) {
      const q = fakeQuery();
      buildHistoryOrderQuery(q, filters({ status }));
      expect(clausesOf(q)).toContain("status.neq.void");
    }
  });

  it("matches refunds on either the order status or the payment status", () => {
    const q = fakeQuery();
    buildHistoryOrderQuery(q, filters({ status: "refunded" }));
    const clauses = clausesOf(q);
    expect(clauses).toContain("status.eq.refunded");
    expect(clauses).toContain("payment_status.in.(refunded,partially_refunded)");
  });

  it("applies no status predicate on All", () => {
    const q = fakeQuery();
    buildHistoryOrderQuery(q, filters({ status: "all" }));
    expect(q.__find("or")).toHaveLength(1);
  });
});

describe("buildHistoryOrderQuery — search", () => {
  it("searches order number, customer, phone and platform", () => {
    const q = fakeQuery();
    buildHistoryOrderQuery(q, filters({ search: "kenji" }));
    const clause = q.__find("or")[0].args[0];
    for (const column of [
      "display_number",
      "order_number",
      "customer_name",
      "customer_phone",
      "delivery_platform",
    ]) {
      expect(clause).toContain(`${column}.ilike.%kenji%`);
    }
  });

  it("neutralizes characters that would break out of the or() expression", () => {
    const q = fakeQuery();
    buildHistoryOrderQuery(q, filters({ search: "a,b(c)" }));
    const clause = q.__find("or")[0].args[0];
    // The raw comma/parens must not survive into the filter expression, or they
    // would be parsed as additional clauses.
    expect(clause).not.toContain("a,b(c)");
  });

  it("escapes LIKE wildcards so '%' is a literal", () => {
    const q = fakeQuery();
    buildHistoryOrderQuery(q, filters({ search: "50%" }));
    const clause = q.__find("or")[0].args[0];
    expect(clause).toContain("50\\%");
  });

  it("applies no search predicate for whitespace-only input", () => {
    const q = fakeQuery();
    buildHistoryOrderQuery(q, filters({ search: "   " }));
    // The unconditional empty-draft exclusion is the only `or` left.
    expect(q.__find("or")).toHaveLength(1);
    expect(q.__find("or")[0].args[0]).toBe(EMPTY_DRAFT_EXCLUSION_OR);
  });
});

describe("buildHistoryOrderQuery — empty drafts", () => {
  it("always excludes never-touched $0 drafts, on every filter set", () => {
    // The exact count and the page rows are built from this same query; if the
    // exclusion were conditional, some filter combination would again render
    // fewer rows than the pager total ("1-4 of 6").
    const cases: Partial<HistoryOrderFilters>[] = [
      {},
      { channel: "online", provider: "doordash" },
      { status: "refunded" },
      { search: "kenji", sort: "amount_desc" },
    ];
    for (const patch of cases) {
      const q = fakeQuery();
      buildHistoryOrderQuery(q, filters(patch));
      const clauses = q.__find("or").map((c: any) => c.args[0]);
      expect(clauses).toContain(EMPTY_DRAFT_EXCLUSION_OR);
    }
  });

  it("keeps every arm that rescues a legitimate $0-looking row", () => {
    // Mirrors isEmptyDraftOrder in usePreviousOrdersStore: closed, paid,
    // voided or refunded orders are real history even at $0 total.
    for (const arm of [
      "total_amount.neq.0",
      // A fully-comped open order totals $0 but keeps its pre-discount
      // subtotal and discount — these arms are what keep it visible.
      "subtotal.neq.0",
      "discount_amount.neq.0",
      // orders.completed_at is what the client renames to closed_at.
      "completed_at.not.is.null",
      "payment_status.eq.paid",
      "status.in.(void,refunded)",
    ]) {
      expect(EMPTY_DRAFT_EXCLUSION_OR).toContain(arm);
    }
  });

  it("applies the exclusion last, so earlier or-group positions are stable", () => {
    const q = fakeQuery();
    buildHistoryOrderQuery(q, filters({ status: "refunded", search: "kenji" }));
    const ors = q.__find("or");
    expect(ors[ors.length - 1].args[0]).toBe(EMPTY_DRAFT_EXCLUSION_OR);
  });
});

describe("buildHistoryOrderQuery — sort", () => {
  it("orders by amount for the amount sorts", () => {
    const q = fakeQuery();
    buildHistoryOrderQuery(q, filters({ sort: "amount_desc" }));
    const first = q.__find("order")[0];
    expect(first.args[0]).toBe("total_amount");
    expect(first.args[1]).toEqual({ ascending: false });
  });

  it("always appends a deterministic tiebreaker so pages can't repeat rows", () => {
    for (const sort of [
      "date_desc",
      "date_asc",
      "amount_desc",
      "amount_asc",
    ] as const) {
      const q = fakeQuery();
      buildHistoryOrderQuery(q, filters({ sort }));
      const orders = q.__find("order");
      expect(orders[orders.length - 1].args[0]).toBe("id");
    }
  });

  it("defaults to newest first", () => {
    const q = fakeQuery();
    buildHistoryOrderQuery(q, filters());
    const first = q.__find("order")[0];
    expect(first.args[0]).toBe("created_at");
    expect(first.args[1]).toEqual({ ascending: false });
  });
});
