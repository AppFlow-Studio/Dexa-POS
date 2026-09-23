# Architecture

Cross-cutting state management, store organization, navigation gestures, and
POS architecture references belong here.

## Conventions

- [`icons.md`](icons.md) — import icons from `@/lib/icons` (never the
  `lucide-react-native` root); how to add, remove, and mock an icon.

## Local-first / SQLite

- [`local-first-orders-seating.md`](local-first-orders-seating.md) — **plan of record** for
  local-first order creation, order items, seating, and instant order totals. Status: proposed.
- [`sqlite-offline-first.md`](sqlite-offline-first.md) — the Track A read mirror (`lib/db`).
  Code-complete, all flags default off, not yet device-validated. Its Track B (Phases 6–9) is
  superseded for orders and seating by the document above.
