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

describe("buildHistoryOrderQuery — channel", () => {
  it("selects online orders by order_source", () => {
    const q = fakeQuery();
    buildHistoryOrderQuery(q, filters({ channel: "online" }));
    const inCalls = q.__find("in");
    expect(inCalls[0].args[0]).toBe("order_source");
    expect(inCalls[0].args[1]).toEqual(
      expect.arrayContaining(["online", "orderout", "online_store"]),
    );
  });

  it("excludes online sources from the non-online tabs, keeping tabs a partition", () => {
    for (const channel of ["dine_in", "takeout", "delivery"] as const) {
      const q = fakeQuery();
      buildHistoryOrderQuery(q, filters({ channel }));
      const notCall = q.__find("not")[0];
      expect(notCall).toBeDefined();
      expect(notCall.args[0]).toBe("order_source");
      expect(notCall.args[1]).toBe("in");
    }
  });

  it("counts QR dine-in as dine-in", () => {
    const q = fakeQuery();
    buildHistoryOrderQuery(q, filters({ channel: "dine_in" }));
    const typeCall = q
      .__find("in")
      .find((c: any) => c.args[0] === "order_type");
    expect(typeCall.args[1]).toEqual(
      expect.arrayContaining(["dine_in", "qr_dine_in"]),
    );
  });

  it("applies no channel predicate on All", () => {
    const q = fakeQuery();
    buildHistoryOrderQuery(q, filters({ channel: "all" }));
    expect(
      q.__find("in").filter((c: any) => c.args[0] === "order_source"),
    ).toHaveLength(0);
    expect(q.__find("not")).toHaveLength(0);
  });
});

describe("buildHistoryOrderQuery — provider", () => {
  it("matches a marketplace across every casing the backend writes", () => {
    const q = fakeQuery();
    buildHistoryOrderQuery(
      q,
      filters({ channel: "online", provider: "doordash" }),
    );
    const call = q
      .__find("in")
      .find((c: any) => c.args[0] === "delivery_platform");
    expect(call.args[1]).toEqual(
      expect.arrayContaining(["doordash", "DOORDASH", "DOOR_DASH"]),
    );
  });

  it("treats House as null-or-not-a-marketplace so NULL rows are included", () => {
    const q = fakeQuery();
    buildHistoryOrderQuery(q, filters({ channel: "online", provider: "house" }));
    const orCall = q.__find("or")[0];
    // `not.in` alone would drop NULLs, which is precisely what House is.
    expect(orCall.args[0]).toContain("delivery_platform.is.null");
  });

  it("ignores the provider when the tab is not Online", () => {
    const q = fakeQuery();
    buildHistoryOrderQuery(
      q,
      filters({ channel: "all", provider: "doordash" }),
    );
    expect(
      q.__find("in").filter((c: any) => c.args[0] === "delivery_platform"),
    ).toHaveLength(0);
  });
});

describe("buildHistoryOrderQuery — status", () => {
  it("excludes voided orders from both paid and unpaid", () => {
    for (const status of ["paid", "unpaid"] as const) {
      const q = fakeQuery();
      buildHistoryOrderQuery(q, filters({ status }));
      const neq = q.__find("neq");
      expect(neq.some((c: any) => c.args[0] === "status" && c.args[1] === "void")).toBe(
        true,
      );
    }
  });

  it("matches refunds on either the order status or the payment status", () => {
    const q = fakeQuery();
    buildHistoryOrderQuery(q, filters({ status: "refunded" }));
    const orCall = q.__find("or")[0];
    expect(orCall.args[0]).toContain("status.eq.refunded");
    expect(orCall.args[0]).toContain("payment_status.eq.refunded");
  });

  it("applies no status predicate on All", () => {
    const q = fakeQuery();
    buildHistoryOrderQuery(q, filters({ status: "all" }));
    expect(q.__find("neq")).toHaveLength(0);
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
