/**
 * Menu mirror — Phase 4. The `get_pos_bootstrap_v1` envelope, decomposed into
 * real tables and reassembled byte-for-byte on the way out.
 *
 * ---------------------------------------------------------------------------
 * Why this is a snapshot and not a delta
 * ---------------------------------------------------------------------------
 * Every other mirrored entity has a per-row change clock the engine can page
 * against. The menu does not, and cannot: effective price and availability are
 * resolved server-side out of five override tables (location_menus,
 * location_item_overrides, location_menu_item_overrides,
 * location_category_overrides, location_modifier_group_overrides), so "which
 * rows changed since X" is not a question the remote schema can answer without
 * re-implementing price resolution on the device — a second source of truth
 * for what an item costs. One resolver, server-side, forever.
 *
 * So the RPC hands back the whole resolved tree behind one opaque `version`
 * token, and this module replaces the location's menu wholesale whenever that
 * token moves. `EntityBatch.replaceScope` is what makes the replace a DELETION
 * as well as an update — an item removed from the menu has no row in the new
 * payload, and an upsert alone would leave it ringing up forever.
 *
 * ---------------------------------------------------------------------------
 * Why the round trip has to be exact
 * ---------------------------------------------------------------------------
 * `readMenuSnapshot()` rebuilds a `PosSyncData` and hands it to the SAME
 * `setMenuData` a live sync uses. That is deliberate, and it is the same rule
 * Phase 3 follows for Previous Orders: one transform, so a menu rendered from
 * disk cannot diverge from a menu rendered from the network. It only holds if
 * what comes back out is what went in, which is why every level of the tree
 * keeps its server object verbatim in `payload` and its position in `_ordinal`.
 *
 * IMAGES. Base64 blobs never enter the database — `resolveMenuImage` has
 * already written them to disk, so the mirror stores the deterministic
 * `file://` path instead (the same swap `menuOfflineCache` makes, for the same
 * reason: a multi-MB payload has no business in a row we read at boot). A
 * missing file degrades to a card with no photo, which the next sync repairs.
 */
import {
  ENTITIES,
  type EntityDescriptor,
} from "@/lib/db/entities";
import {
  getReadDb,
  hasDedicatedReadConnection,
  initLocalDb,
} from "@/lib/db/index";
import { toMinor } from "@/lib/db/money";
import type { StationKind } from "@/lib/db/policy";
import type { TableName } from "@/lib/db/schema";
import {
  dbWriteMutex,
  writeBatch,
  type EntityBatch,
  type Row,
  type WriteResult,
} from "@/lib/db/write";
import { menuImagePath } from "@/services/menuImageCache";
import type {
  ActiveModifierSnoozeSync,
  ActiveSnoozeSync,
  MenuItemIngredientSync,
  MenuWithCategories,
  ModifierIngredientSync,
  PosSyncData,
} from "@/types/menu";

/** Every table the menu snapshot owns. Cleared and rewritten as one unit. */
const MENU_TABLES: TableName[] = [
  "menus",
  "menu_categories",
  "menu_items",
  "modifier_groups",
  "menu_item_modifier_groups",
  "menu_bootstrap",
];

const menuEntity = (): EntityDescriptor => ENTITIES.menu;

/**
 * One prefix for every line this module logs, so `adb logcat | grep LocalDB`
 * shows the whole life of the mirror: written, confirmed, read, or missing.
 *
 * NOT dev-gated, unlike the orders shadow log. These fire a handful of times
 * per session and they are the only answer to "did the menu actually clone?" —
 * a question a release build has to be able to answer during the soak.
 */
const LOG = "[LocalDB][menu]";

/** Run a read on the read connection; take the mutex only on the fallback. */
function runOnRead<T>(fn: () => Promise<T>): Promise<T> {
  return hasDedicatedReadConnection() ? fn() : dbWriteMutex.runExclusive(fn);
}

/**
 * Wait for the database, rather than asking whether it happens to be open yet.
 *
 * Every entry point here runs at boot, and `initLocalDb()` is kicked off from a
 * sibling effect in the same commit — so an `isLocalDbReady()` check races it
 * and loses. That race is not a crash, which is what makes it dangerous: the
 * read silently falls back to MMKV and the write is silently skipped, so the
 * mirror stays empty forever and the flag looks like it works while doing
 * nothing. `initLocalDb()` is idempotent and shares its in-flight promise, so
 * awaiting it here costs nothing beyond the open that was happening anyway,
 * and still returns null on a device where SQLite is unavailable.
 */
async function ensureDb(): Promise<boolean> {
  return (await initLocalDb()) !== null;
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

/**
 * Decompose one bootstrap payload into rows.
 *
 * Exported for the round-trip test, which is the only thing that can prove the
 * decomposition and the reassembly agree — a mapping bug here is silent
 * otherwise, because a menu that came back subtly wrong still renders.
 */
export function mapMenuPayloadToBatch(
  data: PosSyncData,
  locationId: string,
  seenAt: string,
): EntityBatch {
  const menus: Row[] = [];
  const categories: Row[] = [];
  const items: Row[] = [];
  const modifierGroups = new Map<string, Row>();
  const itemModifierLinks = new Map<string, Row>();

  (data.menus ?? []).forEach((menu, menuIndex) => {
    menus.push(toMenuRow(menu, locationId, menuIndex, seenAt));

    (menu.categories ?? []).forEach((entry: any, catIndex) => {
      // Normalized ONCE and reused for the row's column and its items' foreign
      // key. Deriving it twice is how a category whose entry omits
      // `category_id` ends up with items keyed to "undefined" on write and to
      // "" on read — items that silently vanish from the rebuilt tree.
      const categoryId = categoryIdOf(entry);
      categories.push(
        toCategoryRow(entry, menu.id, categoryId, locationId, catIndex, seenAt),
      );

      (entry.items ?? []).forEach((itemEntry: any, itemIndex: number) => {
        // The RPC has been seen returning both the wrapped junction shape
        // ({ display_order, menu_item }) and a bare item — `mapSyncItem` in
        // useMenuStore tolerates both, so this must too.
        const detail = itemEntry?.menu_item ?? itemEntry;
        if (!detail?.id) return;

        items.push(
          toItemRow(
            itemEntry,
            detail,
            menu.id,
            categoryId,
            locationId,
            itemIndex,
            seenAt,
          ),
        );

        for (const group of detail.modifier_groups ?? []) {
          if (!group?.id) continue;
          if (!modifierGroups.has(group.id)) {
            modifierGroups.set(
              group.id,
              toModifierGroupRow(group, locationId, seenAt),
            );
          }
          const linkKey = `${detail.id}:${group.id}`;
          if (!itemModifierLinks.has(linkKey)) {
            itemModifierLinks.set(linkKey, {
              menu_item_id: String(detail.id),
              modifier_group_id: String(group.id),
              location_id: locationId,
              display_order: numOrNull(group.display_order),
            });
          }
        }
      });
    });
  });

  return {
    root: menus,
    children: {
      // menu_bootstrap first: it is the one row that must exist even when the
      // location has no menus at all, and its presence is what tells
      // readMenuSnapshot "this location HAS been synced" as opposed to "this
      // location synced and came back empty".
      menu_bootstrap: [toBootstrapRow(data, locationId, seenAt)],
      menu_categories: categories,
      menu_items: items,
      modifier_groups: [...modifierGroups.values()],
      menu_item_modifier_groups: [...itemModifierLinks.values()],
    },
    // Wholesale: an item pulled off the menu has no row in the new payload and
    // would otherwise survive every future upsert.
    replaceScope: MENU_TABLES,
  };
}

/**
 * Persist a freshly synced bootstrap payload.
 *
 * Never throws: the mirror is an accelerator through the whole of Track A, so
 * a failure here costs the next boot's offline paint, never the live sync that
 * produced the payload.
 */
export async function writeMenuSnapshot(
  station: StationKind,
  locationId: string,
  data: PosSyncData,
): Promise<WriteResult | null> {
  if (!(await ensureDb())) {
    console.warn(`${LOG} write SKIPPED — local DB unavailable`);
    return null;
  }
  // An empty menu is never worth persisting: it would replace a good snapshot
  // with the very blank grid this mirror exists to prevent. Same rule
  // menuOfflineCache applies, for the same reason.
  if (!data?.menus?.length) {
    console.warn(`${LOG} write SKIPPED — payload has no menus`);
    return null;
  }

  const started = Date.now();
  const seenAt = new Date().toISOString();
  const batch = mapMenuPayloadToBatch(stripInlineImages(data), locationId, seenAt);

  const result = await writeBatch(
    menuEntity(),
    station,
    locationId,
    batch,
    { value: data.version ?? data.synced_at ?? null, id: null },
    { lastSuccessAt: seenAt, lastError: null },
  );

  // Deliberately not __DEV__-gated. This fires a handful of times per session
  // (boot, manual sync, after a menu edit) and it is the single line that
  // answers "did the menu actually get cloned?" — which is the question the
  // whole phase turns on, and the one a release build currently cannot answer.
  const counts = batch.children ?? {};
  console.log(
    `${LOG} ${result.committed ? "WROTE" : result.rejected ? "REFUSED (station policy)" : "FAILED"}` +
      ` station=${station} loc=${locationId} version=${data.version ?? "(none)"}` +
      ` menus=${batch.root.length}` +
      ` categories=${counts.menu_categories?.length ?? 0}` +
      ` items=${counts.menu_items?.length ?? 0}` +
      ` groups=${counts.modifier_groups?.length ?? 0}` +
      ` links=${counts.menu_item_modifier_groups?.length ?? 0}` +
      ` ms=${Date.now() - started}`,
  );

  return result;
}

/**
 * Record "we checked, and the menu on screen is still current" without
 * rewriting a single row — and repair the mirror if it turns out not to hold
 * that menu at all.
 *
 * This is the version-unchanged path in PosSyncProvider: the rebuild is
 * skipped because the opaque watermark matched, but a live sync DID land and
 * DID confirm the menu. Without the stamp, freshness would age as though
 * nothing had been checked all service, and the banner would go amber on a
 * menu that is provably current.
 *
 * THE REPAIR IS NOT OPTIONAL, and the case it covers is the first boot after
 * this flag is turned on. The caller skips the rebuild because the version it
 * has APPLIED IN MEMORY matches — which says nothing about what is on disk. On
 * that boot the store was hydrated from the MMKV snapshot, so the mirror is
 * empty; stamping freshness and returning would leave it empty *forever*,
 * because the version never changes again and the skip path is the only one
 * that ever runs. One cheap read closes that.
 */
export async function touchMenuFreshness(
  station: StationKind,
  locationId: string,
  data: PosSyncData,
): Promise<void> {
  if (!(await ensureDb())) return;

  const version = data.version ?? null;
  if (!(await mirrorHoldsVersion(locationId, version))) {
    console.log(
      `${LOG} version matched in memory but NOT on disk — writing the mirror in full` +
        ` (loc=${locationId} version=${version ?? "(none)"})`,
    );
    await writeMenuSnapshot(station, locationId, data);
    return;
  }

  await writeBatch(
    menuEntity(),
    station,
    locationId,
    { root: [] },
    { value: version, id: null },
    { lastSuccessAt: new Date().toISOString(), lastError: null },
  );
  console.log(
    `${LOG} confirmed current — stamp only, no rows rewritten` +
      ` (loc=${locationId} version=${version ?? "(none)"})`,
  );
}

/** True when the mirror already holds exactly this location + version. */
async function mirrorHoldsVersion(
  locationId: string,
  version: string | null,
): Promise<boolean> {
  const db = getReadDb();
  if (!db) return false;
  try {
    const row = await runOnRead(() =>
      db.getFirstAsync<{ version: string | null }>(
        `SELECT version FROM menu_bootstrap WHERE location_id = ?`,
        [locationId],
      ),
    );
    // A payload with no version (pre-versioning snapshot) can never be proven
    // current, so it always reconciles rather than being assumed good.
    return !!row && !!version && row.version === version;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

interface MenuRow {
  id: string;
  payload: string;
}
interface CategoryRow {
  id: string;
  menu_id: string;
  payload: string;
}
interface ItemRow {
  menu_id: string;
  category_id: string;
  payload: string;
}
interface BootstrapRow {
  version: string | null;
  synced_at: string | null;
  menu_item_ingredients: string;
  modifier_group_item_ingredients: string;
  snoozes: string;
  modifier_snoozes: string;
}

/**
 * The three tree reads, exported so the query-plan test binds to the SQL that
 * SHIPS.
 *
 * Phase 3's review found a partial index that the one query it was built for
 * could never use, and ten result-correctness tests said nothing — because a
 * wrong plan returns the right rows, just slowly, and only once the table is
 * full. The plan test that caught it only works if it asserts against these
 * exact strings: a test that rebuilds its own SELECT keeps passing after the
 * real one stops using the index.
 *
 * Each ORDER BY matches its index term for term — `idx_m_loc`, `idx_mc_menu`,
 * `idx_mi_menu` — so all three are index scans with no temp b-tree.
 */
export const MENU_SNAPSHOT_STATEMENTS = {
  menus: `SELECT id, payload FROM menus
           WHERE location_id = ? ORDER BY _ordinal ASC`,
  categories: `SELECT id, menu_id, payload FROM menu_categories
                WHERE location_id = ? ORDER BY menu_id ASC, _ordinal ASC`,
  items: `SELECT menu_id, category_id, payload FROM menu_items
           WHERE location_id = ?
           ORDER BY menu_id ASC, category_id ASC, _ordinal ASC`,
} as const;

/**
 * Rebuild the `PosSyncData` this location last synced, or null if it never has.
 *
 * Four ordered queries and no joins: SQLite is on-device, the row counts are in
 * the hundreds, and the tree is reassembled in JS where the ordering is
 * explicit and testable. `_ordinal` — not `display_order`, which is nullable
 * and can tie — is what makes the output array order identical to the server's.
 */
export async function readMenuSnapshot(
  locationId: string,
): Promise<PosSyncData | null> {
  const started = Date.now();
  if (!(await ensureDb())) {
    console.warn(`${LOG} read MISS — local DB unavailable`);
    return null;
  }
  const db = getReadDb();
  if (!db) {
    console.warn(`${LOG} read MISS — no read handle`);
    return null;
  }

  try {
    const snapshot = await runOnRead(async () => {
      const envelope = await db.getFirstAsync<BootstrapRow>(
        `SELECT version, synced_at, menu_item_ingredients,
                modifier_group_item_ingredients, snoozes, modifier_snoozes
           FROM menu_bootstrap WHERE location_id = ?`,
        [locationId],
      );
      if (!envelope) return null;

      const menuRows = await db.getAllAsync<MenuRow>(
        MENU_SNAPSHOT_STATEMENTS.menus,
        [locationId],
      );
      if (menuRows.length === 0) return null;

      const categoryRows = await db.getAllAsync<CategoryRow>(
        MENU_SNAPSHOT_STATEMENTS.categories,
        [locationId],
      );
      const itemRows = await db.getAllAsync<ItemRow>(
        MENU_SNAPSHOT_STATEMENTS.items,
        [locationId],
      );

      // (menu_id, category_id) -> items, in ordinal order.
      const itemsByCategory = new Map<string, unknown[]>();
      for (const row of itemRows) {
        const key = `${row.menu_id}:${row.category_id}`;
        let list = itemsByCategory.get(key);
        if (!list) {
          list = [];
          itemsByCategory.set(key, list);
        }
        list.push(parseJson(row.payload, {}));
      }

      const categoriesByMenu = new Map<string, any[]>();
      for (const row of categoryRows) {
        const entry = parseJson<any>(row.payload, null);
        if (!entry) continue;
        // Same normalization the write side used — see categoryIdOf.
        entry.items =
          itemsByCategory.get(`${row.menu_id}:${categoryIdOf(entry)}`) ?? [];
        let list = categoriesByMenu.get(row.menu_id);
        if (!list) {
          list = [];
          categoriesByMenu.set(row.menu_id, list);
        }
        list.push(entry);
      }

      const menus: MenuWithCategories[] = [];
      for (const row of menuRows) {
        const menu = parseJson<any>(row.payload, null);
        if (!menu) continue;
        menu.categories = categoriesByMenu.get(row.id) ?? [];
        menus.push(menu as MenuWithCategories);
      }
      if (menus.length === 0) return null;

      return {
        version: envelope.version ?? undefined,
        synced_at: envelope.synced_at ?? "",
        location_id: locationId,
        menus,
        menu_item_ingredients: parseJson<MenuItemIngredientSync[]>(
          envelope.menu_item_ingredients,
          [],
        ),
        modifier_group_item_ingredients: parseJson<ModifierIngredientSync[]>(
          envelope.modifier_group_item_ingredients,
          [],
        ),
        snoozes: parseJson<ActiveSnoozeSync[]>(envelope.snoozes, []),
        modifierSnoozes: parseJson<ActiveModifierSnoozeSync[]>(
          envelope.modifier_snoozes,
          [],
        ),
      };
    });

    if (!snapshot) {
      console.log(
        `${LOG} read MISS — nothing mirrored for loc=${locationId}` +
          ` (never synced, or the last sync was refused/failed)`,
      );
      return null;
    }

    console.log(
      `${LOG} read HIT loc=${locationId} version=${snapshot.version ?? "(none)"}` +
        ` syncedAt=${snapshot.synced_at || "(none)"}` +
        ` menus=${snapshot.menus.length}` +
        ` items=${snapshot.menus.reduce(
          (n, m) =>
            n +
            (m.categories ?? []).reduce(
              (c, cat) => c + ((cat as any).items?.length ?? 0),
              0,
            ),
          0,
        )}` +
        ` snoozes=${snapshot.snoozes?.length ?? 0}` +
        ` ms=${Date.now() - started}`,
    );
    return snapshot;
  } catch (error) {
    // A mirror read must never break the boot path. No snapshot is a blank
    // grid for one launch; a thrown error is a dead provider.
    console.warn(`${LOG} read FAILED:`, error);
    return null;
  }
}

/**
 * Row-by-row census of what the menu mirror actually holds, logged once per
 * boot.
 *
 * The write and read logs only fire when something happens. This one fires
 * unconditionally, which is what makes it useful for the question being asked
 * on the floor: "is the menu cloned on this device, right now?" — answerable
 * before going offline, rather than discovered after.
 *
 * Reads only; never throws. Cheap enough for boot (six COUNT(*)s over tables
 * measured in hundreds of rows).
 */
export async function logMenuMirrorState(locationId: string): Promise<void> {
  if (!(await ensureDb())) return;
  const db = getReadDb();
  if (!db) return;

  try {
    const counts = await runOnRead(async () => {
      const out: Record<string, number> = {};
      for (const table of MENU_TABLES) {
        const row = await db.getFirstAsync<{ n: number }>(
          `SELECT COUNT(*) AS n FROM ${table} WHERE location_id = ?`,
          [locationId],
        );
        out[table] = row?.n ?? 0;
      }
      const envelope = await db.getFirstAsync<{
        version: string | null;
        synced_at: string | null;
      }>(
        `SELECT version, synced_at FROM menu_bootstrap WHERE location_id = ?`,
        [locationId],
      );
      const state = await db.getFirstAsync<{
        last_success_at: string | null;
        last_error: string | null;
      }>(
        `SELECT last_success_at, last_error FROM sync_state
          WHERE entity = 'menu' AND location_id = ?`,
        [locationId],
      );
      return { out, envelope, state };
    });

    const { out, envelope, state } = counts;
    console.log(
      `${LOG} MIRROR STATE loc=${locationId}` +
        ` menus=${out.menus} categories=${out.menu_categories}` +
        ` items=${out.menu_items} groups=${out.modifier_groups}` +
        ` links=${out.menu_item_modifier_groups}` +
        ` envelope=${out.menu_bootstrap}` +
        ` version=${envelope?.version ?? "(none)"}` +
        ` syncedAt=${envelope?.synced_at ?? "(none)"}` +
        ` lastSuccessAt=${state?.last_success_at ?? "(never)"}` +
        ` lastError=${state?.last_error ?? "none"}`,
    );
    if (out.menus === 0) {
      console.warn(
        `${LOG} MIRROR IS EMPTY for this location — an offline boot will fall` +
          ` back to the MMKV snapshot. Check EXPO_PUBLIC_LOCAL_MENU=1 and that` +
          ` a "WROTE" line appeared after the last menu sync.`,
      );
    }
  } catch (error) {
    console.warn(`${LOG} census failed:`, error);
  }
}

// ---------------------------------------------------------------------------
// Row mapping
// ---------------------------------------------------------------------------

function toBootstrapRow(
  data: PosSyncData,
  locationId: string,
  seenAt: string,
): Row {
  return {
    location_id: locationId,
    version: data.version ?? null,
    synced_at: data.synced_at ?? null,
    menu_item_ingredients: JSON.stringify(data.menu_item_ingredients ?? []),
    modifier_group_item_ingredients: JSON.stringify(
      data.modifier_group_item_ingredients ?? [],
    ),
    snoozes: JSON.stringify(data.snoozes ?? []),
    modifier_snoozes: JSON.stringify(data.modifierSnoozes ?? []),
    _server_seen_at: seenAt,
  };
}

/** `payload` is the menu MINUS categories — those live in their own table. */
function toMenuRow(
  menu: MenuWithCategories,
  locationId: string,
  ordinal: number,
  seenAt: string,
): Row {
  const { categories, ...rest } = menu as MenuWithCategories & {
    categories?: unknown;
  };
  return {
    id: String(menu.id),
    location_id: locationId,
    merchant_id: strOrNull(menu.merchant_id),
    name: strOrNull(menu.name),
    description: strOrNull(menu.description),
    is_active: menu.is_active ? 1 : 0,
    display_order: numOrNull(menu.display_order),
    created_at: strOrNull(menu.created_at),
    updated_at: strOrNull(menu.updated_at),
    _ordinal: ordinal,
    _server_seen_at: seenAt,
    payload: JSON.stringify(rest),
  };
}

/** `payload` is the junction entry MINUS items. */
function toCategoryRow(
  entry: any,
  menuId: string,
  categoryId: string,
  locationId: string,
  ordinal: number,
  seenAt: string,
): Row {
  const { items, ...rest } = entry ?? {};
  const category = entry?.category ?? {};
  return {
    id: String(entry?.id ?? `${menuId}:${categoryId}`),
    menu_id: menuId,
    category_id: categoryId,
    location_id: locationId,
    merchant_id: strOrNull(category.merchant_id),
    name: strOrNull(category.name),
    description: strOrNull(category.description),
    image: strOrNull(category.image),
    display_order: numOrNull(entry?.display_order),
    is_active: entry?.is_active === false ? 0 : 1,
    updated_at: strOrNull(category.updated_at ?? entry?.updated_at),
    _ordinal: ordinal,
    _server_seen_at: seenAt,
    payload: JSON.stringify(rest),
  };
}

/**
 * `payload` is the junction entry VERBATIM, nested `menu_item` and its
 * `modifier_groups` included — that whole object is what `mapSyncItem` reads,
 * so splitting it further would mean rebuilding it, and rebuilding it is how
 * the local and server renders drift.
 */
function toItemRow(
  entry: any,
  detail: any,
  menuId: string,
  categoryId: string,
  locationId: string,
  ordinal: number,
  seenAt: string,
): Row {
  // The category_items junction id, when the RPC sent the wrapped shape.
  // The bare-item shape carries no junction id of its own, so key it by
  // (category, item) — which is what that junction row IS.
  const junctionId =
    entry?.menu_item && entry.id
      ? String(entry.id)
      : `${categoryId}:${detail.id}`;

  return {
    id: junctionId,
    menu_id: menuId,
    menu_item_id: String(detail.id),
    category_id: categoryId,
    location_id: locationId,
    merchant_id: strOrNull(detail.merchant_id),
    name: String(detail.name ?? ""),
    description: strOrNull(detail.description),
    // Minor units for SQL to aggregate and sort. The exact server value stays
    // in payload and every display path reads it from there — lib/db/money.ts.
    price_minor: toMinor(detail.effective_price),
    cash_price_minor: toMinor(detail.effective_cash_price),
    availability: detail.effective_availability === false ? 0 : 1,
    image: strOrNull(detail.image),
    tax_category: strOrNull(detail.tax_category),
    is_tax_exempt: detail.is_tax_exempt ? 1 : 0,
    dietary_flags: jsonOrNull(detail.dietary_flags),
    allergens: jsonOrNull(detail.allergens),
    meal_types: jsonOrNull(detail.meal_types),
    display_order: numOrNull(entry?.display_order ?? detail.display_order),
    version: numOrNull(detail.version),
    updated_at: strOrNull(detail.updated_at),
    _ordinal: ordinal,
    _server_seen_at: seenAt,
    payload: JSON.stringify(entry),
  };
}

function toModifierGroupRow(
  group: any,
  locationId: string,
  seenAt: string,
): Row {
  return {
    id: String(group.id),
    location_id: locationId,
    name: strOrNull(group.name),
    display_order: numOrNull(group.display_order),
    is_required: group.is_required ? 1 : 0,
    min_selections: numOrNull(group.min_selections),
    max_selections: numOrNull(group.max_selections),
    updated_at: strOrNull(group.updated_at),
    _server_seen_at: seenAt,
    payload: JSON.stringify(group),
  };
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/**
 * The category id a menu-category junction entry points at.
 *
 * ONE definition, called from both the decomposition and the reassembly: this
 * value is the join key between a category row and its item rows, and the two
 * sides deriving it differently is a silent data loss, not an error.
 */
function categoryIdOf(entry: any): string {
  return String(entry?.category_id ?? entry?.category?.id ?? "");
}

/** True for a raw DB `image` value that is an inline base64 blob. */
function isBase64Image(value: unknown): value is string {
  return typeof value === "string" && value.length > 200 && !value.includes("://");
}

/**
 * Swap inline base64 blobs for the deterministic path `resolveMenuImage`
 * writes them to. Structural copy only — the live payload handed to
 * `setMenuData` is never touched.
 *
 * The same rule menuOfflineCache follows: item images have an on-disk file,
 * category images do not, so a category blob is dropped rather than pointed at
 * a path that will never exist.
 */
export function stripInlineImages(data: PosSyncData): PosSyncData {
  const menus = (data.menus ?? []).map((menu) => ({
    ...menu,
    categories: (menu.categories ?? []).map((catEntry: any) => ({
      ...catEntry,
      category: isBase64Image(catEntry?.category?.image)
        ? { ...catEntry.category, image: null }
        : catEntry?.category,
      items: (catEntry?.items ?? []).map((itemEntry: any) => {
        const wrapped = itemEntry?.menu_item;
        const item = wrapped ?? itemEntry;
        if (!item || !isBase64Image(item.image)) return itemEntry;
        const stripped = { ...item, image: menuImagePath(item.id) };
        return wrapped ? { ...itemEntry, menu_item: stripped } : stripped;
      }),
    })),
  }));

  return { ...data, menus } as PosSyncData;
}

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function strOrNull(v: unknown): string | null {
  return v === null || v === undefined ? null : String(v);
}

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Arrays land as JSON text; anything else nulls rather than stringifying "[object Object]". */
function jsonOrNull(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  return Array.isArray(v) ? JSON.stringify(v) : null;
}
