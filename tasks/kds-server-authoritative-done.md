# POS-KDS Server-Authoritative Done

## Summary
Make KDS "Done" state server-authoritative so completed/served tickets behave consistently across KDS stations, survive refresh/reconnect for the retention window, and are not reverted from Served back to Cooking by stale active-ticket fetches or broadcasts.

Problem symptoms:

- A ticket marked Done can vanish on one KDS station but not show in the Done tab on another station.
- Served/Done tickets can reappear as Cooking after polling or realtime reconciliation.
- Auto-bumped tickets can be removed locally before the server confirms, then fail to reach the expo/Done view.
- Done retention is currently too dependent on local in-memory/persisted state.

## Scope
- POS KDS read/write path.
- Supabase RPC/view behavior around `get_kds_tickets_v2`.
- KDS client merge, broadcast, auto-advance, and Done retention logic.
- Testing and QA instructions for cross-station KDS.

## Non-Scope
- Website dashboard KDS, unless a separate web KDS also renders these RPCs.
- Order payment/completion accounting.
- KDS visual redesign.
- Package or lockfile changes.

## Plan
1. Inspect current KDS lifecycle: fetch, broadcast, manual advance, auto-bump, Done tab retention, and recall.
2. Add/adjust a migration so `get_kds_tickets_v2` can return server-completed Done tickets for a retention window while keeping active statuses server-authoritative.
3. Ensure served items are never interpreted as active Cooking tickets during fetch/broadcast reconstruction.
4. Update POS KDS client merge so server Done tickets are retained cross-station and active stale versions cannot override them.
5. Keep manual Done, bulk Done, and auto-bump writes going through server item status updates.
6. Add targeted source/unit tests for Done server-authoritative behavior.
7. Document Supabase and tablet QA.

## Progress
- Created ticket plan.
- Added `get_kds_tickets_v2` migration so recently served rounds are returned as server `done` tickets for the POS one-hour retention window.
- Added `done_time` to the RPC payload and POS ticket type.
- Updated POS KDS fetch/background reconciliation to split server Done tickets before active visibility filtering.
- Centralized Done ticket dedupe/retention for manual Done, bulk Done, remote-completed broadcasts, and server-hydrated Done.
- Confirmed auto-bump already calls `advanceTicketStatus(..., "served")`, so it now uses the same server-authoritative Done flow.
- Added focused source regression coverage for the RPC contract and POS merge behavior.

## Verification
Targeted checks:

```powershell
npx jest --runTestsByPath __tests__/kdsServerAuthoritativeDone.test.ts
npx jest --runTestsByPath __tests__/kdsTimer.test.ts __tests__/kdsAutomation.test.ts __tests__/kdsRecalledTtl.test.ts
```

Current result:

- `git diff --check` passed, with only existing CRLF conversion warnings for touched TS files.
- Lightweight Node static KDS Done contract check passed.
- Jest is blocked before test discovery because `jest-expo` now requires missing peer dependency `@react-native/jest-preset`. Package files were not changed per repo rules.

Manual/Supabase QA:

1. Apply the migration on staging.
2. Open KDS on two tablets/stations for the same location/display scope.
3. Send an order to KDS and move it to Served/Ready.
4. Mark it Done on tablet A.
5. Confirm tablet B removes it from active columns and shows it in Done after the next poll/realtime update.
6. Refresh/reopen KDS and confirm Done tickets remain visible for the configured retention window.
7. Wait for auto-bump from Served/Ready and confirm it reaches Done on both tablets.
8. Confirm no Served/Ready ticket reverts to Cooking after polling or order broadcasts.
9. Recall from Done and confirm it re-enters the correct active column on both tablets.

## Files
- `tasks/kds-server-authoritative-done.md`
- `supabase/migrations/20260717120000_kds_server_authoritative_done.sql`
- `stores/useKDSStore.ts`
- `types/kds.ts`
- `__tests__/kdsServerAuthoritativeDone.test.ts`

## Open QA
- Needs staging migration.
- Needs two-station tablet proof video.
- Re-run the focused Jest tests after the missing `@react-native/jest-preset` dependency is available.
