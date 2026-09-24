# Menu Management

Menu synchronization, category/item rendering, duplicate protection, and
dual-pricing data QA belong here.

- `menu-channel-visibility.md` — per-location POS / kiosk / online menu
  visibility (ticket `3be8280c`).
- `per-station-menu-scope.md` — per-station "All menus / Selected menus" scope
  on top of the channel toggle; shared selector, cart pruning, offline
  snapshots, change signal.
- `menu-management-rework.md` — the menu management screen rebuilt: top tabs,
  list + detail panes, responsive item grid, inline search, reorder mode,
  per-panel memoized/virtualized rendering. Phase 2 (forms) pending.
- `category-scheduling.md` — menu + category schedules enforced on POS and
  kiosk (`get_pos_bootstrap_v3`, 0=Sunday day mapping, shared evaluator and
  minute clock, read-only schedule summary in place of the phantom editor).
