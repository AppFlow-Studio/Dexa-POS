# Orders

Order creation, lifecycle, item mutation, coursing, previous orders, numbering,
and order-source presentation belong here.

## Active plans

- [Local-First Orders & Seating](../../engineering/architecture/local-first-orders-seating.md) —
  moves order and item creation to a local-SQLite-first write path with a transactional outbox,
  and makes order totals instant. Owns the client-minted-UUID and locally-final order-number
  decisions. Status: proposed.
- [Order Number Allocation](order-number-allocation.md) — allocate once at row
  creation, never renumber. Fixes the skipped/stranded numbers ("we get order 3
  and there is no way to reach order 2") and the seating double-mint. Status:
  implemented, on-device QA open.
