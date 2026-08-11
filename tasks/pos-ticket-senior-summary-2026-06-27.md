# POS Ticket Senior Summary - 2026-06-27

## Executive Summary

This document summarizes the POS tickets handled on branch `alidika-dev-pos` so far. There are 11 POS tickets in scope:

| # | Ticket | Current status | Migration needed |
| --- | --- | --- | --- |
| 1 | Daily Shift Report calendar selects previous day | Code implemented, manual QA pending | No |
| 2 | End of Day Review staff deep link | Code implemented, manual QA pending | No |
| 3 | Printed receipt remove unused dual-pricing alternate total line | Code complete, physical print QA pending | No |
| 4 | DESSERT menu grid duplicate card | Code complete, on-device QA pending | No for current frontend guard |
| 5 | Stale manual cash prices after 4% dual-pricing flip | Data correction migration prepared, target data unresolved | Yes |
| 6 | KDS tickets show server / creator | Code and migration ready, staging QA pending | Yes |
| 7 | Order numbers reset at UTC midnight + Previous Orders newest-first | Migration ready, staging QA pending | Yes |
| 8 | POS platform logos on KDS and Previous Orders | Code complete, on-device QA pending | No |
| 9 | POS/Web location POS settings + station overrides | POS/schema code ready, web UI and QA pending | Yes |
| 10 | Timesheets configurable auto clock-out | POS/backend migration ready, web UI separate, staging QA pending | Yes |
| 11 | KDS rushed/prioritized tickets top-band sort | POS/KDS code and migration ready, staging QA pending | Yes |

The migrations currently added for these tickets are:

- `supabase/migrations/20260623120000_reprice_charcoal_gardenia_stale_cash_prices.sql`
- `supabase/migrations/20260629120000_kds_ticket_server_name.sql`
- `supabase/migrations/20260629130000_order_numbers_location_timezone.sql`
- `supabase/migrations/20260630120000_station_pos_config_overrides.sql`
- `supabase/migrations/20260702120000_auto_clock_out_stale_shifts.sql`
- `supabase/migrations/20260712120000_kds_rush_priority_sort.sql`

Important note on the stale cash-price migration: the first Supabase run could not find the expected Charcoal Gardenia rows, so that migration was changed to no-op with a notice when target rows are absent. If it no-ops, the stale cash-price ticket is not corrected yet and still needs the correct target IDs or a website re-price flow.

## 1. Daily Shift Report Calendar Date Off-by-One

## Summary

Ticket: Timeclock -> Daily Shift Report date selector picked the previous day after selecting a calendar date.

Root issue: date-only selection was being affected by UTC/date round-trip behavior. A selected date like `2026-06-10` could be interpreted through a timezone boundary and display/fetch as the prior day.

## What Changed

- Switched the selected report date state to a local date key string, for example `yyyy-MM-dd`.
- Calendar selection now stores `day.dateString` directly instead of going through a UTC `Date` conversion.
- Display parsing uses a local noon date to avoid timezone boundary drift.
- Daily report fetch bounds now use merchant-local day handling when store timezone is available.
- Initial load and manual selection path now use the same date-key model.

## Files

- `app/(profiles-and-timeclock)/timeclock.tsx`

## Migration

No migration required. This was a client date-selection and query-boundary bug, not bad persisted data.

## Verification Status

Automated targeted test was not added for this UI-only flow.

Manual QA still required:

- Tap several dates and confirm the selected pill, highlighted calendar date, and report rows match exactly.
- Test month boundaries.
- Confirm there is no previous-day shift.
- Confirm merchant timezone boundaries behave correctly.

## 2. End of Day Review Staff Deep Link

## Summary

Ticket: End of Day blocker should take the merchant directly to unresolved staff instead of opening the generic timeclock screen.

Root issue: the EOD "Review staff" action had no unresolved-staff context, so the user still had to manually locate the blocker.

## What Changed

- EOD now derives unresolved staff review employee IDs from timeclock sessions, excluding the active employee.
- "Review staff" routes to the timeclock screen with unresolved review query params:
  - `reviewMode=unresolved`
  - `focusEmployeeIds`
  - `focusStaffProfileIds`
- The timeclock screen reads those params and:
  - sorts focused unresolved staff higher in the list
  - highlights matching staff rows
  - auto-scrolls to the first focus target
  - shows an EOD review focus banner
- Fallback behavior remains the normal timeclock screen when there is no blocker context.

## Files

- `app/(main)/settings/end-of-day.tsx`
- `components/settings/end-of-day/steps/EodStepOverview.tsx`
- `app/(profiles-and-timeclock)/timeclock.tsx`

## Migration

No migration required. This was navigation/context wiring and timeclock UI focus behavior.

## Verification Status

Automated targeted test was not added for this navigation/UI flow.

Manual QA still required:

- From End of Day with 1 unresolved staff member, tap `Review staff`.
- Confirm the target staff row is surfaced immediately and highlighted.
- Confirm the "Shifts Reviewed" blocker card routes the same way.
- Confirm no-blocker case opens the normal timeclock screen.
- Confirm back navigation returns to End of Day.

## 3. Printed Receipt Remove Unused Dual-Pricing Alternate Total Line

## Summary

Ticket: finalized POS printed receipts showed the charged total plus an alternate unused method line, such as `If paid by card`, even when the customer paid cash.

Expected behavior: finalized printed receipts should show only the actual charged pricing mode, for example `TOTAL (CASH)` plus the cash tender / amount paid. Card-paid tickets should show `TOTAL (CARD)` and no `If paid by cash` line.

## What Changed

- Added receipt pricing mode handling for printed receipt data:
  - `cash`
  - `card`
  - `dual`
- `PrinterService` resolves receipt pricing mode from actual non-voided payments.
- Printed receipt templates suppress alternate cash/card total rows unless the receipt is intentionally in `dual` mode.
- Cash-paid finalized receipts collapse card fields to cash values so item lines and totals reconcile.
- Card-paid finalized receipts strip cash alternate values.
- Merge conflict was resolved by preserving upstream scoped split-payment receipt behavior and applying pricing mode resolution to the scoped payment when present.

## Files

- `types/printer.ts`
- `services/printing/PrinterService.ts`
- `services/printing/templates/ReceiptDocumentTemplate.ts`
- `services/printing/templates/ReceiptTemplate.ts`
- `__tests__/receipt-print-pricing-mode.test.ts`
- `tasks/receipt-print-remove-alt-total-line.md`
- `tasks/ticket-log.md`

## Migration

No migration required. This was a render-only printed receipt change. No pricing math, order totals, database columns, or dual-pricing calculation logic were modified.

## Verification Status

Targeted automated verification passed:

```powershell
npx jest --runTestsByPath __tests__/receipt-print-pricing-mode.test.ts
```

Manual QA still required:

- Cash-paid order prints `TOTAL (CASH)` and no alternate `If paid by card` line.
- Card-paid order prints `TOTAL (CARD)` and no alternate `If paid by cash` line.
- Reprint historical receipt and confirm the alternate line is gone.
- Physical print verification on Star Micronics and Landi built-in thermal.

## 4. DESSERT Menu Grid Duplicate Card

## Summary

Ticket: Saucy POS Order Line -> DESSERT -> Crepes & Waffles showed a duplicate/overlapping card for `Strawberry Banana Crepe`.

Root hypothesis: the sync payload can return duplicate rows for the same `menu_item.id` within one category. The grid uses item IDs as keys, so duplicate IDs can cause duplicate-key/recycling artifacts and visible card overlap.

## What Changed

- Added a small sync-dedupe helper for category item rows.
- Category rows are sorted first, then duplicate `menu_item.id` rows are dropped before mapping into the POS menu grid item model.
- The first canonical row is preserved to avoid changing display order or pricing behavior.
- Development logging warns when duplicate category rows are dropped, with menu/category context.
- Added targeted regression coverage.

## Files

- `lib/menuSyncDedupe.ts`
- `stores/useMenuStore.ts`
- `__tests__/menu-sync-dedupe.test.ts`
- `tasks/menu-grid-dessert-duplicate-card.md`
- `tasks/ticket-log.md`

## Migration

No migration is required for the implemented frontend guard.

If seniors want the upstream duplicate row removed from the database/RPC/view, that should be a separate DB investigation using the live `get_menu_with_categories` / `v_location_menu_items` output. We should not write a cleanup migration without exact duplicate row IDs or a confirmed source query.

## Verification Status

Targeted automated verification passed:

```powershell
npx jest --runTestsByPath __tests__/menu-sync-dedupe.test.ts
```

Manual QA still required:

- POS Order Line -> DESSERT -> Crepes & Waffles shows one `Strawberry Banana Crepe` card.
- Item order remains correct.
- Price and cash price remain correct.
- Spot-check at least one other category/menu to confirm no regression.

## 5. Stale Manual Cash Prices After 4% Dual-Pricing Flip

## Summary

Ticket: four Charcoal Gardenia / S2 Milk Shakes were created under manual pricing and retained `cash_price = price` after the store flipped to 4% dual pricing.

Known affected items:

| Item | Current | Expected cash |
| --- | --- | --- |
| Coffee milkshake | `$7.99 / $7.99` | `$7.68` |
| Kitkat | `$7.99 / $7.99` | `$7.68` |
| Oreo Milkshake | `$7.99 / $7.99` | `$7.68` |
| pistachio milkshake | `$7.99 / $7.99` | `$7.68` |

Root issue: stored manual cash prices override the automatic 4% discount read path. The calculator itself is not considered defective.

## What Changed

- Created a task plan and verification runbook.
- Added a guarded Supabase migration to clear stale stored `cash_price` values for the 4 known rows.
- The migration initially aborted when Supabase could not find Charcoal Gardenia target rows.
- The migration was then adjusted to be environment-safe:
  - 4 matching rows: clear `cash_price`
  - 0 matching rows: print notice and no-op
  - partial/ambiguous count: abort

## Files

- `tasks/dual-pricing-stale-manual-cash-price-reprice.md`
- `tasks/ticket-log.md`
- `supabase/migrations/20260623120000_reprice_charcoal_gardenia_stale_cash_prices.sql`

## Migration

Migration exists:

```text
supabase/migrations/20260623120000_reprice_charcoal_gardenia_stale_cash_prices.sql
```

Important: if the migration prints the no-op notice, the data correction did not happen in that environment. The ticket then still needs either:

- correct target row IDs / merchant / location IDs, or
- manual website re-price flow for the affected items.

## Verification Status

No automated app test is applicable because this is a data QA ticket.

Manual / data QA still required:

- Run the migration in the correct Supabase environment or re-price through the website.
- Confirm the 4 named items show `$7.99 / $7.68` on POS and web.
- Sweep Drinks, Acai, Coffee, Combos, and Food for stale cash prices.
- Run scoped checks for `menu_items`, `location_menu_item_overrides`, and `menu_item_menus`.
- Confirm new item creation auto-applies the 4% cash discount.
- Attach screen recording proof and get Abubeckr or Temur signoff.

## 6. KDS Tickets Show Server / Creator

## Summary

Ticket: KDS tickets should show which staff member placed the order.

Root issue: `orders.created_by_staff_id`, `orders.assigned_server_id`, and `kds_displays.show_server_name` already existed, but `get_kds_tickets_v2` did not return `server_id` or `server_name`, so the KDS had nothing to render.

## What Changed

- Added a full `CREATE OR REPLACE FUNCTION public.get_kds_tickets_v2(...)` migration.
- The RPC resolves `kds_displays.show_server_name` once per call and defaults to `true`.
- Each ticket payload now includes `server_id` and `server_name`.
- Server identity priority is `orders.created_by_staff_id`, then `orders.assigned_server_id`.
- `server_name` resolves from `staff_profiles.display_name`, then first/last name fallback.
- If `show_server_name = false`, the RPC returns `server_name = null`.
- KDS ticket headers render `Server: <name>` only when `ticket.server_name` is non-empty.
- KDS ticket type and store equality logic were updated so server-name changes trigger render updates.

## Files

- `supabase/migrations/20260629120000_kds_ticket_server_name.sql`
- `types/kds.ts`
- `stores/useKDSStore.ts`
- `app/(main)/kds.tsx`
- `tasks/kds-ticket-server-name.md`
- `tasks/ticket-log.md`

## Migration

Migration exists:

```text
supabase/migrations/20260629120000_kds_ticket_server_name.sql
```

This function remains `STABLE SECURITY DEFINER` with `search_path` pinned to `public, pg_temp`.

## Verification Status

Targeted checks passed on 2026-06-29:

```powershell
npx jest --runTestsByPath __tests__/kdsTimer.test.ts
npx jest --runTestsByPath __tests__/kdsAutomation.test.ts
```

Manual QA still required:

- Apply migration on staging.
- POS-created order shows the staff name in the KDS header.
- Online/no-staff order shows source/platform fallback and no blank server line.
- `show_server_name = false` returns `server_name = null` and hides the field.
- Void/refund notices and KDS status behavior do not regress.

## 7. Order Numbers Local Midnight + Previous Orders Newest First

## Summary

Ticket: POS order numbers reset at 00:00 UTC, mid-service, and Previous Orders must show newest first.

Root issue: the order-number RPCs used `CURRENT_DATE`, which resolves in the Supabase session timezone. For US-Eastern restaurants, that can reset the daily sequence around 7-8pm local time instead of at the restaurant's local midnight.

Previous Orders sort was inspected in this POS repo. The current branch already uses `created_at DESC` in the history query path, stores keyset paging from raw DB `created_at`, maps fetched history timestamps from `created_at`, and defaults the screen sort to date descending. No POS frontend sort patch was needed in this branch.

## What Changed

- Added a migration replacing both order-number RPCs:
  - `generate_order_number(p_location_id uuid, p_station_id uuid DEFAULT NULL)`
  - `generate_order_number_internal(p_location_id uuid, p_merchant_id uuid)`
- The date key now comes from `NOW() AT TIME ZONE locations.timezone`, falling back to `America/New_York` if the timezone is blank.
- `locations.timezone` drives the local date, so DST is handled through IANA timezone rules.
- Preserved the existing sequence approach:
  - per-merchant/per-date sequence names
  - per-station sequence suffix when station number exists
  - advisory lock around sequence creation
  - `MAX(order_number)` bootstrap for existing same-date prefixes
  - `nextval()` for concurrency-safe generation
  - `SECURITY DEFINER` and pinned `search_path`

## Files

- `supabase/migrations/20260629130000_order_numbers_location_timezone.sql`
- `tasks/order-number-local-midnight-previous-orders-sort.md`
- `tasks/ticket-log.md`
- `tasks/pos-ticket-senior-summary-2026-06-27.md`

## Migration

Migration exists:

```text
supabase/migrations/20260629130000_order_numbers_location_timezone.sql
```

This should be applied after confirming no newer production/staging RPC body has diverged from the contract.

## Verification Status

Local/static verification completed:

- Confirmed Previous Orders query path uses `created_at DESC`.
- Confirmed fetched history timestamps are derived from backend `created_at`.
- Confirmed no package or lockfile changes were made.

Manual/staging QA still required:

- Apply migration on staging.
- Confirm `pg_get_functiondef` for both RPCs no longer uses `CURRENT_DATE` for `v_date_str`.
- Create orders across 00:00 UTC before local midnight and confirm no reset.
- Create orders across local midnight and confirm reset/prefix flip.
- Run a concurrency check for unique numbers.
- Confirm Previous Orders newest-first with orders around the reset boundary.

## 8. POS Platform Logos On KDS And Previous Orders

## Summary

Ticket: POS/Expo platform-logo follow-up for KDS ticket templates and POS previous-orders.

Root issue: platform-logo rendering existed but platform identity resolution was fragmented. KDS and previous-orders needed one POS resolver that maps order data into the canonical marketplace / first-party / generic-online / no-logo cases.

This is client-only. No schema or RPC migration is required.

## What Changed

- Added shared POS platform resolver:
  - priority: `delivery_platform`, `metadata.delivery_company`, `online_orders.delivery_company`, `online_orders.provider`, `order_source`
  - normalizes GrubHub, DoorDash, and Uber Eats casing/separator variants
  - resolves website/app/kiosk to first-party badge
  - resolves orderout/other/unresolved online to generic Online badge
  - resolves POS/in-store to no logo
- Updated the shared `DeliveryPlatformBadge` to use that resolver and local bundled assets.
- Preserved legacy `normalizePlatform` helper behavior for settings/other existing display paths.
- Updated KDS store equality and active KDS card memo comparison so platform/source changes trigger re-render.
- Existing KDS active/done and POS previous-orders badge call sites now share the resolver.
- Added targeted resolver tests.

## Files

- `lib/orderPlatformResolver.ts`
- `lib/platformAliases.ts`
- `components/order/DeliveryPlatformBadge.tsx`
- `stores/useKDSStore.ts`
- `app/(main)/kds.tsx`
- `__tests__/order-platform-resolver.test.ts`
- `tasks/pos-platform-logo-kds-previous-orders.md`
- `tasks/ticket-log.md`
- `tasks/pos-ticket-senior-summary-2026-06-27.md`

## Migration

No migration required. The ticket contract says client-only rendering; KDS and order detail payloads already carry the needed fields.

## Verification Status

Targeted automated verification:

```powershell
npx jest --runTestsByPath __tests__/order-platform-resolver.test.ts
```

Manual QA still required:

- KDS active states and Done show the platform logo for a GrubHub/DoorDash/Uber Eats order.
- POS previous-orders row shows the platform badge for online orders.
- `UBEREATS` and other casing variants normalize correctly.
- Website/app/kiosk orders show first-party badge.
- Unresolved online order shows generic Online badge.
- POS/in-store order shows no badge.

## 9. POS/Web Location POS Settings + Station Overrides

## Summary

Ticket: keep `locations.pos_config` as the location-level POS settings source, add `stations.pos_config_overrides`, and let POS stations resolve their effective config as defaults -> location config -> station override.

This branch covers the POS/schema side. Web dashboard settings UI is intentionally left to the parallel web work.

## What Changed

- Added `stations.pos_config_overrides jsonb NOT NULL DEFAULT '{}'`.
- Added recursive JSONB deep merge helper for nested config blocks.
- Added `get_effective_pos_config(p_station_id)` with:
  - pinned `search_path`
  - `SECURITY DEFINER`
  - `user_location_ids()` scope guard
  - legacy fallback from `public_metadata.dining_settings` and `locations.kds_workflow_mode`
  - station metadata stripping so overrides cannot replace `_version` / `_updated_at`
- Added `update_station_pos_config_overrides(p_station_id, p_overrides)` as a guarded station-override write helper.
- Added shared client deep merge utility mirroring the server precedence.
- POS config sync now calls the effective-config RPC when a station ID exists and falls back to the old location-only read if the migration is not applied.
- POS sync now rehydrates config on station switch.
- KDS manual refresh now fetches station-effective config.
- Added targeted unit coverage for nested merge and station metadata guard.

## Files

- `supabase/migrations/20260630120000_station_pos_config_overrides.sql`
- `lib/posConfigResolution.ts`
- `types/locationConfig.ts`
- `services/locationConfigSync.ts`
- `contexts/PosSyncProvider.tsx`
- `app/(main)/kds.tsx`
- `database.types.ts`
- `__tests__/pos-config-resolution.test.ts`
- `tasks/pos-effective-config-station-overrides.md`
- `tasks/ticket-log.md`
- `tasks/pos-ticket-senior-summary-2026-06-27.md`

## Migration

Migration exists:

```text
supabase/migrations/20260630120000_station_pos_config_overrides.sql
```

This migration should be applied before validating station overrides in POS. The POS client still falls back to the old location-only config read if the RPC is not present, so older environments should not hard-fail.

## Verification Status

Targeted automated verification:

```powershell
npx jest --runTestsByPath __tests__/pos-config-resolution.test.ts
```

Manual QA still required:

- Apply migration on staging.
- Confirm `stations.pos_config_overrides` exists and defaults to `{}`.
- Confirm `get_effective_pos_config` returns defaults plus `locations.pos_config`.
- Set a nested station override and confirm only that station sees it.
- Confirm sibling stations inherit the location default.
- Confirm station switching in POS rehydrates the correct station-effective config.
- Confirm previously non-persisting settings persist after the web settings UI is wired to `locations.pos_config`.

## 10. Timesheets Configurable Auto Clock-Out

## Summary

Ticket: prevent forgotten POS clock-outs from running indefinitely by adding a per-location auto clock-out cutoff. Website Part 1 manual manager adjustment is separate; this branch handles the POS/backend prevention contract only.

## What Changed

- Added `locations.auto_clock_out_enabled` and `locations.auto_clock_out_time`.
- Added `_auto_clock_out_close_break_logs` to close open break entries at the cutoff.
- Added `auto_clock_out_stale_shifts(p_location_id, p_now)`:
  - processes enabled locations
  - computes the most recent past cutoff in `locations.timezone`
  - closes only open `active` / `on_break` shifts with `clock_out_time IS NULL`
  - closes open breaks at the cutoff
  - leaves `is_verified = false`
  - appends an auto-review note
  - writes `audit_logs.action = 'shift_auto_closed'`, actor `System`
  - is idempotent on repeated runs
- Schedules the RPC every 15 minutes when `pg_cron` is installed; otherwise emits a migration notice so Supabase can schedule it externally.
- POS timeclock hydration now calls the safe RPC before loading active shifts and no longer directly updates stale shifts using the old max-hours config.

## Files

- `supabase/migrations/20260702120000_auto_clock_out_stale_shifts.sql`
- `stores/useTimeclockStore.ts`
- `database.types.ts`
- `types/locationConfig.ts`
- `tasks/timesheets-auto-clock-out-pos.md`

## Migration

Migration exists:

```text
supabase/migrations/20260702120000_auto_clock_out_stale_shifts.sql
```

Website settings should write `locations.auto_clock_out_enabled` and `locations.auto_clock_out_time`; do not use legacy `locations.pos_config.timeclock.autoCloseStaleShifts` / `maxShiftHours`.

## Verification Status

No app-wide build was run. Staging Supabase verification is required.

Manual QA still required:

- Apply migration on staging.
- Confirm `locations` has the two auto clock-out columns.
- Turn the setting on for a test location with cutoff `03:00`.
- Backdate/create an open `active` shift before the latest local cutoff and run `auto_clock_out_stale_shifts`.
- Confirm the shift becomes `completed`, `clock_out_time` equals the cutoff, `is_verified = false`, and notes include auto clock-out.
- Repeat with `status = 'on_break'` and an open break; confirm break `end` is set.
- Re-run the RPC and confirm `closed_count = 0` for the same shift.
- Confirm `audit_logs` has `shift_auto_closed`, actor `System`, cutoff metadata, and old/new changes.
- Confirm web Part 1 can still manually adjust the auto-closed shift afterward.

## Migration Inventory

| File | Ticket | Behavior | Current risk |
| --- | --- | --- | --- |
| `supabase/migrations/20260623120000_reprice_charcoal_gardenia_stale_cash_prices.sql` | Stale manual cash prices | Clears `cash_price` only when exactly 4 known stale rows match; no-ops if 0 rows match; aborts on partial match | If target rows are absent, nothing is corrected and manual/web re-price or correct IDs are still required |
| `supabase/migrations/20260629120000_kds_ticket_server_name.sql` | KDS tickets show server / creator | Replaces `get_kds_tickets_v2` to include show-server-name-gated `server_id` and `server_name` | Must be applied after any other pending `get_kds_tickets_v2` migration to avoid overwriting newer RPC changes |
| `supabase/migrations/20260629130000_order_numbers_location_timezone.sql` | Order numbers local midnight | Replaces both order-number generators so sequence date keys use `locations.timezone` instead of UTC `CURRENT_DATE` | Must be applied after confirming the live RPC bodies still match the contract, because `CREATE OR REPLACE FUNCTION` replaces the full body |
| `supabase/migrations/20260630120000_station_pos_config_overrides.sql` | POS settings station overrides | Adds `stations.pos_config_overrides`, effective config resolver, deep merge helper, and guarded station override write RPC | Must be applied before station override QA; coordinate with web settings UI branch so UI writes use the same contract |
| `supabase/migrations/20260702120000_auto_clock_out_stale_shifts.sql` | Timesheets auto clock-out | Adds location cutoff settings, idempotent auto-close RPC, break closure, audit logging, and optional pg_cron schedule | Must be applied before auto-clock-out QA; confirm pg_cron exists or schedule the RPC externally |
| `supabase/migrations/20260712120000_kds_rush_priority_sort.sql` | KDS rush/priority top-band sort | Adds ticket-level `any_rush` to `get_kds_tickets_v2` and orders active tickets by `(any_rush OR prioritized) DESC, start_time ASC` | Must be sequenced after any other pending `get_kds_tickets_v2` replacement so server-name/show-server behavior is preserved |

No migrations are required for:

- Daily Shift Report date off-by-one
- End of Day Review staff deep link
- Printed receipt alternate total removal
- DESSERT duplicate card frontend guard
- POS platform logos on KDS and Previous Orders

## Validation Completed

Targeted tests passed on the current branch:

```powershell
npx jest --runTestsByPath __tests__/receipt-print-pricing-mode.test.ts
npx jest --runTestsByPath __tests__/menu-sync-dedupe.test.ts
npx jest --runTestsByPath __tests__/order-platform-resolver.test.ts
npx jest --runTestsByPath __tests__/kdsTimer.test.ts
npx jest --runTestsByPath __tests__/kdsAutomation.test.ts
npx jest --runTestsByPath __tests__/kdsRushPrioritySort.test.ts
```

For the order-number ticket, no app Jest test was added because the change is a Supabase RPC migration. Static/local verification confirmed the POS Previous Orders path is timestamp-sorted; staging SQL verification is still required after migration.

Repo-wide TypeScript/build checks were intentionally not run because the repo has known unrelated issues and the working rule is targeted verification only.

## Open QA Checklist

- Daily Shift Report: date pill, highlighted calendar date, and rows match selected day across month boundaries.
- End of Day: `Review staff` routes directly to unresolved staff and back navigation returns to EOD.
- Receipt: physical Star/Landi print shows no alternate unused pricing line.
- DESSERT grid: duplicate `Strawberry Banana Crepe` card is gone on device.
- Dual-pricing data: correct environment/IDs are confirmed, affected rows are re-priced, and verification queries return expected results.
- KDS server name: staging order from POS staff shows server name, online/no-staff order falls back to source/platform, and `show_server_name = false` hides the field.
- KDS rush/priority sort: rushed and prioritized active tickets jump into the top band immediately, while normal tickets remain below them.
- Order numbers: staging orders across UTC midnight do not reset, local midnight does reset, and Previous Orders remains newest-first.
- POS platform logos: KDS all active states/Done and POS Previous Orders show marketplace, first-party, and generic-online badges correctly; POS orders show no badge.
- POS settings station overrides: migration applies cleanly, station override affects only one station, sibling stations inherit location defaults, and POS station switching rehydrates the correct effective config.
- Timesheets auto clock-out: migration applies cleanly, enabled location closes stale active/on-break shifts at the local cutoff, audit logs are written, open breaks are closed, and re-running is a no-op.

## PR Notes For Senior Review

- No `package.json` or lockfiles were intentionally modified for these tickets.
- The receipt conflict was resolved by keeping upstream split-receipt scoped-payment behavior and applying pricing-mode collapse to the scoped payment.
- The stale cash-price data migration is intentionally guarded and environment-safe after the first Supabase run failed to find the expected merchant rows.
- The stale cash-price ticket should not be marked Done until the data is corrected in the correct environment and the POS/web sweep is recorded.
- The KDS server-name migration touches the same RPC as other KDS server-authoritative work, so sequence it carefully if another branch also replaces `get_kds_tickets_v2`.
- The KDS rush/priority migration also replaces `get_kds_tickets_v2`; apply after the server-name version or use the newest combined body so `server_name`, `ready_time`, `is_to_go`, and display-scoped acknowledgement behavior are not lost.
- The order-number migration replaces full RPC bodies. If production/staging functions have newer changes than the ticket contract, rebase the migration body before applying.
- The platform-logo ticket is POS-only in this repo. Web Orders list/details remain outside this change and should be coordinated separately.
- The POS settings/station override ticket is POS/schema-only in this branch. Web dashboard UI must coordinate with `update_station_pos_config_overrides` or the same guarded write contract before QA.
- The Timesheets auto-clock-out ticket is POS/backend-only in this branch. Web dashboard settings should write the new `locations.auto_clock_out_enabled` and `locations.auto_clock_out_time` columns and render AUTO badges from the auto note/audit entry.
