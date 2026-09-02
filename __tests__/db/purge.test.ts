/**
 * Phase 1 acceptance — the three purge paths.
 *
 * The plan's "watch for" on this phase: if the env-switch or station-change
 * purge is wrong, everything after it leaks PII — production customer data left
 * on a staging device, or names and phone numbers on a dining-room kiosk.
 * These are the tests that make those two claims real rather than intended.
 */
/**
 * The global MMKV mock in jest-setup.ts is a no-op stub — `set` stores nothing
 * and `getString` always returns undefined. That is fine for tests that only
 * need MMKV not to explode, but useless here: the entire env-switch purge
 * mechanism IS a value written to MMKV and read back on the next boot. Against
 * the stub it would pass while proving nothing.
 *
 * So this file gets a stateful in-memory MMKV. Scoped to the file rather than
 * fixed globally, because making the shared stub stateful could change the
 * behaviour of every other suite that relies on reads returning undefined.
 */
jest.mock("react-native-mmkv", () => {
  const createInstance = () => {
    const store = new Map<string, string>();
    return {
      get size() {
        return store.size;
      },
      getString: jest.fn((k: string) => store.get(k)),
      getBoolean: jest.fn((k: string) => store.get(k) === "true"),
      getNumber: jest.fn((k: string) => Number(store.get(k))),
      set: jest.fn((k: string, v: unknown) => store.set(k, String(v))),
      delete: jest.fn((k: string) => store.delete(k)),
      remove: jest.fn((k: string) => store.delete(k)),
      contains: jest.fn((k: string) => store.has(k)),
      getAllKeys: jest.fn(() => [...store.keys()]),
      clearAll: jest.fn(() => store.clear()),
    };
  };
  return {
    MMKV: jest.fn().mockImplementation(createInstance),
    createMMKV: jest.fn().mockImplementation(createInstance),
  };
});

import { ENTITIES } from "@/lib/db/entities";
import {
  __resetLocalDbForTests,
  destroyLocalDb,
  getDb,
  initLocalDb,
} from "@/lib/db/index";
import { DB_PURGE_PENDING_KEY } from "@/lib/db/purgeFlag";
import { purgeForbiddenTables, purgeLocalDbNow } from "@/lib/db/teardown";
import { writeRows, type Row } from "@/lib/db/write";
import {
  clearCacheData,
  getSyncString,
  removeSyncKey,
  setSyncString,
} from "@/lib/storage";

const LOCATION = "loc-1";

function orderRow(id: string): Row {
  return {
    id,
    location_id: LOCATION,
    order_number: id,
    customer_name: "Jane Doe",
    customer_phone: "+15551234567",
    customer_email: "jane@example.com",
    status: "completed",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    _server_seen_at: "2026-01-01T00:00:00.000Z",
    payload: "{}",
  };
}

/** The menu entity's ROOT row — `menus`, not `menu_items` (schema v7). */
function menuRow(id: string): Row {
  return {
    id,
    location_id: LOCATION,
    name: "Lunch",
    is_active: 1,
    display_order: 0,
    updated_at: "2026-01-01T00:00:00.000Z",
    _ordinal: 0,
    _server_seen_at: "2026-01-01T00:00:00.000Z",
    payload: "{}",
  };
}

async function countIn(table: string): Promise<number> {
  const row = await getDb()!.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM ${table}`,
  );
  return row?.n ?? 0;
}

beforeEach(async () => {
  removeSyncKey(DB_PURGE_PENDING_KEY);
  __resetLocalDbForTests();
  await destroyLocalDb();
  __resetLocalDbForTests();
  await initLocalDb();
});

afterEach(async () => {
  await destroyLocalDb();
  __resetLocalDbForTests();
  removeSyncKey(DB_PURGE_PENDING_KEY);
});

describe("pending-purge flag", () => {
  /**
   * The env-switch path. reconcileEnvironmentOnBoot() is synchronous and runs
   * at module load, so it records an intent rather than awaiting a file delete.
   * initLocalDb() must honour that intent BEFORE it opens anything — otherwise
   * the delete races the first write of the NEW environment's data and takes
   * that out instead.
   */
  it("wipes the database before opening when a purge is owed", async () => {
    await writeRows(ENTITIES.orders, "pos", LOCATION, [orderRow("o1")]);
    expect(await countIn("orders")).toBe(1);

    // Simulate a staging -> prod switch: flag set, process restarts.
    setSyncString(DB_PURGE_PENDING_KEY, "env_switch");
    __resetLocalDbForTests();

    await initLocalDb();

    expect(await countIn("orders")).toBe(0);
  });

  it("clears the flag once honoured, so the next boot keeps its data", async () => {
    setSyncString(DB_PURGE_PENDING_KEY, "env_switch");
    __resetLocalDbForTests();
    await initLocalDb();

    expect(getSyncString(DB_PURGE_PENDING_KEY)).toBeUndefined();

    await writeRows(ENTITIES.orders, "pos", LOCATION, [orderRow("o2")]);
    __resetLocalDbForTests();
    await initLocalDb();

    // Survives the reboot — the purge was a one-shot, not a standing order.
    expect(await countIn("orders")).toBe(1);
  });

  it("leaves an untouched database alone when no purge is owed", async () => {
    await writeRows(ENTITIES.orders, "pos", LOCATION, [orderRow("o1")]);
    __resetLocalDbForTests();
    await initLocalDb();
    expect(await countIn("orders")).toBe(1);
  });
});

describe("clearCacheData", () => {
  it("flags the local DB for purge alongside the MMKV keys", () => {
    const result = clearCacheData();
    expect(getSyncString(DB_PURGE_PENDING_KEY)).toBe("cache_clear");
    expect(result.clearedKeys).toContain(DB_PURGE_PENDING_KEY);
    expect(result.errors).toEqual([]);
  });
});

describe("purgeLocalDbNow", () => {
  it("empties the database and leaves it usable", async () => {
    await writeRows(ENTITIES.orders, "pos", LOCATION, [orderRow("o1")]);
    expect(await countIn("orders")).toBe(1);

    await purgeLocalDbNow("cache_clear");

    // Empty, but reopened — a purge means "empty", not "unavailable".
    expect(getDb()).not.toBeNull();
    expect(await countIn("orders")).toBe(0);

    const result = await writeRows(ENTITIES.orders, "pos", LOCATION, [
      orderRow("o2"),
    ]);
    expect(result.written).toBe(1);
  });
});

describe("station change — POS re-provisioned as a kiosk", () => {
  it("drops every PII table and keeps the menu", async () => {
    await writeRows(ENTITIES.orders, "pos", LOCATION, [orderRow("o1")]);
    await writeRows(ENTITIES.menu, "pos", LOCATION, [menuRow("m1")]);
    await getDb()!.runAsync(
      `INSERT INTO customers (id, location_id, name, phone, _server_seen_at, payload)
       VALUES ('c1', '${LOCATION}', 'Jane Doe', '+15551234567', '2026-01-01', '{}')`,
    );
    await getDb()!.runAsync(
      `INSERT INTO staff (location_member_id, staff_profile_id, location_id,
                          display_name, is_active, _server_seen_at)
       VALUES ('lm1', 'sp1', '${LOCATION}', 'Alex', 1, '2026-01-01')`,
    );

    await purgeForbiddenTables("kiosk");

    // Every table carrying customer or staff PII is empty.
    expect(await countIn("orders")).toBe(0);
    expect(await countIn("customers")).toBe(0);
    expect(await countIn("staff")).toBe(0);

    // The menu survives: a kiosk is an ordering surface and legitimately needs
    // it. Re-syncing it over dining-room WiFi for no reason would be worse.
    expect(await countIn("menus")).toBe(1);
  });

  it("is a no-op on a POS", async () => {
    await writeRows(ENTITIES.orders, "pos", LOCATION, [orderRow("o1")]);
    await purgeForbiddenTables("pos");
    expect(await countIn("orders")).toBe(1);
  });

  it("drops the menu too when the device becomes a KDS", async () => {
    await writeRows(ENTITIES.menu, "pos", LOCATION, [menuRow("m1")]);
    await purgeForbiddenTables("kds");
    expect(await countIn("menus")).toBe(0);
  });

  it("clears stale sync watermarks for now-forbidden entities", async () => {
    await writeRows(ENTITIES.orders, "pos", LOCATION, [orderRow("o1")]);
    // Retention wrote a sync_state row for `orders`.
    expect(await countIn("sync_state")).toBeGreaterThan(0);

    await purgeForbiddenTables("kiosk");

    // A watermark left behind would make the delta engine resume mid-stream if
    // the device were ever re-provisioned back to POS, silently skipping rows.
    const rows = await getDb()!.getAllAsync<{ entity: string }>(
      "SELECT entity FROM sync_state",
    );
    expect(rows.map((r) => r.entity)).not.toContain("orders");
  });
});

describe("PII containment end to end", () => {
  it("never leaves a customer name on a kiosk after re-provisioning", async () => {
    await writeRows(ENTITIES.orders, "pos", LOCATION, [orderRow("o1")]);
    await purgeForbiddenTables("kiosk");

    // Scan every table a kiosk may still hold for the PII we planted.
    for (const table of ["menus", "menu_items", "menu_categories", "sync_state"]) {
      const rows = await getDb()!.getAllAsync<Record<string, unknown>>(
        `SELECT * FROM ${table}`,
      );
      const blob = JSON.stringify(rows);
      expect(blob).not.toContain("Jane Doe");
      expect(blob).not.toContain("+15551234567");
      expect(blob).not.toContain("jane@example.com");
    }
  });
});
