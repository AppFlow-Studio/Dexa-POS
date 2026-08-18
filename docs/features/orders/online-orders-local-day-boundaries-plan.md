# Online Orders Local-Day Boundaries

## Summary

Fix the POS Online Orders Today/Yesterday/Last 7/Custom views so every range
uses one server-authoritative location-local day definition. Active online
orders must remain visible even when their placement timestamp falls outside
the selected historical range.

Status: POS implementation complete; migration deployment and tablet QA remain.

## Scope

In scope:

- Add `get_online_orders_board_v1` in a versioned Supabase migration.
- Resolve boundaries from `locations.timezone` with DST-safe IANA zones and
  half-open `[from, to)` intervals.
- Filter by `online_orders.placed_at`, not device time or `orders.opened_at`.
- Include active statuses regardless of the selected date range.
- Replace the duplicated PostgREST/client filtering in the POS Online Orders
  screen with the RPC.
- Add contract tests and a boundary-focused staging QA matrix.

Out of scope:

- Website/dashboard date filtering.
- Changing whether Done uses placement time or completion time; v1 keeps
  placement time.
- Order totals, payment logic, or provider status relay behavior.

## Current Findings

- `app/(main)/online-orders/index.tsx` directly loads up to 200
  `online_orders` rows, joins `orders`, and filters by client-side bounds.
- `hooks/orders/useOnlineOrdersByDate.ts` contains a second implementation of
  the same fetch/filter logic but is not used by the screen.
- Today bypasses the historical query and uses live Zustand orders, while
  other presets use `get_business_day_bounds` plus client filtering.
- The current filter compares `OrderProfile.opened_at`; the ticket contract is
  based on authoritative `online_orders.placed_at`.

## Decisions For Approval

Recommended contract:

1. Treat Today/Yesterday as location-local calendar days at midnight, not the
   configurable POS rollover hour. This matches the ticket's 11:57 PM/12:10 AM
   acceptance boundary and the local-midnight order-number contract.
2. Active statuses are `pending`, `accepted`, `sent_to_kitchen`, `preparing`,
   and `ready`, matching the POS active-order selector.
3. Active orders outside the selected date range remain visible in every
   preset. Date exclusivity tests use terminal/completed orders.
4. Make `useOnlineOrdersByDate` the single client adapter and remove the
   duplicate screen-level fetch after the RPC is integrated.

## Plan

1. Capture live staging definitions for the status enum, location authorization
   pattern, `online_orders` columns, and the screen's required order payload.
2. Define the RPC result contract so it returns every field needed by the
   existing order transformer/cards without follow-up per-order queries.
3. Add the migration with invoker authorization, pinned `search_path`, validated
   range values, custom-date validation, timezone boundaries, active-status
   override, duplicate-ingestion protection, and deterministic newest-first
   ordering.
4. Add an `OrderService` adapter and RPC result types; route the canonical hook
   through it with stale-request protection and actionable error handling.
5. Replace the screen's duplicate fetch with the hook while preserving Zustand
   reconciliation and realtime updates.
6. Add targeted tests for midnight boundaries, active override, custom ranges,
   deduplication, and DST fallback.
7. Apply the migration to staging and execute the ticket's Jul 22-24 repro plus
   the 11-case date matrix.

## Website Impact

No website implementation is requested. The ticket explicitly identifies the
web dashboard as an analog and excludes it from scope. The website team only
needs the RPC contract communicated if it later chooses to reuse it.

## Progress

- Notion ticket fetched and reviewed.
- Current POS query, date filter, business-day helper, and service adapter
  inspected.
- Added `get_online_orders_board_v1` using location-local midnight boundaries,
  `online_orders.placed_at`, half-open intervals, and DST-safe timezone
  conversion.
- The RPC returns deduplicated order headers and item counts directly, avoiding
  a large follow-up `.in(...)` request and preserving exact historical results.
- The compatibility `p_limit` argument remains in the signature for early
  clients but does not truncate results.
- Replaced the screen's duplicate direct query with the canonical date hook.
- Today, Yesterday, Last 7, and Custom now share the same RPC path.
- Realtime reconciliation is location-gated, lets authoritative completion beat
  stale active state, preserves forward optimistic transitions, and does not
  leak out-of-range completed orders into the selected date.
- If a realtime active order arrives after the RPC snapshot, the hook performs
  one reconciliation refresh so its authoritative placement remains known when
  it later completes.
- A same-filter refresh failure retains the last successful selection; an
  initial offline Today load can still show locally known active/completed rows.

## Verification

Completed automated verification:

- `onlineOrdersLocalDay.test.ts`: local-midnight SQL contract, duplicate-row
  protection, active override, completed-order exclusion, optimistic/server
  reconciliation, offline fallback, and realtime deduplication.
- `onlineOrderService.test.ts`: RPC name, parameters, and response mapping.
- Targeted Jest: 19 tests passed.
- Targeted ESLint for the changed screen, hook, component, and helper: no
  warnings or errors.

Still requires staging/tablet verification:

- 11:57 PM yesterday and 12:10 AM today location-local boundary cases.
- Nov 1, 2026 America/New_York DST fallback case.
- Done counts compared with direct SQL using the same local bounds.

## Files

Implementation files:

- `supabase/migrations/20260804120000_online_orders_board_local_day.sql`
- `services/orderService.ts`
- `hooks/orders/useOnlineOrdersByDate.ts`
- `app/(main)/online-orders/index.tsx`
- `components/online-orders/OnlineOrderDateFilter.tsx`
- `lib/onlineOrderBoard.ts`
- `database.types.ts`
- `__tests__/onlineOrdersLocalDay.test.ts`
- `__tests__/onlineOrderService.test.ts`

## Open QA

- Apply `20260804120000_online_orders_board_local_day.sql` to staging.
- Confirm the five-status active set against the deployed enum.
- Exercise Today, Yesterday, Last 7, and Custom on the tablet.
- Complete the ticket's Jul 22-24 reproduction and midnight/DST matrix.
- Non-implementer screen recording and Abubeckr/Temur sign-off remain required.
