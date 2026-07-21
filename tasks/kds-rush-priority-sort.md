# POS-KDS Rush / Priority Top-Band Sort

## Summary

Rushed KDS tickets stayed in their existing queue position even though item-level `rush` and ticket-level `prioritized` data already existed. The live `get_kds_tickets_v2` RPC sorted only by `start_time ASC NULLS LAST`, and the POS KDS screen also did a final time-only sort before layout.

Expected behavior:

- Any ticket with at least one rushed item moves into the top band.
- Any prioritized ticket moves into the same top band.
- Rushed and prioritized tickets keep their existing chips/labels and sort by fire/start time within the top band.
- Normal tickets continue below the elevated band.

## Scope

In scope:

- `get_kds_tickets_v2` payload and ordering.
- POS KDS store ordering for fetched, broadcast-built, rushed, and prioritized tickets.
- POS KDS screen final layout ordering.

Out of scope:

- Changing the meaning of Rush vs Prioritize.
- Changing the RUSHED chip UI.
- Changing KDS routing, status transitions, or done-ticket recall behavior.

## Plan

1. Add `any_rush` to the `oi_grouped` aggregate in `get_kds_tickets_v2`.
2. Include top-level `any_rush` in each KDS ticket JSON object.
3. Change RPC aggregate ordering to `(any_rush OR prioritized) DESC, start_time ASC NULLS LAST`.
4. Preserve `SECURITY DEFINER` and `SET search_path TO 'public', 'pg_temp'`.
5. Add optional `any_rush` to `KDSTicket`.
6. Update POS KDS store sorting so rushed and prioritized tickets share the elevated top band.
7. Update the KDS screen final layout sort so it cannot undo the RPC/store ordering.

## Progress

- Added migration:
  - `supabase/migrations/20260712120000_kds_rush_priority_sort.sql`
- Added `any_rush` to `types/kds.ts`.
- Updated `stores/useKDSStore.ts` to derive elevated tickets from `any_rush`, item `rush`, ticket `prioritized`, item `is_prioritized`, and local prioritized IDs.
- Updated `app/(main)/kds.tsx` final layout sort to keep elevated tickets above normal tickets.
- Updated `tasks/ticket-log.md`.

## Verification

Targeted local checks passed on 2026-07-12:

```powershell
rg "any_rush|isKdsTicketElevated|isTicketElevated" types stores app supabase/migrations/20260712120000_kds_rush_priority_sort.sql
npx jest --runTestsByPath __tests__/kdsTimer.test.ts __tests__/kdsAutomation.test.ts
npx jest --runTestsByPath __tests__/badWifiWave2.test.ts __tests__/kdsRecalledTtl.test.ts
```

Suggested Supabase verification after applying the migration:

```sql
SELECT pg_get_functiondef('public.get_kds_tickets_v2(uuid,text[],uuid)'::regprocedure);

SELECT get_kds_tickets_v2(
  '<location_id>'::uuid,
  ARRAY['sent','preparing','ready'],
  NULL
);
```

Manual QA still required:

- Apply the migration on staging.
- Open KDS with at least three active tickets in the same column/state.
- Rush a mid-queue ticket and confirm it jumps to the top band immediately.
- Prioritize a non-rushed mid-queue ticket and confirm it also jumps to the top band.
- Confirm RUSHED and prioritized/star UI still render.
- Confirm normal non-rushed/non-prioritized tickets remain below the elevated band.
- Capture screen recording proof for the ticket.

## Files

- `supabase/migrations/20260712120000_kds_rush_priority_sort.sql`
- `types/kds.ts`
- `stores/useKDSStore.ts`
- `app/(main)/kds.tsx`
- `tasks/kds-rush-priority-sort.md`
- `tasks/ticket-log.md`

## Open QA

- Staging migration must be run before app/tablet QA.
- Physical tablet screen recording is still needed.
