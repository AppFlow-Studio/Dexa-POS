/**
 * The LOCAL half of the Online Orders board — the SQL that stands in for
 * `get_online_orders_board_v1`.
 *
 * The RPC is short but it is not simple, and every clause below exists because
 * the RPC has one:
 *
 *  1. **Scope is `online_orders.placed_at`, not `orders.created_at`.** An
 *     order is on a tab because of when the CUSTOMER placed it with the
 *     provider, which can be minutes or hours before the POS row exists.
 *     `_online_placed_at` is that value, resolved at ingest (see
 *     resolveOnlinePlacedAt in lib/db/descriptors/orders.ts).
 *  2. **The window is the location's BUSINESS day, not its calendar day.**
 *     The rollover hour comes from `locations.business_day_start_hour`, which
 *     the client already holds on `selectedStore`, so the bounds are computed
 *     with the same luxon helpers every other business-day surface uses
 *     (lib/businessDay.ts) rather than re-derived here.
 *  3. **Strict scope.** The RPC returns `is_in_range = true` for every row and
 *     carries no out-of-window actives, so the local query does not either. An
 *     order still cooking from yesterday belongs on yesterday's tab.
 *  4. **`item_count` is the sum of NON-VOIDED quantities**, floored at zero —
 *     what the card's badge shows. Computed in SQL, not by counting the
 *     rebuilt items, because the server computes it in SQL and a JS recount
 *     would be a second definition of the same number.
 *
 * The page rows come back as raw mirror rows; the caller rebuilds
 * `FetchedOrderData` from each row's `payload` + child rows and runs the SAME
 * `normalizeFetchedOrder` → `transformBroadcastToOrder` pair the server path
 * runs, so rendering cannot diverge between sources.
 */
import { getEntity } from "@/lib/db/entities";
import { getReadDb, hasDedicatedReadConnection } from "@/lib/db/index";
import { dbWriteMutex } from "@/lib/db/write";
import { getBusinessDayBounds } from "@/lib/businessDay";
import { DateTime } from "luxon";

export type SqlValue = string | number | null;

/**
 * The statuses the board renders, in the RPC's own order.
 *
 * This is deliberately a SUPERSET of `BOARD_ONLINE_ORDER_STATUSES` in
 * lib/onlineOrderBoard.ts by exactly one member — `draft` is in neither, but
 * the RPC also excludes `cancelled` / `void` / `refunded` by listing what it
 * wants rather than what it rejects, and so does this. Listing the wanted set
 * is what makes a new order status default to INVISIBLE on the board rather
 * than to a card nobody designed.
 */
export const BOARD_STATUSES = [
  "pending",
  "accepted",
  "sent_to_kitchen",
  "preparing",
  "ready",
  "completed",
] as const;

export interface BoardWindow {
  /** Inclusive lower bound, UTC ISO. */
  startTs: string;
  /** EXCLUSIVE upper bound, UTC ISO — the RPC's `< v_end_ts`. */
  endTs: string;
}

export interface BoardBusinessDayConfig {
  timezone: string;
  rolloverHour: number;
}

export type BoardPreset = "today" | "yesterday" | "last_7_days" | "custom";

/**
 * The business-day window for a preset, reproducing the RPC's CASE arm for arm.
 *
 * `v_business_today` in SQL is "today in the location's zone, minus a day when
 * the local clock has not yet reached the rollover hour" — which is exactly
 * `getCurrentBusinessDay`. Both bounds are then converted independently so a
 * DST-length day stays correct, which is what `getBusinessDayBounds` does.
 *
 * Returns null for a custom range that the RPC would have raised on (missing
 * or inverted dates), so the caller falls back to the server rather than
 * silently rendering a window the server would have refused.
 */
export function resolveBoardWindow(
  preset: BoardPreset,
  startDate: string | null,
  endDate: string | null,
  config: BoardBusinessDayConfig,
  now: DateTime = DateTime.now(),
): BoardWindow | null {
  const zoned = now.setZone(config.timezone);
  if (!zoned.isValid) return null;

  const businessToday =
    zoned.hour < config.rolloverHour
      ? zoned.minus({ days: 1 }).toISODate()!
      : zoned.toISODate()!;

  let startDay: string;
  let endDay: string;

  switch (preset) {
    case "today":
      startDay = businessToday;
      endDay = businessToday;
      break;
    case "yesterday":
      startDay = shiftDay(businessToday, -1);
      endDay = startDay;
      break;
    case "last_7_days":
      startDay = shiftDay(businessToday, -6);
      endDay = businessToday;
      break;
    case "custom":
      if (!startDate || !endDate || endDate < startDate) return null;
      startDay = startDate;
      endDay = endDate;
      break;
    default:
      return null;
  }

  const start = getBusinessDayBounds(startDay, config);
  const end = getBusinessDayBounds(endDay, config);
  return { startTs: start.startUtc, endTs: end.endUtc };
}

function shiftDay(day: string, days: number): string {
  return DateTime.fromISO(day).plus({ days }).toISODate()!;
}

export interface BoardQuerySpec {
  locationId: string;
  window: BoardWindow;
}

/**
 * The exact statement a board load runs. Exported so the query-plan test
 * asserts against the SQL that SHIPS — a test that rebuilt its own SELECT
 * would keep passing after this one stopped using its index.
 *
 * `_online_placed_at IS NOT NULL` is stated even though the range bounds
 * already exclude NULLs: SQLite only uses a partial index when the WHERE
 * clause SYNTACTICALLY implies the index predicate, and it does not reason
 * that `>= ?` implies `IS NOT NULL`. Without the conjunct the board is a full
 * scan of every order the mirror holds — 20,000 rows at the retention cap, to
 * render one day.
 *
 * The item count is a correlated subquery rather than a GROUP BY join so the
 * outer query keeps its index-ordered walk; `idx_oi_order` is the partial
 * index on `order_items(order_id) WHERE is_voided IS NOT 1`, and the `IS NOT
 * 1` conjunct is what unlocks it. `COALESCE(is_voided, 0) = 0` beside it is
 * the exact server semantics (`NOT COALESCE(oi.is_voided, false)`, which
 * INCLUDES a NULL flag) — the two select the same rows, and the pair is the
 * same shape Phase 5's analytics ③ landed on.
 */
export function buildBoardStatement(spec: BoardQuerySpec): {
  sql: string;
  params: SqlValue[];
} {
  const statusList = BOARD_STATUSES.map((s) => `'${s}'`).join(", ");
  return {
    sql: `SELECT o.*,
                 (SELECT COALESCE(SUM(MAX(oi.quantity, 0)), 0)
                    FROM order_items oi
                   WHERE oi.order_id = o.id
                     AND oi.is_voided IS NOT 1
                     AND COALESCE(oi.is_voided, 0) = 0) AS _item_count
            FROM orders o
           WHERE o.location_id = ?
             AND o._online_placed_at IS NOT NULL
             AND o._online_placed_at >= ?
             AND o._online_placed_at < ?
             AND o.status IN (${statusList})
           ORDER BY o._online_placed_at DESC, o.id DESC`,
    params: [spec.locationId, spec.window.startTs, spec.window.endTs],
  };
}

export interface LocalBoardRow {
  order: Record<string, SqlValue>;
  placedAt: string | null;
  itemCount: number;
  items: Record<string, SqlValue>[];
  payments: Record<string, SqlValue>[];
}

/**
 * One board window from the local mirror. Returns null when the DB is
 * unavailable — the caller falls back to the server.
 */
export async function queryLocalOnlineBoard(
  spec: BoardQuerySpec,
): Promise<LocalBoardRow[] | null> {
  const db = getReadDb();
  if (!db) return null;

  // Same read-connection rule as historyQuery: under WAL the dedicated reader
  // sees a consistent snapshot while a delta write is in flight, so opening a
  // board never queues behind the sync. The mutex is re-taken only on the
  // fallback path, where the reader failed to open and getReadDb() handed back
  // the write handle.
  return runOnRead(async () => {
    const { sql, params } = buildBoardStatement(spec);
    const rows = await db.getAllAsync<Record<string, SqlValue>>(sql, params);
    if (rows.length === 0) return [];

    const ids = rows.map((r) => r.id as string);
    const placeholders = ids.map(() => "?").join(",");
    const [items, payments] = await Promise.all([
      db.getAllAsync<Record<string, SqlValue>>(
        `SELECT * FROM order_items WHERE order_id IN (${placeholders})`,
        ids,
      ),
      db.getAllAsync<Record<string, SqlValue>>(
        `SELECT * FROM order_payments WHERE order_id IN (${placeholders})`,
        ids,
      ),
    ]);

    const itemsByOrder = groupByOrder(items);
    const paymentsByOrder = groupByOrder(payments);

    return rows.map((row) => {
      const id = row.id as string;
      const { _item_count, ...order } = row;
      return {
        order,
        placedAt: (row._online_placed_at as string | null) ?? null,
        itemCount: Number(_item_count ?? 0),
        items: itemsByOrder[id] ?? [],
        payments: paymentsByOrder[id] ?? [],
      };
    });
  });
}

function groupByOrder(
  rows: Record<string, SqlValue>[],
): Record<string, Record<string, SqlValue>[]> {
  const out: Record<string, Record<string, SqlValue>[]> = {};
  for (const row of rows) {
    const id = row.order_id as string;
    (out[id] ??= []).push(row);
  }
  return out;
}

/**
 * Whether the mirror covers this window well enough to paint from.
 *
 * NOT the same question as `isOrdersMirrorFresh`, and the difference is the
 * point: the board never SKIPS the server while online (see the resolution
 * rule in useOnlineOrdersByDate), so freshness is not what is being decided
 * here. What matters is COVERAGE — a window that starts before the mirror's
 * retention floor would render a partial board with no way for the operator to
 * tell, which is the one failure this whole phase is written to avoid.
 *
 * Retention is measured on `created_at` while the board scopes on `placed_at`.
 * Those differ, and the direction is safe: `placed_at` precedes `created_at`
 * (the customer orders, then the row is created), so an order inside the
 * retained `created_at` range can only have been placed EARLIER. Comparing the
 * floor against the window start is therefore conservative — it can refuse a
 * window the mirror actually covers, never accept one it does not.
 */
export async function boardWindowIsCovered(
  locationId: string,
  window: BoardWindow,
): Promise<boolean> {
  const db = getReadDb();
  if (!db) return false;
  try {
    const row = await runOnRead(() =>
      db.getFirstAsync<{
        last_success_at: string | null;
        retention_floor: string | null;
      }>(
        `SELECT last_success_at, retention_floor FROM sync_state
          WHERE entity = 'orders' AND location_id = ?`,
        [locationId],
      ),
    );
    // No sync_state row at all means the mirror has never synced this
    // location. An empty board would then read as "no online orders today"
    // rather than "nothing has been mirrored yet" — a wrong answer instead of
    // a missing one, which is the distinction every other Phase 5 page draws.
    if (!row?.last_success_at) return false;
    if (row.retention_floor && row.retention_floor > window.startTs) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/** `staleAfterMs` for the orders mirror — the freshness contract, one source. */
export function ordersStaleAfterMs(): number {
  return getEntity("orders")?.staleAfterMs ?? 5 * 60_000;
}

/** Same rule as historyQuery: mutex only when there is no dedicated reader. */
function runOnRead<T>(fn: () => Promise<T>): Promise<T> {
  return hasDedicatedReadConnection() ? fn() : dbWriteMutex.runExclusive(fn);
}
