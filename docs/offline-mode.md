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

