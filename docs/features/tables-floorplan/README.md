# Tables And Floor Plan

Floor-plan integration, table sessions, merge/transfer behavior, scaling, and
feature-specific performance work belong here.

## Active plans

- [Floor-switch resilience (2026-09)](floor-switch-resilience-2026-09.md) — the 20-second
  floor switch at Charcoal Gardenia. The switch paints before any read; the reconcile is one
  snapshot call under a deadline. Status: built, device acceptance open.
- [Local-First Orders & Seating](../../engineering/architecture/local-first-orders-seating.md) —
  §9 is the tables track: local `table_sessions` / `table_session_tables` / `order_seats`,
  local-first seating, and the two-devices-seat-one-table-offline resolution. Deletes the
  "Seating in progress" gate and the `hydrateOrderFromSeat` rekey path. Status: proposed.
