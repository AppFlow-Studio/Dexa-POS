# Staging → Prod Schema Gaps

**Date:** 2026-04-30
**Staging project:** `dfwqakoyittmrwbqvxgw`
**Prod project:** `hifouuofcaytijrkbvcy`

This document captures the schema drift between staging and prod that was discovered while debugging a prod cart-mutation failure. It is intended for the website/backend team to schedule remediation as proper feature ships from `dexapos-website/supabase/migrations/`. No further DB writes were made on prod beyond the one fix called out below.

---

## Already fixed

- `public._assert_order_station_match(p_order_id uuid, p_station_id uuid)` was deployed to prod on 2026-04-30 to unblock 9 station-guarded RPCs (`add_order_item_v3`, `add_open_item_v3`, `update_order_details_v1`, `manage_order_discount_v2`, `apply_refund_to_payment_v2`, `duplicate_order_item_v2`, `remove_order_item_modifier_v2`, `add_order_item_modifier_v2`, `claim_order_v1`) that were calling it via `PERFORM`. Migration body matches `utils/supabase/migrations/assert_order_station_match.sql`. Recorded in `supabase_migrations.schema_migrations` as `20260430195120 / assert_order_station_match`.

Symptom seen on device: `function public._assert_order_station_match(uuid,uuid) does not exist` on every cart item mutation. Resolved.

---

## Discovered drift

> All items below were applied to staging out-of-band; none have committed migration files in `utils/supabase/migrations/`. The canonical home is `dexapos-website/supabase/migrations/` (per the comment at `utils/supabase/migrations/00_idempotency_layer.sql:20-22`). DDL for any of these can be reconstructed from staging via `pg_get_functiondef(oid)`, `pg_indexes.indexdef`, and `pg_get_triggerdef()`.

### Tables (5 staging-only on prod, 1 prod-only on staging)

Missing on prod:

| Table | Purpose | Notes |
|---|---|---|
| `suspension_events` | Merchant suspension audit trail | Required by suspension function family |
| `pci_export_function_registry` | Backing table for `assert_pci_safe_exports()` | PCI compliance check |
| `pin_login_attempts` | PIN brute-force / rate-limit tracking | Backs the staging-only `idx_pin_attempts_*` indexes |
| `security_alerts` | Security alert records | Has a staging-only RLS policy `service_role_read_security_alerts` |
| `tip_payroll_exports` | Tip distribution export tracking | Pairs with `export_tip_distribution()` |

Prod-only (staging is behind here):

- `orderout_menu_sync_results` — Orderout integration sync result tracking. Staging team should pull this in on next sync cycle.

### Triggers — 4 missing on prod (on tables that DO exist on prod)

| Table | Trigger | Timing | Function it calls |
|---|---|---|---|
| `orders` | `trg_guard_suspension_on_orders` | BEFORE INSERT | `guard_merchant_suspension()` (also missing) |
| `orders` | `trg_drain_watcher_on_orders` | AFTER UPDATE | drain-watcher fn (missing) |
| `cash_drawer_sessions` | `trg_guard_suspension_on_drawer_sessions` | BEFORE INSERT | `guard_merchant_suspension()` (missing) |
| `cash_drawer_sessions` | `trg_drain_watcher_on_drawer_sessions` | AFTER INSERT/UPDATE | drain-watcher fn (missing) |

> **Don't deploy these triggers in isolation.** The two `BEFORE INSERT` triggers reference helper functions that aren't on prod yet. If you create the trigger before the function, every new order and every new cash-drawer session will fail to insert. Ship triggers + functions + tables atomically.

### Staging-only functions (~17)

Already fixed: `_assert_order_station_match`. Remaining:

**Merchant suspension family (7 functions, requires `suspension_events` table):**
- `request_merchant_suspension(p_merchant_id, p_force, p_reason, p_initiated_by)`
- `cancel_merchant_suspension(p_merchant_id, p_initiated_by)`
- `maybe_complete_merchant_suspension()`
- `guard_merchant_suspension()` (trigger function — used by the 2 `BEFORE INSERT` triggers above)
- `merchant_open_drawer_sessions(p_merchant_id)`
- `merchant_open_orders(p_merchant_id)`
- `get_merchant_drain_status(p_merchant_id)`

**Tip pool validation (5 functions):**
- `validate_pool_share_sum()` (trigger function)
- `validate_tip_pool_config(p_config_id)`
- `enforce_tip_out_no_reciprocity()` (trigger function)
- `upsert_employee_daily_tips_override(...)`
- `verify_employee_daily_tips(p_id, p_verified_by)`

**PCI / payment vault (3 functions, requires `pci_export_function_registry` table):**
- `assert_pci_safe_exports()`
- `get_payment_terminal_credentials(p_terminal_id)`
- `upsert_terminal_vault_secret(p_terminal_id, p_auth_key)`

**Signature drift:**
- `log_audit_event` — staging adds a 14th param `p_pii_access_type text`. Prod still 13 params. If/when the POS app starts passing this argument, deploy the new signature in lockstep with the call sites. Today the app calls the 13-param version; not currently broken on prod.

**Other:**
- `moddatetime()` — extension function. Not actually used by any of the 4 missing prod triggers (they're hand-rolled plpgsql), so this is a non-issue unless other migrations rely on it. Skip.

### Indexes

Most staging-only indexes are perf-only and tied to features that aren't on prod (`pin_login_attempts`, audit-log tables, payment-audit-log). They become relevant only when those features ship.

One that gets called out elsewhere as critical, but **isn't:**
- `idempotency_keys_key_idx` (`btree(key)`). The `idempotency_keys` table has a composite PK `(key, op)`; the PK's leading column already supports `WHERE key = ?` lookups via leftmost-prefix scan. The standalone single-column index is a minor optimization, not a correctness gap and not a double-charge risk. Skip unless someone reports slow queries.

### RLS policies

- Staging-only: `security_alerts.service_role_read_security_alerts` — needs `security_alerts` table first (also missing on prod). Ship together with the table.
- Prod-only: `waitlist."Can Read Waitlist Mercahnt"` (typo'd policy name on prod). No action; staging team can choose to mirror or leave.

### Extensions

- Staging-only: `hypopg`, `index_advisor`, `moddatetime`. The first two are DBA tooling only. `moddatetime` is unused by any actual prod-facing trigger. **No action.**

### Migration metadata oddity

`supabase_migrations.schema_migrations` shows `20260430154957 / qualify_cash_drawer_rpc_bodies` recorded on **prod only** — never backported to staging. Worth a quick check: was this a prod hotfix that hasn't been propagated back? If so, staging should pick it up on the next sync.

---

## Recommended ship order

Each dormant feature should ship as **one atomic migration** containing its table(s) + functions + triggers + RLS policy. Do not split, otherwise dependents will fail.

1. **Merchant suspension feature** — single migration: `suspension_events` table + 7 functions + 4 triggers + RLS as needed. Without this, prod has no concept of "merchant is suspended" and cannot enforce it.
2. **Tip pool validation** — single migration: 5 functions (3 are trigger functions). Pair with whatever schema constraints rely on them.
3. **PCI safe-exports** — single migration: `pci_export_function_registry` table + 3 functions. Compliance-driven; coordinate with whoever owns PCI scope.
4. **PIN brute-force protection** — single migration: `pin_login_attempts` table + supporting indexes. Backend security feature.
5. **Audit log signature** — only when POS app is ready to pass `p_pii_access_type` everywhere. Lockstep client + server deploy.
6. **(Reverse direction)** Staging needs to pull in `orderout_menu_sync_results` and the `qualify_cash_drawer_rpc_bodies` migration.

None of these are blocking the POS app today. The cart bug that prompted this audit is fixed.

---

## Verification

After deploying each feature, the website team can run these read-only checks against the prod project:

```sql
-- Helper for any new function
SELECT proname, pg_get_function_identity_arguments(oid)
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace AND proname = '<name>';

-- Trigger present + bound
SELECT event_object_table, trigger_name, action_timing, event_manipulation
FROM information_schema.triggers
WHERE trigger_schema = 'public' AND trigger_name = '<name>';

-- Table created with expected columns
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = '<name>'
ORDER BY ordinal_position;

-- RLS policies on a table
SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = '<name>';
```

For the cart fix specifically (already deployed), confirm with a real device:
1. Place an order from station A.
2. Add a cart item (any item) — should succeed without `function does not exist`.
3. Switch to station B and try to add to A's order — should surface `ORDER_OWNED_BY_OTHER_STATION`, prompting the claim flow.
