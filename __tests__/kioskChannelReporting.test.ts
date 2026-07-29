import fs from "fs";
import path from "path";

function read(...parts: string[]) {
  return fs.readFileSync(path.join(process.cwd(), ...parts), "utf8");
}

describe("kiosk channel reporting contract", () => {
  const migration = read(
    "supabase",
    "migrations",
    "20260722120000_kiosk_channel_reporting.sql",
  );
  const orderStore = read("stores", "useOrderStore.ts");
  const offlineSync = read("services", "offlineSyncInit.ts");
  const orderTypes = read("types", "db-order-management-types.ts");
  const sourceHelper = read("lib", "orderSource.ts");
  const idempotency = read("lib", "network", "idempotencyKey.ts");

  it("backfills and constrains orders.order_source to canonical reporting channels", () => {
    expect(migration).toContain("SET order_source = 'online_store'");
    expect(migration).toContain("WHERE lower(order_source) = 'online'");
    expect(migration).toContain("orders_order_source_canonical");
    expect(migration).toContain(
      "order_source IN ('pos', 'kiosk', 'online_store', 'orderout')",
    );
    expect(migration).toContain("VALIDATE CONSTRAINT orders_order_source_canonical");
    expect(migration).toContain("ALTER COLUMN order_source SET DEFAULT 'pos'");
    expect(migration).toContain("order_source IS NOT NULL");
    expect(migration).not.toContain("ALTER COLUMN order_source SET NOT NULL");
  });

  it("sets kiosk source through server-side create-order wrappers", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.resolve_create_order_source");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.enforce_order_source_channel");
    expect(migration).toContain("CREATE TRIGGER orders_enforce_order_source_channel");
    expect(migration).toContain("IF v_station_type = 'self_service' THEN");
    expect(migration).toContain("RETURN 'kiosk'");
    expect(migration).toContain("order_source=kiosk requires a self_service station");
    expect(migration).toContain("source-specific ingestion RPC");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.create_order_v2");
    expect(migration).toContain("p_order_source text");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.create_order_v3");
    expect(migration).toContain("SET order_source = v_source");
  });

  it("adds channel-segmented report RPCs without platform-provider dependence", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.get_business_day_summary_v2");
    expect(migration).toContain("'by_channel'");
    expect(migration).toContain("p.captured_at >= v_start_ts");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.get_sales_by_item_report_v2");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.get_payment_summary_stats_v2");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.get_admin_transaction_summary_v2");
    expect(migration).toContain(
      "public.is_order_reportable(o.status, o.payment_status)",
    );
    expect(migration).not.toContain(
      "CREATE OR REPLACE FUNCTION public.is_order_reportable",
    );
    expect(migration).not.toContain("online_order_provider");
  });

  it("preserves the legacy item-report shape and protects definer reports", () => {
    expect(migration).toContain("'category', category_name");
    expect(migration).toContain("'gross_sales', gross_sales");
    expect(migration).not.toContain("'summary', jsonb_build_object");
    expect(migration).toContain("public.user_merchant_id()");
    expect(migration).toContain("public.user_location_ids()");
    expect(migration).toContain("public.is_dexapos_admin()");
    expect(migration).toContain("public.get_admin_merchant_ids()");
  });

  it("passes p_order_source at initial POS order creation and removes kiosk post-insert updates", () => {
    expect(orderTypes).toContain("p_order_source");
    expect(orderStore).toContain(
      'p_order_source: order.order_source === "kiosk" ? "kiosk" : "pos"',
    );
    expect(offlineSync).toContain(
      'p_order_source: order.order_source === "kiosk" ? "kiosk" : "pos"',
    );
    expect(orderStore).not.toContain("Failed to sync kiosk order_source");
    expect(offlineSync).not.toContain("Failed to sync kiosk order_source");
    expect(idempotency).toContain("rpc === 'create_order' && k === 'p_station_id'");
  });

  it("keeps kiosk out of the online-order source set used for online drawers", () => {
    expect(sourceHelper).toContain(
      'export const ONLINE_ORDER_SOURCES = ["online", "orderout", "online_store"] as const',
    );
    expect(sourceHelper).toContain('"kiosk"');
    expect(sourceHelper).toContain("normalizeOrderSourceChannel");
    expect(sourceHelper).toContain("isKioskOrderSource");
  });
});
