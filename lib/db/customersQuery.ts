/**
 * The LOCAL customer directory — the read half of the Phase 5 customers mirror.
 *
 * ---------------------------------------------------------------------------
 * The design decision that keeps this small
 * ---------------------------------------------------------------------------
 * Four screens read the directory today and each filters it slightly
 * differently: the bill's CustomerSheet matches name / phone / address, the
 * waitlist matches name and a digits-normalized phone, the reservations panel
 * matches its own way. Moving each of those filters into SQL would mean four
 * SQL predicates that have to stay in step with four JS ones — the exact
 * divergence historyQuery.ts exists to prevent, multiplied by four.
 *
 * So this query is deliberately a SUPERSET filter, not a replacement for any of
 * them. It narrows one location's directory (up to 5,000 rows) down to the
 * candidates that could possibly match on name, phone or address, and hands
 * that list back; each screen then runs its OWN unchanged filter over it. The
 * per-screen semantics stay exactly where they are and stay exactly what they
 * were. The only thing that changes is that the list being filtered is the
 * whole directory instead of the most recent 200.
 *
 * That is why the limit here is generous and the matching is loose. Narrowing
 * further would start making per-screen decisions this layer must not make.
 *
 * ---------------------------------------------------------------------------
 * Why the sort is `_ordinal` and not `last_order_date`
 * ---------------------------------------------------------------------------
 * The fetch orders by `last_order_date DESC NULLS FIRST` server-side, and
 * `_ordinal` records that order. Re-sorting on the promoted column here would
 * re-derive it, and SQLite's NULL ordering is not PostgREST's — the two would
 * disagree about where customers with no orders yet belong, which is most of a
 * new merchant's directory.
 */
import {
  readCustomerPayloads,
  runOnRead,
  type ServerCustomer,
} from "@/lib/db/descriptors/customers";
import { caseFold } from "@/lib/db/descriptors/orders";
import { ENTITIES } from "@/lib/db/entities";
import { getReadDb } from "@/lib/db/index";

/**
 * How many candidates the superset filter returns.
 *
 * Comfortably above the 200 the screens used to hold in full, and far below
 * the 5,000 cap — this is a type-ahead candidate list, not a data export. A
 * query loose enough to exceed it (a single letter) is one the operator is
 * still typing.
 */
export const CUSTOMER_SEARCH_LIMIT = 200;

/** Below this, a query is treated as "show me the directory" rather than a search. */
const MIN_QUERY_LENGTH = 2;

export interface CustomerSearchSpec {
  locationId: string;
  /** Raw user input. Empty or shorter than 2 chars returns the recent list. */
  query?: string;
  limit?: number;
}

/** Escape LIKE metacharacters so a literal % or _ cannot widen the match. */
function escapeLike(raw: string): string {
  return raw.replace(/[\\%_]/g, "\\$&");
}

/** Digits only, matching the folded `_search_phone` column. */
function queryDigits(raw: string): string {
  return raw.replace(/\D/g, "");
}

/**
 * One location's directory, narrowed to the candidates for `query`.
 *
 * Returns the server's own customer rows, rebuilt from `payload`, so callers
 * hand them straight to code that expects what the network returned. Returns
 * null when the local DB is unavailable — the caller falls back to the MMKV
 * cache, exactly as Previous Orders falls back to the server.
 */
export async function searchLocalCustomers(
  spec: CustomerSearchSpec,
): Promise<ServerCustomer[] | null> {
  const db = getReadDb();
  if (!db) return null;

  const limit = spec.limit ?? CUSTOMER_SEARCH_LIMIT;
  const raw = (spec.query ?? "").trim();

  return runOnRead(async () => {
    // Short or empty query: the directory itself, newest-first, which is what
    // these screens show before anyone types.
    if (raw.length < MIN_QUERY_LENGTH) {
      const rows = await db.getAllAsync<{ payload: string }>(
        `SELECT payload FROM customers
          WHERE location_id = ?
          ORDER BY _ordinal
          LIMIT ?`,
        [spec.locationId, limit],
      );
      return readCustomerPayloads(rows);
    }

    const folded = `%${escapeLike(caseFold(raw) ?? "")}%`;
    const digits = queryDigits(raw);

    // The phone arm only participates when the query actually contains digits.
    // Without that guard, a name search for "Ann" would fold to an empty digit
    // string and `LIKE '%%'` would match every row that has a phone — turning
    // every name search into a full directory return.
    const clauses = ["_search_name LIKE ? ESCAPE '\\'", "_search_address LIKE ? ESCAPE '\\'"];
    const params: (string | number)[] = [spec.locationId, folded, folded];
    if (digits.length > 0) {
      clauses.push("_search_phone LIKE ? ESCAPE '\\'");
      params.push(`%${escapeLike(digits)}%`);
    }
    params.push(limit);

    const rows = await db.getAllAsync<{ payload: string }>(
      `SELECT payload FROM customers
        WHERE location_id = ?
          AND (${clauses.join(" OR ")})
        ORDER BY _ordinal
        LIMIT ?`,
      params,
    );
    return readCustomerPayloads(rows);
  });
}

/**
 * The busiest customers, for CustomerSheet's "top customers" strip.
 *
 * Previously computed by sorting the 200-row cache in JS, which made it "the
 * top 3 of the most recent 200" rather than the top 3 — a different list, and
 * a wrong one, whenever a regular had not been in lately.
 */
export async function topLocalCustomers(
  locationId: string,
  limit = 3,
): Promise<ServerCustomer[] | null> {
  const db = getReadDb();
  if (!db) return null;

  return runOnRead(async () => {
    const rows = await db.getAllAsync<{ payload: string }>(
      `SELECT payload FROM customers
        WHERE location_id = ? AND COALESCE(total_orders, 0) > 0
        ORDER BY total_orders DESC, _ordinal
        LIMIT ?`,
      [locationId, limit],
    );
    return readCustomerPayloads(rows);
  });
}

export interface CustomersMirrorState {
  /** ISO timestamp of the last successful directory write, or null. */
  lastSuccessAt: string | null;
  /** Rows currently held for this location. */
  rowCount: number;
}

/** The directory's freshness + size in one read. Never throws. */
export async function getCustomersMirrorState(
  locationId: string,
): Promise<CustomersMirrorState | null> {
  const db = getReadDb();
  if (!db) return null;
  try {
    const row = await runOnRead(() =>
      db.getFirstAsync<{ last_success_at: string | null; row_count: number | null }>(
        `SELECT last_success_at, row_count FROM sync_state
          WHERE entity = 'customers' AND location_id = ?`,
        [locationId],
      ),
    );
    if (!row) return null;
    return {
      lastSuccessAt: row.last_success_at ?? null,
      rowCount: row.row_count ?? 0,
    };
  } catch {
    return null;
  }
}

/**
 * True when the directory was refreshed recently enough to skip a round trip.
 * Threshold is the descriptor's `staleAfterMs`, so this and the freshness UI
 * can never disagree about what counts as fresh.
 */
export async function isCustomersMirrorFresh(
  locationId: string,
): Promise<boolean> {
  const state = await getCustomersMirrorState(locationId);
  if (!state?.lastSuccessAt) return false;
  const staleAfterMs = ENTITIES.customers.staleAfterMs;
  return Date.now() - new Date(state.lastSuccessAt).getTime() < staleAfterMs;
}
