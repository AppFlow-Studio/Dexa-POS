# Timesheets - POS Auto Clock-Out Backend Contract

## Summary

Part 1 manual timesheet adjustment is handled in the web dashboard. This POS/backend slice implements Part 2: a per-location automatic clock-out cutoff that safely closes stale open `staff_shifts` without using the old POS max-hours direct update path.

The storage contract is:

- `locations.auto_clock_out_enabled boolean NOT NULL DEFAULT false`
- `locations.auto_clock_out_time time NOT NULL DEFAULT '03:00'`
- `locations.timezone` interprets the cutoff as location-local wall time

## Scope

In scope:

- Add the Supabase migration for the setting columns.
- Add `auto_clock_out_stale_shifts(p_location_id uuid default null, p_now timestamptz default now())`.
- Close open breaks in `staff_shifts.break_logs` at the cutoff.
- Leave auto-closed shifts `is_verified = false`.
- Add a clear auto-close note and `shift_auto_closed` audit entry with actor `System`.
- Make POS hydration call the safe server function before loading active sessions.
- Document the website contract for enabling/disabling and setting the cutoff.

Out of scope:

- Website settings UI.
- Website Part 1 manual adjustment UI/RPC.
- AUTO badge rendering on the web dashboard.
- PTO accrual policy changes for unverified auto-closed shifts.

## POS Flow Findings

- POS creates/clocks in shifts through `handle_time_clock` and `handle_time_clock_v2`. `sign_in` and `clock_in` insert `staff_shifts` with `status = 'active'`, `hourly_rate_snapshot`, device/station metadata, and default `clock_in_time`.
- POS manual clock-out uses the same RPC action `clock_out`, which updates the active shift to `status = 'completed'` and `clock_out_time = now()`.
- Session logout can also call `pos_staff_logout(..., p_clock_out = true)`, which delegates back to `handle_time_clock(..., 'clock_out', ...)`.
- Offline queued `clock_out` actions are processed by `services/timeclockSyncProcessor.ts`. If the RPC fails, it has a best-effort direct `staff_shifts` update fallback for the target open shift.
- Manual POS clock-out intentionally blocks if the shift is `on_break` with `END_BREAK_FIRST`; the UI also prevents clock-out while on break.
- Breaks are stored in `staff_shifts.break_logs` as JSONB entries shaped like `{ "start": timestamptz, "end": null | timestamptz, "type": "unpaid" }`.
- POS break start appends an open break log and sets `status = 'on_break'`; break end sets the last break `end` and returns `status = 'active'`.
- Existing force-close paths existed before this ticket: EOD bulk clock-out directly updates active/on-break shifts, and timeclock hydration had a hidden `autoCloseStaleShifts/maxShiftHours` direct update. The hydration auto-close path is now replaced with the safe server RPC call.
- No existing timeclock audit action was found for normal `clock_out`; the new system action is `shift_auto_closed`.

## Plan

- Add guarded location settings columns for the cutoff.
- Implement helper `_auto_clock_out_close_break_logs(jsonb, timestamptz)` to close dangling break ends.
- Implement `auto_clock_out_stale_shifts` as a SECURITY DEFINER RPC:
  - process enabled locations only
  - compute the most recent past cutoff in `locations.timezone`
  - close only `status IN ('active','on_break')` and `clock_out_time IS NULL`
  - set `clock_out_time` to the cutoff instant
  - close open breaks at that cutoff
  - set `is_verified = false`
  - append an auto-close review note
  - insert `audit_logs.action = 'shift_auto_closed'` with actor `System`
  - return counts and closed shift IDs
- Schedule it every 15 minutes when `pg_cron` is installed; otherwise leave the RPC callable and raise a migration notice.
- Have POS hydration call the RPC for its current location before querying active shifts.

## Progress

- Added migration `20260702120000_auto_clock_out_stale_shifts.sql`.
- Added `locations.auto_clock_out_enabled` and `locations.auto_clock_out_time` to `database.types.ts`.
- Added RPC type for `auto_clock_out_stale_shifts`.
- Replaced the old hydration max-hours direct close with a best-effort RPC call.
- Marked legacy `autoCloseStaleShifts/maxShiftHours` config comments as server-replaced.
- Added QA coverage to the in-progress testing sweep.

## Verification

Static/local:

- `git diff --check` should be run before PR.
- SQL migration requires staging Supabase execution for full verification.

Staging SQL:

```sql
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'locations'
  AND column_name IN ('auto_clock_out_enabled', 'auto_clock_out_time');

SELECT public.auto_clock_out_stale_shifts('<location_id>'::uuid, '<test_now>'::timestamptz);

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

- Toggle off/no enabled location returns no closures.
- Toggle on closes stale open shifts at the location-local cutoff.
- Already completed shifts are not touched.
- Re-running the RPC does not alter the same shift twice.
- Open `break_logs` entries have `end` populated with the cutoff.
- Auto-closed shifts remain `is_verified = false`.
- Audit rows show `shift_auto_closed`, actor `System`, cutoff metadata, and old/new changes.

## Files

- `supabase/migrations/20260702120000_auto_clock_out_stale_shifts.sql`
- `stores/useTimeclockStore.ts`
- `database.types.ts`
- `types/locationConfig.ts`
- `tasks/timesheets-auto-clock-out-pos.md`
- `tasks/ticket-log.md`
- `tasks/in-progress-ticket-testing-sweep-2026-07-02.md`
- `tasks/pos-ticket-senior-summary-2026-06-27.md`

## Website Contract

Website settings should write directly through an authorized server action/RPC to:

- `locations.auto_clock_out_enabled`
- `locations.auto_clock_out_time`

Do not use `locations.pos_config.timeclock.autoCloseStaleShifts` or `maxShiftHours` for the new feature. Those are legacy POS config fields and no longer drive POS hydration auto-close.

Suggested UI copy: any shift still open at the configured location-local time is automatically clocked out, marked unverified, and requires manager review.

## Open QA

- Apply the migration in staging.
- Confirm `pg_cron` schedules `auto_clock_out_stale_shifts`; if `pg_cron` is unavailable, schedule `SELECT public.auto_clock_out_stale_shifts();` externally every 15 minutes.
- Test enabled and disabled locations.
- Test a stale `active` shift.
- Test a stale `on_break` shift with an open break.
- Test a shift opened after the latest cutoff.
- Re-run the RPC to prove idempotence.
- Confirm web Part 1 `admin_adjust_staff_shift` can edit an auto-closed row afterward and set `is_verified = true`.
