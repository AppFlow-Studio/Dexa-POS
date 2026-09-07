/**
 * Inventory mirror — Phase 5. The stock catalog and vendor list, decomposed
 * into real tables and reassembled into the exact inputs the live sync mapped.
 *
 * ---------------------------------------------------------------------------
 * Why this is a snapshot and not a delta
 * ---------------------------------------------------------------------------
 * `inventory_items` has an `updated_at`, so a keyset delta LOOKS available —
 * and that is the trap. The numbers this screen exists to show are not on that
 * table. Stock quantity is resolved out of `location_inventory_stock`, and
 * effective cost and reorder point out of `location_inventory_overrides`, both
 * keyed per location; `get_pos_inventory_sync` is what joins them. Paging
 * `inventory_items` by `updated_at` would mirror the MERCHANT-level row and
 * miss every per-location resolution — a catalog that looks right and reports
 * the wrong stock, which is worse than one that is visibly missing.
 *
 * Nor can the resolution be re-implemented here: that is a second source of
 * truth for how much of something the restaurant has. One resolver,
 * server-side, forever — the same rule §7 sets for menu prices.
 *
 * So the RPC hands back the whole resolved catalog, and this module replaces
 * the location's inventory wholesale each time. `EntityBatch.replaceScope` is
 * what makes the replace a DELETION as well as an update: an item deactivated
 * or removed simply has no row in the next payload, and an upsert alone would
 * leave it in the catalog forever.
 *
 * ---------------------------------------------------------------------------
 * What is stored, and why it is the raw rows
 * ---------------------------------------------------------------------------
 * `payload` holds the WIRE rows — `{rpc, row}` per item, the selected vendor
 * row per vendor — not a mapped `InventoryItem`. `readInventorySnapshot`
 * rebuilds those inputs and runs `mapInventorySyncPayload`, the same function
 * the live path runs. One transform, so "offline shows what online shows"
 * reduces to "the inputs round-trip" — a property a test can assert, rather
 * than an intention two mapping copies have to keep agreeing on.
 *
 * The promoted columns (`current_stock`, `reorder_point`, `cost_per_unit_minor`
 * …) exist for SQL to filter and sort on — a low-stock query, a vendor rollup.
 * Nothing displayed is ever read from them, and money follows the §7.1 rule:
 * minor units for aggregation, the server's own value in `payload`.
 */
import { ENTITIES, type EntityDescriptor } from "@/lib/db/entities";
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
import {
  mapInventorySyncPayload,
  type DirectInventoryRow,
  type InventorySyncData,
  type RawInventorySync,
  type RawVendorRow,
  type RpcInventoryRow,
} from "@/lib/inventory/inventorySyncPayload";

/** Every table the inventory snapshot owns. Cleared and rewritten as one unit. */
const INVENTORY_TABLES: TableName[] = ["inventory_items", "vendors"];

const inventoryEntity = (): EntityDescriptor => ENTITIES.inventory;

/**
 * One prefix for every line this module logs, so `adb logcat | grep LocalDB`
 * shows the whole life of the mirror. Not __DEV__-gated, for the same reason
 * the menu's is not: "did the catalog actually clone?" is the question the
 * phase turns on, and a release build has to be able to answer it during the
 * soak.
 */
const LOG = "[LocalDB][inventory]";

/** Run a read on the read connection; take the mutex only on the fallback. */
function runOnRead<T>(fn: () => Promise<T>): Promise<T> {
  return hasDedicatedReadConnection() ? fn() : dbWriteMutex.runExclusive(fn);
}

/**
 * Wait for the database rather than asking whether it happens to be open.
 *
 * Phase 4 lost this race at every cold boot: `isLocalDbReady()` at the top of a
 * read returns false while `initLocalDb()` is still in flight, the read
 * silently falls back to the network and the write is silently skipped, so the
 * mirror stays empty while the flag looks like it works. `initLocalDb()` is
 * idempotent and shares its in-flight promise, so awaiting costs nothing.
 */
async function ensureDb(): Promise<boolean> {
  return (await initLocalDb()) !== null;
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

/**
 * Decompose one raw sync into rows.
 *
 * Exported for the round-trip test, which is the only thing that can prove the
 * decomposition and the reassembly agree — a mapping bug here is silent
 * otherwise, because a catalog that came back subtly wrong still renders.
 *
 * `_ordinal` is the position in the array the live mapping PRODUCED, not the
 * position in either input: the mapper emits RPC-resolved items first and
 * direct-only items after, and that combined order is what has to come back.
 * Numbering by the output means one `ORDER BY _ordinal` reproduces it, with no
 * knowledge of the merge rule on the read side.
 */
export function mapInventorySyncToBatch(
  raw: RawInventorySync,
  locationId: string,
  seenAt: string,
): EntityBatch {
  const itemRowMap = new Map(raw.itemRows.map((row) => [row.id, row]));
  const rpcRowMap = new Map(raw.rpcRows.map((row) => [row.id, row]));

  // The mapper's own order: RPC rows that have a direct row, then the direct
  // rows that had no RPC row. Rebuilt here rather than imported so the row
  // universe and the ordinals come from one walk.
  const resolvedIds = raw.rpcRows
    .filter((i) => itemRowMap.has(i.id))
    .map((i) => i.id);
  const resolvedIdSet = new Set(resolvedIds);
  const directOnlyIds = raw.itemRows
    .filter((row) => !resolvedIdSet.has(row.id))
    .map((row) => row.id);

  const root: Row[] = [...resolvedIds, ...directOnlyIds].map((id, index) =>
    toItemRow(
      id,
      rpcRowMap.get(id) ?? null,
      itemRowMap.get(id) ?? null,
      locationId,
      index,
      seenAt,
    ),
  );

  const vendorRows: Row[] = raw.vendorRows.map((vendor, index) =>
    toVendorRow(vendor, locationId, index, seenAt),
  );

  return {
    root,
    children: { vendors: vendorRows },
    // The pull returns the COMPLETE set every time, so the location is cleared
    // inside the same transaction as the insert. A failed sync can then never
    // leave the location holding nothing.
    replaceScope: INVENTORY_TABLES,
  };
}

/**
 * Persist a freshly synced catalog.
 *
 * Never throws: the mirror is an accelerator through the whole of Track A, so a
 * failure here costs the next entry's offline paint, never the live sync that
 * produced the payload.
 */
export async function writeInventorySnapshot(
  station: StationKind,
  locationId: string,
  raw: RawInventorySync,
): Promise<WriteResult | null> {
  if (!(await ensureDb())) {
    console.warn(`${LOG} write SKIPPED — local DB unavailable`);
    return null;
  }

  // An empty catalog is never worth persisting: it would replace a good
  // snapshot with the blank list this mirror exists to prevent. A location
  // genuinely holding zero inventory items is indistinguishable from a
  // half-failed fetch here, and of the two possible mistakes, keeping a stale
  // catalog is the recoverable one — the next sync corrects it, while a
  // wrongly-emptied catalog stays empty until someone notices.
  if (!raw.itemRows.length && !raw.vendorRows.length) {
    console.warn(`${LOG} write SKIPPED — payload has no items and no vendors`);
    return null;
  }

  const started = Date.now();
  const seenAt = new Date().toISOString();
  const batch = mapInventorySyncToBatch(raw, locationId, seenAt);

  const result = await writeBatch(
    inventoryEntity(),
    station,
    locationId,
    batch,
    // There is no version token to page against — the watermark IS the moment
    // the catalog was confirmed, which is what the freshness stamp reads.
    { value: seenAt, id: null },
    { lastSuccessAt: seenAt, lastError: null },
  );

  console.log(
    `${LOG} ${result.committed ? "WROTE" : result.rejected ? "REFUSED (station policy)" : "FAILED"}` +
      ` station=${station} loc=${locationId}` +
      ` items=${batch.root.length}` +
      ` vendors=${batch.children?.vendors?.length ?? 0}` +
      ` ms=${Date.now() - started}`,
  );

  return result;
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

interface StoredItemRow {
  id: string;
  payload: string;
}
interface StoredVendorRow {
  payload: string;
}

/**
 * The two reads, exported so the query-plan test binds to the SQL that SHIPS.
 *
 * Phase 3 shipped a partial index the one query it was built for could never
 * use, and ten correctness tests said nothing — a wrong plan returns the right
 * rows, just slowly, and only once the table is full. A plan test that rebuilds
 * its own SELECT keeps passing after the real one stops using the index, so it
 * has to assert against these exact strings.
 *
 * Each ORDER BY matches its index term for term — `idx_ii_ord`, `idx_v_ord`.
 */
export const INVENTORY_SNAPSHOT_STATEMENTS = {
  items: `SELECT id, payload FROM inventory_items
           WHERE location_id = ? ORDER BY _ordinal ASC`,
  vendors: `SELECT payload FROM vendors
             WHERE location_id = ? ORDER BY _ordinal ASC`,
} as const;

/**
 * Rebuild the raw sync inputs this location last stored, or null if it never
 * has.
 *
 * Exported separately from `readInventorySnapshot` because the raw inputs are
 * what the round-trip test compares: mapping first would hide an input that
 * came back wrong in a way the mapping happens to paper over.
 */
export async function readRawInventorySync(
  locationId: string,
): Promise<RawInventorySync | null> {
  if (!(await ensureDb())) {
    console.warn(`${LOG} read MISS — local DB unavailable`);
    return null;
  }

  const db = getReadDb();
  if (!db) return null;

  try {
    const [storedItems, storedVendors] = await runOnRead(async () => [
      await db.getAllAsync<StoredItemRow>(INVENTORY_SNAPSHOT_STATEMENTS.items, [
        locationId,
      ]),
      await db.getAllAsync<StoredVendorRow>(
        INVENTORY_SNAPSHOT_STATEMENTS.vendors,
        [locationId],
      ),
    ]);

    if (!storedItems.length && !storedVendors.length) return null;

    const rpcRows: RpcInventoryRow[] = [];
    const itemRows: DirectInventoryRow[] = [];
    for (const stored of storedItems) {
      const parsed = parseJson<{
        rpc: RpcInventoryRow | null;
        row: DirectInventoryRow | null;
      } | null>(stored.payload, null);
      if (!parsed) continue;
      if (parsed.rpc) rpcRows.push(parsed.rpc);
      if (parsed.row) itemRows.push(parsed.row);
    }

    const vendorRows: RawVendorRow[] = [];
    for (const stored of storedVendors) {
      const parsed = parseJson<RawVendorRow | null>(stored.payload, null);
      if (parsed) vendorRows.push(parsed);
    }

    return { rpcRows, itemRows, vendorRows };
  } catch (error) {
    console.warn(`${LOG} read FAILED:`, error);
    return null;
  }
}

/**
 * The catalog this location last synced, mapped by the SAME function the live
 * path uses, or null if the mirror holds nothing for it.
 */
export async function readInventorySnapshot(
  locationId: string,
): Promise<InventorySyncData | null> {
  const started = Date.now();
  const raw = await readRawInventorySync(locationId);
  if (!raw) {
    console.log(
      `${LOG} read MISS loc=${locationId} — falling back to the network.` +
        ` Check EXPO_PUBLIC_LOCAL_INVENTORY=1 and that a sync has landed once.`,
    );
    return null;
  }

  const mapped = mapInventorySyncPayload(raw, locationId);
  console.log(
    `${LOG} read HIT loc=${locationId} items=${mapped.inventoryItems.length}` +
      ` vendors=${mapped.vendors.length} ms=${Date.now() - started}`,
  );
  return mapped;
}

// ---------------------------------------------------------------------------
// Row mapping
// ---------------------------------------------------------------------------

/**
 * One catalog row.
 *
 * The promoted columns take the DIRECT row's values wherever it has them,
 * matching the precedence the live mapping uses — so a low-stock SQL query and
 * the rendered list cannot disagree about which items are low. `current_stock`
 * is the one exception and it is deliberate: it holds the RPC's per-location
 * resolved `stock_quantity`, because that is the number the app shows and
 * therefore the only one worth indexing.
 */
function toItemRow(
  id: string,
  rpc: RpcInventoryRow | null,
  row: DirectInventoryRow | null,
  locationId: string,
  ordinal: number,
  seenAt: string,
): Row {
  return {
    id,
    location_id: locationId,
    vendor_id: row?.vendor_id ?? null,
    name: row?.name ?? rpc?.name ?? null,
    category: row?.category ?? null,
    current_stock: numOrNull(rpc?.stock_quantity ?? row?.current_stock),
    unit_type: row?.unit_type ?? rpc?.unit_type ?? null,
    reorder_point: numOrNull(
      row?.reorder_point ?? rpc?.effective_reorder_point ?? rpc?.reorder_point,
    ),
    cost_per_unit_minor: toMinor(row?.cost_per_unit ?? rpc?.effective_cost),
    stock_mode: row?.stock_mode ?? rpc?.stock_mode ?? null,
    // Both selects filter on is_active = true, so every row that reaches the
    // mirror is active by construction. Stored anyway rather than assumed: the
    // column is what `idx_ii_loc` keys on, and a future select that relaxes the
    // filter should not silently mark everything active.
    is_active: 1,
    created_at: null,
    updated_at: row?.updated_at ?? rpc?.updated_at ?? null,
    _ordinal: ordinal,
    _server_seen_at: seenAt,
    payload: JSON.stringify({ rpc, row }),
  };
}

function toVendorRow(
  vendor: RawVendorRow,
  locationId: string,
  ordinal: number,
  seenAt: string,
): Row {
  return {
    id: vendor.id,
    location_id: locationId,
    name: vendor.name ?? null,
    is_active: 1,
    updated_at: null,
    _ordinal: ordinal,
    _server_seen_at: seenAt,
    payload: JSON.stringify(vendor),
  };
}

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
