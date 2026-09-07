/**
 * Phase 5 acceptance — the customer directory mirror.
 *
 * Runs against a REAL SQLite engine (__mocks__/expo-sqlite.js, backed by
 * node:sqlite), because the claims worth testing are SQL behaviours: the
 * location-leading composite key, the wholesale replace that makes a DELETION
 * expressible, the folded search columns that decide whether a non-ASCII name
 * is findable, and the LIKE arms that decide whether a name query silently
 * returns the whole directory.
 *
 * THE PROPERTY THAT MATTERS is the round trip: `payload` holds the server's
 * row verbatim and the read hands that back, so "offline shows what online
 * shows" reduces to "the rows come back out unchanged" — asserted, rather than
 * left as an intention two mapping copies have to keep agreeing on. Same shape
 * as the inventory mirror's ③.
 */
import {
  CUSTOMER_FETCH_LIMIT,
  foldPhone,
  mapCustomersToBatch,
  writeCustomersSnapshot,
  type ServerCustomer,
} from "@/lib/db/descriptors/customers";
import {
  CUSTOMER_SEARCH_LIMIT,
  getCustomersMirrorState,
  searchLocalCustomers,
  topLocalCustomers,
} from "@/lib/db/customersQuery";
import { ENTITIES } from "@/lib/db/entities";
import {
  __resetLocalDbForTests,
  destroyLocalDb,
  getReadDb,
  initLocalDb,
} from "@/lib/db/index";

const LOCATION = "loc-1";
const OTHER_LOCATION = "loc-2";
const MERCHANT = "m-1";

beforeEach(async () => {
  __resetLocalDbForTests();
  await destroyLocalDb();
  __resetLocalDbForTests();
  await initLocalDb();
});

afterEach(async () => {
  await destroyLocalDb();
  __resetLocalDbForTests();
});

// ---------------------------------------------------------------------------
// Fixtures — shaped exactly like `.from("customers").select("*")` returns
// ---------------------------------------------------------------------------

function customer(
  id: string,
  overrides: Partial<ServerCustomer> = {},
): ServerCustomer {
  return {
    id,
    merchant_id: MERCHANT,
    name: `Name ${id}`,
    phone: "5551234567",
    email: `${id}@example.com`,
    address: null,
    is_active: true,
    vip_level: null,
    total_orders: 3,
    visits: 3,
    lifetime_spend: 120.5,
    avg_spend: 40.17,
    last_order_date: "2026-08-01T00:00:00.000Z",
    last_visit: "2026-08-01T00:00:00.000Z",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: null,
    ...overrides,
  };
}

async function seed(
  rows: ServerCustomer[],
  locationId = LOCATION,
): Promise<void> {
  await writeCustomersSnapshot("pos", locationId, rows);
}

function search(query?: string, locationId = LOCATION) {
  return searchLocalCustomers({ locationId, query });
}

// ---------------------------------------------------------------------------

describe("the round trip", () => {
  it("returns the server rows unchanged, in the server's order", async () => {
    const rows = [
      customer("c1", { name: "Ada Lovelace" }),
      customer("c2", { name: "Grace Hopper" }),
      customer("c3", { name: "Alan Turing" }),
    ];
    await seed(rows);

    const back = await search();
    expect(back).toEqual(rows);
  });

  it("survives a nullable updated_at — the reason this is a snapshot", async () => {
    // Every fixture row has `updated_at: null`. A keyset delta would drop all
    // of them silently; the snapshot must not care.
    await seed([customer("c1"), customer("c2")]);
    expect((await search())!.length).toBe(2);
  });

  it("keeps a malformed payload from emptying the directory", async () => {
    await seed([customer("c1"), customer("c2")]);
    const db = getReadDb()!;
    await db.runAsync(
      `UPDATE customers SET payload = 'not json' WHERE id = 'c1'`,
    );
    const back = await search();
    expect(back!.map((c) => c.id)).toEqual(["c2"]);
  });
});

describe("the wholesale replace", () => {
  it("makes a DELETION expressible — a merged-away customer disappears", async () => {
    await seed([customer("c1"), customer("c2"), customer("c3")]);
    expect((await search())!.length).toBe(3);

    await seed([customer("c1"), customer("c3")]);
    const back = await search();
    expect(back!.map((c) => c.id)).toEqual(["c1", "c3"]);
  });

  it("REFUSES an empty payload rather than replacing a good directory", async () => {
    await seed([customer("c1"), customer("c2")]);
    const result = await writeCustomersSnapshot("pos", LOCATION, []);
    expect(result).toBeNull();
    expect((await search())!.length).toBe(2);
  });

  it("clears only its own location", async () => {
    await seed([customer("c1"), customer("c2")]);
    await seed([customer("x1")], OTHER_LOCATION);

    // Replacing loc-1 must not touch loc-2.
    await seed([customer("c1")]);
    expect((await search())!.map((c) => c.id)).toEqual(["c1"]);
    expect((await search(undefined, OTHER_LOCATION))!.map((c) => c.id)).toEqual([
      "x1",
    ]);
  });

  it("keeps two locations' rows for the SAME customer id apart", async () => {
    // customers is merchant-scoped remotely, so one id legitimately appears at
    // both of a merchant's locations. A single-column key would collapse them.
    await seed([customer("shared", { name: "At One" })]);
    await seed([customer("shared", { name: "At Two" })], OTHER_LOCATION);

    expect((await search())![0].name).toBe("At One");
    expect((await search(undefined, OTHER_LOCATION))![0].name).toBe("At Two");
  });
});

describe("search", () => {
  it("matches on name, case-insensitively, including non-ASCII", async () => {
    await seed([
      customer("c1", { name: "José Álvarez" }),
      customer("c2", { name: "Bob" }),
    ]);
    // The whole reason the fold happens in JS at ingest: SQLite's LIKE and
    // LOWER are ASCII-only, so an uppercase É would not match a lowercase é.
    expect((await search("JOSÉ"))!.map((c) => c.id)).toEqual(["c1"]);
    expect((await search("álvarez"))!.map((c) => c.id)).toEqual(["c1"]);
  });

  it("matches a phone however the operator punctuates it", async () => {
    await seed([
      customer("c1", { phone: "(555) 987-6543", name: "Zoe" }),
      customer("c2", { phone: "5551112222", name: "Amy" }),
    ]);
    expect((await search("555-987"))!.map((c) => c.id)).toEqual(["c1"]);
    expect((await search("9876543"))!.map((c) => c.id)).toEqual(["c1"]);
  });

  it("does NOT let a name query fall through to the phone arm", async () => {
    // The guard that matters: a query with no digits folds to an empty digit
    // string, and an unguarded `_search_phone LIKE '%%'` would match every row
    // that has a phone — turning every name search into a full directory dump.
    await seed([
      customer("c1", { name: "Ann", phone: "5550001111" }),
      customer("c2", { name: "Bob", phone: "5552223333" }),
    ]);
    expect((await search("Ann"))!.map((c) => c.id)).toEqual(["c1"]);
  });

  it("matches on address, which CustomerSheet filters on", async () => {
    await seed([
      customer("c1", { address: "12 Elm Street" }),
      customer("c2", { address: "9 Oak Avenue" }),
    ]);
    expect((await search("elm"))!.map((c) => c.id)).toEqual(["c1"]);
  });

  it("treats LIKE metacharacters as literal text", async () => {
    // Both fixtures are chosen so that FAILING to escape widens the match to
    // include the second row. A query like "100%" would not discriminate:
    // '%100%%' still excludes a row with no "100" in it, so the test would
    // pass with the escaping removed and prove nothing.
    await seed([
      customer("c1", { name: "50%B discount" }),
      customer("c2", { name: "Bob" }),
    ]);
    // Unescaped this becomes '%%B%' — "contains B" — which matches Bob too.
    expect((await search("%B"))!.map((c) => c.id)).toEqual(["c1"]);

    await seed([
      customer("d1", { name: "a_c literal" }),
      customer("d2", { name: "abc" }),
    ]);
    // Unescaped '_' is LIKE's single-character wildcard, so 'a_c' matches abc.
    expect((await search("a_c"))!.map((c) => c.id)).toEqual(["d1"]);
  });

  it("returns the recent directory for a query shorter than 2 chars", async () => {
    await seed([customer("c1"), customer("c2"), customer("c3")]);
    expect((await search(""))!.length).toBe(3);
    expect((await search("a"))!.length).toBe(3);
  });

  it("scopes to the location", async () => {
    await seed([customer("c1", { name: "Findable" })]);
    await seed([customer("x1", { name: "Findable" })], OTHER_LOCATION);
    expect((await search("findable"))!.map((c) => c.id)).toEqual(["c1"]);
  });

  it("caps the candidate list", async () => {
    const many = Array.from({ length: CUSTOMER_SEARCH_LIMIT + 25 }, (_, i) =>
      customer(`c${i}`, { name: `Match ${i}` }),
    );
    await seed(many);
    expect((await search("match"))!.length).toBe(CUSTOMER_SEARCH_LIMIT);
  });

  it("preserves the server's ordering rather than re-deriving it", async () => {
    // `last_order_date` is deliberately NOT the local sort key: the server
    // ordered these NULLS FIRST and SQLite would put them last.
    const rows = [
      customer("newest", { last_order_date: null }),
      customer("older", { last_order_date: "2026-08-05T00:00:00.000Z" }),
      customer("oldest", { last_order_date: "2026-01-05T00:00:00.000Z" }),
    ];
    await seed(rows);
    expect((await search())!.map((c) => c.id)).toEqual([
      "newest",
      "older",
      "oldest",
    ]);
  });
});

describe("top customers", () => {
  it("ranks by total_orders across the WHOLE directory", async () => {
    await seed([
      customer("quiet", { total_orders: 1 }),
      customer("regular", { total_orders: 40 }),
      customer("never", { total_orders: 0 }),
      customer("sometimes", { total_orders: 12 }),
    ]);
    const top = await topLocalCustomers(LOCATION, 3);
    expect(top!.map((c) => c.id)).toEqual(["regular", "sometimes", "quiet"]);
  });

  it("excludes customers with no orders", async () => {
    await seed([
      customer("never", { total_orders: 0 }),
      customer("nullish", { total_orders: null }),
    ]);
    expect(await topLocalCustomers(LOCATION, 3)).toEqual([]);
  });
});

describe("policy and bookkeeping", () => {
  it("the fetch limit and the retention cap are the SAME number", async () => {
    // They describe one window from opposite ends. A mismatch means the mirror
    // either prunes rows the payload still holds or claims coverage it never
    // fetched.
    expect(CUSTOMER_FETCH_LIMIT).toBe(ENTITIES.customers.retention.maxRows);
  });

  it("a kiosk and a KDS may not hold the directory", async () => {
    const kiosk = await writeCustomersSnapshot("kiosk", LOCATION, [
      customer("c1"),
    ]);
    expect(kiosk?.rejected).toBe(true);
    const kds = await writeCustomersSnapshot("kds", LOCATION, [customer("c1")]);
    expect(kds?.rejected).toBe(true);
    expect(await search()).toEqual([]);
  });

  it("records freshness and row count", async () => {
    await seed([customer("c1"), customer("c2")]);
    const state = await getCustomersMirrorState(LOCATION);
    expect(state?.rowCount).toBe(2);
    expect(state?.lastSuccessAt).toBeTruthy();
  });

  it("promotes money to exact minor units and keeps the server value verbatim", async () => {
    await seed([customer("c1", { lifetime_spend: 120.55, avg_spend: 40.18 })]);
    const db = getReadDb()!;
    const row = await db.getFirstAsync<{
      lifetime_spend_minor: number;
      avg_spend_minor: number;
    }>(`SELECT lifetime_spend_minor, avg_spend_minor FROM customers`);
    expect(row!.lifetime_spend_minor).toBe(12055);
    expect(row!.avg_spend_minor).toBe(4018);
    // …and the displayed value still comes from the untouched payload.
    expect((await search())![0].lifetime_spend).toBe(120.55);
  });

  it("reads the directory through the location index, not a table scan", async () => {
    await seed([customer("c1")]);
    const db = getReadDb()!;
    const plan = await db.getAllAsync<{ detail: string }>(
      `EXPLAIN QUERY PLAN
       SELECT payload FROM customers WHERE location_id = ? ORDER BY _ordinal LIMIT ?`,
      [LOCATION, 200],
    );
    const detail = plan.map((p) => p.detail).join(" | ");
    expect(detail).toContain("idx_c_loc_ord");
    // The index supplies the order, so there is no sort step at all.
    expect(detail).not.toContain("USE TEMP B-TREE");
  });
});

describe("mapping", () => {
  it("folds phones to digits only", () => {
    expect(foldPhone("(555) 123-4567")).toBe("5551234567");
    expect(foldPhone("")).toBeNull();
    expect(foldPhone(null)).toBeNull();
  });

  it("tags every row with the location it was mirrored for", () => {
    const batch = mapCustomersToBatch([customer("c1")], LOCATION, "now");
    expect(batch.root[0].location_id).toBe(LOCATION);
    // …while merchant_id, the row's real scope, is preserved beside it.
    expect(batch.root[0].merchant_id).toBe(MERCHANT);
    expect(batch.replaceScope).toEqual(["customers"]);
  });
});
