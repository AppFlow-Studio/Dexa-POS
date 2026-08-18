# POS-KDS Routing Traceability

## Summary

- Ticket: `[POS-KDS · P0] KDS Routing Traceability — immutable kds_routing_log + send-attempt ledger + order routing trace RPC`
- Notion page: `3b98280c-1b1d-8194-9732-f2ee39d3004a`
- Notion URL: `https://app.notion.com/p/3b98280c1b1d81949732f2ee39d3004a`
- POS status: code complete; shared migration review/application and physical QA remain.
- Shared migration owner/path: `DexaPOS-Website/supabase/migrations/20260814120000_kds_routing_traceability.sql`
- Migration state: not applied. Temur DDL review is required before staging.

## Scope

### POS scope

- Use `send_order_to_kitchen_v1` for initial, late-sync, pre-auth, table-session, and offline-replay kitchen sends.
- Send active station/device/staff context to the shared send-attempt ledger.
- Preserve composite and item idempotency keys through queue, replay, retry, and app restart.
- Freeze the exact resolved/unresolved item split before the first replay RPC.
- Require `updated_count === requested_count` before reporting success.
- Reject zero-destination sends when `kds_updated_count = 0`.
- Keep ordinary KDS preparing/ready/served/recall operations on the existing bulk status path.

### Non-scope

- No POS migration; the website repo owns the one shared Supabase migration.
- No routing-rule, prep-station, category, order-type, `show_all_items`, or fallback changes.
- No KDS state-machine redesign or support/admin trace screen in the POS.
- No package or lockfile changes.

## Existing POS Flow

Before this ticket, initial sends first moved the order out of `draft`, then called `bulk_update_order_item_status_v2`. Offline replay repeated those two client-side steps. Station/device context was not attached to the send operation, queued retries could reconstruct a different item set, and callers treated any transport-level success as complete even when the RPC's reported count did not match the request.

## Plan

1. Add a shared POS context/result validator for kitchen sends.
2. Add a typed `OrderService.sendOrderToKitchen` wrapper around the composite RPC.
3. Route every initial-send family through the wrapper.
4. Persist context and both keys in offline queue/replay paths.
5. Reject partial, missing-contract, and no-active-route responses.
6. Preserve all existing KDS routing and lifecycle behavior.
7. Add targeted tests and a physical QA runbook.

## Progress

- [x] Added operation-scoped composite/item idempotency keys.
- [x] Added queue payloads carrying station, device, staff, statuses, and keys.
- [x] Added composite RPC wrapper with structured diagnostics.
- [x] Converted normal order-entry and table-session initial sends.
- [x] Converted late item-sync, payment, and pre-auth sends.
- [x] Converted offline add-item and `send_to_kitchen` replay paths.
- [x] Frozen replay item IDs before the first RPC attempt.
- [x] Preserved a new key pair only when unresolved items split into a new logical remainder operation.
- [x] Added partial-count, cached-replay, schema-contract, and no-route handling.
- [x] Updated generated POS RPC args for `p_station_id` and `p_device_id`.
- [x] Updated operator remedies and non-retryable sync subtitles.
- [x] Added automated contract/wiring tests.
- [ ] Temur reviews shared DDL/RPC definitions.
- [ ] Shared migration is applied on staging.
- [ ] Physical POS/KDS and offline replay QA is completed.
- [ ] Independent verifier signs off.

## Online Send Implementation

`OrderService.sendOrderToKitchen` calls `send_order_to_kitchen_v1` with:

- `p_order_id`
- `p_order_status`
- `p_order_item_ids`
- `p_item_status`
- `p_staff_id`
- `p_idempotency_key`
- `p_items_idempotency_key`
- `p_station_id`
- `p_device_id`

The POS reports success only when explicit requested/updated counts exist and match. A response with `kds_updated_count = 0` is also rejected because no KDS destination accepted the items. Local optimistic state and kitchen printing remain fast, but the success toast now waits for server confirmation.

## Offline And Replay

- Queue rows retain the composite key in `OfflineOperation.idempotencyKey`.
- Item-RPC keys and station/device/staff context are stored in operation params.
- Online attempts that fall back to the queue also persist their exact resolved DB item IDs.
- Legacy queued rows are backfilled once, before their first RPC attempt.
- Replay freezes resolved/unresolved item IDs before calling Supabase, preventing a retry from changing the request under an already-used key.
- Unresolved remainder items become a separate bounded logical operation with a new key pair.
- Cached replay results are revalidated; they are not assumed successful.

## Response Mismatch Handling

| Code | Trigger | POS behavior |
| --- | --- | --- |
| `KITCHEN_ITEMS_UNRESOLVED` | `updated_count < requested_count` or request-count disagreement | No success toast, no blind automatic resend, actionable refresh/re-fire warning. |
| `KITCHEN_NO_ACTIVE_ROUTE` | Requested rows updated but `kds_updated_count = 0` | No success toast; operator is told to check active displays and routing trace. |
| `KITCHEN_TRACE_CONTRACT_MISMATCH` | Shared RPC omits required counts | No success toast; staging must apply the reviewed shared migration. |
| `KITCHEN_STATUS_PARTIAL_UPDATE` | Non-send KDS status call updates fewer rows than requested | Structured error and refresh-before-retry guidance. |

## Verification

### Automated

- `npx jest __tests__/kdsRoutingTraceability.test.ts __tests__/sendToKitchenRequeueBound.test.ts --runInBand`
- Result: 2 suites passed, 20 tests passed.
- Targeted ESLint on all changed runtime files: 0 errors. Reported warnings are pre-existing file-level warnings.
- `npx tsc --noEmit --pretty false`: no errors from ticket files. The command remains non-green because the repo is missing existing kiosk/Expo modules (`expo-screen-orientation`, `expo-video`, and `reanimated-color-picker`) and has their related implicit-any errors.
- `git diff --check`: passed.

### Shared Database Contract

After Temur approves and the migration is applied, confirm:

```sql
select pg_get_functiondef(
  'public.send_order_to_kitchen_v1(uuid,text,uuid[],text,uuid,uuid,uuid,uuid,text)'::regprocedure
);

select pg_get_functiondef(
  'public.bulk_update_order_item_status_v2(uuid[],text,uuid,uuid,integer)'::regprocedure
);
```

Both functions must remain `SECURITY DEFINER` with a pinned `search_path`. Do not apply a second POS migration.

## Physical KDS QA Matrix

Use disposable staging orders and record order IDs, station IDs, device IDs, timestamps, and videos.

| Scenario | POS/KDS steps | Expected evidence |
| --- | --- | --- |
| Normal online | Send a two-item draft from a registered station. | Success appears only after RPC confirmation; `requested_count = updated_count`; attempt row contains station/device. |
| Mixed category | Route two items to different prep displays and send once. | Physical destinations exactly match pre-ticket behavior; routing trace has the expected rules/display rows. |
| Partial update | In a disposable test, submit one valid and one random stale item UUID through the same POS send contract. | No unconditional success; warning shows; attempt ledger records requested 2 / updated 1. |
| Offline replay | Force offline, send, inspect `__queue()`, reconnect, then run `__flushQueue()`. | Item IDs, station/device, and both keys survive; one replay attempt is logged; no duplicate success. |
| Retry/cached replay | Interrupt the response after server execution, then retry the same queue row. | Same composite/item keys; `was_replay = true`; cached counts are revalidated. |
| Disabled displays | Disable every KDS display only at a disposable location and send an order. | No success toast; `KITCHEN_NO_ACTIVE_ROUTE`; routing trace records `no_active_display`. Restore displays afterward. |
| Lifecycle regression | Exercise sent, preparing, ready, served, recall, void, and full refund. | Existing KDS state transitions remain; voided/refunded items do not block readiness. |
| Performance | Record 20 comparable sends before and after migration. | Compare p95 Supabase/RPC duration; no material routing-delay regression. |

Inspect the trace after each test:

```sql
select public.get_order_routing_trace('<order_id>'::uuid);

select requested_count,
       actually_updated_count,
       station_id,
       device_id,
       idempotency_key,
       was_replay,
       created_at
from public.kds_send_attempts
where order_id = '<order_id>'::uuid
order by created_at;
```

## Files

- `lib/kdsSendTraceability.ts`
- `lib/network/opResult.ts`
- `lib/offlineSyncSubtitles.ts`
- `services/orderService.ts`
- `services/offlineSyncInit.ts`
- `services/preAuthService.ts`
- `services/sessionEffects/sendToKitchenEffect.ts`
- `stores/useOrderStore.ts`
- `database.types.ts`
- `__tests__/kdsRoutingTraceability.test.ts`
- `__tests__/sendToKitchenRequeueBound.test.ts`
- `tasks/kds-routing-traceability-pos.md`
- `tasks/ticket-log.md`
- `docs/tickets/ALL-TICKETS-REFERENCE.md`

## Open QA

- Temur DDL/RPC review.
- Apply the website migration to staging.
- Run the full physical matrix on at least two KDS displays and one POS station.
- Verify offline replay on a tablet under controlled bad Wi-Fi.
- Capture the 20-send p95 comparison.
- Abubeckr or the assigned independent verifier signs off.

## Sign-Off

- POS implementation: complete.
- Shared database review/application: pending.
- Physical routing parity: pending.
- Offline replay proof: pending.
- Independent verification: pending.
- Ticket Done: no.
