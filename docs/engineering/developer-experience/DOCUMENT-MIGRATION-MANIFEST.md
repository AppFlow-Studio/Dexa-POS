# Documentation Migration Manifest

This manifest records the POS-only, content-preserving relocation prepared for
the feature-based documentation restructure.

- Generated: 2026-08-02
- Pre-existing artifacts inventoried: 71
- Moved artifacts: 65 source paths into 64 canonical documents
- Content policy: organization only; source content is preserved and one
  byte-identical duplicate is consolidated
- Approval: Temur and Abubeckr required before publish/merge

## Retained In Place

- `README.md` - repository entry point
- `AGENTS.md` - repository agent/workflow contract
- `CLAUDE.md` - repository AI/workflow contract
- `privacypolicy.md` - published app legal document
- `utils/migrations/changes.txt` - migration source notes
- `utils/migrations/phase3.2db.txt` - executable SQL source

## Relocations

| Previous path | Canonical path |
| --- | --- |
| `DM-010-05_IMPLEMENTATION_SUMMARY.md` | `docs/features/waitlist-host/DM-010-05_IMPLEMENTATION_SUMMARY.md` |
| `SMART_WAIT_TIME_ESTIMATION.md` | `docs/features/waitlist-host/SMART_WAIT_TIME_ESTIMATION.md` |
| `WAITLIST_FEATURE_IMPLEMENTATION.md` | `docs/features/waitlist-host/WAITLIST_FEATURE_IMPLEMENTATION.md` |
| `PERF-AUDIT-B-REALTIME.md` | `docs/engineering/performance/PERF-AUDIT-B-REALTIME.md` |
| `PERF-AUDIT-C-HARDWARE.md` | `docs/engineering/performance/PERF-AUDIT-C-HARDWARE.md` |
| `PREVIOUS_ORDERS_IMPLEMENTATION_SUMMARY.md` | `docs/features/orders/PREVIOUS_ORDERS_IMPLEMENTATION_SUMMARY.md` |
| `VERSION-DELTA.md` | `docs/engineering/framework-upgrades/VERSION-DELTA.md` |
| `components/analytics/README.md` | `docs/features/reporting/analytics-components.md` |
| `docs/bad-wifi-deeper-optimizations.md` | `docs/features/offline-sync/bad-wifi-deeper-optimizations.md` |
| `docs/FEATURE_UPDATES_2026-06-16.md` | `docs/handoffs/FEATURE_UPDATES_2026-06-16.md` |
| `docs/GESTURE_SHORTCUT_INVENTORY.md` | `docs/engineering/architecture/GESTURE_SHORTCUT_INVENTORY.md` |
| `docs/offline-mode.md` | `docs/features/offline-sync/offline-mode.md` |
| `docs/ORDERS_LIFECYCLE.md` | `docs/features/orders/ORDERS_LIFECYCLE.md` |
| `docs/PAYMENT_PROCESSING.md` | `docs/features/payments-terminals/PAYMENT_PROCESSING.md` |
| `docs/perf-baseline-protocol.md` | `docs/engineering/performance/perf-baseline-protocol.md` |
| `docs/POS_PERFORMANCE_ARCHITECTURE_AUDIT_2026-07-24.md` | `docs/engineering/performance/POS_PERFORMANCE_ARCHITECTURE_AUDIT_2026-07-24.md` |
| `docs/SENTRY_SETUP.md` | `docs/engineering/observability/SENTRY_SETUP.md` |
| `docs/staging-vs-prod-gaps.md` | `docs/engineering/database/staging-vs-prod-gaps.md` |
| `docs/STATE_MANAGEMENT.md` | `docs/engineering/architecture/STATE_MANAGEMENT.md` |
| `docs/TIP_POOLING.md` | `docs/features/staff-timeclock/TIP_POOLING.md` |
| `guides/coursing-integration.md` | `docs/features/orders/coursing-integration.md` |
| `guides/floor-plan-integration.md` | `docs/features/tables-floorplan/floor-plan-integration.md` |
| `guides/order-store-migration-guide.md` | `docs/features/orders/order-store-migration-guide.md` |
| `hooks/pos/OrderItemCRUDGuide.md` | `docs/features/orders/OrderItemCRUDGuide.md` |
| `stores/slices/README.md` | `docs/engineering/architecture/store-slices.md` |
| `types/floor-plan-and-table-guide.md` | `docs/features/tables-floorplan/floor-plan-integration.md` |
| `types/order-flow.md` | `docs/features/orders/order-flow.md` |
| `utils/migrations/rls_plan.md` | `docs/engineering/database/rls_plan.md` |
| `tasks/appstate-netinfo-listener-inventory.md` | `docs/engineering/performance/appstate-netinfo-listener-inventory.md` |
| `tasks/bay-ridge-owner-misprovisioned-relink.md` | `docs/features/identity-access/bay-ridge-owner-misprovisioned-relink.md` |
| `tasks/billing-pos-suspended-access.md` | `docs/features/billing/billing-pos-suspended-access.md` |
| `tasks/castles-usb-compatibility.md` | `docs/features/payments-terminals/castles-usb-compatibility.md` |
| `tasks/castles-usb-e2e-test-plan.md` | `docs/features/payments-terminals/castles-usb-e2e-test-plan.md` |
| `tasks/changelog-jaffal-jul-fixsprint.md` | `docs/handoffs/changelog-jaffal-jul-fixsprint.md` |
| `tasks/dual-pricing-stale-manual-cash-price-reprice.md` | `docs/features/menu-management/dual-pricing-stale-manual-cash-price-reprice.md` |
| `tasks/floorplan-perf-400-tables.md` | `docs/features/tables-floorplan/floorplan-perf-400-tables.md` |
| `tasks/h2-shared-payment-transform-plan.md` | `docs/features/payments-terminals/h2-shared-payment-transform-plan.md` |
| `tasks/handoff-perf-memory-badwifi.md` | `docs/handoffs/handoff-perf-memory-badwifi.md` |
| `tasks/in-progress-ticket-testing-sweep-2026-07-02.md` | `docs/quality/qa-tracking/in-progress-ticket-testing-sweep-2026-07-02.md` |
| `tasks/kds-rush-priority-sort.md` | `docs/features/kds/kds-rush-priority-sort.md` |
| `tasks/kds-server-authoritative-done.md` | `docs/features/kds/kds-server-authoritative-done.md` |
| `tasks/kds-ticket-server-name.md` | `docs/features/kds/kds-ticket-server-name.md` |
| `tasks/lessons.md` | `docs/engineering/developer-experience/lessons.md` |
| `tasks/mem-leak-tables-refactor.md` | `docs/features/tables-floorplan/mem-leak-tables-refactor.md` |
| `tasks/memory-state-audit.md` | `docs/engineering/performance/memory-state-audit.md` |
| `tasks/menu-grid-dessert-duplicate-card.md` | `docs/features/menu-management/menu-grid-dessert-duplicate-card.md` |
| `tasks/notify-templates-plan.md` | `docs/features/notifications-messaging/notify-templates-plan.md` |
| `tasks/option-c-callsite-audit.md` | `docs/features/offline-sync/option-c-callsite-audit.md` |
| `tasks/option-c-rpc-audit.md` | `docs/features/offline-sync/option-c-rpc-audit.md` |
| `tasks/order-number-local-midnight-previous-orders-sort.md` | `docs/features/orders/order-number-local-midnight-previous-orders-sort.md` |
| `tasks/perf-handoff.md` | `docs/handoffs/perf-handoff.md` |
| `tasks/perf-nav-kds-results.md` | `docs/engineering/performance/perf-nav-kds-results.md` |
| `tasks/per-order-pin-attribution.md` | `docs/features/identity-access/per-order-pin-attribution.md` |
| `tasks/pos-effective-config-station-overrides.md` | `docs/features/pos-settings/pos-effective-config-station-overrides.md` |
| `tasks/pos-platform-logo-kds-previous-orders.md` | `docs/features/orders/pos-platform-logo-kds-previous-orders.md` |
| `tasks/pos-ticket-senior-summary-2026-06-27.md` | `docs/handoffs/pos-ticket-senior-summary-2026-06-27.md` |
| `tasks/receipt-print-remove-alt-total-line.md` | `docs/features/payments-terminals/receipt-print-remove-alt-total-line.md` |
| `tasks/rollback-sdk53-port.md` | `docs/engineering/framework-upgrades/rollback-sdk53-port.md` |
| `tasks/sdk57-regression-plan.md` | `docs/engineering/framework-upgrades/sdk57-regression-plan.md` |
| `tasks/sdk57-regression-session2-state.md` | `docs/engineering/framework-upgrades/sdk57-regression-session2-state.md` |
| `tasks/sustained-perf-and-badwifi.md` | `docs/engineering/performance/sustained-perf-and-badwifi.md` |
| `tasks/table-merge-transfer-date-calendar-integrity.md` | `docs/quality/qa-tracking/table-merge-transfer-date-calendar-integrity.md` |
| `tasks/ticket-log.md` | `docs/tickets/ALL-TICKETS-REFERENCE.md` |
| `tasks/timesheets-auto-clock-out-pos.md` | `docs/features/staff-timeclock/timesheets-auto-clock-out-pos.md` |
| `tasks/todo.md` | `docs/engineering/performance/todo.md` |
