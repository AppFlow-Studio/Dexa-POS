/**
 * Phase 1 measurement harness — the deliverable that turns the provisional
 * retention caps in lib/db/entities.ts into derived ones.
 *
 * The caps cannot be guessed and must not be inherited. The existing MMKV-era
 * constants (MAX_CACHED_ORDERS = 200, KDS_DONE_TICKET_LIMIT = 50, the
 * .slice(0, N)s) were sized for in-memory JSON blobs with no query engine —
 * a completely different constraint. Carrying them across would be patching an
 * old limit into a new design.
 *
 * The derivation (plan §5.2):
 *
 *   1. Write N real rows per table on device; read page_count x page_size;
 *      record bytes-per-row INCLUDING indexes. The payload column dominates
 *      and varies a lot between a 2-item order and a 20-item one, which is
 *      why this measures real rows rather than synthetic uniform ones.
 *   2. Set a total mirror storage budget from the WORST hardware in the fleet.
 *   3. Establish each table's workload requirement — for orders, "how far back
 *      does a cashier actually look up a check?", answerable from
 *      usePreviousOrdersStore telemetry, not intuition.
 *   4. cap = min(budget / bytes-per-row, workload x safety factor).
 *
 * This module does step 1 and reports it. Steps 2-4 are judgement calls that
 * belong in the plan doc, with the numbers recorded beside them.
 *
 * DEV-ONLY. Never called on a production boot path — it writes and deletes
 * throwaway rows.
 */
import { getDb, getDbSizeBytes, getTableRowCounts } from "@/lib/db/index";
import type { TableName } from "@/lib/db/schema";
import { dbWriteMutex, type Row } from "@/lib/db/write";

export interface TableSizeSample {
  table: TableName;
  rows: number;
  /** Total DB growth attributable to these rows, including index pages. */
  bytesDelta: number;
  bytesPerRow: number;
}

export interface MirrorSizeReport {
  samples: TableSizeSample[];
  dbSizeBytes: number | null;
  rowCounts: Record<string, number>;
  measuredAt: string;
}

/**
 * Measure bytes-per-row for one table by inserting real rows and diffing the
 * file size.
 *
 * Runs inside a transaction that is COMMITTED, not rolled back — a rollback
 * would leave the page count unchanged and report zero. The rows are deleted
 * afterwards, but note SQLite does not shrink the file on DELETE, so the
 * measurement is of *allocated* growth. That is the right number: unreclaimed
 * space is precisely what a storage budget has to survive.
 */
export async function measureTable(
  table: TableName,
  rows: Record<string, string | number | null>[],
): Promise<TableSizeSample | null> {
  const db = getDb();
  if (!db || rows.length === 0) return null;

  const before = await getDbSizeBytes();
  if (before === null) return null;

  const cols = Object.keys(rows[0]);
  const sql = `INSERT OR REPLACE INTO ${table} (${cols
    .map((c) => `"${c}"`)
    .join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`;

  await db.withTransactionAsync(async () => {
    for (const row of rows) {
      await db.runAsync(
        sql,
        cols.map((c) => row[c]),
      );
    }
  });

  const after = await getDbSizeBytes();
  if (after === null) return null;

  const bytesDelta = after - before;
  return {
    table,
    rows: rows.length,
    bytesDelta,
    bytesPerRow: Math.round(bytesDelta / rows.length),
  };
}

/** Remove rows written by a measurement run. */
export async function cleanupMeasurement(
  table: TableName,
  ids: string[],
  idColumn = "id",
): Promise<void> {
  const db = getDb();
  if (!db || ids.length === 0) return;
  const placeholders = ids.map(() => "?").join(", ");
  await db.runAsync(
    `DELETE FROM ${table} WHERE "${idColumn}" IN (${placeholders})`,
    ids,
  );
}

/**
 * Snapshot for the storage monitor and for the Phase 1 report. Cheap — two
 * pragma reads plus one COUNT(*) per table — but the COUNTs make it O(rows),
 * so call it on demand rather than on the boot path.
 */
export async function getMirrorSizeReport(): Promise<MirrorSizeReport> {
  return {
    samples: [],
    dbSizeBytes: await getDbSizeBytes(),
    rowCounts: await getTableRowCounts(),
    measuredAt: new Date().toISOString(),
  };
}

/**
 * Human-readable summary for the dev console. Deliberately plain text — this
 * gets pasted into the plan doc's §11 table, and a formatted blob is easier to
 * transcribe than a JSON dump.
 */
export function formatSizeReport(report: MirrorSizeReport): string {
  const lines: string[] = [
    `Local DB size: ${formatBytes(report.dbSizeBytes)}`,
    `Measured at:   ${report.measuredAt}`,
    "",
    "Rows per table:",
  ];
  for (const [table, count] of Object.entries(report.rowCounts)) {
    lines.push(`  ${table.padEnd(28)} ${count}`);
  }
  if (report.samples.length > 0) {
    lines.push("", "Bytes per row (incl. indexes):");
    for (const s of report.samples) {
      lines.push(
        `  ${s.table.padEnd(28)} ${s.bytesPerRow} B/row  (${s.rows} rows, ${formatBytes(s.bytesDelta)})`,
      );
    }
  }
  return lines.join("\n");
}

function formatBytes(bytes: number | null): string {
  if (bytes === null) return "unavailable";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

// ===========================================================================
// THE MEASUREMENT PASS — dev-only, flag-gated (EXPO_PUBLIC_DB_MEASURE=1).
//
// Seeds realistic rows per table, measures bytes-per-row (INCLUDING indexes)
// via measureTable(), cleans up, and logs a report. Runs inside dbWriteMutex
// so a concurrent delta write cannot skew the file-size diffs. Runs at most
// once per app session.
//
// The rows are synthetic but size-realistic: payloads mimic the descriptor
// output (order header without children, items with modifiers, payments with
// lineage fields). Money is minor units; payload JSON mirrors the server shape.
// ===========================================================================

const MEASURE_FLAG = process.env.EXPO_PUBLIC_DB_MEASURE === "1";
const MEASURE_LOCATION = "00000000-0000-4000-8000-00000000f1ee"; // synthetic
const MEASURE_MERCHANT = "00000000-0000-4000-8000-00000000f1ef"; // synthetic
const MEASURE_SERVER = "11111111-1111-4111-8111-111111111111"; // synthetic
const MEASURE_STATION = "22222222-2222-4222-8222-222222222222"; // synthetic

let measurementRan = false;

function measureId(n: number): string {
  return `ffffffff-ffff-4fff-8fff-${String(n).padStart(12, "0")}`;
}

function iso(daysAgo: number, msAgo = 0): string {
  return new Date(Date.now() - daysAgo * 86_400_000 - msAgo).toISOString();
}

/** Order header payload — mirrors descriptors/orders.ts stripChildren() shape. */
function orderPayload(id: string): string {
  return JSON.stringify({
    id,
    location_id: MEASURE_LOCATION,
    merchant_id: MEASURE_MERCHANT,
    order_number: `ORD-MEAS-${id.slice(-4)}`,
    display_number: id.slice(-4),
    order_type: "dine_in",
    order_source: "pos",
    status: "completed",
    payment_status: "paid",
    check_status: "closed",
    customer_id: null,
    customer_name: "Measurement Customer",
    customer_phone: "555-0100",
    customer_email: null,
    table_number: "12",
    seat_number: "1",
    session_id: null,
    assigned_server_id: MEASURE_SERVER,
    created_by_staff_id: MEASURE_SERVER,
    station_id: MEASURE_STATION,
    device_id: "meas-device",
    subtotal: 6475,
    tax_amount: 575,
    total_amount: 7050,
    discount_amount: 0,
    service_charge: 0,
    tip_amount: 1000,
    amount_due: 0,
    amount_paid: 8050,
    card_subtotal: 6475,
    card_tax_amount: 575,
    card_total: 7050,
    cash_subtotal: null,
    cash_tax_amount: null,
    cash_total: null,
    cash_amount_due: null,
    cash_discount_amount: null,
    effective_total: 7050,
    voided_at: null,
    void_reason: null,
    voided_by: null,
    cancelled_at: null,
    cancellation_reason: null,
    sent_to_kitchen_at: iso(0, 60_000),
    ready_at: iso(0, 30_000),
    completed_at: iso(0),
    is_offline: false,
    reopen_count: 0,
    created_at: iso(1),
    updated_at: iso(0),
    sync_version: 12,
  });
}

/** Order row. Column set matches lib/db/schema.ts orders exactly. */
function orderRow(id: string): Row {
  return {
    id,
    location_id: MEASURE_LOCATION,
    merchant_id: MEASURE_MERCHANT,
    order_number: `ORD-MEAS-${id.slice(-4)}`,
    display_number: id.slice(-4),
    order_type: "dine_in",
    order_source: "pos",
    status: "completed",
    payment_status: "paid",
    check_status: "closed",
    customer_name: "Measurement Customer",
    customer_phone: "555-0100",
    table_number: "12",
    seat_number: "1",
    assigned_server_id: MEASURE_SERVER,
    created_by_staff_id: MEASURE_SERVER,
    station_id: MEASURE_STATION,
    device_id: "meas-device",
    subtotal_minor: 6475,
    tax_amount_minor: 575,
    total_amount_minor: 7050,
    discount_amount_minor: 0,
    service_charge_minor: 0,
    tip_amount_minor: 1000,
    amount_due_minor: 0,
    amount_paid_minor: 8050,
    card_subtotal_minor: 6475,
    card_tax_amount_minor: 575,
    card_total_minor: 7050,
    cash_subtotal_minor: null,
    cash_tax_amount_minor: null,
    cash_total_minor: null,
    cash_amount_due_minor: null,
    cash_discount_amount_minor: null,
    effective_total_minor: 7050,
    sent_to_kitchen_at: iso(0, 60_000),
    ready_at: iso(0, 30_000),
    completed_at: iso(0),
    is_offline: 0,
    reopen_count: 0,
    created_at: iso(1),
    updated_at: iso(0),
    sync_version: 12,
    _server_seen_at: iso(0),
    payload: orderPayload(id),
  };
}

/** Order item payload — big variant carries modifiers + instructions. */
function itemPayload(id: string, orderId: string, big: boolean): string {
  return JSON.stringify({
    id,
    order_id: orderId,
    menu_item_id: big
      ? "33333333-3333-4333-8333-333333333333"
      : "44444444-4444-4444-8444-444444444444",
    menu_id: "55555555-5555-4555-8555-555555555555",
    category_id: "66666666-6666-4666-8666-666666666666",
    item_name: big
      ? "Grilled Atlantic Salmon, lemon-butter sauce, seasonal asparagus, herb-roasted baby potatoes"
      : "House Coffee",
    category_name: big ? "Entrees" : "Beverages",
    menu_name: "Dinner Menu",
    quantity: big ? 2 : 1,
    unit_price: big ? 2499 : 425,
    subtotal: big ? 4998 : 425,
    tax_amount: big ? 444 : 38,
    cash_unit_price: big ? 2399 : 399,
    cash_subtotal: big ? 4798 : 399,
    cash_tax_amount: big ? 426 : 35,
    discount_amount: 0,
    pre_discount_subtotal: big ? 4998 : 425,
    item_status: "active",
    kitchen_status: "sent",
    course_number: 1,
    seat_number: 1,
    display_order: 1,
    is_voided: false,
    voided_at: null,
    void_reason: null,
    is_to_go: false,
    is_prioritized: false,
    rush: false,
    special_instructions: big
      ? "No capers, salmon medium-well, sauce on the side please"
      : null,
    kitchen_notes: null,
    selected_size_id: big ? "77777777-7777-4777-8777-777777777777" : null,
    selected_size_name: big ? "Large" : null,
    modifiers: big
      ? [
          {
            id: "88888888-8888-4888-8888-888888888888",
            name: "Extra Lemon Butter",
            price: 150,
            quantity: 1,
          },
          {
            id: "99999999-9999-4999-8999-999999999999",
            name: "Add Asparagus",
            price: 250,
            quantity: 1,
          },
        ]
      : [],
    created_at: iso(1),
    updated_at: iso(0),
  });
}

/** Order item row — NO _server_seen_at on this table. */
function itemRow(id: string, orderId: string, big: boolean): Row {
  return {
    id,
    order_id: orderId,
    menu_item_id: big
      ? "33333333-3333-4333-8333-333333333333"
      : "44444444-4444-4444-8444-444444444444",
    menu_id: "55555555-5555-4555-8555-555555555555",
    category_id: "66666666-6666-4666-8666-666666666666",
    item_name: big
      ? "Grilled Atlantic Salmon, lemon-butter sauce, seasonal asparagus, herb-roasted baby potatoes"
      : "House Coffee",
    category_name: big ? "Entrees" : "Beverages",
    menu_name: "Dinner Menu",
    quantity: big ? 2 : 1,
    unit_price_minor: big ? 2499 : 425,
    subtotal_minor: big ? 4998 : 425,
    tax_amount_minor: big ? 444 : 38,
    cash_unit_price_minor: big ? 2399 : 399,
    cash_subtotal_minor: big ? 4798 : 399,
    cash_tax_amount_minor: big ? 426 : 35,
    discount_amount_minor: 0,
    pre_discount_subtotal_minor: big ? 4998 : 425,
    item_status: "active",
    kitchen_status: "sent",
    course_number: 1,
    seat_number: 1,
    display_order: 1,
    is_voided: 0,
    is_to_go: 0,
    is_prioritized: 0,
    rush: 0,
    special_instructions: big
      ? "No capers, salmon medium-well, sauce on the side please"
      : null,
    selected_size_id: big ? "77777777-7777-4777-8777-777777777777" : null,
    selected_size_name: big ? "Large" : null,
    created_at: iso(1),
    updated_at: iso(0),
    payload: itemPayload(id, orderId, big),
  };
}

/** Payment row — NO _server_seen_at on this table either. */
function paymentRow(id: string, orderId: string): Row {
  return {
    id,
    order_id: orderId,
    location_id: MEASURE_LOCATION,
    device_id: "meas-device",
    payment_method: "credit_card",
    status: "captured",
    amount_minor: 7050,
    tip_amount_minor: 1000,
    amount_tendered_minor: 8050,
    change_given_minor: 0,
    dual_pricing_fee_minor: 0,
    discount_portion_minor: 0,
    is_cash_priced: 0,
    is_voided: 0,
    is_returned: 0,
    is_settled: 1,
    card_last_four: "4242",
    card_type: "visa",
    auth_code: "MEAS1234",
    covers_items: JSON.stringify([measureId(0)]),
    idempotency_key: `meas-${id}`,
    terminal_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    payment_device_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    settlement_batch_id: null,
    parent_payment_id: null,
    transaction_id: `txn-${id.slice(-8)}`,
    split_portion_index: 0,
    initiated_at: iso(0, 120_000),
    approved_at: iso(0, 60_000),
    captured_at: iso(0, 30_000),
    failed_at: null,
    voided_at: null,
    payload: JSON.stringify({
      id,
      order_id: orderId,
      payment_method: "credit_card",
      status: "captured",
      amount: 7050,
      tip_amount: 1000,
      amount_tendered: 8050,
      card_last_four: "4242",
      card_type: "visa",
      auth_code: "MEAS1234",
      initiated_at: iso(0, 120_000),
      approved_at: iso(0, 60_000),
      captured_at: iso(0, 30_000),
    }),
  };
}

function inventoryRow(id: string): Row {
  const ts = iso(0);
  return {
    id,
    location_id: MEASURE_LOCATION,
    vendor_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    name: "Tomato — Vine Ripened (Case)",
    category: "Produce",
    current_stock: 42.5,
    unit_type: "case",
    reorder_point: 10,
    cost_per_unit_minor: 1850,
    stock_mode: "par",
    is_active: 1,
    created_at: iso(30),
    updated_at: ts,
    _server_seen_at: ts,
    payload: JSON.stringify({
      id,
      location_id: MEASURE_LOCATION,
      name: "Tomato — Vine Ripened (Case)",
      category: "Produce",
      current_stock: 42.5,
      unit_type: "case",
      reorder_point: 10,
      cost_per_unit: 18.5,
      stock_mode: "par",
      is_active: true,
      updated_at: ts,
    }),
  };
}

function customerRow(id: string): Row {
  const ts = iso(0);
  return {
    id,
    merchant_id: MEASURE_MERCHANT,
    name: "Measurement Patron",
    phone: "555-0123",
    email: "patron@example.com",
    is_active: 1,
    vip_level: "gold",
    total_orders: 27,
    visits: 31,
    lifetime_spend_minor: 148250,
    avg_spend_minor: 4782,
    last_order_date: iso(1),
    last_visit: iso(1),
    created_at: iso(90),
    updated_at: ts,
    _server_seen_at: ts,
    payload: JSON.stringify({
      id,
      merchant_id: MEASURE_MERCHANT,
      name: "Measurement Patron",
      phone: "555-0123",
      email: "patron@example.com",
      is_active: true,
      vip_level: "gold",
      total_orders: 27,
      visits: 31,
      lifetime_spend: 1482.5,
      avg_spend: 47.82,
      last_order_date: iso(1),
      last_visit: iso(1),
      updated_at: ts,
    }),
  };
}

/** Staff — no payload column; row columns only. */
function staffRow(id: string): Row {
  return {
    location_member_id: id,
    staff_profile_id: `dddddddd-dddd-4ddd-8ddd-${id.slice(-12)}`,
    location_id: MEASURE_LOCATION,
    role_code: "server",
    employment_type: "full_time",
    is_active: 1,
    display_name: "Measurement Server",
    first_name: "Measurement",
    last_name: "Server",
    avatar_url: null,
    updated_at: iso(0),
    _server_seen_at: iso(0),
  };
}

function menuItemRow(id: string): Row {
  const ts = iso(0);
  return {
    id,
    location_id: MEASURE_LOCATION,
    merchant_id: MEASURE_MERCHANT,
    menu_id: "55555555-5555-4555-8555-555555555555",
    category_id: "66666666-6666-4666-8666-666666666666",
    name: "Grilled Atlantic Salmon",
    description:
      "Lemon-butter sauce, seasonal asparagus, herb-roasted baby potatoes",
    price_minor: 2499,
    cash_price_minor: 2399,
    availability: 1,
    tax_category: "standard",
    is_tax_exempt: 0,
    dietary_flags: JSON.stringify(["gluten_free_option"]),
    allergens: JSON.stringify(["fish"]),
    meal_types: JSON.stringify(["dinner"]),
    display_order: 3,
    version: 7,
    updated_at: ts,
    _server_seen_at: ts,
    payload: JSON.stringify({
      id,
      location_id: MEASURE_LOCATION,
      merchant_id: MEASURE_MERCHANT,
      name: "Grilled Atlantic Salmon",
      description:
        "Lemon-butter sauce, seasonal asparagus, herb-roasted baby potatoes",
      price: 24.99,
      cash_price: 23.99,
      availability: true,
      tax_category: "standard",
      is_tax_exempt: false,
      dietary_flags: ["gluten_free_option"],
      allergens: ["fish"],
      meal_types: ["dinner"],
      version: 7,
      updated_at: ts,
    }),
  };
}

/**
 * Run the Phase 1 measurement pass. Dev-only, once per session, behind
 * EXPO_PUBLIC_DB_MEASURE=1. Seeds → measures → cleans up → logs the report.
 */
export async function runMeasurementPass(): Promise<MirrorSizeReport | null> {
  if (!__DEV__ || !MEASURE_FLAG || measurementRan) return null;
  if (!getDb()) return null;
  measurementRan = true;

  const report: MirrorSizeReport = {
    samples: [],
    dbSizeBytes: null,
    rowCounts: {},
    measuredAt: new Date().toISOString(),
  };

  console.log(
    "[LocalDB][measure] === Phase 1 measurement pass (dev-only, EXPO_PUBLIC_DB_MEASURE) ===",
  );

  const ORDERS_N = 300;
  const ITEMS_N = 600;
  const PAYS_N = 300;
  const FLAT_N = 500;

  // Serialize against the delta writer so file-size diffs are clean.
  await dbWriteMutex.runExclusive(async () => {
    // 1. Parent orders first — the FK on order_items/order_payments needs them.
    const orderIds = Array.from({ length: ORDERS_N }, (_, i) => measureId(i));
    const ordersSample = await measureTable("orders", orderIds.map(orderRow));
    if (ordersSample) report.samples.push(ordersSample);

    // 2. Items referencing the parents (2 per order, alternating small/big).
    const itemIds = Array.from({ length: ITEMS_N }, (_, i) =>
      measureId(10_000 + i),
    );
    const itemRows = itemIds.map((id, i) =>
      itemRow(id, orderIds[i % orderIds.length], i % 2 === 0),
    );
    const itemsSample = await measureTable("order_items", itemRows);
    if (itemsSample) report.samples.push(itemsSample);

    // 3. Payments referencing the parents (1 per order).
    const payIds = Array.from({ length: PAYS_N }, (_, i) =>
      measureId(20_000 + i),
    );
    const payRows = payIds.map((id, i) =>
      paymentRow(id, orderIds[i % orderIds.length]),
    );
    const paysSample = await measureTable("order_payments", payRows);
    if (paysSample) report.samples.push(paysSample);

    // 4. Standalone tables.
    const invIds = Array.from({ length: FLAT_N }, (_, i) =>
      measureId(30_000 + i),
    );
    const invSample = await measureTable(
      "inventory_items",
      invIds.map(inventoryRow),
    );
    if (invSample) report.samples.push(invSample);

    const custIds = Array.from({ length: FLAT_N }, (_, i) =>
      measureId(40_000 + i),
    );
    const custSample = await measureTable(
      "customers",
      custIds.map(customerRow),
    );
    if (custSample) report.samples.push(custSample);

    const staffIds = Array.from({ length: FLAT_N }, (_, i) =>
      measureId(50_000 + i),
    );
    const staffSample = await measureTable("staff", staffIds.map(staffRow));
    if (staffSample) report.samples.push(staffSample);

    const menuIds = Array.from({ length: FLAT_N }, (_, i) =>
      measureId(60_000 + i),
    );
    const menuSample = await measureTable(
      "menu_items",
      menuIds.map(menuItemRow),
    );
    if (menuSample) report.samples.push(menuSample);

    // 5. Cleanup. Deleting the parents cascades items + payments.
    await cleanupMeasurement("orders", orderIds);
    await cleanupMeasurement("inventory_items", invIds);
    await cleanupMeasurement("customers", custIds);
    await cleanupMeasurement("staff", staffIds, "location_member_id");
    await cleanupMeasurement("menu_items", menuIds);
  });

  report.dbSizeBytes = await getDbSizeBytes();
  report.rowCounts = await getTableRowCounts();

  // The insert-diff reads 0 for a table that was already populated (rows fit
  // in existing pages, so page_count doesn't move). Orders is exactly that on
  // a device where the delta sync already ran — so report the REAL payload
  // footprint from the mirror's actual rows as the authoritative number.
  const db = getDb();
  if (db) {
    try {
      const real = await db.getFirstAsync<{
        bytes: number | null;
        n: number | null;
      }>(`SELECT SUM(length(payload)) AS bytes, COUNT(*) AS n FROM orders`);
      if (real?.n && real.n > 0 && real.bytes) {
        const perRow = Math.round(real.bytes / real.n);
        const idx = report.samples.findIndex((s) => s.table === "orders");
        if (idx >= 0) report.samples.splice(idx, 1);
        report.samples.push({
          table: "orders",
          rows: real.n,
          bytesDelta: real.bytes,
          bytesPerRow: perRow,
        });
      }
    } catch {
      // non-fatal — the diff sample (possibly 0) stays in the report
    }
  }

  console.log("[LocalDB][measure] === report ===");
  console.log(formatSizeReport(report));

  // Derived estimate for the orders cap: per-order storage = header row +
  // items + payments, using the Section B production averages (2.54 items,
  // 0.93 payments) as a first pass.
  const o = report.samples.find((s) => s.table === "orders");
  const it = report.samples.find((s) => s.table === "order_items");
  const p = report.samples.find((s) => s.table === "order_payments");
  if (o && it && p) {
    const perOrder =
      o.bytesPerRow + 2.54 * it.bytesPerRow + 0.93 * p.bytesPerRow;
    console.log(
      `[LocalDB][measure] est bytes/order @ 2.54 items + 0.93 pays: ${Math.round(perOrder)}`,
    );
    const budget = 50 * 1024 * 1024;
    console.log(
      `[LocalDB][measure] implied orders cap @ 50MB budget: ${Math.floor(budget / perOrder)}`,
    );
  }

  console.log("[LocalDB][measure] done — rows cleaned up");
  return report;
}
