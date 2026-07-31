# QA Closure Matrix - POS In-Progress Tickets From July 2 Screenshots

Date: 2026-07-02

Purpose: map the visible in-progress POS tickets from Ali's board screenshots to the code/doc work that exists on `alidika-dev-pos`, then give a concrete manual QA plan for POS tablet, physical printer, website coordination, and Supabase validation.

Important scope note: the screenshots show 13 visible tickets, while the board badge shows 17 in progress. This POS matrix covers the visible tickets plus one additional POS ticket from this branch's existing docs: KDS server/creator. Hidden board tickets are not covered here.

## Repos Checked

POS repo:

- `C:\Users\Ali DIka\Desktop\Dexa-POS`
- Branch checked: `alidika-dev-pos`

Website repo coordination:

- Website manual timesheet adjustment is separate and already handled in website work.
- Website settings UI for POS config and auto clock-out is separate where noted.

## Status Map

| Ticket | Surface | Current status | Who owns next step | Video value |
| --- | --- | --- | --- | --- |
| End of Day - Review staff does not deep-link | POS | Implemented in POS branch, needs tablet QA | Ali QA | Medium |
| Daily Shift Report calendar off by one | POS | Implemented in POS branch, needs tablet QA | Ali QA | Medium |
| [POS] Remove `If paid by card` alternative-price line from printed receipt | POS printer | Implemented in POS branch, needs physical Star/Landi printer QA | Ali QA | High |
| [POS Menu Grid] DESSERT duplicate card | POS menu grid | Implemented in POS branch, needs tablet QA at Saucy | Ali QA | Medium |
| [QA] Re-price stale manual-priced items after dual-pricing flip | POS/Web/data | Guarded data migration/runbook exists; target data was unresolved in first Supabase attempt | Ali + senior data confirmation | Medium |
| [POS-KDS] Show server/creator on KDS tickets | POS/KDS + Supabase RPC | Implemented with migration, needs staging migration and KDS QA | Ali QA | High |
| Order numbers reset at UTC midnight + Previous Orders newest-first | POS/backend | Implemented with migration; Previous Orders sort confirmed in branch | Ali QA | High |
| [POS+Web Orders/KDS] Delivery-platform logo everywhere | POS/KDS/Previous Orders | POS part implemented; web part is separate | Ali QA | High |
| [POS/Web] Location POS Settings + station overrides | POS/schema + web coordination | POS/schema side implemented; web UI/settings side separate | Ali QA + web branch | High |
| Timesheets manual hour adjustment + configurable auto clock-out | POS/backend + web coordination | POS/backend auto clock-out implemented; website manual adjustment is separate | Ali QA + migration apply | High |
| QA: Table Merge & Transfer + POS Dates/Calendars | POS/backend QA | Transfer/merge safety migration + POS client guard added; full tablet/Supabase QA still pending | Ali QA | High |
| [POS-KDS] Rushed/prioritized tickets do not sort to top | POS/KDS + Supabase RPC | Implemented with migration and source regression test; needs staging migration and KDS screen recording | Ali QA | High |
| [DATA] Owner mis-provisioned - Bay Ridge owner relink | Data/admin | Not POS code; needs senior/prod-authorized repair | Senior/prod repair | Low/Medium |
| P0 cash payment records `$0.00` / Paid with balance | POS/backend | Not implemented in this branch | Owner branch / new work | High |
| POS offline order never syncs / pay-after-paid / clipped New Order | POS/offline | Not implemented in this branch | POS owner / new work | High |

## Migration Checklist

Run these in Supabase before testing the migration-backed tickets:

- `supabase/migrations/20260623120000_reprice_charcoal_gardenia_stale_cash_prices.sql`
- `supabase/migrations/20260629120000_kds_ticket_server_name.sql`
- `supabase/migrations/20260629130000_order_numbers_location_timezone.sql`
- `supabase/migrations/20260630120000_station_pos_config_overrides.sql`
- `supabase/migrations/20260702120000_auto_clock_out_stale_shifts.sql`
- `supabase/migrations/20260710120000_table_transfer_session_safety.sql`
- `supabase/migrations/20260712120000_kds_rush_priority_sort.sql`

Important:

- The stale cash-price migration is intentionally guarded. If it prints a no-op notice because it cannot find the expected rows, that ticket is not corrected in that environment and still needs correct target IDs or website re-price.
- The KDS server-name and order-number migrations replace full RPC bodies. Apply after confirming no newer live RPC work would be overwritten.
- The auto clock-out migration schedules `auto_clock_out_stale_shifts` only when `pg_cron` is already installed. If not, schedule `SELECT public.auto_clock_out_stale_shifts();` externally every 15 minutes.

## POS Tickets Ready For Tablet / Device QA

## 1. End of Day - Review Staff Deep Link

Ticket title:

- `End of Day - "Review staff" does not deep-link to the staff member blocking checkout`

Implemented in POS repo:

- `app/(main)/settings/end-of-day.tsx`
- `components/settings/end-of-day/steps/EodStepOverview.tsx`
- `app/(profiles-and-timeclock)/timeclock.tsx`

Scope:

- POS End of Day review navigation only.
- No migration required.

POS QA:

1. On the tablet, clock in one staff member and leave them active.
2. Open `Settings -> End of Day`.
3. Confirm Overview shows `Shifts Reviewed` as failed or blocked.
4. Tap `Review staff`.
5. Expected: Timeclock opens in unresolved review-focus mode.
6. Expected: unresolved staff row is highlighted and scrolled into view.
7. Go back to Overview.
8. Tap the `Shifts Reviewed` blocker card itself.
9. Expected: same focused behavior.
10. Test with multiple active staff.
11. Expected: unresolved rows are surfaced, first target focused.
12. Test with no active blocker.
13. Expected: normal Timeclock screen with no stale focus banner.

Supabase QA:

```sql
SELECT id, staff_profile_id, location_id, status, clock_in_time, clock_out_time
FROM public.staff_shifts
WHERE location_id = '<location_id>'
ORDER BY clock_in_time DESC
LIMIT 20;
```

Record video:

- Yes. Short video from End of Day blocker to highlighted staff row is enough.

## 2. Daily Shift Report Calendar Off-By-One

Ticket title:

- `Daily Shift Report calendar is off by one - selecting a date loads the previous day`

Implemented in POS repo:

- `app/(profiles-and-timeclock)/timeclock.tsx`

Scope:

- POS Timeclock Daily Shift Report date selection and merchant-local report bounds.
- No migration required.

POS QA:

1. Open `Timeclock -> Daily Shift Report`.
2. Tap today's date.
3. Expected: selected pill, calendar highlight, and rows all match today.
4. Tap yesterday.
5. Expected: no previous-day offset.
6. Tap the 1st of a month.
7. Tap the last day of a month.
8. If possible, test near local midnight.
9. Expected: selected date never rolls back one day.

Supabase QA:

```sql
SELECT id, staff_profile_id, location_id, clock_in_time, clock_out_time, status
FROM public.staff_shifts
WHERE location_id = '<location_id>'
ORDER BY clock_in_time DESC
LIMIT 30;
```

Expected:

- Rows shown by the tablet correspond to the selected merchant-local calendar date.

Record video:

- Yes. Useful evidence: tap a date, then show pill/highlight/list all match that same date. Include a month boundary.

## 3. POS Printed Receipt - Remove Unused Alternative Pricing Line

Ticket title:

- `[POS] Remove "If paid by card" alternative-price line from printed receipt`

Implemented in POS repo:

- `tasks/receipt-print-remove-alt-total-line.md`
- Receipt composer/print changes already documented in the task file.

Scope:

- Finalized POS printed receipt only.
- No migration required.
- No totals/math changes expected.

POS/device QA:

1. Create an order with dual-pricing enabled.
2. Pay fully with cash.
3. Print receipt on Star Micronics.
4. Expected: receipt shows cash total and amount paid only.
5. Expected: no `If paid by card` line.
6. Reprint the same receipt on Landi built-in printer if available.
7. Create or use a card-paid order.
8. Print receipt.
9. Expected: receipt shows card total and amount paid only.
10. Expected: no `If paid by cash` line.
11. Reprint a historical order.
12. Expected: no unused alternative pricing line.

Supabase QA:

```sql
SELECT id,
       order_number,
       payment_status,
       amount_paid,
       amount_due,
       cash_amount_due,
       total_amount,
       card_total,
       cash_total
FROM public.orders
WHERE id = '<order_id>';

SELECT id, order_id, payment_method, amount, tip_amount, is_cash_priced, status
FROM public.order_payments
WHERE order_id = '<order_id>'
ORDER BY created_at;
```

Record video:

- Yes. This is one of the best customer-facing proof videos. Include printer output for cash and card if possible.

## 4. POS Menu Grid DESSERT Duplicate Card

Ticket title:

- `[POS Menu Grid] DESSERT renders a duplicate card for one item - data source returns duplicate row (Saucy)`

Implemented in POS repo:

- `tasks/menu-grid-dessert-duplicate-card.md`
- Menu sync/grid dedupe guard documented in the task file.

Scope:

- POS menu grid rendering guard.
- No migration required for the frontend guard.

POS QA:

1. Open Saucy POS.
2. Go to `Order Line -> DESSERT -> Crepes & Waffles`.
3. Find `Strawberry Banana Crepe`.
4. Expected: item appears once.
5. Expected: no overlapping duplicate card shell.
6. Add it to the cart.
7. Expected: correct item ID, price, cash price, modifiers, and taxes.
8. Spot-check another category for missing/reordered items.

Supabase QA:

```sql
SELECT menu_id, category_id, menu_item_id, COUNT(*)
FROM public.menu_item_menus
WHERE menu_id = '<menu_id>'
GROUP BY menu_id, category_id, menu_item_id
HAVING COUNT(*) > 1;
```

Expected:

- If source data still has duplicate rows, POS should render one stable item card.

Record video:

- Optional. A clear before/after or current single-card proof is enough unless senior asks for a live tablet video.

## 5. POS Platform Logos On KDS And Previous Orders

Ticket title:

- `[POS+Web Orders/KDS] Render delivery-platform logo in every KDS state + POS previous-orders + web admin`

Implemented in POS repo:

- `tasks/pos-platform-logo-kds-previous-orders.md`
- Shared POS platform resolver and POS surface wiring documented in the task file.

Scope:

- POS/KDS and POS Previous Orders only in this repo.
- Website dashboard logo work is separate.
- No migration required.

POS QA:

1. Load or create Grubhub, DoorDash, and Uber Eats orders.
2. Confirm logo appears on KDS in active states.
3. Confirm logo appears on KDS Done state.
4. Confirm logo appears in POS Previous Orders row.
5. Confirm logo appears in Previous Orders detail/header where applicable.
6. Test casing variants such as `UBEREATS`, `uber_eats`, `GrubHub`, and `doordash`.
7. Confirm website/app/kiosk orders show the agreed first-party fallback.
8. Confirm POS/in-store orders show no third-party logo.

Supabase QA:

```sql
SELECT id, order_number, order_source, delivery_platform, metadata
FROM public.orders
WHERE id = '<order_id>';
```

Record video:

- Yes. Good visual sweep if staging/prod has enough third-party orders.

## Migration-Backed POS / Backend QA

## 6. Re-Price Stale Manual-Priced Items After Dual-Pricing Flip

Ticket title:

- `[QA] Re-price stale manual-priced items not reflecting 4% cash discount after dual-pricing flip`

Implemented in POS repo:

- `tasks/dual-pricing-stale-manual-cash-price-reprice.md`
- `supabase/migrations/20260623120000_reprice_charcoal_gardenia_stale_cash_prices.sql`

Scope:

- Data correction / verification.
- No pricing calculator code change.

Current caution:

- First Supabase run could not find the expected Charcoal Gardenia rows and was aborted/no-op guarded.
- Do not mark Done until the correct environment/IDs are confirmed or the website re-price path updates the target items.

Dashboard/POS QA:

1. Apply the migration or re-price through the website.
2. Confirm the 4 known affected items show `$7.99 / $7.68`.
3. Confirm Coffee milkshake.
4. Confirm Kitkat.
5. Confirm Oreo Milkshake.
6. Confirm pistachio milkshake.
7. Open POS Drinks -> Milk Shakes.
8. Expected: the same prices show in POS.
9. Sweep Drinks, Acai, Coffee, Combos, and Food.
10. Confirm new test item auto-calculates cash at 4% off, then delete the test item.

Supabase QA:

```sql
SELECT id, name, price, cash_price
FROM public.menu_items
WHERE cash_price IS NOT NULL
  AND cash_price >= price;

SELECT *
FROM public.location_menu_item_overrides
WHERE custom_cash_price IS NOT NULL
  AND custom_cash_price >= custom_price;

SELECT *
FROM public.menu_item_menus
WHERE custom_cash_price IS NOT NULL
  AND custom_cash_price >= custom_price;
```

Expected:

- Scoped pilot merchant/location query returns `0 rows` after correction.
- Unscoped query should be reviewed carefully before taking broad action.

Record video:

- Optional. Screenshots plus SQL before/after may be enough; record POS grid if senior wants visual proof.

## 7. POS-KDS Show Server / Creator

Ticket title:

- `[POS-KDS] Show who placed the order on KDS tickets - add server/creator to get_kds_tickets_v2 payload + render, gated by show_server_name`

Implemented in POS repo:

- `tasks/kds-ticket-server-name.md`
- `supabase/migrations/20260629120000_kds_ticket_server_name.sql`
- KDS ticket header render updates documented in the task file.

Scope:

- POS-created ticket server/creator on KDS.
- Gated by `kds_displays.show_server_name`.

POS QA:

1. Apply `20260629120000_kds_ticket_server_name.sql`.
2. Create a POS order as a logged-in staff member.
3. Send it to KDS.
4. Expected: KDS ticket header shows `Server: <staff name>`.
5. Create/load an online order with no POS staff.
6. Expected: no blank server line.
7. Expected: source/platform fallback still displays.
8. Set `show_server_name = false` for the KDS display.
9. Expected: server name hides.
10. Re-enable it.
11. Expected: server name returns.

Supabase QA:

```sql
SELECT id, name, show_server_name
FROM public.kds_displays
WHERE location_id = '<location_id>';

SELECT public.get_kds_tickets_v2(
  p_location_id := '<location_id>'::uuid,
  p_statuses := ARRAY['pending', 'preparing', 'ready'],
  p_kds_display_id := '<kds_display_id>'::uuid
);
```

Expected:

- Ticket JSON includes `server_id` and `server_name` when the display setting allows it.

Record video:

- Yes. This is strong evidence because it proves POS staff attribution and the display toggle.

## 8. Order Numbers Local Midnight + Previous Orders Newest-First

Ticket title:

- `Order numbers reset at UTC midnight (mid-service) + Previous Orders not sorted newest-first`

Implemented in POS repo:

- `tasks/order-number-local-midnight-previous-orders-sort.md`
- `supabase/migrations/20260629130000_order_numbers_location_timezone.sql`

Scope:

- Backend order-number date key.
- POS Previous Orders sort was already newest-first in this branch.

POS QA:

1. Apply `20260629130000_order_numbers_location_timezone.sql`.
2. Confirm location timezone is correct.
3. Create orders before and after 00:00 UTC but before local midnight.
4. Expected: sequence does not reset at UTC midnight.
5. Create orders across local midnight.
6. Expected: sequence resets only on local date change.
7. Open Previous Orders.
8. Expected: newest orders appear first.
9. Use Previous Orders calendar/date picker if available.
10. Expected: local dates match order business date.

Supabase QA:

```sql
SELECT pg_get_functiondef('public.generate_order_number(uuid, uuid)'::regprocedure);
SELECT pg_get_functiondef('public.generate_order_number_internal(uuid, uuid)'::regprocedure);

SELECT id, order_number, location_id, created_at, closed_at
FROM public.orders
WHERE location_id = '<location_id>'
ORDER BY created_at DESC
LIMIT 50;
```

Expected:

- Order-number functions use `locations.timezone` / local date logic, not raw `CURRENT_DATE`.
- Previous Orders sorts newest-first.

Record video:

- Yes if you can demonstrate boundary order creation. Otherwise capture SQL/function proof plus Previous Orders sort proof.

## 9. Location POS Settings + Station Overrides

Ticket title:

- `[POS/Web] Location-level POS Settings surface + per-station overrides`

Implemented in POS repo:

- `tasks/pos-effective-config-station-overrides.md`
- `supabase/migrations/20260630120000_station_pos_config_overrides.sql`
- POS effective-config hydration and station-switch rehydrate documented in the task file.

Scope:

- POS/schema side in this repo.
- Website dashboard settings UI is separate.

POS QA:

1. Apply `20260630120000_station_pos_config_overrides.sql`.
2. Use two stations at the same location.
3. Change a location-level POS setting from the web surface once web UI is wired.
4. Expected: both stations inherit it after POS sync/restart.
5. Set a station-only override.
6. Expected: only that station changes.
7. Expected: sibling station remains on location default.
8. Switch stations on the same device.
9. Expected: POS rehydrates the selected station's effective config.

Supabase QA:

```sql
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'stations'
  AND column_name = 'pos_config_overrides';

SELECT public.get_effective_pos_config('<station_id>'::uuid);

SELECT public.update_station_pos_config_overrides(
  '<station_id>'::uuid,
  '{"notifications":{"soundEnabled":false}}'::jsonb
);

SELECT public.get_effective_pos_config('<station_id>'::uuid);
```

Expected:

- `stations.pos_config_overrides` exists with default `{}`.
- Effective config resolves defaults -> location config -> station override.

Record video:

- Yes once web UI is wired. It proves inheritance and override behavior clearly.

## 10. Timesheets Auto Clock-Out POS/Backend

Ticket title:

- `Timesheets - manual hour adjustment + configurable auto clock-out`

Implemented in POS repo:

- `tasks/timesheets-auto-clock-out-pos.md`
- `supabase/migrations/20260702120000_auto_clock_out_stale_shifts.sql`
- POS timeclock hydration now calls the safe backend RPC before loading active sessions.

Scope:

- POS/backend auto clock-out only.
- Website manual adjustment Part 1 is separate.
- Website settings UI and AUTO badge are separate.

POS QA:

1. Apply `20260702120000_auto_clock_out_stale_shifts.sql`.
2. Set a test location to `auto_clock_out_enabled = true`.
3. Set `auto_clock_out_time = '03:00'`.
4. Create or backdate an open `staff_shifts` row before the latest local cutoff.
5. Open POS for that location so timeclock hydration runs.
6. Expected: stale open shift is not hydrated as active because the server RPC closes it first.
7. Create a normal active shift after the cutoff.
8. Expected: it remains active until the next cutoff.
9. Confirm manual POS clock-out still works for a normal active shift.

Supabase QA:

```sql
UPDATE public.locations
SET auto_clock_out_enabled = true,
    auto_clock_out_time = '03:00'
WHERE id = '<location_id>';

SELECT public.auto_clock_out_stale_shifts(
  '<location_id>'::uuid,
  '<test_now_after_cutoff>'::timestamptz
);

SELECT id, status, clock_in_time, clock_out_time, break_logs, is_verified, notes
FROM public.staff_shifts
WHERE location_id = '<location_id>'
ORDER BY updated_at DESC
LIMIT 20;

SELECT action, actor_name, actor_role, resource_id, metadata, changes, created_at
FROM public.audit_logs
WHERE action = 'shift_auto_closed'
ORDER BY created_at DESC
LIMIT 20;
```

Expected:

- Completed stale shifts have `clock_out_time` at the local cutoff.
- `is_verified = false`.
- Notes include auto clock-out review text.
- Open break has `end` populated.
- A `shift_auto_closed` audit row exists with actor `System`.
- Re-running the RPC returns `closed_count = 0` for the same shift.

Record video:

- Yes. Strong proof: show cutoff setting/SQL, stale active shift before, RPC result, shift after, closed break, and audit row.

## Tickets Not Ready To Mark Done From Current POS Branch

## 11. QA: Table Merge & Transfer + POS Dates/Calendars

Status:

- POS/backend safety work is now implemented in this branch.
- Migration added: `supabase/migrations/20260710120000_table_transfer_session_safety.sql`.
- POS client guard added in `services/floorPlanService.ts`.
- Full tablet and Supabase QA is still required before Done.

POS QA:

1. Create active order on Table A.
2. Create active order on Table B.
3. Merge Table A and Table B.
4. Expected: merged table state is clear and both checks/items are preserved.
5. Transfer the merged order to Table C.
6. Expected: Table A/B are released or show correct state.
7. Expected: Table C owns the order.
8. Add an item after transfer.
9. Pay/close the order.
10. Open Previous Orders.
11. Expected: newest order appears first.
12. Use Previous Orders calendar/date picker for today and previous date.
13. Expected: order appears under the correct local date.
14. Attempt transfer while offline.
15. Expected: POS blocks transfer with connection warning and does not queue an optimistic move.

Supabase QA:

```sql
SELECT id, order_number, table_number, table_id, status, payment_status, created_at, closed_at
FROM public.orders
WHERE id = '<order_id>';

SELECT *
FROM public.order_items
WHERE order_id = '<order_id>'
ORDER BY created_at;
```

RPC edge QA after migration:

```sql
-- Empty target array must error and preserve existing table links.
SELECT public.transfer_table_session('<SESSION_ID>'::uuid, ARRAY[]::uuid[], 'qa empty');

-- Duplicate target IDs must error and preserve existing table links.
SELECT public.transfer_table_session(
  '<SESSION_ID>'::uuid,
  ARRAY['<TABLE_ID>'::uuid, '<TABLE_ID>'::uuid],
  'qa duplicate'
);

-- Confirm the session still has its original active table links.
SELECT session_id, table_id, is_primary, seated_position, is_active
FROM public.table_session_tables
WHERE session_id = '<SESSION_ID>'::uuid
ORDER BY is_active DESC, seated_position;
```

Record video:

- Yes. Required proof should include transfer happy path, occupied target blocked, offline blocked, and Supabase edge-case query results.

## 12. Bay Ridge Owner Identity Relink

Ticket title:

- `[DATA] Owner mis-provisioned (pos_only, no Clerk link) - "Member not found" on reactivate - Bay Ridge House of Wings`

Status:

- Not POS code.
- Data/admin runbook added: `tasks/bay-ridge-owner-misprovisioned-relink.md`.
- Requires senior/prod-authorized Clerk and Supabase repair.
- POS is only affected indirectly through shared staff/member identity.
- POS PIN login reads `location_members` + `staff_profiles`; the Staff Directory reactivate failure is not in this repo.

Supabase QA after repair:

```sql
SELECT sp.id,
       sp.account_type,
       sp.user_id,
       sp.is_active,
       m.id AS member_id,
       m.organization_id,
       lm.id AS location_member_id,
       lm.role_code,
       lm.is_active AS location_member_active
FROM public.staff_profiles sp
LEFT JOIN public.members m
  ON m.staff_profile_id = sp.id
  OR m.user_id = sp.user_id
LEFT JOIN public.location_members lm
  ON lm.staff_profile_id = sp.id
WHERE sp.id = '<staff_profile_id>';
```

Record video:

- Optional. Better evidence is SQL before/after plus a short dashboard reactivation recording.

## 13. P0 Cash Payment Records `$0.00` / Paid With Balance

Status:

- Not implemented in this POS branch.
- Needs POS/backend/RPC investigation unless a separate branch already contains the fix.

POS QA when implementation exists:

1. Create an order with multiple items, tax, and service charge if applicable.
2. Pay full order with cash.
3. Expected: payment screen shows correct amount paid.
4. Expected: order closes as paid with zero balance.
5. Open Previous Orders.
6. Expected: paid amount is not `$0.00`.
7. Repeat with cash discount / dual-pricing enabled.
8. Repeat with tip if the flow supports it.

Supabase QA:

```sql
SELECT id,
       order_number,
       status,
       payment_status,
       amount_paid,
       amount_due,
       cash_amount_due,
       total_amount,
       card_total,
       cash_total
FROM public.orders
WHERE id = '<order_id>';

SELECT id, payment_method, amount, tip_amount, is_cash_priced, status
FROM public.order_payments
WHERE order_id = '<order_id>'
ORDER BY created_at;
```

Expected:

- Payment row amount is not `0.00`.
- Order is paid only if remaining balance is actually zero.
- Cash/card dual totals remain internally consistent.

Record video:

- Yes. This is P0 and should have POS payment proof plus Supabase proof once fixed.

## 14. POS Offline Order Never Syncs / Pay-After-Paid / Clipped New Order

Status:

- Not implemented in this POS branch.
- Likely belongs to POS table/offline sync work.

POS QA:

1. Start online.
2. Create an order.
3. Disable network.
4. Add items while offline.
5. Confirm offline/queued state is visible.
6. Re-enable network.
7. Expected: order syncs with real items, not an empty server shell.
8. Pay the order.
9. Attempt a pay-after-paid edge path.
10. Expected: duplicate payment is blocked or safely reconciled.
11. Check `New Order` button at target tablet resolution.
12. Expected: button is not clipped.

Supabase QA:

```sql
SELECT id, order_number, status, payment_status, amount_paid, total_amount, created_at, updated_at
FROM public.orders
WHERE order_number = '<order_number>'
ORDER BY created_at DESC;

SELECT id, order_id, menu_item_id, quantity, unit_price
FROM public.order_items
WHERE order_id = '<order_id>';
```

Expected:

- No empty order shell after reconnect.
- Synced order has item rows and correct totals.
- Paid order cannot be paid again.

Record video:

- Yes. This is high-value because it proves offline queue, reconnect, and payment guard behavior.

## What To Test First

1. POS tablet: End of Day Review staff deep link.
2. POS tablet: Daily Shift Report date selector.
3. POS physical printer: printed receipt alternate-price removal.
4. POS tablet: DESSERT duplicate card.
5. POS visual sweep: platform logos on KDS and Previous Orders.
6. Supabase + POS: KDS server/creator after migration.
7. Supabase + POS: order numbers local midnight after migration.
8. Supabase + POS/web coordination: station config overrides after migration.
9. Supabase + POS/web coordination: timesheets auto clock-out after migration.
10. Data/admin: stale cash-price correction only after target rows are confirmed.

## Best Tickets For Senior/Customer Video

1. POS printed receipt alternate-price removal.
2. KDS server/creator gated by `show_server_name`.
3. Timesheets auto clock-out with stale shift before/after and audit row.
4. Order numbers local-midnight reset with SQL/function proof and Previous Orders sort.
5. POS platform logos across KDS and Previous Orders.
6. End of Day Review staff deep link.
7. Daily Shift Report no off-by-one.
8. Location POS settings + station overrides once web UI is wired.
9. Cash payment P0 and offline sync only after their implementation branch is confirmed.
