/**
 * The LOCAL half of Previous Orders — the SQL emitter that sits beside
 * `buildHistoryOrderQuery` (services/historyOrderFilters.ts).
 *
 * One source of filter truth, two backends: the PostgREST builder owns the
 * server path, this module owns the local path, and every WHERE arm below
 * mirrors the PostgREST builder's semantics EXACTLY (including the NULL
 * behaviour of `neq` and the empty-draft exclusion). If the two drift, an
 * online search and an offline search of the same filter will disagree — that
 * is the exact bug this pairing exists to prevent.
 *
 * Two schema facts shape this file:
 *
 *  1. Money is INTEGER minor units locally (`total_amount_minor`), so the
 *     amount sort keys on the minor column — monotonic with dollars.
 *  2. `delivery_platform` is NOT a promoted column; it lives only in the
 *     verbatim server `payload`. Provider filters and platform search read it
 *     via `json_extract(payload, '$.delivery_platform')`.
 *
 * The page rows come back as raw mirror rows; the caller (the store) rebuilds
 * `FetchedOrderData` from each row's `payload` + child rows and runs the SAME
 * transform as the server path, so rendering can never diverge.
 */
import { caseFold } from "@/lib/db/descriptors/orders";
import { getEntity } from "@/lib/db/entities";
import {
    getReadDb,
    hasDedicatedReadConnection,
} from "@/lib/db/index";
import { dbWriteMutex } from "@/lib/db/write";
import {
    FIRST_PARTY_ONLINE_ORDER_PROVIDERS,
    MARKETPLACE_ONLINE_ORDER_PROVIDERS,
    getOnlineOrderProviderQueryAliases,
} from "@/lib/orderPlatformResolver";
import { ONLINE_ORDER_SOURCES } from "@/lib/orderSource";
import type { HistoryOrderFilters } from "@/services/historyOrderFilters";
import type { HistoryOrderSummary } from "@/services/orderService";

export type SqlValue = string | number | null;

export interface HistoryQuerySpec {
  locationId: string;
  filters: HistoryOrderFilters;
  startTs: string | null;
  endTs: string | null;
  pageIndex: number;
  pageSize: number;
}

export interface HistoryQueryWhere {
  where: string;
  params: SqlValue[];
}

/**
 * Run a read on the read connection, taking `dbWriteMutex` ONLY if we had to
 * fall back to the write handle. One place decides it, so no read path can
 * accidentally keep the old serialized behaviour or lose the fallback's safety.
 */
function runOnRead<T>(fn: () => Promise<T>): Promise<T> {
  return hasDedicatedReadConnection() ? fn() : dbWriteMutex.runExclusive(fn);
}

/** delivery_platform is not promoted — read it from the verbatim payload. */
const DELIVERY_PLATFORM_SQL = `json_extract(o.payload, '$.delivery_platform')`;

const DINE_IN_TYPES = ["dine_in", "qr_dine_in"];
const TAKEOUT_TYPES = ["takeout"];
const DELIVERY_TYPES = ["delivery"];

function quoteList(values: string[]): string {
  return `(${values.map((v) => `'${v.replace(/'/g, "''")}'`).join(", ")})`;
}

/** Mirror services/historyOrderFilters.escapeSearchTerm. */
function escapeSearchTerm(raw: string): string {
  return raw.replace(/[,()]/g, " ").replace(/[%_]/g, "\\$&").trim();
}

/**
 * Build the WHERE clause + params for a Previous Orders query.
 * Every arm mirrors buildHistoryOrderQuery. `neq` in PostgREST does NOT match
 * NULL rows, so the SQL below says `IS NOT NULL AND != …` wherever the server
 * builder used `.neq` — a NULL column must be excluded the same way both sides.
 */
export function buildHistoryOrderWhere(
  spec: Omit<HistoryQuerySpec, "pageIndex" | "pageSize">,
): HistoryQueryWhere {
  const { locationId, filters, startTs, endTs } = spec;
  const clauses: string[] = [];
  const params: SqlValue[] = [];

  clauses.push("o.location_id = ?");
  params.push(locationId);
  if (startTs) {
    clauses.push("o.created_at >= ?");
    params.push(startTs);
  }
  if (endTs) {
    clauses.push("o.created_at < ?");
    params.push(endTs);
  }

  // ── Channel ──────────────────────────────────────────────
  const onlineList = quoteList([...ONLINE_ORDER_SOURCES]);
  switch (filters.channel) {
    case "online":
      clauses.push(`o.order_source IN ${onlineList}`);
      break;
    case "dine_in":
      clauses.push(`o.order_type IN ${quoteList(DINE_IN_TYPES)}`);
      clauses.push(
        `(o.order_source IS NULL OR o.order_source NOT IN ${onlineList})`,
      );
      break;
    case "takeout":
      clauses.push(`o.order_type IN ${quoteList(TAKEOUT_TYPES)}`);
      clauses.push(
        `(o.order_source IS NULL OR o.order_source NOT IN ${onlineList})`,
      );
      break;
    case "delivery":
      clauses.push(`o.order_type IN ${quoteList(DELIVERY_TYPES)}`);
      clauses.push(
        `(o.order_source IS NULL OR o.order_source NOT IN ${onlineList})`,
      );
      break;
    case "all":
    default:
      break;
  }

  // ── Provider (Online tab only) ───────────────────────────
  if (filters.channel === "online" && filters.provider !== "all") {
    const marketplace = MARKETPLACE_ONLINE_ORDER_PROVIDERS.find(
      (p) => p === filters.provider,
    );
    if (marketplace) {
      const aliases = getOnlineOrderProviderQueryAliases(marketplace);
      clauses.push(
        `(${aliases.map(() => `${DELIVERY_PLATFORM_SQL} LIKE ?`).join(" OR ")})`,
      );
      params.push(...aliases.map((a) => `%${a}%`));
    } else if (filters.provider === "house") {
      const aliases = FIRST_PARTY_ONLINE_ORDER_PROVIDERS.flatMap(
        getOnlineOrderProviderQueryAliases,
      );
      clauses.push(
        `(${aliases.map(() => `${DELIVERY_PLATFORM_SQL} LIKE ?`).join(" OR ")})`,
      );
      params.push(...aliases.map((a) => `%${a}%`));
    } else if (filters.provider === "other") {
      const aliases = [
        ...MARKETPLACE_ONLINE_ORDER_PROVIDERS,
        ...FIRST_PARTY_ONLINE_ORDER_PROVIDERS,
      ].flatMap(getOnlineOrderProviderQueryAliases);
      clauses.push(
        `(${DELIVERY_PLATFORM_SQL} IS NOT NULL AND ${DELIVERY_PLATFORM_SQL} != '' AND ${aliases
          .map(() => `${DELIVERY_PLATFORM_SQL} NOT LIKE ?`)
          .join(" AND ")})`,
      );
      params.push(...aliases.map((a) => `%${a}%`));
    }
  }

  // ── Status ───────────────────────────────────────────────
  switch (filters.status) {
    case "paid":
      clauses.push(`o.payment_status = 'paid' AND o.status != 'void'`);
      break;
    case "unpaid":
      // PostgREST neq excludes NULL — mirror that exactly.
      clauses.push(
        `o.payment_status IS NOT NULL AND o.payment_status != 'paid' AND o.status IS NOT NULL AND o.status != 'void'`,
      );
      break;
    case "refunded":
      clauses.push(`(o.status = 'refunded' OR o.payment_status = 'refunded')`);
      break;
    case "voided":
      clauses.push(`o.status = 'void'`);
      break;
    case "all":
    default:
      break;
  }

  // ── Search ───────────────────────────────────────────────
  // ESCAPE '\' makes the escaped %/_ in the term literal (same escaping the
  // PostgREST path applies). Digits-only queries also probe phone.
  //
  // The customer name is matched TWICE, and the second arm is the interesting
  // one. SQLite's LIKE folds case for ASCII only; Postgres `ilike` folds
  // Unicode — so a search for "josé" hit online and missed offline, a
  // filter-parity gap of exactly the kind this module's header promises there
  // are none of. `_search_customer_name` holds the JS-folded name written at
  // ingest (descriptors/orders.ts), matched here against the folded term. The
  // plain `customer_name` arm stays so a row written before the column existed
  // still matches on ASCII.
  const term = escapeSearchTerm(filters.search);
  if (term) {
    const like = `%${term}%`;
    const foldedLike = `%${caseFold(term) ?? term}%`;
    clauses.push(
      `(o.display_number LIKE ? ESCAPE '\\' OR o.order_number LIKE ? ESCAPE '\\' OR o.customer_name LIKE ? ESCAPE '\\' OR o._search_customer_name LIKE ? ESCAPE '\\' OR o.customer_phone LIKE ? ESCAPE '\\' OR ${DELIVERY_PLATFORM_SQL} LIKE ? ESCAPE '\\')`,
    );
    params.push(like, like, like, foldedLike, like, like);
  }

  // ── Empty drafts — mirror EMPTY_DRAFT_EXCLUSION_OR ───────
  clauses.push(
    `(o.total_amount_minor != 0 OR o.subtotal_minor != 0 OR o.discount_amount_minor != 0 OR o.completed_at IS NOT NULL OR o.payment_status = 'paid' OR o.status IN ('void','refunded'))`,
  );

  return { where: clauses.map((c) => `(${c})`).join(" AND "), params };
}

/** ORDER BY for a filter set — `id` is the deterministic tiebreak, as server. */
export function historyOrderBySql(filters: HistoryOrderFilters): string {
  switch (filters.sort) {
    case "date_asc":
      return "o.created_at ASC, o.id ASC";
    case "amount_desc":
      return "o.total_amount_minor DESC, o.id ASC";
    case "amount_asc":
      return "o.total_amount_minor ASC, o.id ASC";
    case "date_desc":
    default:
      return "o.created_at DESC, o.id ASC";
  }
}

export interface LocalHistoryResult {
  orders: Record<string, SqlValue>[];
  itemsByOrder: Record<string, Record<string, SqlValue>[]>;
  paymentsByOrder: Record<string, Record<string, SqlValue>[]>;
  totalCount: number;
}

/**
 * The exact statements a page turn runs. Exported so the query-plan test
 * asserts against the SQL that SHIPS — a test that rebuilt its own SELECT
 * would keep passing after this one stopped using an index.
 */
export function buildHistoryPageStatements(spec: HistoryQuerySpec): {
  pageSql: string;
  countSql: string;
  pageParams: SqlValue[];
  params: SqlValue[];
} {
  const { where, params } = buildHistoryOrderWhere(spec);
  const orderBy = historyOrderBySql(spec.filters);
  return {
    pageSql: `SELECT o.* FROM orders o WHERE ${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
    countSql: `SELECT COUNT(*) AS n FROM orders o WHERE ${where}`,
    pageParams: [...params, spec.pageSize, spec.pageIndex * spec.pageSize],
    params,
  };
}

/**
 * One page of history from the local mirror, plus the exact total for the
 * filter set (so "N of M" and the pager are locally honest). Child rows
 * (items/payments) ride along so the caller can rebuild FetchedOrderData.
 * Returns null when the DB is unavailable — caller falls back to server.
 */
export async function queryLocalHistoryPage(
  spec: HistoryQuerySpec,
): Promise<LocalHistoryResult | null> {
  const db = getReadDb();
  if (!db) return null;

  // Reads take the dedicated read connection and DON'T take dbWriteMutex: the
  // mutex is there because expo-sqlite won't serialize transactions on one
  // connection, which is a writer constraint. Under WAL a second connection
  // reads a consistent snapshot while a write batch is in flight, so a page
  // turn no longer queues behind whatever the delta sync is doing. When the
  // reader failed to open, getReadDb() returns the write handle and
  // runOnRead() re-takes the mutex — correct either way, only slower.
  return runOnRead(async () => {
    const { pageSql, countSql, pageParams, params } =
      buildHistoryPageStatements(spec);

    const [pageRows, countRow] = await Promise.all([
      db.getAllAsync<Record<string, SqlValue>>(pageSql, pageParams),
      db.getFirstAsync<{ n: number }>(countSql, params),
    ]);

    const ids = pageRows.map((r) => r.id as string);
    if (ids.length === 0) {
      return {
        orders: [],
        itemsByOrder: {},
        paymentsByOrder: {},
        totalCount: countRow?.n ?? 0,
      };
    }

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

    const itemsByOrder: Record<string, Record<string, SqlValue>[]> = {};
    for (const it of items) {
      const oid = it.order_id as string;
      (itemsByOrder[oid] ??= []).push(it);
    }
    const paymentsByOrder: Record<string, Record<string, SqlValue>[]> = {};
    for (const p of payments) {
      const oid = p.order_id as string;
      (paymentsByOrder[oid] ??= []).push(p);
    }

    return {
      orders: pageRows,
      itemsByOrder,
      paymentsByOrder,
      totalCount: countRow?.n ?? 0,
    };
  });
}

/**
 * Discriminator-only projection of every order in the current window matching
 * the active search + status — the LOCAL half of `getHistoryOrderSummaries`.
 *
 * Channel/provider are forced to "all" exactly like the server: they are the
 * axes being counted, so constraining them would make every tab report its own
 * count as the total. The tab/chip counts render from the mirror with zero
 * round trips and stay correct offline. Returns null when the DB is
 * unavailable — caller falls back to the server summary fetch.
 *
 * Capped at `HISTORY_SUMMARY_CAP` rows, the same number and the same
 * newest-first order the server projection uses, and reports `truncated` the
 * same way. Uncapped, a month-wide window at the 20k retention cap would
 * marshal every row in the window across the bridge on every refresh to
 * produce a handful of tab counts.
 */
export const HISTORY_SUMMARY_CAP = 5000;

export async function queryLocalHistorySummaries(opts: {
  locationId: string;
  filters: HistoryOrderFilters;
  startTs: string | null;
  endTs: string | null;
  /** Override the cap. Production never passes this; the test proves the cap. */
  cap?: number;
}): Promise<{ rows: HistoryOrderSummary[]; truncated: boolean } | null> {
  const db = getReadDb();
  if (!db) return null;
  const cap = opts.cap ?? HISTORY_SUMMARY_CAP;

  return runOnRead(async () => {
    const { where, params } = buildHistoryOrderWhere({
      locationId: opts.locationId,
      filters: { ...opts.filters, channel: "all", provider: "all" },
      startTs: opts.startTs,
      endTs: opts.endTs,
    });
    // CAP + 1 so truncation is detected without a second COUNT pass.
    const sql = `SELECT o.id, o.created_at, o.order_type, o.order_source, o.status,
                        o.payment_status,
                        ${DELIVERY_PLATFORM_SQL} AS delivery_platform
                 FROM orders o
                 WHERE ${where}
                 ORDER BY o.created_at DESC
                 LIMIT ?`;
    const rows = await db.getAllAsync<HistoryOrderSummary>(sql, [
      ...params,
      cap + 1,
    ]);
    const truncated = rows.length > cap;
    return { rows: truncated ? rows.slice(0, cap) : rows, truncated };
  });
}

/**
 * True when the orders mirror was last synced recently enough to trust it as
 * the source of truth for Previous Orders.
 *
 * The delta sync stamps `sync_state.last_success_at` for the `orders` entity
 * on every successful cycle (≈ every 30s), so a recent stamp means the mirror
 * is at most a cycle behind the server. Previous Orders uses this to skip the
 * server round trip when opening online: the mirror already holds what the
 * server would return, so fetching would only re-fetch what the sync just
 * pulled.
 *
 * Threshold is the orders descriptor's `staleAfterMs` — the same freshness
 * contract the `useLocalFreshness` UI uses, so the two can never disagree
 * about what counts as fresh.
 */
export async function isOrdersMirrorFresh(
  locationId: string,
  startTs?: string | null,
): Promise<boolean> {
  const state = await getOrdersMirrorState(locationId);
  if (!state?.lastSuccessAt) return false;
  const staleAfterMs = getEntity("orders")?.staleAfterMs ?? 5 * 60_000;
  if (Date.now() - new Date(state.lastSuccessAt).getTime() >= staleAfterMs) {
    return false;
  }
  // The requested window must start at or after the mirror's oldest retained
  // row, or the local page/counts would under-report and the server must
  // correct instead.
  if (startTs && state.retentionFloor && state.retentionFloor > startTs) {
    return false;
  }
  return true;
}

export interface OrdersMirrorState {
  /** ISO timestamp of the last successful delta cycle, or null. */
  lastSuccessAt: string | null;
  /**
   * `created_at` of the OLDEST row the mirror still retains — the honest answer
   * to "how far back does this device go offline?". The scope line reads this
   * rather than the match count, which says nothing about coverage.
   */
  retentionFloor: string | null;
}

/** The orders mirror's freshness + coverage in one read. Never throws. */
export async function getOrdersMirrorState(
  locationId: string,
): Promise<OrdersMirrorState | null> {
  const db = getReadDb();
  if (!db) return null;
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
    if (!row) return null;
    return {
      lastSuccessAt: row.last_success_at ?? null,
      retentionFloor: row.retention_floor ?? null,
    };
  } catch {
    return null;
  }
}
