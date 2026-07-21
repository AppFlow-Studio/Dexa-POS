# Offline Mode Overview

This app is offline-first. Core operations (orders, items, payments, kitchen sends) update local state immediately, then sync in the background via the offline queue.

## Flow at a Glance
1. **Local update first** – UI/state is updated instantly.
2. **Queue operation** – A queued op stores all required params (local IDs allowed).
3. **ID resolution** – When back online, local IDs are resolved to backend UUIDs via `offlineIdRegistry` and store lookups.
4. **Replay** – `offlineSyncService` processes ops by priority (orders → items → kitchen → payments).
5. **Reconcile** – Backend responses update local orders/payments/items (amounts, statuses, IDs).

## Key Components
- `offlineSyncService`: Queue, persistence, priorities, auto-retry (exponential backoff), network detection.
- `offlineSyncInit`: Bridges queue to store actions; resolves IDs and executes ops (all payments go through `process_payment_v2`).
- `offlineIdRegistry`: Maps local IDs (`local_order_…`, `order_…`, etc.) to backend UUIDs.
- `useOrderStore`: Offline-first actions; queues when offline; reconciles backend responses.
- `orderService`: RPC wrappers (`process_payment_v2`, `add_order_item_v2`, etc.).

## Payments (including split/per-item)
- Each payment is queued as its own `process_payment` op (no collapsing).
- Per-item/split-by-item: `p_item_ids` can contain local IDs; resolved to backend item IDs before calling `process_payment_v2`.
- On success, the last local payment is marked `sync_status: "synced"` and updated with `payment_id`, `itemsCovered`, and backend amounts (`amount_due`, `amount_paid`).
- Offline failures keep the payment locally and queue for retry (no rollback).

## Orders & Items
- Order creation is serialized per order; stale creation attempts are timed out and retried to avoid duplicates.
- Item additions are serialized per order to avoid race conditions and total mis-calculation.
- Kitchen sends queue `send_to_kitchen` when offline; local state is set to `preparing` immediately.

## Auto-Retry
- Exponential backoff: base 2s, max 60s, multiplier 2x, jitter 1s.
- Auto-retry is scheduled on network regain and after each failed attempt (until max retries).
- UI surfaces pending/failed syncs and auto-retry activity.

## Adding a New Offline Action
1. **Define the op** in `offlineSyncService.OperationType` with a priority (lower = earlier).
2. **Queue it** from the store/action using `queueOperation` (include `localOrderId`/`localItemId` and a `contextSnapshot` if helpful).
3. **Resolve IDs** in `offlineSyncInit` before hitting the backend (use `resolveOrderId`, `resolveItemId`, `isValidUUID`, `isLocalId`).
4. **Execute RPC** (or REST) and **reconcile** local state with the response (update IDs, amounts, statuses).
5. **Guard collapsing**: If the op must never collapse, keep `entityKey` undefined (payments already do this).
6. **Handle retries**: Return `false` to retry; throw/return `false` on missing dependencies (e.g., no `db_order_id` yet).
7. **Log** parameters and responses for observability.

## Troubleshooting
- **Payments missing items**: Ensure `p_item_ids` are passed (local IDs are fine) and resolved in `offlineSyncInit`.
- **Duplicate orders**: Confirm per-order creation lock and timeout are intact.
- **Stuck sync**: Check pending queue size and auto-retry status; manual retry remains available.

## Bad-WiFi Optimization (Option C)

Category A mutations (target-state, idempotent) are wrapped with a deadline so the UI never freezes more than ~2.5s on slow WiFi. After 2 timeouts in 30s the connection-quality state machine flips `getIsOnline()` to false; subsequent mutations skip the network and queue. A `ping()` probe loop auto-recovers when the network returns.

### Affected actions (Category A — fixed)
Send to Kitchen, Close Check, Reopen Check, Void Item / Order / Payment, +/- Quantity, Modify Modifiers, Toggle Rush / Priority, Item Removal, Cancel Order, Clear Items, Lock/Unlock for Payment.

### NOT affected (Category B — still freeze on bad WiFi)
Add Item, Open Item, Process Payment, Seat Guests, Create Order, Add Discount, Add/Remove Modifier, Duplicate Item, Recall Items. These are deferred to `bad-wifi-deeper-optimizations.md` because retry safety requires server-side idempotency keys (not yet implemented).

### Migration deploy order
1. Apply `utils/supabase/migrations/00_ping_rpc.sql` to staging.
2. Verify: `SELECT ping();` returns epoch ms.
3. Run rollback drill: apply `00_ping_rpc_rollback.sql`, confirm clean, re-apply forward.
4. Apply to production.
5. **Then** deploy the client build that imports `lib/network/connectionQuality.ts`.

If the order is reversed, the probe RPC is missing and the app stays in `slow` mode longer (no crash, just slower auto-recovery).

### Rollback
Single client-side toggle: `useStoreSettingsStore.deadlineWrapEnabled = false` (via `setDeadlineWrapEnabled` from `lib/network/killSwitch`). When OFF, the wrap layer falls through to original synchronous behavior. Restores main-branch behavior in <30s without redeploying.

### Slow-mode is silent
Slow-mode operates in the background — no scary "Offline" UI. The `useNetworkStatus()` hook exposes two values:
- `isOnline` (effective): `false` during slow-mode. Use for **routing decisions** ("queue this, don't try live").
- `rawIsOnline` (NetInfo only): unaffected by slow-mode. Use for **UI affordances** ("should I show an offline banner?").

`NetworkStatusBadge`, `SyncStatusBar`, and the offline banners in `BillSection` consult `rawIsOnline` so on flaky-but-connected WiFi, the UI looks normal and the queue drains in the background. Routing checks (e.g., dine-in transfer guard, card payment disable, pin-login) still consult effective `isOnline` because those operations genuinely require a fast live network.

### CI discipline
`npm run check:rpc-discipline` fails if a new direct `supabase.rpc(...)` is added to `stores/useOrderStore.ts` without an `// rpc-discipline-allow: <reason>` comment on the previous line. Routes new mutations through `services/orderService.ts` (the wrap layer).

