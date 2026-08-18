# OrderOut Ready-Path Audit And E2E Validation

## Summary

Audit every POS/KDS Ready or Done action and prove that it transitions
`orders.status`, allowing the database-level OrderOut relay to capture the
change exactly once and deliver it to UberEats, DoorDash, or Grubhub.

Status: plan ready for approval; writer audit can start after live staging
access is available. The companion relay ticket is marked Done in Notion, but
its staging deployment must still be confirmed.

## Scope

In scope:

- POS Online Orders Mark Ready and Mark Done actions.
- KDS double-tap in two-step and three-step modes.
- KDS long-press/Bump Order, bulk advance, and auto-bump.
- Expo/consolidated online-order actions and generic status RPCs.
- Live staging function definitions and feature-flag routing.
- RPC corrections via migrations when a server writer fails to advance the
  parent order.
- Staging relay E2E and controlled Charcoal Gardenia validation.

Out of scope:

- Rebuilding the OrderOut outbound relay owned by Ali Awdi.
- Provider cancellation/refund writeback.
- Unrelated order lifecycle redesign.

## Current Findings

- POS Online Orders actions funnel through `useOnlineOrderActions`:
  `mark_online_order_ready` targets `ready`, and `complete_online_order`
  targets `completed`.
- KDS ticket actions funnel through `useKDSStore.advanceTicketStatus`, including
  direct bump, bulk advance, and auto-bump.
- The checked-in `bulk_update_order_item_status_v2` migration recalculates the
  parent `orders.status` and reaches `ready` when all actionable items are
  ready/served.
- The KDS served-success path also calls `update_order_status(..., 'ready')`
  after the last ticket for an order leaves the active queue.
- The client can still route to legacy `bulk_update_order_item_status` when the
  idempotent-v2 feature flag is disabled. Its deployed behavior is not defined
  in this repository and must be inspected live.
- `update_order_status_dep` has no repository definition and must be checked
  for deployed references before it is declared dead.

## Plan

1. Confirm that Ali Awdi's relay migration, queue, worker, mock endpoint, and
   required staging secrets are deployed, despite the companion ticket's Done
   status.
2. Query live staging `pg_get_functiondef` for
   `mark_online_order_ready`, `complete_online_order`,
   `bulk_update_order_item_status`, `bulk_update_order_item_status_v2`,
   `update_order_status`, and `update_order_status_dep`.
3. Record the deployed value/path for
   `EXPO_PUBLIC_IDEMPOTENT_BULK_UPDATE_ORDER_ITEM_STATUS`; audit both possible
   routes rather than assuming v2 is active.
4. Complete the writer matrix with exact POS file/line and live function
   evidence for every ticket-listed action.
5. Classify gaps:
   - RPC gap: fix here with a versioned migration, `SECURITY DEFINER`, pinned
     `search_path`, and idempotent parent-status semantics.
   - POS client gap: create a linked Ali Jaffal ticket before this audit closes.
   - Website client gap: create a linked website ticket; do not silently widen
     this POS ticket.
6. Run staging E2E for each writer path and assert one order status transition,
   one relay row, one mock call, and advanced `provider_status`.
7. Run idempotency, recall, forced-5xx retry/DLQ/replay, and non-OrderOut
   exclusion cases.
8. After staging is green, coordinate one low-value live order per marketplace
   through both POS and KDS paths and collect non-implementer recordings.

## Website Impact

Website work is conditional, not planned upfront:

- The audit must search website code for direct writes to `orders` or
  `order_items` that can represent Ready/Done without updating
  `orders.status`.
- Website and QR orders must be tested as relay exclusions and produce zero
  queue rows.
- If a website writer bypass exists, create a separate website ticket and fix
  it in that repository. No website UI work is required by this POS ticket.

The outbound relay itself is shared backend work owned by Ali Awdi and is
already marked Done; this ticket validates it rather than reimplements it.

## Progress

- Notion audit ticket and companion relay ticket fetched and reviewed.
- POS Online Orders and KDS writer chokepoints identified.
- Checked-in v2 bulk RPC behavior inspected.
- Live staging definitions and E2E evidence not yet collected.

## Verification

Required evidence:

- Completed writer-path matrix with function definitions and file references.
- One relay row and one mock request per path.
- Double-tap and recall-to-ready idempotency.
- Forced 5xx to retry, DLQ, and successful replay.
- Zero relay rows for dine-in, website, and QR orders.
- Live UberEats, DoorDash, and Grubhub validation from both POS and KDS.

## Files

Expected files only if an RPC gap is confirmed:

- `supabase/migrations/<timestamp>_orderout_ready_path_status_fix.sql`
- Potential targeted tests for KDS/online-order actions
- This plan and `docs/tickets/ALL-TICKETS-REFERENCE.md`

## Open QA

- Staging Supabase access is required for authoritative function definitions.
- Confirm companion relay deployment and mock endpoint availability.
- Confirm the production API contract and credentials are already deployed.
- Implementer cannot self-verify any fix they ship.
