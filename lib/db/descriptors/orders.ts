/**
 * Orders delta descriptor — the first real implementation of the Phase 2
 * contract, and the template every later entity follows.
 *
 * Three schema realities shape this file, all verified against
 * database.types.ts on this branch:
 *
 *  1. `orders.updated_at` exists and is the watermark.
 *  2. `order_payments` has NO updated_at and NO created_at — only initiated_at,
 *     approved_at, captured_at, failed_at, voided_at. It therefore cannot carry
 *     a cursor of its own and is synced as a CHILD of its parent order.
 *     ⚠ This assumes every payment mutation bumps the parent order's
 *     updated_at. See VERIFY-PAYMENT-TOUCH below.
 *  3. There is no `deleted_at` anywhere, so hard deletes are invisible to a
 *     watermark pull. Voids are soft deletes (`voided_at`, `is_voided`) and DO
 *     ride the delta; pullManifest covers the genuine DELETE.
 */
import type { PostgrestFilterBuilder } from "@supabase/postgrest-js";

import {
  registerEntityQueries,
  type DeltaPage,
  type ManifestContext,
  type PullContext,
} from "@/lib/db/entities";
import { toMinor } from "@/lib/db/money";
import type { Row } from "@/lib/db/write";

/**
 * The embed. Deliberately does NOT filter out voided items: a void is the
 * tombstone that makes remove-wins work, and the mirror wants the truth. The
 * partial index (`WHERE is_voided IS NOT 1`) keeps them out of the hot query
 * instead.
 *
 * The trailing embeds + columns (order_discounts, stations, created_by_staff,
 * online_orders, delivery_platform, metadata) mirror the Previous Orders
 * history query in services/orderService.ts. They ride in the verbatim
 * `payload` so the LOCAL render path (normalizeFetchedOrder in
 * utils/orderTransformers.ts) produces IDENTICAL output to the server path:
 * server name, station name, online identity, platform and discounts.
 * If one side adds a field the other must too, or local rows diverge — e.g.
 * the server column rendering "Unknown" or a raw staff id because the
 * created_by_staff join never made it into the mirror payload.
 *
 * v11 closed that exact gap for the Online Orders board. `to_jsonb(o)` in
 * `get_online_orders_board_v1` returns EVERY `orders` column, while this list
 * was a subset — so sixteen fields `normalizeFetchedOrder` reads
 * (external_id, delivery_address, the six service-charge columns,
 * cash_discount_applied, effective_subtotal / effective_tax_amount,
 * payment_pricing_mode, split_payment_path, platform_order_number,
 * created_by_user_id, started_preparing_at) resolved to their defaults on the
 * local path and to real values on the server path, for the same order. They
 * arrive free with the row; the divergence did not.
 *
 * The `online_orders` embed gains `id`, `placed_at` and `updated_at` because
 * the FK is NOT unique and the board picks ONE authoritative placement row —
 * see resolveOnlinePlacedAt.
 */
const ORDER_SELECT = `
  id, location_id, merchant_id, order_number, display_number, external_id,
  order_type, order_source, status, payment_status, check_status,
  customer_id, customer_name, customer_phone, customer_email, delivery_address,
  table_number, seat_number, session_id,
  assigned_server_id, created_by_staff_id, created_by_user_id,
  station_id, device_id,
  subtotal, tax_amount, total_amount, discount_amount, service_charge,
  service_charge_name, service_charge_rate, service_charge_applies_on,
  service_charge_rule_id, service_charge_is_manual, service_charge_is_taxable,
  tip_amount, amount_due, amount_paid,
  card_subtotal, card_tax_amount, card_total,
  cash_subtotal, cash_tax_amount, cash_total, cash_amount_due,
  cash_discount_amount, cash_discount_applied,
  effective_subtotal, effective_tax_amount, effective_total,
  payment_pricing_mode, split_payment_path, platform_order_number,
  voided_at, void_reason, voided_by, cancelled_at, cancellation_reason,
  sent_to_kitchen_at, started_preparing_at, ready_at, completed_at,
  is_offline, reopen_count, created_at, updated_at, sync_version,
  delivery_platform, metadata,
  order_items(*),
  order_payments(*),
  order_discounts(*),
  stations (station_name),
  created_by_staff:staff_profiles!created_by_staff_id (first_name, last_name),
  online_orders:online_orders!online_orders_order_id_fkey (id, order_id, provider, delivery_company, placed_at, updated_at)
`;

/**
 * Keyset filter: (watermark, id) > (since, sinceId).
 *
 * Expressed in PostgREST as `wm.gt.X OR (wm.eq.X AND id.gt.Y)`. The tiebreak
 * half is what makes rows sharing a millisecond safe — without it, `gt` alone
 * silently skips them and `gte` alone loops forever on the same page.
 *
 * Values are double-quoted because ISO timestamps contain `.` and `:`, which
 * PostgREST would otherwise treat as filter syntax.
 */
function applyKeyset<T extends PostgrestFilterBuilder<any, any, any, any, any>>(
  query: T,
  column: string,
  pk: string,
  since: string | null,
  sinceId: string | null,
): T {
  if (!since) return query;
  // A null tiebreak means the cursor is a LAGGED boundary rather than a real
  // row (see WATERMARK_LAG_MS in syncEngine.ts). Inclusive `gte` there, so a
  // row sitting exactly on the boundary is re-read rather than skipped —
  // re-reading is free (upserts are idempotent), skipping is permanent.
  if (!sinceId) return query.gte(column, since) as T;
  return query.or(
    `${column}.gt."${since}",and(${column}.eq."${since}",${pk}.gt."${sinceId}")`,
  ) as T;
}

interface ServerOrder {
  id: string;
  updated_at: string;
  created_at: string;
  location_id: string;
  [key: string]: unknown;
}

/** Server order -> local `orders` columns. `id` MUST stay first (upsert key). */
function toOrderRow(o: ServerOrder, seenAt: string): Row {
  const num = (k: string) => toMinor(o[k] as number | null);
  return {
    id: o.id,
    location_id: o.location_id,
    merchant_id: str(o.merchant_id),
    order_number: str(o.order_number),
    display_number: str(o.display_number),
    order_type: str(o.order_type),
    order_source: str(o.order_source),
    status: str(o.status),
    payment_status: str(o.payment_status),
    check_status: str(o.check_status),
    customer_id: str(o.customer_id),
    customer_name: str(o.customer_name),
    customer_phone: str(o.customer_phone),
    customer_email: str(o.customer_email),
    table_number: str(o.table_number),
    seat_number: str(o.seat_number),
    session_id: str(o.session_id),
    assigned_server_id: str(o.assigned_server_id),
    created_by_staff_id: str(o.created_by_staff_id),
    station_id: str(o.station_id),
    device_id: str(o.device_id),

    subtotal_minor: num("subtotal"),
    tax_amount_minor: num("tax_amount"),
    total_amount_minor: num("total_amount"),
    discount_amount_minor: num("discount_amount"),
    service_charge_minor: num("service_charge"),
    tip_amount_minor: num("tip_amount"),
    amount_due_minor: num("amount_due"),
    amount_paid_minor: num("amount_paid"),
    card_subtotal_minor: num("card_subtotal"),
    card_tax_amount_minor: num("card_tax_amount"),
    card_total_minor: num("card_total"),
    cash_subtotal_minor: num("cash_subtotal"),
    cash_tax_amount_minor: num("cash_tax_amount"),
    cash_total_minor: num("cash_total"),
    cash_amount_due_minor: num("cash_amount_due"),
    cash_discount_amount_minor: num("cash_discount_amount"),
    effective_total_minor: num("effective_total"),

    voided_at: str(o.voided_at),
    void_reason: str(o.void_reason),
    voided_by: str(o.voided_by),
    cancelled_at: str(o.cancelled_at),
    cancellation_reason: str(o.cancellation_reason),

    sent_to_kitchen_at: str(o.sent_to_kitchen_at),
    ready_at: str(o.ready_at),
    completed_at: str(o.completed_at),
    is_offline: bool(o.is_offline),
    reopen_count: (o.reopen_count as number | null) ?? 0,
    created_at: o.created_at,
    updated_at: o.updated_at,
    sync_version: (o.sync_version as number | null) ?? null,

    // Local-only. `_business_day` is derived at ingest rather than queried,
    // because it does not exist on remote — it is what analytics groups on.
    _sync_status: "synced",
    _business_day: businessDayOf(o.created_at),
    // Case-folded at INGEST, because it cannot be done at query time: SQLite's
    // LIKE, LOWER() and COLLATE NOCASE are all ASCII-only, while Postgres
    // `ilike` folds Unicode — so "JOSÉ" matched an online search and missed an
    // offline one. Folding in JS on the way in is the only place the two can
    // be made to agree.
    _search_customer_name: caseFold(o.customer_name),
    // The Online Orders board's window predicate and sort key. Derived at
    // ingest for the same reason _business_day is: it does not exist on
    // `orders` at all.
    _online_placed_at: resolveOnlinePlacedAt(o.online_orders),
    _server_seen_at: seenAt,
    payload: JSON.stringify(stripChildren(o)),
  };
}

/** One `online_orders` row as the mirror embed returns it. */
export interface OnlinePlacementRow {
  id?: string | null;
  placed_at?: string | null;
  updated_at?: string | null;
}

/**
 * The AUTHORITATIVE placement row's `placed_at`, matching
 * `get_online_orders_board_v1` exactly:
 *
 *   SELECT DISTINCT ON (oo.order_id) oo.placed_at
 *     ORDER BY oo.order_id, oo.updated_at DESC, oo.id DESC
 *
 * Two things make this worth a function rather than `rows[0].placed_at`.
 *
 * FIRST, the FK is not unique — the RPC's own comment says duplicate ingestion
 * rows exist, which is why it deduplicates at all. PostgREST returns an embed
 * array in no defined order, so taking the first element would pick a
 * different row than the server picks whenever there is more than one, and the
 * two would disagree about which business day an order belongs to.
 *
 * SECOND, "newest wins" has to reproduce the server's NULL handling. Postgres
 * `ORDER BY x DESC` puts NULLs FIRST, so a placement row with a NULL
 * `updated_at` outranks one with a value — and if that winner also has a NULL
 * `placed_at`, the order is OUT of every window rather than falling back to
 * the sibling row. Returning null here is therefore a real answer, not a
 * missing one, and the board excludes exactly what the RPC excludes.
 *
 * Deliberately does NOT reorder the array it reads: `resolveFetchedOrderPlatform`
 * takes `joinRows[0]` for the platform badge, and quietly re-sorting the
 * payload underneath it would change what renders on both the local AND the
 * server path.
 */
export function resolveOnlinePlacedAt(value: unknown): string | null {
  if (!Array.isArray(value) || value.length === 0) return null;

  let best: OnlinePlacementRow | null = null;
  for (const raw of value as OnlinePlacementRow[]) {
    if (!raw || typeof raw !== "object") continue;
    if (best === null || outranks(raw, best)) best = raw;
  }
  return best?.placed_at ?? null;
}

/** Postgres `ORDER BY updated_at DESC, id DESC` — NULLs sort FIRST on DESC. */
function outranks(a: OnlinePlacementRow, b: OnlinePlacementRow): boolean {
  const byUpdated = compareDescNullsFirst(a.updated_at, b.updated_at);
  if (byUpdated !== 0) return byUpdated < 0;
  return compareDescNullsFirst(a.id, b.id) < 0;
}

/** Negative when `a` sorts before `b` under DESC with NULLs first. */
function compareDescNullsFirst(
  a: string | null | undefined,
  b: string | null | undefined,
): number {
  const aNull = a === null || a === undefined;
  const bNull = b === null || b === undefined;
  if (aNull && bNull) return 0;
  if (aNull) return -1;
  if (bNull) return 1;
  if (a === b) return 0;
  return a > b ? -1 : 1;
}

function toItemRow(item: Record<string, unknown>, orderId: string): Row {
  const num = (k: string) => toMinor(item[k] as number | null);
  return {
    id: String(item.id),
    order_id: orderId,
    menu_item_id: str(item.menu_item_id),
    menu_id: str(item.menu_id),
    category_id: str(item.category_id),
    item_name: String(item.item_name ?? ""),
    category_name: str(item.category_name),
    menu_name: str(item.menu_name),
    quantity: (item.quantity as number | null) ?? 0,
    unit_price_minor: num("unit_price"),
    subtotal_minor: num("subtotal"),
    tax_amount_minor: num("tax_amount"),
    price_paid_minor: num("price_paid"),
    cash_unit_price_minor: num("cash_unit_price"),
    cash_subtotal_minor: num("cash_subtotal"),
    cash_tax_amount_minor: num("cash_tax_amount"),
    discount_amount_minor: num("discount_amount"),
    pre_discount_subtotal_minor: num("pre_discount_subtotal"),
    item_status: str(item.item_status),
    kitchen_status: str(item.kitchen_status),
    course_number: (item.course_number as number | null) ?? null,
    seat_number: (item.seat_number as number | null) ?? null,
    display_order: (item.display_order as number | null) ?? null,
    is_voided: bool(item.is_voided),
    voided_at: str(item.voided_at),
    void_reason: str(item.void_reason),
    is_to_go: bool(item.is_to_go),
    is_prioritized: bool(item.is_prioritized),
    rush: bool(item.rush),
    special_instructions: str(item.special_instructions),
    kitchen_notes: str(item.kitchen_notes),
    selected_size_id: str(item.selected_size_id),
    selected_size_name: str(item.selected_size_name),
    created_at: str(item.created_at),
    updated_at: str(item.updated_at),
    _sync_status: "synced",
    payload: JSON.stringify(item),
  };
}

function toPaymentRow(p: Record<string, unknown>, orderId: string): Row {
  const num = (k: string) => toMinor(p[k] as number | null);
  return {
    id: String(p.id),
    order_id: orderId,
    location_id: str(p.location_id),
    device_id: str(p.device_id),
    payment_method: str(p.payment_method),
    status: str(p.status),
    amount_minor: num("amount"),
    tip_amount_minor: num("tip_amount"),
    total_amount_minor: num("total_amount"),
    amount_tendered_minor: num("amount_tendered"),
    change_given_minor: num("change_given"),
    dual_pricing_fee_minor: num("dual_pricing_fee"),
    discount_portion_minor: num("discount_portion"),
    is_cash_priced: bool(p.is_cash_priced),
    is_voided: bool(p.is_voided),
    is_returned: bool(p.is_returned),
    is_settled: bool(p.is_settled),
    card_last_four: str(p.card_last_four),
    card_type: str(p.card_type),
    auth_code: str(p.auth_code),
    covers_items: p.covers_items ? JSON.stringify(p.covers_items) : null,
    idempotency_key: str(p.idempotency_key),
    terminal_id: str(p.terminal_id),
    payment_device_id: str(p.payment_device_id),
    settlement_batch_id: str(p.settlement_batch_id),
    parent_payment_id: str(p.parent_payment_id),
    transaction_id: str(p.transaction_id),
    split_portion_index: (p.split_portion_index as number | null) ?? null,
    initiated_at: str(p.initiated_at),
    approved_at: str(p.approved_at),
    captured_at: str(p.captured_at),
    failed_at: str(p.failed_at),
    voided_at: str(p.voided_at),
    payload: JSON.stringify(p),
  };
}

/**
 * Server orders -> a batch ready for the write boundary.
 *
 * Exported because the realtime path needs the EXACT same mapping as the delta
 * pull. Two mappings would mean a broadcast-applied row and a pull-applied row
 * could differ for the same order — the kind of divergence that is invisible
 * until someone compares two stations.
 */
export function mapOrdersToBatch(
  rows: ServerOrder[],
  seenAt: string,
): { root: Row[]; children: { order_items: Row[]; order_payments: Row[] } } {
  const root: Row[] = [];
  const items: Row[] = [];
  const payments: Row[] = [];

  for (const order of rows) {
    root.push(toOrderRow(order, seenAt));
    for (const item of (order.order_items as Record<string, unknown>[]) ?? []) {
      items.push(toItemRow(item, order.id));
    }
    for (const p of (order.order_payments as Record<string, unknown>[]) ?? []) {
      payments.push(toPaymentRow(p, order.id));
    }
  }

  return { root, children: { order_items: items, order_payments: payments } };
}

export async function pullOrdersDelta(ctx: PullContext): Promise<DeltaPage> {
  let query = ctx.supabase
    .from("orders")
    .select(ORDER_SELECT)
    .eq("location_id", ctx.locationId);

  query = applyKeyset(query as any, "updated_at", "id", ctx.since, ctx.sinceId);

  const { data, error } = await query
    .order("updated_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(ctx.limit);

  if (error) throw error;

  const rows = (data ?? []) as unknown as ServerOrder[];
  const batch = mapOrdersToBatch(rows, new Date().toISOString());

  // Cursor is the LAST row, because the query is ordered ascending on the same
  // (updated_at, id) pair the keyset filter uses.
  const last = rows.length > 0 ? rows[rows.length - 1] : null;

  return {
    batch,
    watermark: last
      ? { value: last.updated_at, id: last.id }
      : { value: ctx.since, id: ctx.sinceId },
    hasMore: rows.length === ctx.limit,
    received: rows.length,
  };
}

/**
 * id-only fetch for hard-delete detection. Cheap by design: no embed, no
 * payload — roughly 40 bytes per row, so a 2,000-order window is ~80 KB.
 */
/**
 * VERIFY-PAYMENT-TOUCH — outstanding server-side verification.
 *
 * Payments have no watermark of their own, so they are only re-pulled when
 * their PARENT order's updated_at moves. That is correct if and only if every
 * payment mutation touches the order row.
 *
 * `process_payment_v8` plainly does (it sets payment_status, amount_paid).
 * The two to confirm are `void_payment` and `adjust_tips_v2`: if either updates
 * order_payments WITHOUT bumping orders.updated_at, the local mirror keeps a
 * stale payment indefinitely — a voided payment still showing as captured, or
 * a tip adjustment that never appears. Both are money-visible.
 *
 * Check the migration SQL, not the RPC name. If either misses the touch, the
 * fix belongs in the RPC (add the order-level UPDATE), not here — a
 * client-side workaround would mean polling payments on their own cursor,
 * which the table cannot support.
 */
export async function pullOrdersManifest(
  ctx: ManifestContext,
): Promise<string[]> {
  // PostgREST caps a response at 1000 rows by default. WITHOUT pagination this
  // function silently returned only the first ~1000 ids — and the reconcile
  // then treated every local row beyond that as an "orphan" and DELETED real
  // history. Page through ALL ids, ordered, so the manifest is complete.
  const ids: string[] = [];
  const PAGE = 1000;
  for (let offset = 0; ; offset += PAGE) {
    if (ctx.signal?.aborted) break;
    const { data, error } = await ctx.supabase
      .from("orders")
      .select("id")
      .eq("location_id", ctx.locationId)
      .gte("created_at", ctx.since)
      .order("id", { ascending: true })
      .range(offset, offset + PAGE - 1);

    if (error) throw error;
    const rows = data ?? [];
    ids.push(...rows.map((r: { id: string }) => r.id));
    if (rows.length < PAGE) break;
  }
  return ids;
}

/**
 * How many orders the delta still has to fetch — the cold-sync progress
 * denominator.
 *
 * `head: true` so no rows cross the wire, and the SAME keyset filter as
 * `pullOrdersDelta` so the number counts exactly the rows the loop is about to
 * walk (see EntityDescriptor.countPending for why "pending", not "total").
 *
 * `count: "estimated"` rather than "exact": exact is a COUNT(*) that gets
 * slower as history grows, and this drives a progress bar. Postgres returns an
 * exact count for a small result and the planner's estimate for a large one,
 * which is precisely the tradeoff a percentage wants.
 *
 * Returns null rather than throwing on any failure — the caller degrades to a
 * spinner, and a cosmetic count must never be able to fail a sync.
 */
export async function countOrdersPending(
  ctx: Omit<PullContext, "limit">,
): Promise<number | null> {
  try {
    let query = ctx.supabase
      .from("orders")
      .select("id", { count: "estimated", head: true })
      .eq("location_id", ctx.locationId);

    query = applyKeyset(
      query as any,
      "updated_at",
      "id",
      ctx.since,
      ctx.sinceId,
    );

    const { count, error } = await query;
    if (error) return null;
    return typeof count === "number" ? count : null;
  } catch {
    return null;
  }
}

export function registerOrdersDescriptor(): void {
  registerEntityQueries("orders", {
    pullDelta: pullOrdersDelta,
    pullManifest: pullOrdersManifest,
    countPending: countOrdersPending,
  });
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function str(v: unknown): string | null {
  return v === null || v === undefined ? null : String(v);
}

/**
 * Unicode case fold for the local search columns. THE one implementation —
 * `historyQuery.ts` folds the search term with the same function, and a fold
 * applied differently on the two sides is a search that silently misses.
 */
export function caseFold(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v);
  return s ? s.toLocaleLowerCase() : null;
}

/** SQLite has no boolean; null stays null so "unset" survives the round trip. */
function bool(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  return v ? 1 : 0;
}

/** The embedded arrays live in their own tables — don't duplicate them in payload. */
function stripChildren(o: ServerOrder): Record<string, unknown> {
  const { order_items, order_payments, ...rest } = o;
  return rest;
}

/**
 * Business day for an order, derived at ingest.
 *
 * TODO(business-day-config): this uses a naive UTC date. The real rule is
 * timezone + rolloverHour per location (lib/businessDay.ts
 * getBusinessDayForTimestamp), which needs the location's config threaded into
 * the pull context. Analytics (Phase 5) is the first consumer that cares, so
 * this is correct-shaped but not yet correct — wire the config before then.
 */
function businessDayOf(createdAt: string): string | null {
  if (!createdAt) return null;
  const d = new Date(createdAt);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}
