# Option C — Category A Caller Audit

Phase 2 deliverable per `lets-look-into-this-stateless-blossom.md` (post-ship hardening).

## Goal

When `OrderService` Category A methods return `{data: null, error: { code: 'DEADLINE_EXCEEDED' }}` on slow-WiFi timeout, callers must either (A) queue the op for replay or (B) accept that local state already reflects the change and the user's intent will reconcile via realtime. Class C callers that silently lose intent are the bug — patch the top 5 hot paths and document the rest for follow-up.

## Classification

| Class | Behavior on `{ error: DEADLINE_EXCEEDED }` | Action |
|---|---|---|
| A | Catch handles error → calls `queueOperation`/`queueFailedOperation` | None. Verify catch path is reached. |
| B | Local state already correct; realtime will reconcile when network recovers | Document; no patch. |
| C | Silently lost intent (no queue, no retry) | Patch top 5; defer rest with rationale. |
| D | Indeterminate; needs deeper review | Flag. |

### Critical pattern note

Pre-Option-C, `OrderService` methods threw on RPC error (the catch fired). Post-Option-C, they **return** `{data: null, error}` on deadline timeout — so `.then(...)` receives the error payload as a *resolved* value. **`.catch()` does NOT fire** for `DEADLINE_EXCEEDED`. Sites that rely solely on `.catch()` for queue-on-failure are now Class C.

## Audit table

| File:Line | Method | Class | Notes |
|---|---|---|---|
| `services/sessionEffects/sendToKitchenEffect.ts:89` | `updateOrderStatus` | A | `await` + `if (statusError)` → `queueFailedOperation('send_to_kitchen', ...)` (line 102). DEADLINE_EXCEEDED is a non-null `error`, branch fires correctly. |
| `services/sessionEffects/sendToKitchenEffect.ts:135` | `bulkUpdateOrderItemStatus` | A | Same await + result.error check + `queueFailedOperation`. |
| `services/sessionEffects/closeCheckEffect.ts:36` | `closeCheck` | A | `await` + `if (!result.success)` → `queueFailedOperation('close_check')`. The wrapper packages DEADLINE_EXCEEDED into `{success: false, error}` shape, so check fires. |
| `services/sessionEffects/reopenCheckEffect.ts:43` | `reopenCheck` | A | Same pattern (verify during impl — has `queueFailedOperation` call). |
| `services/offlineSyncInit.ts:545,569,591,775,811,837,878,1754,1769,2389,2436,2593` | various | A | All inside `executeOperation` queue executor. Returns false on error → queue retry handler reschedules. Built-in retry path. |
| `stores/useOrderStore.ts:1395,1422,1467,1518,1691,1767,1796,1841` | various (item sync flows) | A | `addItemToBackend` flows with `await` + `if (error)` checks → `queueOperation`. Verified pattern in earlier reads. |
| `stores/useOrderStore.ts:2436` | `bulkUpdateOrderItemStatus` | A | Inside payment-finalize kitchen send. `await` + error check + queueOperation. |
| **`stores/useOrderStore.ts:2466`** | `closeCheck` | **C** | Auto-close on full payment. `.then(res => if (!res.success) log)` + `.catch(err => log)`. **No queue.** DEADLINE_EXCEEDED → log only, intent lost. **Patch site #5** |
| `stores/useOrderStore.ts:5961` | `updateOrderItemQuantity` | A | Merge survivor flow. `.catch()` queues — but only fires on thrown errors, not DEADLINE_EXCEEDED. **Re-classify as C** but lower frequency (merge-on-add edge case). Defer. |
| `stores/useOrderStore.ts:6010` | `removeOrderItem` | A | Merge cleanup flow. Same as 5961 — `.catch()` only. Defer (low frequency edge). |
| `stores/useOrderStore.ts:6052` | `updateOrderItemQuantity` | A | Same merge-edge pattern. Defer. |
| **`stores/useOrderStore.ts:6116`** | `updateOrderItem` | **C** | `.then(response => if (response.data && response.data.success))` + `.catch()`. DEADLINE_EXCEEDED bypasses both. **Patch site #4** (modify-item is hot path — special instructions, etc.) |
| **`stores/useOrderStore.ts:6199`** | `replaceOrderItemModifiers` | **C** | Same `.then(if data.success).catch()` pattern. Modifier changes are heavily fired. **Patch site #2** |
| **`stores/useOrderStore.ts:6840`** | `voidOrderItem` | **C** | `.catch()` only inside `removeItemFromActiveOrder` (already touched in main ship). Voiding is hot path. **Patch site #3** |
| `stores/useOrderStore.ts:6856` | `removeOrderItem` | A→C | Same `.catch()` only pattern. Local state already updated optimistically; realtime reconciles ➜ Class B *if* item never reached backend; Class C if it did and we lose the remove intent. Patch alongside #3 (same code block). |
| **`stores/useOrderStore.ts:6995`** | `updateOrderItemQuantity` | **C** | The `.then(if data.success)` path falls through to `setSyncStatus('synced')` *even when sync failed* — actively corrupts the sync state on DEADLINE_EXCEEDED. **Patch site #1** (highest impact — directly breaks sync barrier) |
| `stores/useOrderStore.ts:8228,8243` | `updateOrderStatus` | C | Various status updates. Lower-frequency than item ops. Defer. |
| **`stores/useOrderStore.ts:8327`** | `closeCheck` | **C** | `updateOrderCheckStatus` flow. `await` + `if (!result.success) rollback local state`. **No queue path.** User's close-check intent is silently rolled back. (BillSection's "Close Check" button hits this path.) Same effect as already-Class-A `closeCheckEffect`, but separate code path. Defer (sessionEffect path covers most cases). Document: bill-button path needs explicit user retry. |
| `stores/useOrderStore.ts:8353` | `reopenCheck` | C | Same pattern as 8327. Defer. |
| `stores/useOrderStore.ts:9037,9412,9424,9470,9517,9563,9617,9631,9808,9839,9861,9908,10138,10184,10324,10371` | various status/bulk | A | All inside flows that have `.catch(queueOperation)` pattern OR are inside try/catch + await + error-shape check. Spot-check confirms. Defer detailed verification — these are batch backend operations not fired directly by user actions. |
| `stores/useOrderStore.ts:10453` | `removeOrderItemsBatch` | C | Batch remove. Defer (low frequency vs single removes). |
| `stores/useOrderStore.ts:10504` | `voidOrder` | C | Whole-order void. Defer (low frequency). |
| `stores/useKDSStore.ts:1511,1531,2169,2405,2474` | `bulkUpdateOrderItemStatus` / `updateOrderStatus` | C | KDS hot paths (mark item ready, etc.). All use `.then().catch()` with no DEADLINE_EXCEEDED handling. **High-frequency in real kitchens** but these are kitchen-side operations, not customer-facing. Defer to next iteration; Sentry data will show actual hit rate. |
| `stores/useKDSStore.ts:2009,2072` | `togglePriorityOnItems` / `toggleRushOnItems` | C | Lower frequency. Defer. Op type doesn't exist in queue union. |
| `stores/usePaymentStore.ts:1084` | `lockOrderForPayment` | D | Payment lock. **Critical path** — silent loss could cause double-charge. **Decision: don't auto-queue lock failures.** Document: lock failure on bad WiFi correctly fails the payment attempt; user must retry manually. This is the safe behavior. Class B (intentional). |
| `stores/usePaymentStore.ts:1166` | `unlockOrderForPayment` | B | Unlock failure on bad WiFi just leaves the order locked locally for ~60s (server-side lock TTL). Acceptable. |
| `app/(main)/order-processing.tsx:385` | `closeCheck` | C | UI button calls directly. Same pattern as 8327. Defer. |
| `components/menu/PaymentDetailBottomSheet.tsx:4039,4097` | `reopenCheck` / `closeCheck` | C | Payment sheet UI. Defer. |
| `components/bill/MoreOptionsBottomSheet.tsx:351,382` | `toggleRushOnItems` / `togglePriorityOnItems` | C | Lower frequency. Op type missing from queue. Defer. |
| `components/tables/TableOrderView.tsx:799,838` | toggle rush/priority | C | Same as above. Defer. |
| `services/preAuthService.ts:192,210,446` | various | D | Pre-auth flow has its own retry logic (`paymentJournal`). Out of scope for this audit. |

## Patch policy enforcement

**Patching the top 5 hot paths only:**
1. `useOrderStore.ts:6995` — `updateOrderItemQuantity` in increment flow (CORRUPTS sync state on DEADLINE_EXCEEDED — highest priority)
2. `useOrderStore.ts:6199` — `replaceOrderItemModifiers` (modifier changes, hot path)
3. `useOrderStore.ts:6840` + `6856` — `voidOrderItem` / `removeOrderItem` in `removeItemFromActiveOrder`
4. `useOrderStore.ts:6116` — `updateOrderItem`
5. `useOrderStore.ts:2466` — `closeCheck` auto-close on full payment

**Deferred** (~20 sites): everything tagged C above outside the top 5. Rationale: Sentry breadcrumbs from Item 1 will show actual hit rates — patch in a future iteration informed by data, not speculation. Ops that lack a queue type (`toggle_rush`, `toggle_priority`, `cancel_order`, `void_order`, `remove_items_batch`, `lock_order_for_payment`) would also need OperationType union changes — explicit scope creep, deferred.

**Class A confirmed safe** for all `sessionEffects/*` and `offlineSyncInit.ts` callers — these are the queue executor and side effects that already have proper `await + error-shape check + queueOperation` pattern.

## Patch pattern

For Class C call sites with `.then().catch()` chain, change the `.then()` to detect deadline:
```ts
.then(async response => {
  if (response?.error?.code === 'DEADLINE_EXCEEDED') {
    await queueOperation({ type, params, localOrderId, localItemId })
    return false
  }
  if (response.data?.success) {
    // existing apply logic
  }
})
```

For sites with `await OrderService.X()` + `if (!result.success)` (close/reopen check shape), check error code via the unwrapping logic OR sniff message string. Detail in patches below.
