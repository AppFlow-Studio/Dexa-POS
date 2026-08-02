# QA Table Merge / Transfer + POS Date Calendar Integrity

## Summary

- Ticket: QA closure for POS table merge, table transfer, Previous Orders date handling, and related calendar integrity.
- Surface: POS tablet floor plan, table sessions, Previous Orders, and Supabase RPCs.
- This task is POS/backend scoped. Website is only a comparison surface if dashboard date totals disagree with POS.

## Scope

- In scope:
  - POS table transfer client guard.
  - Supabase RPC safety for `transfer_table_session`, `merge_table_to_session`, and `unmerge_table_from_session`.
  - Prevent table transfer from leaving a session with zero tables.
  - Preserve active/inactive table link semantics used by the POS floor plan.
  - Keep `get_business_day_bounds` unchanged after confirming it already returns merchant-local half-open bounds.
  - Manual QA plan for table merge/transfer and Previous Orders date fixtures.
- Out of scope:
  - Website dashboard date filtering fixes.
  - New combine-check behavior.
  - RBAC gating for table transfer.
  - Renumbering or changing historical orders.

## Plan

1. Inspect live staging RPC definitions for table transfer, merge, unmerge, and business-day bounds.
2. Patch the risky `transfer_table_session(uuid, uuid[], text)` overload used by POS.
3. Preserve the existing `transfer_table_session(uuid, uuid[])` signature by delegating to the safe overload.
4. Make merge/unmerge respect `table_session_tables.is_active` so stale inactive links do not block or distort current table state.
5. Add POS client guard for empty, null, and duplicate transfer targets.
6. Document migration and remaining QA evidence.

## Progress

- Confirmed staging has:
  - `get_business_day_bounds(uuid,date,date)`
  - `merge_table_to_session(uuid,uuid)`
  - `unmerge_table_from_session(uuid,uuid)`
  - `transfer_table_session(uuid,uuid[])`
  - `transfer_table_session(uuid,uuid[],text)`
- Confirmed POS calls the three-argument transfer overload through `FloorPlanService.transferTableSession`.
- Found the three-argument overload could delete old table links before validating an empty or duplicate target array.
- Added migration `supabase/migrations/20260710120000_table_transfer_session_safety.sql`.
- Added a POS service guard in `services/floorPlanService.ts`.

## Verification

Local static verification:

```powershell
rg "At least one target table is required|Duplicate target tables are not allowed|transfer_table_session" services/floorPlanService.ts supabase/migrations/20260710120000_table_transfer_session_safety.sql
```

Supabase verification after migration:

```sql
select p.oid::regprocedure::text as signature,
       pg_get_functiondef(p.oid) as definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'transfer_table_session',
    'merge_table_to_session',
    'unmerge_table_from_session',
    'get_business_day_bounds'
  )
order by p.proname, p.oid::regprocedure::text;
```

Expected:

- `transfer_table_session(uuid,uuid[],text)` rejects empty target arrays.
- `transfer_table_session(uuid,uuid[],text)` rejects duplicate target IDs.
- `transfer_table_session(uuid,uuid[])` delegates to the safe overload.
- Merge/unmerge only consider active table links.
- `get_business_day_bounds` remains unchanged.

## Files

- `services/floorPlanService.ts`
- `supabase/migrations/20260710120000_table_transfer_session_safety.sql`
- `docs/quality/qa-tracking/table-merge-transfer-date-calendar-integrity.md`
- `docs/tickets/ALL-TICKETS-REFERENCE.md`
- `docs/quality/qa-tracking/in-progress-ticket-testing-sweep-2026-07-02.md`

## Open QA

- Apply the migration on staging.
- Run QA case 2.9: empty target array must error and leave the original session table links intact.
- Run QA case 2.10: duplicate target IDs must error and leave the original session table links intact.
- Run table transfer happy path from POS tablet and confirm `orders.table_number` updates.
- Run occupied target case and confirm the target is blocked.
- Run offline transfer case and confirm POS blocks it without queueing.
- Run merge/unmerge happy path and primary reassignment.
- Run Previous Orders date fixture cases O1-O5 against POS and Supabase.
- Record tablet video and Supabase query proof before marking Done.
