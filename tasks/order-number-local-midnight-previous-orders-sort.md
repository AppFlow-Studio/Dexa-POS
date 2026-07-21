# Order Numbers Local Midnight + Previous Orders Newest First

## Summary

Ticket: POS Previous Orders list + order-number generation RPCs.

This is a POS/backend ticket, not a website-only ticket. The proven backend issue is that both order-number RPCs used `CURRENT_DATE`, which resolves in the Supabase/PostgREST session timezone. That makes restaurant order numbers reset at 00:00 UTC instead of the location's local midnight.

The Previous Orders sorting part was inspected in this POS repo. The current branch already queries history by `created_at DESC`, stores the keyset cursor from raw DB `created_at`, maps fetched history timestamps from `created_at`, and defaults the screen sort to date descending. No frontend sort change was needed in this branch.

## Scope

In scope:

- `generate_order_number(p_location_id uuid, p_station_id uuid DEFAULT NULL)`.
- `generate_order_number_internal(p_location_id uuid, p_merchant_id uuid)`.
- Location-local date key based on `locations.timezone`.
- Previous Orders sort verification in POS service/store/screen code.
- Task documentation and senior summary updates.

Out of scope:

- Renumbering historical orders.
- Changing order total/payment logic.
- Website order history.
- Cleanup of old order-number sequences.
- Multi-location sequence-key redesign beyond the existing per-merchant/per-date/per-station sequence shape.

## Plan

1. Confirm whether this is POS or website scope from the ticket and local repo paths.
2. Inspect Previous Orders data flow for any `order_number` sort.
3. Add a Supabase migration replacing both order-number RPCs.
4. Derive `v_date_str` from `(NOW() AT TIME ZONE locations.timezone)::date`.
5. Preserve the existing daily sequence approach: sequence name, advisory lock around sequence creation, `MAX(order_number)` bootstrap, lock release before `nextval`, and pinned `search_path`.
6. Document staging verification and manual QA.

## Progress

- Confirmed ticket is POS/backend from the attached contract.
- Inspected Previous Orders paths:
  - `services/orderService.ts` uses `.order("created_at", { ascending: false })` for history queries.
  - `stores/usePreviousOrdersStore.ts` sorts merged history by `timestamp` descending and stores keyset cursor from raw `created_at`.
  - `utils/orderTransformers.ts` maps fetched history `opened_at` from backend `created_at`.
  - `app/(main)/previous-orders.tsx` defaults to date descending.
- Added migration:
  - `supabase/migrations/20260629130000_order_numbers_location_timezone.sql`
- Updated `tasks/ticket-log.md`.
- Updated `tasks/pos-ticket-senior-summary-2026-06-27.md`.

## Verification

Static/local verification:

```powershell
rg -n "CURRENT_DATE|NOW\(\) AT TIME ZONE|generate_order_number" supabase/migrations/20260629130000_order_numbers_location_timezone.sql
Select-String -Path "services\orderService.ts" -Pattern "created_at"
Select-String -Path "stores\usePreviousOrdersStore.ts" -Pattern "ORDER BY created_at DESC|timestamp descending|created_at"
Select-String -Path "utils\orderTransformers.ts" -Pattern "opened_at: backendOrder.created_at|created_at: fetchedOrder.created_at"
Select-String -Path "app\(main)\previous-orders.tsx" -Pattern "sortBy|sortOrder|dateA|dateB"
```

Staging verification after applying the migration:

```sql
SELECT proname, pg_get_functiondef(oid)
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND proname IN ('generate_order_number', 'generate_order_number_internal');
```

Confirm both function bodies use `NOW() AT TIME ZONE` with `locations.timezone` and no longer use `CURRENT_DATE` for the order-number date key.

Manual QA still required:

- Apply migration on staging.
- Create orders for a location whose timezone is `America/New_York` while UTC date differs from local date; prefix must match local date.
- Create orders across 00:00 UTC but before local midnight; sequence must continue, not reset.
- Create orders across local midnight; sequence must reset to `0001` and prefix must flip to the new local date.
- Fire concurrent orders and confirm unique, gap-tolerant numbers with no duplicate `order_number`.
- Confirm Previous Orders shows newest orders first by `created_at`, including orders around the previous UTC reset boundary.
- Confirm offline-created orders receive server-generated local-date numbers at sync.

## Files

- `supabase/migrations/20260629130000_order_numbers_location_timezone.sql`
- `tasks/order-number-local-midnight-previous-orders-sort.md`
- `tasks/ticket-log.md`
- `tasks/pos-ticket-senior-summary-2026-06-27.md`

## Open QA

- Migration has not been run from this workspace.
- Need staging proof from Supabase function definitions and POS Previous Orders screen recording.
- Need Abubeckr signoff before marking Done.
