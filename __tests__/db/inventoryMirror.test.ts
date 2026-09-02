/**
 * Phase 5 acceptance — the inventory mirror.
 *
 * Runs against a REAL SQLite engine (__mocks__/expo-sqlite.js, backed by
 * node:sqlite), because the claims worth testing are SQL behaviours: the
 * location-leading composite key that keeps two stores' resolved stock apart,
 * the wholesale replace that makes a DELETION expressible, the station policy
 * at the write boundary, and the query plan the entry read depends on.
 *
 * The round trip is the load-bearing one, and it is asserted on the RAW rows
 * rather than the mapped catalog. `readInventorySnapshot` runs the same
 * `mapInventorySyncPayload` the live sync runs, so "the mirror shows what the
 * network shows" reduces to "the inputs come back out unchanged" — a property.
 * Comparing the mapped output alone would hide an input that came back wrong in
 * a way the mapping happens to paper over.
 */
import {
  INVENTORY_SNAPSHOT_STATEMENTS,
  mapInventorySyncToBatch,
  readInventorySnapshot,
  readRawInventorySync,
  writeInventorySnapshot,
} from "@/lib/db/descriptors/inventory";
import { ENTITIES } from "@/lib/db/entities";
import {
  __resetLocalDbForTests,
  destroyLocalDb,
  getDb,
  initLocalDb,
} from "@/lib/db/index";
import {
  mapInventorySyncPayload,
  type DirectInventoryRow,
  type RawInventorySync,
  type RawVendorRow,
  type RpcInventoryRow,
} from "@/lib/inventory/inventorySyncPayload";

const LOCATION = "loc-1";
const OTHER_LOCATION = "loc-2";
const TS = "2026-08-30T12:00:00.000Z";

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
// Fixtures — shaped exactly like what the two selects and the RPC return
// ---------------------------------------------------------------------------

function rpcRow(
  id: string,
  overrides: Partial<RpcInventoryRow> = {},
): RpcInventoryRow {
  return {
    id,
    name: `RPC ${id}`,
    sku: `SKU-${id}`,
    unit_type: "kg",
    stock_mode: "stock_tracking",
    reorder_point: 5,
    reorder_quantity: 20,
    is_active: true,
    updated_at: TS,
    stock_quantity: 42,
    effective_cost: 3.5,
    effective_reorder_point: 6,
    ...overrides,
  };
}

function directRow(
  id: string,
  overrides: Partial<DirectInventoryRow> = {},
): DirectInventoryRow {
  return {
    id,
    name: `Item ${id}`,
    category: "Produce",
    current_stock: 10,
    unit_type: "kg",
    reorder_point: 4,
    cost_per_unit: 2.25,
    vendor_id: "vendor-1",
    stock_mode: "stock_tracking",
    updated_at: TS,
    ...overrides,
  };
}

function vendorRow(
  id: string,
  overrides: Partial<RawVendorRow> = {},
): RawVendorRow {
  return {
    id,
    name: `Vendor ${id}`,
    contact_name: "Sam",
    email: "sam@example.com",
    phone: "555-0100",
    address_line1: "1 Market St",
    city: "Springfield",
    state: "IL",
    zip_code: "62701",
    ...overrides,
  };
}

function sync(overrides: Partial<RawInventorySync> = {}): RawInventorySync {
  return {
    rpcRows: [rpcRow("item-a"), rpcRow("item-b")],
    itemRows: [directRow("item-a"), directRow("item-b")],
    vendorRows: [vendorRow("vendor-1")],
    ...overrides,
  };
}

async function syncState() {
  return getDb()!.getFirstAsync<{
    watermark: string | null;
    last_success_at: string | null;
    row_count: number | null;
    retention_cap: number | null;
  }>(`SELECT watermark, last_success_at, row_count, retention_cap
        FROM sync_state WHERE entity = 'inventory' AND location_id = ?`, [
    LOCATION,
  ]);
}

// ---------------------------------------------------------------------------

describe("round trip — what goes in is what comes out", () => {
  it("returns the raw sync inputs unchanged", async () => {
    const raw = sync();
    await writeInventorySnapshot("pos", LOCATION, raw);

    expect(await readRawInventorySync(LOCATION)).toEqual(raw);
  });

  it("maps the mirror through the SAME function the live path uses", async () => {
    const raw = sync();
    await writeInventorySnapshot("pos", LOCATION, raw);

    expect(await readInventorySnapshot(LOCATION)).toEqual(
      mapInventorySyncPayload(raw, LOCATION),
    );
  });

  it("returns null when the location has never synced", async () => {
    expect(await readRawInventorySync(LOCATION)).toBeNull();
    expect(await readInventorySnapshot(LOCATION)).toBeNull();
  });
});

describe("order", () => {
  /**
   * The mapper emits RPC-resolved items first and direct-only items after.
   * `_ordinal` numbers the OUTPUT, not either input, so one ORDER BY reproduces
   * that merge without the read side knowing the rule.
   */
  it("keeps resolved items ahead of direct-only ones across the round trip", async () => {
    const raw = sync({
      // "item-b" has no RPC row, so it is direct-only and sorts last even
      // though it comes first in the direct rows.
      rpcRows: [rpcRow("item-a")],
      itemRows: [directRow("item-b"), directRow("item-a")],
    });

    await writeInventorySnapshot("pos", LOCATION, raw);
    const snapshot = await readInventorySnapshot(LOCATION);

    expect(snapshot!.inventoryItems.map((i) => i.id)).toEqual([
      "item-a",
      "item-b",
    ]);
    expect(snapshot).toEqual(mapInventorySyncPayload(raw, LOCATION));
  });

  it("preserves vendor order", async () => {
    const raw = sync({
      vendorRows: [vendorRow("v-3"), vendorRow("v-1"), vendorRow("v-2")],
    });
    await writeInventorySnapshot("pos", LOCATION, raw);

    expect(
      (await readInventorySnapshot(LOCATION))!.vendors.map((v) => v.id),
    ).toEqual(["v-3", "v-1", "v-2"]);
  });
});

describe("the row universe", () => {
  it("drops an RPC row that has no direct row — it is not active here", async () => {
    const raw = sync({
      rpcRows: [rpcRow("item-a"), rpcRow("item-ghost")],
      itemRows: [directRow("item-a")],
    });

    await writeInventorySnapshot("pos", LOCATION, raw);
    const snapshot = await readInventorySnapshot(LOCATION);

    expect(snapshot!.inventoryItems.map((i) => i.id)).toEqual(["item-a"]);
  });

  it("keeps a direct row that has no RPC row, unresolved", async () => {
    const raw = sync({
      rpcRows: [],
      itemRows: [directRow("item-a", { current_stock: 7 })],
    });

    await writeInventorySnapshot("pos", LOCATION, raw);
    const snapshot = await readInventorySnapshot(LOCATION);

    expect(snapshot!.inventoryItems).toHaveLength(1);
    expect(snapshot!.inventoryItems[0].stockQuantity).toBe(7);
  });
});

describe("wholesale replace — an upsert alone cannot express a deletion", () => {
  it("removes an item that is absent from the next payload", async () => {
    await writeInventorySnapshot("pos", LOCATION, sync());
    expect((await readInventorySnapshot(LOCATION))!.inventoryItems).toHaveLength(
      2,
    );

    await writeInventorySnapshot(
      "pos",
      LOCATION,
      sync({ rpcRows: [rpcRow("item-a")], itemRows: [directRow("item-a")] }),
    );

    const snapshot = await readInventorySnapshot(LOCATION);
    expect(snapshot!.inventoryItems.map((i) => i.id)).toEqual(["item-a"]);
  });

  it("removes a vendor that is absent from the next payload", async () => {
    await writeInventorySnapshot(
      "pos",
      LOCATION,
      sync({ vendorRows: [vendorRow("v-1"), vendorRow("v-2")] }),
    );

    await writeInventorySnapshot(
      "pos",
      LOCATION,
      sync({ vendorRows: [vendorRow("v-2")] }),
    );

    expect(
      (await readInventorySnapshot(LOCATION))!.vendors.map((v) => v.id),
    ).toEqual(["v-2"]);
  });

  it("refuses an empty payload rather than replacing a good catalog", async () => {
    await writeInventorySnapshot("pos", LOCATION, sync());

    const result = await writeInventorySnapshot("pos", LOCATION, {
      rpcRows: [],
      itemRows: [],
      vendorRows: [],
    });

    expect(result).toBeNull();
    expect((await readInventorySnapshot(LOCATION))!.inventoryItems).toHaveLength(
      2,
    );
  });

  it("clears only the location it is replacing", async () => {
    await writeInventorySnapshot("pos", LOCATION, sync());
    await writeInventorySnapshot("pos", OTHER_LOCATION, sync());

    await writeInventorySnapshot(
      "pos",
      LOCATION,
      sync({ rpcRows: [rpcRow("item-a")], itemRows: [directRow("item-a")] }),
    );

    expect(
      (await readInventorySnapshot(OTHER_LOCATION))!.inventoryItems,
    ).toHaveLength(2);
  });
});

describe("location-leading keys", () => {
  /**
   * The Phase 4 lesson, applied before it could bite twice: stock and cost are
   * RESOLVED per location, so the same item id means different numbers at
   * different stores. Keying on `id` alone lets one store's write overwrite the
   * other's, and the survivor carries the wrong stock under the right id —
   * correct-looking data, invisible until someone counts a shelf.
   */
  it("keeps two locations' resolutions of the same item apart", async () => {
    await writeInventorySnapshot(
      "pos",
      LOCATION,
      sync({
        rpcRows: [rpcRow("item-shared", { stock_quantity: 11 })],
        itemRows: [directRow("item-shared")],
      }),
    );
    await writeInventorySnapshot(
      "pos",
      OTHER_LOCATION,
      sync({
        rpcRows: [rpcRow("item-shared", { stock_quantity: 99 })],
        itemRows: [directRow("item-shared")],
      }),
    );

    const here = await readInventorySnapshot(LOCATION);
    const there = await readInventorySnapshot(OTHER_LOCATION);

    expect(here!.inventoryItems[0].stockQuantity).toBe(11);
    expect(there!.inventoryItems[0].stockQuantity).toBe(99);
  });

  it("keeps the same vendor id apart across locations", async () => {
    await writeInventorySnapshot(
      "pos",
      LOCATION,
      sync({ vendorRows: [vendorRow("v-1", { name: "Here" })] }),
    );
    await writeInventorySnapshot(
      "pos",
      OTHER_LOCATION,
      sync({ vendorRows: [vendorRow("v-1", { name: "There" })] }),
    );

    expect((await readInventorySnapshot(LOCATION))!.vendors[0].name).toBe(
      "Here",
    );
    expect((await readInventorySnapshot(OTHER_LOCATION))!.vendors[0].name).toBe(
      "There",
    );
  });
});

describe("station policy", () => {
  it("lets a POS hold the catalog", async () => {
    const result = await writeInventorySnapshot("pos", LOCATION, sync());
    expect(result?.committed).toBe(true);
  });

  it("refuses a kiosk — an ordering surface has no business holding stock", async () => {
    const result = await writeInventorySnapshot("kiosk", LOCATION, sync());

    expect(result?.rejected).toBe(true);
    expect(await readRawInventorySync(LOCATION)).toBeNull();
  });

  it("refuses a KDS", async () => {
    const result = await writeInventorySnapshot("kds", LOCATION, sync());
    expect(result?.rejected).toBe(true);
  });

  it("checks the replace scope too, not just the insert", async () => {
    // A DELETE against a table this station may not hold is as much a policy
    // violation as a write, so the batch must be refused WHOLE — including its
    // clear — rather than being allowed to empty a table it may not fill.
    const batch = mapInventorySyncToBatch(sync(), LOCATION, TS);
    expect(batch.replaceScope).toEqual(["inventory_items", "vendors"]);

    await writeInventorySnapshot("pos", LOCATION, sync());
    await writeInventorySnapshot("kiosk", LOCATION, sync());

    expect((await readInventorySnapshot(LOCATION))!.inventoryItems).toHaveLength(
      2,
    );
  });
});

describe("money", () => {
  it("promotes exact minor units for SQL and keeps the server value in payload", async () => {
    await writeInventorySnapshot(
      "pos",
      LOCATION,
      sync({
        rpcRows: [rpcRow("item-a", { effective_cost: 3.5 })],
        itemRows: [directRow("item-a", { cost_per_unit: 12.35 })],
      }),
    );

    const row = await getDb()!.getFirstAsync<{
      cost_per_unit_minor: number;
      payload: string;
    }>(
      `SELECT cost_per_unit_minor, payload FROM inventory_items
        WHERE location_id = ? AND id = ?`,
      [LOCATION, "item-a"],
    );

    expect(row!.cost_per_unit_minor).toBe(1235);
    // The server's own value survives verbatim — the integer is only ever for
    // SQL to aggregate on.
    expect(JSON.parse(row!.payload).row.cost_per_unit).toBe(12.35);
    expect((await readInventorySnapshot(LOCATION))!.inventoryItems[0].cost).toBe(
      12.35,
    );
  });

  it("never stores a fractional money value in the promoted column", async () => {
    await writeInventorySnapshot(
      "pos",
      LOCATION,
      sync({
        rpcRows: [],
        itemRows: [directRow("item-a", { cost_per_unit: 0.1 + 0.2 })],
      }),
    );

    const row = await getDb()!.getFirstAsync<{ cost_per_unit_minor: number }>(
      `SELECT cost_per_unit_minor FROM inventory_items WHERE location_id = ?`,
      [LOCATION],
    );
    expect(Number.isInteger(row!.cost_per_unit_minor)).toBe(true);
    expect(row!.cost_per_unit_minor).toBe(30);
  });
});

describe("promoted columns", () => {
  it("indexes the stock the app actually shows, not the merchant-level row", async () => {
    // The RPC's per-location `stock_quantity` is what the catalog renders, so a
    // low-stock SQL query has to key on the same number — otherwise the query
    // and the list disagree about which items are low.
    await writeInventorySnapshot(
      "pos",
      LOCATION,
      sync({
        rpcRows: [rpcRow("item-a", { stock_quantity: 2 })],
        itemRows: [directRow("item-a", { current_stock: 500 })],
      }),
    );

    const row = await getDb()!.getFirstAsync<{ current_stock: number }>(
      `SELECT current_stock FROM inventory_items WHERE location_id = ?`,
      [LOCATION],
    );
    expect(row!.current_stock).toBe(2);
  });
});

describe("retention", () => {
  /**
   * A row cap and a wholesale replace cannot coexist. The pull returns the
   * COMPLETE catalog, so pruning would delete rows the payload still contains
   * and leave the mirror permanently disagreeing with the server about which
   * items exist.
   */
  it("is uncapped, so a large catalog survives whole", async () => {
    expect(ENTITIES.inventory.retention.maxRows).toBeNull();

    const many = Array.from({ length: 300 }, (_, i) => `item-${i}`);
    await writeInventorySnapshot("pos", LOCATION, {
      rpcRows: many.map((id) => rpcRow(id)),
      itemRows: many.map((id) => directRow(id)),
      vendorRows: [vendorRow("v-1")],
    });

    expect((await readInventorySnapshot(LOCATION))!.inventoryItems).toHaveLength(
      300,
    );
    expect((await syncState())?.row_count).toBe(300);
  });
});

describe("freshness", () => {
  it("stamps the moment the catalog was confirmed", async () => {
    const before = Date.now();
    await writeInventorySnapshot("pos", LOCATION, sync());
    const state = await syncState();

    expect(state?.last_success_at).toBeTruthy();
    expect(state?.watermark).toBe(state?.last_success_at);
    expect(
      new Date(state!.last_success_at!).getTime(),
    ).toBeGreaterThanOrEqual(before);
  });

  it("holds the 60s threshold that makes stock the tightest entity we mirror", () => {
    expect(ENTITIES.inventory.staleAfterMs).toBe(60_000);
  });
});

describe("query plan — the entry read must be an index scan, not a sort", () => {
  /**
   * Phase 3 shipped an index the one query it was built for could never use,
   * and ten correctness tests said nothing: a wrong plan returns the right
   * rows, just slowly, and only once the table is full. This read runs on the
   * path someone takes to look at stock during service.
   */
  it("uses the ordinal indexes with no temp b-tree", async () => {
    await writeInventorySnapshot("pos", LOCATION, sync());

    for (const [name, sql] of Object.entries(INVENTORY_SNAPSHOT_STATEMENTS)) {
      const plan = await getDb()!.getAllAsync<{ detail: string }>(
        `EXPLAIN QUERY PLAN ${sql}`,
        [LOCATION],
      );
      const detail = plan.map((r) => r.detail).join(" | ");
      expect({ name, detail }).toEqual({
        name,
        detail: expect.stringContaining("USING INDEX"),
      });
      expect({ name, detail }).not.toEqual({
        name,
        detail: expect.stringContaining("TEMP B-TREE"),
      });
    }
  });
});

describe("the DB-open race", () => {
  /**
   * Phase 4 lost this at every cold boot: an `isLocalDbReady()` check at the
   * top of a read loses the race against a sibling `initLocalDb()`, the read
   * falls back to the network, and the mirror looks broken while the flag looks
   * fine. Both entry points must OPEN the database, not ask whether it is open.
   */
  it("opens the database itself rather than assuming it is open", async () => {
    await writeInventorySnapshot("pos", LOCATION, sync());

    __resetLocalDbForTests();
    expect(await readInventorySnapshot(LOCATION)).not.toBeNull();
  });
});
