# In-Progress Ticket Testing Sweep - 2026-07-02

## Summary

Source: Ali board screenshots with visible in-progress tickets. The board badge shows 17 in progress; screenshots show 13 tickets, so this sweep covers the visible tickets plus one additional POS ticket from this branch's existing docs: KDS server/creator.

Branch checked: `alidika-dev-pos`.

This branch contains the POS ticket docs, code, tests, and migrations for 10 POS tickets. Most are implemented but still pending manual QA, staging migration, or physical-device verification.

## Status Map

| Ticket | Branch status | Did we work it? | Migration | Test readiness | Video value |
| --- | --- | --- | --- | --- | --- |
| End of Day - Review staff deep link | Code implemented | Yes | No | Ready for POS QA | Medium |
| Daily Shift Report calendar off-by-one | Code implemented | Yes | No | Ready for POS QA | Medium |
| Printed receipt remove `If paid by card` line | Code complete | Yes | No | Ready for physical print QA | High |
| DESSERT duplicate menu card | Code complete | Yes | No | Ready for POS QA | Medium |
| Stale manual cash prices after 4% dual-pricing flip | Migration/runbook prepared; target data unresolved | Yes | Yes | Needs correct Supabase target or website re-price | Medium |
| KDS show server / creator | Code + migration ready | Yes | Yes | Ready after migration | High |
| Order numbers local-midnight reset + Previous Orders sort | Migration ready | Yes | Yes | Ready after migration | High |
| Platform logos on KDS + Previous Orders | Code complete | Yes | No | Ready for POS QA | High |
| Location POS settings + station overrides | POS/schema code ready; web UI separate | Yes | Yes | Ready after migration + web UI wiring | High |
| Table Merge & Transfer + POS Dates/Calendars | Not in our ticket set | No | Unknown | Owner-specific QA needed | High |
| Owner mis-provisioned / Member not found | Not in our ticket set; data/admin issue | No | Unknown | Admin/Supabase QA needed | Low/Medium |
| Timesheets manual hour adjustment + auto clock-out | POS/backend auto clock-out ready; web manual adjustment is separate | Partial | Yes | Ready after migration + web Part 1 | High |
| P0 cash payment records `$0.00` / paid with balance | Not in our ticket set | No | Unknown | Payment/backend QA needed | High |
| Offline order never syncs / pay-after-paid / clipped New Order | Not in our ticket set | No | Unknown | Bad-network POS QA needed | High |

## Migration Checklist

Run these in Supabase before testing the migration-backed tickets:

- `supabase/migrations/20260623120000_reprice_charcoal_gardenia_stale_cash_prices.sql`
- `supabase/migrations/20260629120000_kds_ticket_server_name.sql`
- `supabase/migrations/20260629130000_order_numbers_location_timezone.sql`
- `supabase/migrations/20260630120000_station_pos_config_overrides.sql`
- `supabase/migrations/20260702120000_auto_clock_out_stale_shifts.sql`

Important: the stale cash-price migration is intentionally guarded. If it prints a no-op notice because it cannot find the expected rows, that ticket is not corrected in that environment and still needs correct target IDs or website re-price.

## Ready POS QA - No Migration

## 1. End of Day Review Staff Deep Link

Task doc: `tasks/pos-ticket-senior-summary-2026-06-27.md`

### App QA

1. On POS, clock in at least one staff member.
2. Leave that staff member unresolved for End of Day.
3. Open `Settings -> End of Day`.
4. Tap `Review staff`.
5. Expected: Timeclock opens directly in unresolved review mode.
6. Expected: target staff row is surfaced/highlighted.
7. Go back to End of Day.
8. Tap the `Shifts Reviewed` blocker card if visible.
9. Expected: same focused staff behavior.
10. Test no-blocker case.
11. Expected: Timeclock opens normally with no stale highlight/banner.

### Supabase QA

No migration required. Optional data check:

```sql
SELECT id, staff_profile_id, location_id, status, clock_in_time, clock_out_time
FROM public.staff_shifts
WHERE location_id = '<location_id>'
ORDER BY clock_in_time DESC
LIMIT 20;
```

## 2. Daily Shift Report Calendar Off-By-One

Task doc: `tasks/pos-ticket-senior-summary-2026-06-27.md`

### App QA

1. Open `Timeclock -> Daily Shift Report`.
2. Tap today, yesterday, and older dates.
3. Confirm selected pill, highlighted calendar day, and report rows match exactly.
4. Test first and last day of a month.
5. Test near local midnight if possible.
6. Expected: no previous-day shift in selection or rows.

### Supabase QA

No migration required. Optional data check:

```sql
SELECT id, staff_profile_id, location_id, clock_in_time, clock_out_time, status
FROM public.staff_shifts
WHERE location_id = '<location_id>'
  AND clock_in_time >= '<utc_start>'
  AND clock_in_time < '<utc_end>'
ORDER BY clock_in_time;
```

Use the merchant/store timezone to compute `<utc_start>` and `<utc_end>` for the selected local date.

## 3. Printed Receipt Remove Unused Alternate Total

Task doc: `tasks/receipt-print-remove-alt-total-line.md`

### App / Device QA

1. Create an order with dual-pricing totals.
2. Pay fully with cash.
3. Print receipt on Star Micronics.
4. Expected: receipt shows `TOTAL (CASH)` and no `If paid by card`.
5. Reprint the same order on Landi built-in thermal.
6. Expected: same output.
7. Create or use a card-paid order.
8. Print receipt.
9. Expected: receipt shows `TOTAL (CARD)` and no `If paid by cash`.
10. Reprint a historical order.
11. Expected: no alternate unused pricing line.

### Supabase QA

No migration required. Optional payment sanity check:

```sql
SELECT id, order_number, payment_status, amount_paid, amount_due,
       cash_amount_due, total_amount, card_total, cash_total
FROM public.orders
WHERE id = '<order_id>';

SELECT id, order_id, payment_method, amount, tip_amount, is_cash_priced, status
FROM public.order_payments
WHERE order_id = '<order_id>'
ORDER BY created_at;
```

## 4. DESSERT Duplicate Menu Card

Task doc: `tasks/menu-grid-dessert-duplicate-card.md`

### App QA

1. Open Saucy POS.
2. Go to `Order Line -> DESSERT -> Crepes & Waffles`.
3. Confirm `Strawberry Banana Crepe` appears once.
4. Confirm no overlapping/duplicate card shell.
5. Add the item to cart.
6. Confirm price and cash price remain correct.
7. Spot-check one other category to confirm no missing/reordered items.

### Supabase QA

No migration required for the frontend guard. Optional source-data investigation:

```sql
SELECT menu_id, category_id, menu_item_id, COUNT(*)
FROM public.menu_item_menus
WHERE menu_id = '<menu_id>'
GROUP BY menu_id, category_id, menu_item_id
HAVING COUNT(*) > 1;
```

## 5. Platform Logos On KDS And Previous Orders

Task doc: `tasks/pos-platform-logo-kds-previous-orders.md`

### App QA

1. Load or create GrubHub, DoorDash, and Uber Eats orders.
2. Confirm logo appears on KDS in active states and Done.
3. Confirm logo appears in POS Previous Orders row.
4. Confirm logo appears in Previous Orders detail/header where applicable.
5. Test casing variants such as `UBEREATS`, `uber_eats`, `GrubHub`, `doordash`.
6. Confirm website/app/kiosk orders show first-party fallback if expected.
7. Confirm POS/in-store orders show no third-party logo.

### Supabase QA

No migration required. Inspect the order payload fields:

```sql
SELECT id, order_number, order_source, delivery_platform, metadata
FROM public.orders
WHERE id = '<order_id>';
```

## Migration-Backed QA

## 6. Stale Manual Cash Prices After 4% Dual-Pricing Flip

Task doc: `tasks/dual-pricing-stale-manual-cash-price-reprice.md`

### Web/POS QA

1. Apply migration or re-price through the website.
2. Confirm the 4 known affected items show `$7.99 / $7.68`:
3. Coffee milkshake.
4. Kitkat.
5. Oreo Milkshake.
6. pistachio milkshake.
7. Confirm same pricing in POS Drinks -> Milk Shakes.
8. Sweep Drinks, Acai, Coffee, Combos, and Food.
9. Confirm new test item auto-calculates cash at 4% off, then delete the test item.

### Supabase QA

Run scoped to the pilot merchant/location first. Expected after correction: `0 rows`.

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

## 7. KDS Show Server / Creator

Task doc: `tasks/kds-ticket-server-name.md`

### App QA

1. Apply `20260629120000_kds_ticket_server_name.sql`.
2. Create a POS order as a logged-in staff member.
3. Send it to KDS.
4. Expected: KDS ticket header shows `Server: <staff name>`.
5. Create/load an online order with no POS staff.
6. Expected: no blank server line; source/platform fallback still displays.
7. Set `show_server_name = false` for the KDS display.
8. Expected: server name hides.
9. Re-enable it and confirm server name returns.

### Supabase QA

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

Expected: ticket JSON includes `server_id` and `server_name` when display setting allows it.

## 8. Order Numbers Local Midnight + Previous Orders Newest First

Task doc: `tasks/order-number-local-midnight-previous-orders-sort.md`

### App QA

1. Apply `20260629130000_order_numbers_location_timezone.sql`.
2. Confirm store timezone is correct.
3. Create orders before and after 00:00 UTC but before local midnight.
4. Expected: sequence does not reset at UTC midnight.
5. Create orders across local midnight.
6. Expected: sequence resets only on local date change.
7. Open Previous Orders.
8. Expected: newest orders appear first.

### Supabase QA

```sql
SELECT pg_get_functiondef('public.generate_order_number(uuid, uuid)'::regprocedure);
SELECT pg_get_functiondef('public.generate_order_number_internal(uuid, uuid)'::regprocedure);
```

Expected: date key uses `locations.timezone` / `NOW() AT TIME ZONE ...`, not raw `CURRENT_DATE`.

Optional order check:

```sql
SELECT id, order_number, created_at
FROM public.orders
WHERE location_id = '<location_id>'
ORDER BY created_at DESC
LIMIT 20;
```

## 9. Location POS Settings + Station Overrides

Task doc: `tasks/pos-effective-config-station-overrides.md`

### App QA

1. Apply `20260630120000_station_pos_config_overrides.sql`.
2. Use two stations at the same location.
3. Change a location-level POS setting from the web surface once web UI is wired.
4. Expected: both stations inherit it after sync/restart.
5. Set a station-only override.
6. Expected: only that station changes; sibling remains on location default.
7. Switch stations on the same device.
8. Expected: POS rehydrates the selected station's effective config.

### Supabase QA

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

Expected: column exists with default `{}`; effective config resolves defaults -> location config -> station override.

## 10. Timesheets Auto Clock-Out POS/Backend

Task doc: `tasks/timesheets-auto-clock-out-pos.md`

### App QA

1. Apply `20260702120000_auto_clock_out_stale_shifts.sql`.
2. Set a test location to `auto_clock_out_enabled = true` and `auto_clock_out_time = '03:00'`.
3. Create or backdate an open `staff_shifts` row before the latest local cutoff.
4. Open POS for that location so timeclock hydration runs.
5. Expected: stale open shift is not hydrated as active because the server RPC closes it first.
6. Create a normal active shift after the cutoff.
7. Expected: it remains active until the next cutoff.
8. Confirm manual POS clock-out still works for a normal active shift.

### Supabase QA

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

Expected: completed stale shifts have `clock_out_time` at the local cutoff, `is_verified = false`, auto-clock-out note, closed break `end`, and a `shift_auto_closed` audit row. Re-running the RPC should return `closed_count = 0` for the same shift.

## Visible Tickets Not Implemented By Me

## 11. Table Merge & Transfer + POS Dates/Calendars

Not part of the 9 POS tickets documented in this branch.

Suggested QA:

1. Merge two active tables.
2. Transfer merged table/order to another table.
3. Confirm table status, order ownership, and floor-plan UI state.
4. Pay/close the transferred order.
5. Confirm Previous Orders date/calendar placement.

Suggested SQL:

```sql
SELECT id, order_number, table_number, table_id, status, payment_status,
       created_at, closed_at
FROM public.orders
WHERE id = '<order_id>';
```

## 12. Owner Mis-Provisioned / Member Not Found

Not part of the POS ticket set. Treat as admin/dashboard/data QA.

Suggested SQL:

```sql
SELECT id, email, clerk_user_id
FROM public.users
WHERE email = '<email>';

SELECT id, merchant_id, user_id, email, is_active
FROM public.staff_profiles
WHERE merchant_id = '<merchant_id>';
```

## 13. P0 Cash Payment Records `$0.00` / Paid With Balance

Not part of my completed ticket set, but high priority if another branch claims the fix.

Suggested QA:

1. Create cash-priced order.
2. Pay full amount with cash.
3. Confirm POS shows paid with zero balance.
4. Confirm Previous Orders amount paid equals cash total.

Suggested SQL:

```sql
SELECT id, order_number, payment_status, amount_paid, amount_due,
       cash_amount_due, total_amount, card_total, cash_total
FROM public.orders
WHERE id = '<order_id>';

SELECT id, payment_method, amount, tip_amount, is_cash_priced, status
FROM public.order_payments
WHERE order_id = '<order_id>'
ORDER BY created_at;
```

Expected if fixed: payment row amount is not `0.00`; order is paid; both due fields are `0`.

## 14. Offline Order Never Syncs / Pay-After-Paid / Clipped New Order

Not part of my completed ticket set. Likely offline sync/current POS flow QA.

Suggested QA:

1. Start online and create a new order.
2. Go offline.
3. Add items and continue normal order flow.
4. Reconnect.
5. Expected: order gets backend ID and items sync; no empty server shell.
6. Pay the order.
7. Attempt pay-after-paid edge path.
8. Expected: no duplicate payment and order remains consistent.
9. Check `New Order` button layout on target device.

Suggested SQL:

```sql
SELECT id, order_number, status, payment_status, amount_paid, total_amount,
       created_at, updated_at
FROM public.orders
WHERE order_number = '<order_number>'
ORDER BY created_at DESC;

SELECT id, order_id, menu_item_id, quantity, unit_price
FROM public.order_items
WHERE order_id = '<order_id>';
```

## Best Video Candidates

- Printed receipt alternate-price removal: physical Star/Landi proof.
- KDS server/creator: POS-created ticket showing staff name and `show_server_name` toggle behavior.
- Order numbers local-midnight reset: strong if you can show SQL/function plus boundary order creation.
- Location POS settings + station overrides: strong once web UI is wired because it proves inherit/override.
- Timesheets auto clock-out: strong if you show the cutoff setting, stale active shift before/after RPC, closed break, and AUTO/audit evidence.
- Platform logos: visual KDS + Previous Orders sweep across GrubHub/DoorDash/Uber Eats.
- Cash payment `$0.00` P0: high priority if its fix is in another branch.
- Offline order never syncs: high priority if its fix is in another branch.
- EOD Review staff: quick video proving blocker-to-staff focus.
- Daily Shift Report: quick video tapping dates and month boundaries.

## Immediate QA Order

1. Apply the 5 migrations on staging in order.
2. Run quick no-migration POS checks: Daily Shift Report, EOD Review staff, DESSERT duplicate card, platform logos.
3. Run physical receipt proof on Star and Landi.
4. Run migration-backed QA: KDS server name, order-number local midnight, station config overrides, stale cash-price data, auto clock-out.
5. Separately test or route the non-owned tickets.
