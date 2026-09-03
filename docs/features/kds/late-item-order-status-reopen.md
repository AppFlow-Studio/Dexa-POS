# Late Kitchen Item Order Status Reconciliation

## Summary

When an item from an open order completed its kitchen cycle, the parent order
could show `Ready`. Firing a newly-added item updated the item optimistically
but left the parent at `Ready` until a later server reconciliation. Offline or
queued sends could display the stale parent status for longer.

## Scope

- Reopen an open order's fulfillment status when any later item batch is sent.
- Apply the same transition to standard order entry, explicit-order/payment
  sends, and table/course sends.
- Respect the configured two-step or three-step KDS workflow.
- Preserve closed checks and terminal void/cancel/refund/decline states.
- Keep the existing server migration and kitchen status calculations intact.

Non-scope: KDS ticket layout, payment lifecycle, historical closed orders, and
order-total calculations.

## Plan

1. Add one shared resolver for the parent status after a kitchen send.
2. Use it in all optimistic POS send paths.
3. Prevent the table item's legacy status aggregate from immediately restoring
   `Ready` after a new `sent`/`preparing` batch.
4. Add focused regression coverage for late sends and terminal safeguards.
5. Verify the mixed-cycle sequence on an Android POS and KDS.

## Progress

- [x] Root cause confirmed in the POS optimistic send paths.
- [x] Existing backend reconciliation reviewed.
- [x] Shared parent-status resolver implemented.
- [x] Standard, explicit-order/payment, and table/course paths updated.
- [x] Focused automated coverage added.
- [ ] Physical/emulator POS and KDS verification completed.
- [ ] Independent verifier sign-off recorded.

## Verification

- `npx jest __tests__/lateKitchenItemOrderStatus.test.ts __tests__/kitchenStatusConsolidation.test.ts __tests__/sendToKitchenReAddSameItem.test.ts __tests__/lateItemSendFromLiveStates.test.ts --runInBand`
  passed: 4 suites, 35 tests.
- `npx eslint lib/kitchenStatusUtils.ts stores/useOrderStore.ts __tests__/lateKitchenItemOrderStatus.test.ts`
  passed with 0 errors. The 36 warnings are pre-existing warnings in
  `stores/useOrderStore.ts`.
- `C:\Program Files\Git\bin\bash.exe ./scripts/check-kitchen-status-literals.sh`
  passed. The npm wrapper selects WSL `bash` on this machine and cannot run
  because no WSL distribution is installed.
- `npx tsc --noEmit --pretty false` remains red on unrelated current-staging
  SQLite mirror, menu, kiosk dependency, order-day grouping, and test typing
  errors. It reported no error in a file changed by this ticket.

The latest server definition in
`supabase/migrations/20260827160000_fix_kds_refire_preserves_fire_time.sql`
already moves a `ready` parent back into the active kitchen cycle when a new
item receives `sent`/`preparing`. No new migration is required for this fix.

## Files

- `lib/kitchenStatusUtils.ts`
- `stores/useOrderStore.ts`
- `__tests__/lateKitchenItemOrderStatus.test.ts`
- `docs/features/kds/late-item-order-status-reopen.md`
- `docs/tickets/ALL-TICKETS-REFERENCE.md`

## Open QA

1. Create an open takeout order with one item and send it to the kitchen.
2. Advance that item through the configured workflow until the POS parent shows
   `Ready`.
3. Add a second item to the same open check and press Send.
4. Confirm immediately that the second item is fired and the parent changes to
   `In Kitchen` in three-step mode or `Preparing` in two-step mode. It must not
   remain `Ready`.
5. Confirm the new item appears on the KDS while the completed first item does
   not regress or re-fire.
6. Repeat from a dine-in table/course order.
7. Repeat once while offline: the local parent status must reopen, the send must
   queue, and reconnect must converge without duplicating the first item.
8. Record POS and KDS video proof and obtain independent sign-off.
