/**
 * Customer directory mirror — Phase 5.
 *
 * ---------------------------------------------------------------------------
 * What this actually fixes, which is not primarily an offline gap
 * ---------------------------------------------------------------------------
 * Today `fetchAndCacheCustomers` pulls `.limit(200)` ordered by
 * `last_order_date` into MMKV, and every consumer — the bill's CustomerSheet,
 * the waitlist form, the reservations panel — filters THAT ARRAY in JS. So a
 * regular who last visited a few months ago at a busy location cannot be found
 * at all, with or without a connection. The type-ahead is not a network search
 * that degrades offline; it is a client-side scan of a truncated list that is
 * equally truncated online.
 *
 * The mirror raises that window from 200 to 5,000 and makes the scan a SQL
 * one. Offline coverage is the second benefit, not the first.
 *
 * ---------------------------------------------------------------------------
 * Why this is a snapshot and not a delta
 * ---------------------------------------------------------------------------
 * `public.customers.updated_at` is NULLABLE. A keyset cursor on a nullable
 * column is not a cursor: `.gte(col, since)` drops every NULL row from the
 * result silently, so a customer whose `updated_at` was never written would be
 * invisible to the mirror permanently, and ordering by it is unstable. This is
 * the same fact that kept `table_sessions` out of the analytics mirror. The
 * difference is only that a customer directory is small enough to replace
 * wholesale and a session history is not.
 *
 * `replaceScope` is what makes the replace express a DELETION as well as an
 * update — a customer merged away or deactivated has no row in the next
 * payload, and an upsert alone would keep them in the directory forever.
 *
 * ---------------------------------------------------------------------------
 * The scope bend, stated once
 * ---------------------------------------------------------------------------
 * Remote `customers` is MERCHANT-scoped and carries no location. The local
 * table has a `location_id` anyway, meaning "the location this row was
 * mirrored for", because the entire write boundary keys on that column. See
 * the note above the DDL in lib/db/schema.ts. `merchant_id` is preserved
 * verbatim alongside it, and `payload` holds the server's row untouched.
 */
import { ENTITIES, type EntityDescriptor } from "@/lib/db/entities";
import { caseFold } from "@/lib/db/descriptors/orders";
import { getReadDb, hasDedicatedReadConnection, initLocalDb } from "@/lib/db/index";
import { toMinor } from "@/lib/db/money";
import type { StationKind } from "@/lib/db/policy";
import {
  dbWriteMutex,
  writeBatch,
  type EntityBatch,
  type Row,
  type WriteResult,
} from "@/lib/db/write";

const LOG = "[LocalDB][customers]";

/**
 * How many customers one fetch brings back.
 *
 * This MUST equal the entity's `retention.maxRows`. The two describe the same
 * window from opposite ends: the fetch bounds what arrives, the cap bounds what
 * is kept, and a mismatch means either the mirror prunes rows the payload still
 * contains (cap < fetch) or claims coverage it never fetched (cap > fetch). A
 * test asserts the equality rather than a comment asking for it.
 *
 * 200 was the old MMKV limit and the reason a three-month-old regular could not
 * be found. 5,000 is the Phase 1 workload-derived cap — at ~786 B/row that is
 * ~3.9 MB, well inside budget.
 */
export const CUSTOMER_FETCH_LIMIT = ENTITIES.customers.retention.maxRows ?? 5000;

function customersEntity(): EntityDescriptor {
  return ENTITIES.customers;
}

async function ensureDb(): Promise<boolean> {
  if (getReadDb()) return true;
  await initLocalDb();
  return !!getReadDb();
}

/** Digits only — mirrors the `replace(/\D/g, "")` the waitlist normalizes with. */
export function foldPhone(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const digits = value.replace(/\D/g, "");
  return digits.length > 0 ? digits : null;
}

function str(v: unknown): string | null {
  return v === null || v === undefined ? null : String(v);
}

function bool(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  return v ? 1 : 0;
}

/** A customer row as it arrives from `.from("customers").select("*")`. */
export interface ServerCustomer {
  id: string;
  [key: string]: unknown;
}

/**
 * Server row -> local columns. `id` MUST stay first (upsert key convention).
 *
 * `_ordinal` is the row's position in the payload, which preserves the
 * server's own `last_order_date DESC NULLS FIRST` ordering without
 * re-deriving it locally. Re-sorting on the promoted column would be a second
 * source of truth for "who is most recent", and would disagree the moment the
 * server's null handling and SQLite's differ — which they do.
 */
export function toCustomerRow(
  c: ServerCustomer,
  locationId: string,
  ordinal: number,
  seenAt: string,
): Row {
  return {
    id: c.id,
    location_id: locationId,
    merchant_id: str(c.merchant_id),
    name: str(c.name),
    phone: str(c.phone),
    email: str(c.email),
    address: str(c.address),
    is_active: bool(c.is_active),
    vip_level: str(c.vip_level),
    total_orders: (c.total_orders as number | null) ?? null,
    visits: (c.visits as number | null) ?? null,
    lifetime_spend_minor: toMinor(c.lifetime_spend as number | null),
    avg_spend_minor: toMinor(c.avg_spend as number | null),
    last_order_date: str(c.last_order_date),
    last_visit: str(c.last_visit),
    created_at: str(c.created_at),
    updated_at: str(c.updated_at),
    _ordinal: ordinal,
    // Folded at INGEST. SQLite's LIKE / LOWER / COLLATE NOCASE are ASCII-only
    // while the JS `.toLowerCase().includes()` these screens do today is not,
    // so folding at query time would quietly narrow the results for any name
    // outside ASCII. Same rule as orders._search_customer_name.
    _search_name: caseFold(str(c.name)),
    _search_phone: foldPhone(c.phone),
    _search_address: caseFold(str(c.address)),
    _server_seen_at: seenAt,
    payload: JSON.stringify(c),
  };
}

/** Server rows -> a batch ready for the write boundary. */
export function mapCustomersToBatch(
  rows: ServerCustomer[],
  locationId: string,
  seenAt: string,
): EntityBatch {
  return {
    root: rows.map((c, i) => toCustomerRow(c, locationId, i, seenAt)),
    // The fetch returns the complete top-N window every time, so a customer
    // absent from it must leave the mirror too.
    replaceScope: ["customers"],
  };
}

/**
 * Persist a freshly fetched directory.
 *
 * Never throws: the mirror is an accelerator through the whole of Track A, so a
 * failure here costs the next screen's offline paint, never the live fetch that
 * produced the payload.
 */
export async function writeCustomersSnapshot(
  station: StationKind,
  locationId: string,
  rows: ServerCustomer[],
): Promise<WriteResult | null> {
  if (!(await ensureDb())) {
    console.warn(`${LOG} write SKIPPED — local DB unavailable`);
    return null;
  }

  // An empty payload is never worth persisting: it would replace a good
  // directory with the blank list this mirror exists to prevent. A merchant
  // genuinely holding zero customers is indistinguishable from a half-failed
  // fetch here, and of the two possible mistakes, keeping a stale directory is
  // the recoverable one — the next fetch corrects it, while a wrongly-emptied
  // one stays empty until someone notices they cannot find anybody.
  if (rows.length === 0) {
    console.warn(`${LOG} write SKIPPED — payload has no customers`);
    return null;
  }

  const started = Date.now();
  const seenAt = new Date().toISOString();
  const batch = mapCustomersToBatch(rows, locationId, seenAt);

  const result = await writeBatch(
    customersEntity(),
    station,
    locationId,
    batch,
    // No version token and no per-row clock — the watermark IS the moment the
    // directory was confirmed, which is what the freshness stamp reads.
    { value: seenAt, id: null },
    { lastSuccessAt: seenAt, lastError: null },
  );

  console.log(
    `${LOG} ${result.committed ? "WROTE" : result.rejected ? "REFUSED (station policy)" : "FAILED"}` +
      ` station=${station} loc=${locationId} rows=${batch.root.length}` +
      ` ms=${Date.now() - started}`,
  );

  return result;
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

/** Same read-connection rule as historyQuery: mutex only on the fallback. */
export function runOnRead<T>(fn: () => Promise<T>): Promise<T> {
  return hasDedicatedReadConnection() ? fn() : dbWriteMutex.runExclusive(fn);
}

/**
 * Rebuild the server rows verbatim from `payload`, in the server's order.
 *
 * Returning the payload rather than the promoted columns is the same choice
 * inventory's ③ made: what the screens render is the server's own row, so the
 * mirror round-trips its input instead of handing back a reconstruction that
 * two mapping copies have to keep agreeing on.
 */
export async function readCustomerPayloads(
  rows: { payload: string }[],
): Promise<ServerCustomer[]> {
  const out: ServerCustomer[] = [];
  for (const r of rows) {
    try {
      out.push(JSON.parse(r.payload) as ServerCustomer);
    } catch {
      // One malformed payload must not empty the directory.
    }
  }
  return out;
}
