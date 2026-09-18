# Tables And Floor Plan

Floor-plan integration, table sessions, merge/transfer behavior, scaling, and
feature-specific performance work belong here.

## Active plans

- [Local-First Orders & Seating](../../engineering/architecture/local-first-orders-seating.md) —
  §9 is the tables track: local `table_sessions` / `table_session_tables` / `order_seats`,
  local-first seating, and the two-devices-seat-one-table-offline resolution. Deletes the
  "Seating in progress" gate and the `hydrateOrderFromSeat` rekey path. Status: proposed.
