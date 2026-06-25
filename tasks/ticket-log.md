# Ticket Log

| Date | Ticket | Status | Summary | Task File |
| --- | --- | --- | --- | --- |
| 2026-06-20 | POS printed receipt - remove unused dual-pricing alt line | Code complete - pending physical verification | Collapsed printed receipt totals to the actual charged pricing mode so the alternate `If paid by ...` style total is no longer rendered on finalized receipts. | `tasks/receipt-print-remove-alt-total-line.md` |
| 2026-06-23 | POS menu grid - DESSERT duplicate Strawberry Banana Crepe card | Code complete - pending on-device verification | Added a category-item dedupe guard in menu sync so duplicate `menu_item.id` rows no longer reach the Order Line grid and overlap as duplicate cards. | `tasks/menu-grid-dessert-duplicate-card.md` |
| 2026-06-23 | QA dual pricing - re-price stale manual cash prices after 4% flip | Migration ready - pending Supabase run and QA | Added a guarded data migration plus scoped verification checklist for stale S2 / Charcoal Gardenia manual cash prices. | `tasks/dual-pricing-stale-manual-cash-price-reprice.md` |
