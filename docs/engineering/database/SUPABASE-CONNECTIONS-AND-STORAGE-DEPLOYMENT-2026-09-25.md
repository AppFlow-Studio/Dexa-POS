# Supabase Connections and Storage: Deployment Checklist (2026-09-25)

Everything that has to be applied, deployed or configured, per repo, to ship the [connections and storage plan](SUPABASE-CONNECTIONS-AND-STORAGE-2026-09-24.md). The plan has the reasons, the verification steps and the full [runbook](SUPABASE-CONNECTIONS-AND-STORAGE-2026-09-24.md#deployment-runbook).

All of it is written and verified locally. Nothing is applied or deployed yet.

| Repo | Branch | Migrations to apply | Edge functions to deploy | New env flags |
| --- | --- | --- | --- | --- |
| DexaPOS-Website | `db/connections-and-storage` | 6 | 1 (`valor-webhook`) | None |
| Dexa-POS | `db-fixes` | None (2 mirror copies) | None | 2, optional |

## DexaPOS-Website

### Migrations

Apply from `supabase/migrations/` in this order: staging first, production after a 24 h soak.

| # | File | What it does | Notes |
| --- | --- | --- | --- |
| 1 | `20260925120000_remove_kds_board_snapshots.sql` | Removes the KDS board snapshot feature: 2 tables, 7 functions, 2 triggers, 2 cron jobs. Replaces `bulk_update_order_item_status_v2` without the snapshot call. | Deploy the Website first. Run off-hours: brief lock on `order_items`. |
| 2 | `20260925121000_connection_hardening.sql` | `frequent-jobs` cron dispatcher replacing 7 jobs; nightly `purge-operational-logs` retention; `station_updated` push triggers on `stations` and `payment_terminals`. | Keep the NOTICE output: it records the old cron commands for rollback. |
| 3 | `20260925121500_order_number_xact_lock.sql` | Order-number functions lock only when creating the day's sequence, with a transaction-scoped lock. Backfills the sequence registry. | |
| 4 | `20260925122000_storefront_push_and_realtime_access.sql` | Order status push to storefront visitors for non-POS orders; `qr-session` broadcasts become public; `realtime.messages` policy for location members and Dexa HQ. | Run off-hours: adds a trigger on `orders`. Stops by design if `broadcast_order_changes` isn't the `20260816130000` version. |
| 5 | `20260925123000_table_session_broadcast_fields.sql` | Adds `is_active` and `server_staff_id` to the `table_sessions` broadcast payload. | Needed before turning on `EXPO_PUBLIC_FLOOR_BROADCAST_APPLY`. |
| 6 | `20260925124000_realtime_publication_empty.sql` | Empties the `supabase_realtime` publication, which turns off Postgres Changes. | Last, after the new Website is live. Keep the NOTICE output: it lists the tables removed. |

- All six are safe to re-run. If one fails with `55P03` (lock timeout), re-run it.
- `supabase db push` applies them in this order in one go. That is fine once the Website is deployed.
- Each has a rollback, to run only if needed: `supabase/migrations/rollback/<same name>_rollback.sql`.

### Edge functions

| Function | Change | Deploy? |
| --- | --- | --- |
| `valor-webhook` | Stops storing the body of unsigned (`ignored`) and failed-signature (`invalid_signature`) requests; logs the event name instead. | **Yes:** `supabase functions deploy valor-webhook --project-ref <ref>` |
| `orderout-status-relay` | Comment only. | No |
| `orderout-delivery-dispatch` | Comment only. | No |

### Env flags

None. No new Supabase secrets or Vault entries either.

## Dexa-POS

### Migrations

Nothing to apply from this repo. These two files are byte-identical copies of Website migrations 1 and 3, kept so both migration folders agree:

- `supabase/migrations/20260925120000_remove_kds_board_snapshots.sql`
- `supabase/migrations/20260925121500_order_number_xact_lock.sql`

### Edge functions

None.

### Env flags

Both are optional. Leaving them unset keeps today's behaviour, so the POS release can ship without them. `EXPO_PUBLIC_*` values are compiled into the bundle, so set them in the EAS profile or `.env` before a build or OTA update.

| Flag | Value | Turn on when |
| --- | --- | --- |
| `EXPO_PUBLIC_FLOOR_BROADCAST_APPLY` | `1` | Website migration 5 is live on that environment. Pilot one store first. |
| `EXPO_PUBLIC_CLERK_SUPABASE_JWT_TEMPLATE` | The Clerk JWT template name | The template exists in Clerk (below) and has been checked on staging: sign in, place an order, bump on KDS, private channels stay joined. |

## Outside the repos

- **Supabase dashboard (plan Phase 1), staging and production:** Realtime → Settings, Database connection pool size **2** and Postgres Changes pool size **2**. Production only: compute Micro → **Small**, outside service hours.
- **Clerk (plan Phase 6.3):** a JWT template for Supabase with a 300 s lifetime, no custom signing key, and claims `{"role": "authenticated", "email": "{{user.primary_email_address}}", "org": {"id": "{{org.id}}"}}`.
- **Supabase billing (plan Phase 6.1):** Realtime spend cap off, or move to Team, before about 400 concurrent devices.

## Order

Do all of this on staging, soak for 24 h including a service, then repeat on production.

1. Record the pre-checks (plan runbook, step 1).
2. Dashboard settings (Outside the repos).
3. Deploy the Website branch and `valor-webhook`.
4. Apply Website migrations 1–6.
5. Off-hours, from the SQL editor:
   - `CALL public.purge_operational_logs(p_strip_since => '-infinity');`
   - then `SET lock_timeout = '5s'; VACUUM FULL public.valor_webhook_events;`
6. Check for leaked order-number locks (plan, Appendix) and terminate any idle holders.
7. Regenerate `database.types.ts` in both repos.
8. Release the POS build or OTA. It needs migration 2 live on that environment.
9. Later, per the table above: `EXPO_PUBLIC_FLOOR_BROADCAST_APPLY` for a pilot store, then the Clerk template and `EXPO_PUBLIC_CLERK_SUPABASE_JWT_TEMPLATE`.
