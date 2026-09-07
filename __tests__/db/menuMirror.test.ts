/**
 * Phase 4 acceptance — the menu mirror.
 *
 * Everything here runs against a REAL SQLite engine (__mocks__/expo-sqlite.js
 * is backed by node:sqlite), because the claims worth testing are SQL
 * behaviours: the composite primary keys that keep one category's items apart
 * across two menus, the wholesale replace that makes a DELETION expressible,
 * the foreign-key cascade, and the station policy at the write boundary.
 *
 * The round trip is the load-bearing one. `readMenuSnapshot` hands its result
 * to the SAME `setMenuData` a live sync uses, so "the mirror renders the same
 * menu as the network" reduces to "what comes back out is what went in" — and
 * that is a property, so it is asserted as one.
 */
import {
  mapMenuPayloadToBatch,
  MENU_SNAPSHOT_STATEMENTS,
  readMenuSnapshot,
  touchMenuFreshness,
  writeMenuSnapshot,
} from "@/lib/db/descriptors/menu";
import { ENTITIES } from "@/lib/db/entities";
import {
  __resetLocalDbForTests,
  destroyLocalDb,
  getDb,
  initLocalDb,
} from "@/lib/db/index";
import { writeBatch } from "@/lib/db/write";
import type { PosSyncData } from "@/types/menu";

const LOCATION = "loc-1";
const TS = "2026-08-28T12:00:00.000Z";

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
// Fixtures — shaped exactly like get_pos_bootstrap_v1's payload
// ---------------------------------------------------------------------------

function modifierGroup(id: string, name: string) {
  return {
    id,
    name,
    display_order: 1,
    min_selections: 0,
    max_selections: 1,
    is_required: false,
    is_active: true,
    items: [
      {
        id: `${id}-opt-1`,
        name: "Extra",
        price_modifier: 1.5,
        display_order: 1,
        is_active: true,
        is_default: false,
        stock_tracking_mode: "in_stock",
        current_stock: null,
      },
    ],
  };
}

function itemEntry(
  junctionId: string,
  itemId: string,
  categoryId: string,
  overrides: Record<string, unknown> = {},
  itemOverrides: Record<string, unknown> = {},
) {
  return {
    id: junctionId,
    menu_item_id: itemId,
    category_id: categoryId,
    display_order: 1,
    is_featured: false,
    ...overrides,
    menu_item: {
      id: itemId,
      name: "Cheeseburger",
      // NULL is the "global item" case — it must survive the round trip, and it
      // is NOT the same thing as the mirror's location_id column.
      location_id: null,
      description: "Two patties",
      image: null,
      allergens: ["dairy"],
      meal_types: ["lunch"],
      card_bg_color: null,
      price_levels: {
        level_1_base: 9.5,
        level_2_location_item: null,
        level_2_modifier: null,
        level_2_modifier_type: null,
        level_3_category: null,
        level_4_location_category: null,
        level_5_location_menu: null,
      },
      effective_price: 9.5,
      effective_cash_price: 9.0,
      effective_availability: true,
      price_source: "base",
      has_location_item_override: false,
      has_category_override: false,
      has_location_category_override: false,
      has_location_menu_override: false,
      stock_tracking_mode: "in_stock",
      current_stock: null,
      modifier_groups: [modifierGroup("mg-cheese", "Cheese")],
      is_tax_exempt: false,
      tax_category: "standard",
      ...itemOverrides,
    },
  };
}

function categoryEntry(
  junctionId: string,
  categoryId: string,
  items: unknown[],
  displayOrder: number | null = 1,
) {
  return {
    id: junctionId,
    category_id: categoryId,
    display_order: displayOrder,
    is_active: true,
    category: {
      id: categoryId,
      name: "Burgers",
      description: null,
      image: null,
      location_id: null,
      has_location_override: false,
      has_menu_category_override: false,
    },
    items,
  };
}

function menu(id: string, categories: unknown[], displayOrder: number | null = 1) {
  return {
    id,
    merchant_id: "merch-1",
    location_id: null,
    name: "Lunch",
    description: null,
    is_active: true,
    is_global: true,
    is_location_owned: false,
    display_order: displayOrder,
    created_at: TS,
    updated_at: TS,
    categories,
    schedules: [],
  };
}

function payload(overrides: Partial<PosSyncData> = {}): PosSyncData {
  return {
    version: "20260828T120000.000000-42",
    synced_at: TS,
    location_id: LOCATION,
    menus: [
      menu("menu-lunch", [
        categoryEntry("mc-1", "cat-burgers", [
          itemEntry("ci-1", "item-burger", "cat-burgers"),
        ]),
      ]),
    ],
    menu_item_ingredients: [
      {
        id: "r-1",
        menu_item_id: "item-burger",
        inventory_item_id: "inv-1",
        quantity: 2,
      },
    ],
    modifier_group_item_ingredients: [],
    snoozes: [
      {
        menu_item_id: "item-burger",
        snoozed_until: "2026-08-28T18:00:00.000Z",
        snooze_reason: "86",
      },
    ],
    modifierSnoozes: [],
    ...overrides,
  } as PosSyncData;
}

async function countIn(table: string): Promise<number> {
  const row = await getDb()!.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM ${table}`,
  );
  return row?.n ?? 0;
}

// ---------------------------------------------------------------------------

describe("round trip — what comes out is what went in", () => {
  it("rebuilds the bootstrap payload exactly", async () => {
    const source = payload();
    await writeMenuSnapshot("pos", LOCATION, source);

    expect(await readMenuSnapshot(LOCATION)).toEqual(source);
  });

  /**
   * The boot race, asserted directly.
   *
   * Every entry point here runs at boot, and `initLocalDb()` is kicked off from
   * a SIBLING effect in the same commit — so a plain `isLocalDbReady()` check
   * loses the race. It does not crash; it silently falls back to MMKV on read
   * and silently skips the write, which leaves the mirror empty forever while
   * the flag looks like it works. This is what stops that regressing.
   */
  it("opens the database itself rather than assuming it is already open", async () => {
    await writeMenuSnapshot("pos", LOCATION, payload());
    // Drop the module handles WITHOUT reopening — the state a boot starts in.
    __resetLocalDbForTests();

    expect(await readMenuSnapshot(LOCATION)).toEqual(payload());
  });

  it("returns null before the location has ever synced", async () => {
    expect(await readMenuSnapshot(LOCATION)).toBeNull();
    expect(await readMenuSnapshot("never-synced")).toBeNull();
  });

  it("keeps each location's menu to itself", async () => {
    await writeMenuSnapshot("pos", LOCATION, payload());
    expect(await readMenuSnapshot("loc-2")).toBeNull();
  });

  /**
   * `_ordinal`, not `display_order`, is what preserves the server's ordering.
   * display_order is nullable and can tie — the server's ORDER BY breaks ties
   * on name, and re-deriving that here would be a second sort to keep in step.
   */
  it("preserves source order when display_order is null or tied", async () => {
    const source = payload({
      menus: [
        menu(
          "menu-a",
          [
            categoryEntry("mc-z", "cat-z", [], null),
            categoryEntry("mc-a", "cat-a", [], null),
            categoryEntry("mc-m", "cat-m", [], null),
          ],
          null,
        ),
      ] as never,
    });
    await writeMenuSnapshot("pos", LOCATION, source);

    const back = await readMenuSnapshot(LOCATION);
    expect(back!.menus[0].categories.map((c) => c.id)).toEqual([
      "mc-z",
      "mc-a",
      "mc-m",
    ]);
  });
});

describe("composite keys — one category, two menus", () => {
  /**
   * The failure this exists to catch, and it is not hypothetical: a global
   * category can belong to several menus, and `price_levels.level_5_location_menu`
   * is a per-location-MENU price override. Keying items on the junction id
   * alone (which is what `category_items.id` is) collapses both appearances
   * into one row — the last write wins and the other menu silently loses its
   * items, at a different price.
   */
  it("keeps both appearances, each with its own effective price", async () => {
    const shared = (menuId: string, price: number) =>
      menu(menuId, [
        categoryEntry("mc-shared", "cat-shared", [
          // Same category_items junction id in both menus — this is the trap.
          itemEntry("ci-shared", "item-burger", "cat-shared", {}, {
            effective_price: price,
          }),
        ]),
      ]);

    const source = payload({
      menus: [shared("menu-lunch", 9.5), shared("menu-dinner", 12.5)] as never,
    });
    await writeMenuSnapshot("pos", LOCATION, source);

    expect(await countIn("menu_items")).toBe(2);

    const back = await readMenuSnapshot(LOCATION);
    const priceIn = (i: number) =>
      (back!.menus[i].categories[0].items[0] as any).menu_item.effective_price;
    expect(priceIn(0)).toBe(9.5);
    expect(priceIn(1)).toBe(12.5);

    // And the promoted minor-unit columns follow the same split.
    const rows = await getDb()!.getAllAsync<{
      menu_id: string;
      price_minor: number;
    }>(`SELECT menu_id, price_minor FROM menu_items ORDER BY menu_id`);
    expect(rows).toEqual([
      { menu_id: "menu-dinner", price_minor: 1250 },
      { menu_id: "menu-lunch", price_minor: 950 },
    ]);
  });

  it("does not duplicate rows when the same payload is written twice", async () => {
    await writeMenuSnapshot("pos", LOCATION, payload());
    const first = {
      menus: await countIn("menus"),
      categories: await countIn("menu_categories"),
      items: await countIn("menu_items"),
      groups: await countIn("modifier_groups"),
      links: await countIn("menu_item_modifier_groups"),
      envelope: await countIn("menu_bootstrap"),
    };

    await writeMenuSnapshot("pos", LOCATION, payload());

    expect({
      menus: await countIn("menus"),
      categories: await countIn("menu_categories"),
      items: await countIn("menu_items"),
      groups: await countIn("modifier_groups"),
      links: await countIn("menu_item_modifier_groups"),
      envelope: await countIn("menu_bootstrap"),
    }).toEqual(first);
  });
});

describe("wholesale replace — the only way a deletion is expressible", () => {
  /**
   * An upsert cannot express a removal. An item taken off the menu simply has
   * no row in the next payload, so without clearing the location first it
   * survives every future sync — a deleted item still ringing up, forever.
   */
  it("drops an item that is no longer in the payload", async () => {
    await writeMenuSnapshot(
      "pos",
      LOCATION,
      payload({
        menus: [
          menu("menu-lunch", [
            categoryEntry("mc-1", "cat-burgers", [
              itemEntry("ci-1", "item-burger", "cat-burgers"),
              itemEntry("ci-2", "item-fries", "cat-burgers"),
            ]),
          ]),
        ] as never,
      }),
    );
    expect(await countIn("menu_items")).toBe(2);

    // item-fries is discontinued.
    await writeMenuSnapshot("pos", LOCATION, payload());

    expect(await countIn("menu_items")).toBe(1);
    const back = await readMenuSnapshot(LOCATION);
    expect(back!.menus[0].categories[0].items).toHaveLength(1);
  });

  it("drops a whole menu that is no longer returned", async () => {
    await writeMenuSnapshot(
      "pos",
      LOCATION,
      payload({
        menus: [
          menu("menu-lunch", [categoryEntry("mc-1", "cat-a", [])]),
          menu("menu-brunch", [categoryEntry("mc-2", "cat-b", [])]),
        ] as never,
      }),
    );
    expect(await countIn("menus")).toBe(2);

    await writeMenuSnapshot("pos", LOCATION, payload());

    expect(await countIn("menus")).toBe(1);
    // The replace cleared every menu table for the location, so the departed
    // menu's category went with it rather than being left orphaned.
    expect(await countIn("menu_categories")).toBe(1);
  });

  /**
   * The empty-payload guard. An empty menu is exactly the blank grid this
   * mirror exists to prevent, so it must never be allowed to replace a good
   * snapshot — the same rule menuOfflineCache applies.
   */
  it("refuses an empty payload rather than wiping a good snapshot", async () => {
    await writeMenuSnapshot("pos", LOCATION, payload());

    const result = await writeMenuSnapshot(
      "pos",
      LOCATION,
      payload({ menus: [] }),
    );

    expect(result).toBeNull();
    expect(await countIn("menus")).toBe(1);
    expect(await readMenuSnapshot(LOCATION)).not.toBeNull();
  });

  /**
   * Two locations, the SAME global menu id, different resolved prices — which
   * is the normal case for a merchant-wide menu, and the case a device hits
   * whenever someone switches stores.
   *
   * This is a real regression test: dropping `location_id` from the menu keys
   * makes loc-2's write overwrite loc-1's row, and the resync then leaves
   * loc-2 holding loc-1's prices under the right id. Correct-looking data,
   * wrong money.
   */
  it("keeps two locations' resolutions of the same menu apart", async () => {
    const priced = (price: number) =>
      menu("menu-global", [
        categoryEntry("mc-1", "cat-burgers", [
          itemEntry("ci-1", "item-burger", "cat-burgers", {}, {
            effective_price: price,
          }),
        ]),
      ]);

    await writeMenuSnapshot(
      "pos",
      LOCATION,
      payload({ menus: [priced(9.5)] as never }),
    );
    await writeMenuSnapshot("pos", "loc-2", {
      ...payload({ menus: [priced(12.5)] as never }),
      location_id: "loc-2",
    });

    // A resync of loc-1 must not touch loc-2's rows.
    await writeMenuSnapshot(
      "pos",
      LOCATION,
      payload({ menus: [priced(9.5)] as never }),
    );

    expect(await countIn("menus")).toBe(2);
    const priceAt = async (loc: string) =>
      (
        (await readMenuSnapshot(loc))!.menus[0].categories[0].items[0] as any
      ).menu_item.effective_price;
    expect(await priceAt(LOCATION)).toBe(9.5);
    expect(await priceAt("loc-2")).toBe(12.5);
  });
});

describe("images — base64 never enters the database", () => {
  it("stores the on-disk path for an item and drops a category blob", async () => {
    const blob = "x".repeat(400);
    const source = payload({
      menus: [
        {
          ...menu("menu-lunch", []),
          categories: [
            {
              ...categoryEntry("mc-1", "cat-burgers", [
                itemEntry("ci-1", "item-burger", "cat-burgers", {}, {
                  image: blob,
                }),
              ]),
              category: {
                id: "cat-burgers",
                name: "Burgers",
                description: null,
                image: blob,
                location_id: null,
                has_location_override: false,
                has_menu_category_override: false,
              },
            },
          ],
        },
      ] as never,
    });

    await writeMenuSnapshot("pos", LOCATION, source);

    // Scan every menu table for the blob — the point is that it is nowhere.
    for (const table of [
      "menus",
      "menu_categories",
      "menu_items",
      "modifier_groups",
    ]) {
      const rows = await getDb()!.getAllAsync<Record<string, unknown>>(
        `SELECT * FROM ${table}`,
      );
      expect(JSON.stringify(rows)).not.toContain(blob);
    }

    const back = await readMenuSnapshot(LOCATION);
    const item = (back!.menus[0].categories[0].items[0] as any).menu_item;
    // Item images have a deterministic on-disk file written by
    // resolveMenuImage; category images do not, so a category blob is dropped
    // rather than pointed at a path that will never exist.
    expect(item.image).toContain("item-burger.jpg");
    expect(back!.menus[0].categories[0].category.image).toBeNull();
  });
});

describe("station policy at the write boundary", () => {
  it("lets a kiosk hold the menu — it is an ordering surface", async () => {
    const result = await writeMenuSnapshot("kiosk", LOCATION, payload());
    expect(result?.rejected).toBe(false);
    expect(await countIn("menus")).toBe(1);
  });

  it("refuses the menu on a KDS — item names ride on the ticket", async () => {
    const result = await writeMenuSnapshot("kds", LOCATION, payload());
    expect(result?.rejected).toBe(true);
    expect(await countIn("menus")).toBe(0);
    expect(await countIn("menu_bootstrap")).toBe(0);
  });

  /**
   * The replace scope is a DELETE, and a DELETE against a table this station
   * may not hold is as much a policy violation as a write. Asserted directly
   * because it is the one path where the batch's tables and the batch's
   * *targets* differ.
   */
  it("refuses a batch whose replace scope reaches a forbidden table", async () => {
    const batch = mapMenuPayloadToBatch(payload(), LOCATION, TS);
    const result = await writeBatch(ENTITIES.menu, "kds", LOCATION, {
      root: [],
      replaceScope: batch.replaceScope,
    });
    expect(result.rejected).toBe(true);
  });
});

describe("freshness — the stamp the banner reads", () => {
  async function syncState() {
    return getDb()!.getFirstAsync<{
      watermark: string | null;
      last_success_at: string | null;
      row_count: number | null;
    }>(
      `SELECT watermark, last_success_at, row_count FROM sync_state
        WHERE entity = 'menu' AND location_id = ?`,
      [LOCATION],
    );
  }

  it("records the version as the watermark and stamps the sync", async () => {
    const source = payload();
    await writeMenuSnapshot("pos", LOCATION, source);

    const state = await syncState();
    expect(state?.watermark).toBe(source.version);
    expect(state?.last_success_at).toBeTruthy();
    expect(state?.row_count).toBe(1);
  });

  /**
   * The version-unchanged path in PosSyncProvider. A live sync landed and
   * PROVED the menu current; nothing needs rewriting, but the stamp does —
   * without this it ages all service on a menu nothing is wrong with, and the
   * banner goes amber on a menu that is provably correct.
   */
  it("advances the stamp without touching a single row", async () => {
    await writeMenuSnapshot("pos", LOCATION, payload());
    const before = await syncState();
    const rowsBefore = await getDb()!.getAllAsync(
      `SELECT * FROM menu_items ORDER BY id`,
    );

    await new Promise((r) => setTimeout(r, 5));
    await touchMenuFreshness("pos", LOCATION, payload());

    const after = await syncState();
    expect(after!.last_success_at! > before!.last_success_at!).toBe(true);
    expect(await getDb()!.getAllAsync(`SELECT * FROM menu_items ORDER BY id`))
      .toEqual(rowsBefore);
  });

  /**
   * The first boot after the flag is turned on: the store hydrated from the
   * MMKV snapshot, the live sync returns the SAME version, and the caller
   * therefore takes the skip path. Stamping and returning there would leave
   * the mirror empty forever — the version never changes again, so the skip
   * path is the only one that ever runs.
   */
  it("writes the mirror in full when the version matched but the mirror is empty", async () => {
    expect(await countIn("menus")).toBe(0);

    await touchMenuFreshness("pos", LOCATION, payload());

    expect(await readMenuSnapshot(LOCATION)).toEqual(payload());
  });

  it("rewrites the mirror when it holds a DIFFERENT version", async () => {
    await writeMenuSnapshot("pos", LOCATION, payload({ version: "old" }));

    await touchMenuFreshness("pos", LOCATION, payload({ version: "new" }));

    expect((await syncState())?.watermark).toBe("new");
    expect((await readMenuSnapshot(LOCATION))?.version).toBe("new");
  });
});

describe("query plan — the boot read must be an index scan, not a sort", () => {
  /**
   * Phase 3's own A1: the index shipped for Previous Orders was partial, the
   * query could never use it, and TEN result-correctness tests said nothing —
   * because a wrong plan returns the right rows, just slowly, and only once the
   * table is full. This read runs on the boot path, so the same mistake here
   * costs first paint on exactly the launch that has no network to fall back on.
   */
  it("uses the ordinal indexes with no temp b-tree", async () => {
    await writeMenuSnapshot("pos", LOCATION, payload());

    for (const [name, sql] of Object.entries(MENU_SNAPSHOT_STATEMENTS)) {
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

describe("money", () => {
  it("promotes minor units for SQL and keeps the server value in payload", async () => {
    await writeMenuSnapshot(
      "pos",
      LOCATION,
      payload({
        menus: [
          menu("menu-lunch", [
            categoryEntry("mc-1", "cat-burgers", [
              itemEntry("ci-1", "item-burger", "cat-burgers", {}, {
                effective_price: 12.35,
                effective_cash_price: 11.99,
              }),
            ]),
          ]),
        ] as never,
      }),
    );

    const row = await getDb()!.getFirstAsync<{
      price_minor: number;
      cash_price_minor: number;
      payload: string;
    }>(`SELECT price_minor, cash_price_minor, payload FROM menu_items`);

    expect(row!.price_minor).toBe(1235);
    expect(row!.cash_price_minor).toBe(1199);
    // The integer is for aggregation only — the exact server value survives.
    expect(JSON.parse(row!.payload).menu_item.effective_price).toBe(12.35);
  });
});
