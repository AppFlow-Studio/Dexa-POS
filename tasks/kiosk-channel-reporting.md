# Reporting Kiosk Channel Segmentation

## Summary
Kiosk revenue must report separately from in-store POS revenue. The canonical reporting key is `orders.order_source`, with allowed values `pos`, `kiosk`, `online_store`, and `orderout`.

This POS repo branch does not contain a `create_kiosk_order` RPC. The implemented POS/backend contract therefore protects the current POS kiosk creation path (`create_order_v2` / `create_order_v3`) and adds a database trigger so self-service station orders are forced to `order_source = 'kiosk'` server-side at insert/update time. When Ali J's T4 `create_kiosk_order` lands, its function body still needs a live definition review to confirm it also sets `order_source = 'kiosk'`.

## Scope
- Backfill legacy `orders.order_source = 'online'` to canonical `online_store`.
- Enforce canonical `orders.order_source` values with a validated CHECK constraint.
- Normalize `order_source` writes server-side and force self-service stations to `kiosk`.
- Add additive channel-aware report RPCs without mutating existing report signatures.
- Update POS kiosk order creation/offline replay to pass `p_order_source` up front instead of post-insert patching.
- Harden POS source helpers so kiosk is its own channel and not treated as online/platform revenue.

## Non-Scope
- Website dashboard Reports UI cards/filters, owned in the website repo.
- The T4 kiosk build itself and `create_kiosk_order` implementation if it lands outside this branch.
- OrderOut historical mis-tag cleanup beyond preserving `orderout` in the canonical set.
- EOD/cash-drawer reporting.
- POS Previous Orders channel filtering.

## Plan
1. Trace kiosk order creation and reporting RPC availability in this branch.
2. Add Supabase migration for source backfill, canonical constraint, server-side channel enforcement, and channel report RPCs.
3. Update current POS `create_order` caller/replay paths to include `p_order_source` at initial RPC call.
4. Remove kiosk post-insert `orders.update({ order_source: 'kiosk' })` patches.
5. Add targeted static tests for migration/source contract and source-helper behavior.
6. Document Supabase and website QA steps for final evidence.

## Progress
- Confirmed `create_kiosk_order` does not exist in this branch.
- Added `20260722120000_kiosk_channel_reporting.sql`.
- Added `normalize_order_source`, `order_source_label`, and `is_order_reportable` helpers.
- Backfilled legacy `online` rows to `online_store`, set default `pos`, and enforced non-null canonical values through the nonblocking `orders_order_source_canonical` CHECK.
- Added `orders_enforce_order_source_channel` trigger: self-service stations become `kiosk`; non-self-service writes cannot spoof `kiosk`.
- Added `create_order_v2` / `create_order_v3` overloads accepting `p_order_source`; POS callers use these so current kiosk flow lands on the server-side contract.
- Added report RPCs: `get_business_day_summary_v2`, `get_sales_by_item_report_v2`, `get_payment_summary_stats_v2`, `get_admin_transaction_summary_v2`.
- `get_business_day_summary_v2.by_channel` uses the same `order_payments.captured_at` business-day basis as local `get_business_day_summary_v1` so channel gross/net can reconcile to the headline closing report.
- Re-audited after merging staging: staging did not add `create_kiosk_order`, and the current kiosk checkout still routes through `create_order_v2` / `create_order_v3`.
- Removed the migration's duplicate, looser text overload of `is_order_reportable`; item sales now call the existing locked enum predicate directly.
- Kept `get_sales_by_item_report_v2` response-compatible with the legacy report (`NULL` returns the same array shape and keys) while adding the optional source filter.
- Added merchant/location authorization to item and business-day reports and HQ-only assignment scoping to the payment/admin report RPCs.
- Payment failure/admin transaction summaries keep failed/void/refund rows in scope because those metrics intentionally report payment attempts and reversals. Recognized-order gating remains on order-derived sales figures; applying it to failure/void metrics would erase the rows those reports exist to measure.
- Updated POS source helper and tests so kiosk is not classified as online.

## Acceptance Checklist
- [ ] `create_kiosk_order` sets `order_source = 'kiosk'` server-side on every insert. Local status: not present in this branch; verify in T4/live function definition before marking Done.
- [ ] Backfill applied: zero rows remain with `order_source = 'online'`; live values are exactly `pos`, `kiosk`, `online_store`, `orderout`.
- [ ] CHECK constraint is live and validated on staging; non-canonical source insert/update fails.
- [ ] `get_business_day_summary_v2` returns `by_channel`, and channel totals sum exactly to headline totals on a mixed POS/kiosk/online day.
- [ ] Item-sales and payment-summary v2 reports filter to kiosk-only and pos-only correctly; NULL reproduces current all-channel behavior.
- [ ] `is_order_reportable` is reused for sales-item channel figures; payment/admin summaries preserve existing failed/void payment semantics while adding channel filters.
- [ ] Dashboard Sales Summary channel breakdown and report-tab channel filter are verified in the website repo.
- [ ] HQ `get_admin_transaction_summary_v2` exposes channel rows.
- [ ] Kiosk orders do not appear in Online Ordering Revenue-by-Platform; `online_order_provider = 'kiosk'` has no reporting effect.
- [ ] Refund of a kiosk order stays attributed to kiosk in all channel reports.
- [ ] Evidence pack: SQL outputs, report screenshots, and Temur sign-off.

## Verification
Targeted local checks:

```powershell
node -e "const fs=require('fs'); const m=fs.readFileSync('supabase/migrations/20260722120000_kiosk_channel_reporting.sql','utf8'); for (const s of ['orders_order_source_canonical','orders_enforce_order_source_channel','get_business_day_summary_v2','get_sales_by_item_report_v2','get_payment_summary_stats_v2','get_admin_transaction_summary_v2']) if (!m.includes(s)) throw new Error('missing '+s); console.log('kiosk channel reporting source checks passed')"
npx jest --runTestsByPath __tests__/kioskChannelReporting.test.ts __tests__/orderSource.test.ts
git diff --check
```

Current local status:

- Node source-contract check passed.
- Resolved CFD web artifacts match byte-for-byte between `cfd-web-build` and Android assets.
- Jest is blocked by the repo's existing `jest-expo` / React Native preset dependency issue (`@react-native/jest-preset` missing); no package or lockfile changes were made for this ticket.
- Targeted Android Kotlin compilation was started with Android Studio's bundled Java 21, but Gradle stopped at provisioning the missing NDK `27.0.12077973` and did not reach source compilation within five minutes. The validation processes were stopped; Android Studio/tablet build remains required after SDK provisioning completes.

Supabase/staging checks after running the migration:

```sql
SELECT order_source, count(*)
FROM public.orders
GROUP BY 1
ORDER BY 1;

SELECT conname, convalidated
FROM pg_constraint
WHERE conrelid = 'public.orders'::regclass
  AND conname = 'orders_order_source_canonical';

SELECT public.get_business_day_summary_v2('<location_id>'::uuid, '<business_date>'::date);

SELECT public.get_sales_by_item_report_v2('<merchant_id>'::uuid, '<location_id>'::uuid, '<start>'::timestamptz, '<end>'::timestamptz, 'kiosk');
SELECT public.get_sales_by_item_report_v2('<merchant_id>'::uuid, '<location_id>'::uuid, '<start>'::timestamptz, '<end>'::timestamptz, 'pos');
SELECT public.get_sales_by_item_report_v2('<merchant_id>'::uuid, '<location_id>'::uuid, '<start>'::timestamptz, '<end>'::timestamptz, NULL);

SELECT * FROM public.get_payment_summary_stats_v2('<start>'::timestamptz, '<end>'::timestamptz, 'kiosk');
SELECT * FROM public.get_payment_summary_stats_v2('<start>'::timestamptz, '<end>'::timestamptz, NULL);

SELECT * FROM public.get_admin_transaction_summary_v2(
  p_date_from := '<start>'::timestamptz,
  p_date_to := '<end>'::timestamptz
);
```

Compatibility check for item sales:

```sql
SELECT public.get_sales_by_item_report(
  '<merchant_id>'::uuid,
  '<location_id>'::uuid,
  '<start>'::timestamptz,
  '<end>'::timestamptz
)::jsonb = public.get_sales_by_item_report_v2(
  '<merchant_id>'::uuid,
  '<location_id>'::uuid,
  '<start>'::timestamptz,
  '<end>'::timestamptz,
  NULL
);
```

Expected: `true`.

Negative constraint check:

```sql
BEGIN;
UPDATE public.orders
SET order_source = 'bad_source'
WHERE id = '<safe_test_order_id>'::uuid;
ROLLBACK;
```

Expected: update fails with `orders_order_source_canonical` or trigger error.

Kiosk birth-contract check with a self-service station:

```sql
SELECT id, station_id, order_source, created_at
FROM public.orders
WHERE station_id = '<self_service_station_id>'::uuid
ORDER BY created_at DESC
LIMIT 10;
```

Expected: every created row has `order_source = 'kiosk'`.

## Website Tasks
- Add Sales Summary channel breakdown card consuming `get_business_day_summary_v2.by_channel`.
- Add channel filter on report tabs using the v2 report RPCs and `p_order_source`.
- Add/report HQ transaction channel dimension from `get_admin_transaction_summary_v2`.
- Verify Online Ordering Revenue-by-Platform does not treat kiosk as a platform.
- Confirm merchant-facing labels: `In-Store`, `Kiosk`, `Online`, `Delivery Apps`.
- Coordinate migration ownership: the website repo currently contains a same-named copy of `20260722120000_kiosk_channel_reporting.sql`. It must either be removed in favor of this migration or updated byte-for-byte with the corrected recognized-order and authorization contract before either PR merges.

## Files
- `supabase/migrations/20260722120000_kiosk_channel_reporting.sql`
- `lib/orderSource.ts`
- `lib/network/idempotencyKey.ts`
- `types/db-order-management-types.ts`
- `stores/useOrderStore.ts`
- `services/offlineSyncInit.ts`
- `__tests__/orderSource.test.ts`
- `__tests__/kioskChannelReporting.test.ts`
- `tasks/kiosk-channel-reporting.md`

## Open QA
- Run the migration on staging first.
- Confirm mixed-day channel totals against independent SQL.
- Verify current kiosk order placement on tablet writes `order_source = 'kiosk'`.
- Review T4 `create_kiosk_order` live definition once it lands; it is still absent locally and in the current GitHub default branch.
- Website repo still needs UI evidence and report screenshots.
