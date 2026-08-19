# Purchase-order numbering — integrity follow-up

Follow-up to `3648280c-1b1d-81ff-9f0e-e9307c2cd616` ("POS: Declare-Zero Button + PO Numbering"), Task 2. That ticket's PO-numbering work shipped and is verified working. Verification surfaced two defects it did not cover: two rows with an empty `po_number`, and no uniqueness constraint on the column.

The original ticket stays at **Done**. This document is the record for the follow-on work.

## Scope decision — per (merchant, location)

**The constraint is scoped per merchant *and* per location.** This was derived from the generator's actual behavior, not chosen by preference.

Both client generators in `stores/useInventoryStore.ts` counted rows filtered by `merchant_id = M AND location_id = L`:

| Generator | Filter | Output |
| --- | --- | --- |
| `getNextPurchaseOrderNumber` | `merchant_id`, `location_id`, `is_adhoc_expense` not true | `PO-####` |
| `getNextExpenseNumber` | `merchant_id`, `location_id`, `is_adhoc_expense = true` | `EXP-####` |

Consequences that fall out of matching that scope:

- Two merchants both starting at `PO-0001` is correct and expected. A **global** unique constraint would have collided on the second merchant's first PO — the failure mode the ticket flagged.
- Two locations under one merchant each run their own series. Also expected.
- POs and ad-hoc expenses share the `po_number` column but are kept apart by their prefixes, so both series can coexist in one scope.
- `location_id` is **nullable**, and Postgres treats NULLs as distinct by default. A plain `UNIQUE (merchant_id, location_id, po_number)` would allow unlimited duplicates for any row with a NULL location. The index keys on `COALESCE(location_id::text, '')` instead, which also avoids depending on the column's exact type.

## What changed

Migration: [`utils/supabase/migrations/purchase_orders_po_number_integrity.sql`](../../../utils/supabase/migrations/purchase_orders_po_number_integrity.sql)
Rollback: [`utils/supabase/migrations/purchase_orders_po_number_integrity_rollback.sql`](../../../utils/supabase/migrations/purchase_orders_po_number_integrity_rollback.sql)

1. **Backfill** — every row with a blank `po_number` gets a number from the current sequence, oldest first, prefix chosen by `is_adhoc_expense`. Existing `PO-0001` / `PO-0002` are untouched, so the two known rows land after them.
2. **`CHECK purchase_orders_po_number_not_blank`** — `po_number` may not be NULL, empty, or whitespace.
3. **`UNIQUE INDEX uq_purchase_orders_po_number_scope`** on `(merchant_id, COALESCE(location_id::text, ''), po_number)`.
4. **`BEFORE INSERT` trigger `trg_assign_purchase_order_number`** — the database now owns numbering.
5. **Client** (`stores/useInventoryStore.ts`) — both count-based generators deleted; `createPurchaseOrder` and `addExternalExpense` omit `po_number` and read the assigned value back.

### Why the database owns numbering now

Adding the unique index alone would have made things worse. The client generator was count-based — it read `COUNT(*)` and wrote `COUNT+1`:

- Two stations creating a PO at the same moment both read N and both write N+1. Today that silently duplicates. With a unique index and no other change, it becomes a **failed insert in front of a user creating a perfectly valid PO** — a data bug converted into an outage.
- `removeExternalExpense` deletes rows, so the count drops and the next number reuses one already taken.
- The backfill itself shifts the count.

The trigger fixes all three: allocation is `MAX+1` (not `COUNT+1`) over the sequential series only, serialized per scope by `pg_advisory_xact_lock`. Behavior on insert:

| Incoming `po_number` | Result |
| --- | --- |
| NULL or blank | Generated |
| Supplied, free in scope | Kept — this is what preserves legacy `PO-YYYY-MM-NNN` values |
| Supplied, already used in scope | Regenerated |

Regenerating rather than rejecting is deliberate: PO numbers are system-assigned (no screen anywhere accepts one as input — the only UI references are display and search), and the tablets do not all update at once. A station still running the old count-based build gets a correct, non-colliding number instead of an error.

Legacy `PO-YYYY-MM-NNN` numbers contain dashes, so they never match the `^PO-\d{1,15}$` pattern the generator maxes over. They keep their values, they do not perturb the counter, and they cannot collide with the `PO-####` series.

The `CHECK` also applies to `UPDATE`, where the trigger does not fire. Blanking an existing `po_number` therefore raises an error rather than being silently regenerated — an explicit blanking is a bug worth surfacing.

## Deploy order

**The migration must land before the client build.** The client no longer sends `po_number`, and the column is `NOT NULL` with no default — those inserts fail until the trigger exists to fill it. `BEFORE ROW` triggers run before constraint evaluation, so once the trigger is in place the omitted column is fine.

Rolling back has the mirror constraint: roll the client back first, or PO creation breaks.

### Production sequence

1. `purchase_orders_reattach_orphan_location.sql` — **prod only**, see below
2. `purchase_orders_po_number_integrity.sql`
3. Client build

Staging ran step 2 on 2026-08-17 and is verified (see Parity check). Step 1 is scoped to a production merchant UUID and no-ops elsewhere.

> **Unverified:** whether staging holds any purchase order with a NULL `location_id`. Step 2 was applied there without checking, so any such row would already have been numbered inside a `(merchant, NULL)` scope. Confirm with
> `select id, po_number, created_at, merchant_id from purchase_orders where location_id is null;`
> before treating staging as a clean reference.

### The orphaned row (prod only)

The blank PO created 2026-06-16 carried `location_id = NULL`. `purchase_orders.location_id` is `ON DELETE SET NULL`, so its location was deleted out from under it.

Left alone it forms its own numbering scope — `(merchant, NULL)` — and the backfill would hand it `PO-0001`, giving production a third row reading `PO-0001`. No collision (three distinct scopes), but indistinguishable in any merchant-level view that is not scope-filtered.

It also leaves a standing hazard: since `ON DELETE SET NULL` collapses a deleted location's orders into the `(merchant, NULL)` scope, a future location deletion can push those numbers into collision with whatever already sits there — and the unique index would then make the **location delete itself fail**. Production has exactly one orphan, so clearing it removes the whole class of problem.

Decision: re-attach it to location `94dd8b80-7a92-4ddf-981a-372d98a938d6` before backfilling. Both blanks then share one scope and the backfill assigns, in `created_at` order:

| Row | Assigned |
| --- | --- |
| 2026-04-14 | `PO-0001` |
| 2026-06-16 | `PO-0002` |

Both in scope `33b2baaf…|94dd8b80…`. The existing `PO-0001` / `PO-0002` live under a different merchant (`a7af715f…`) and are untouched.

The script asserts every assumption before writing — merchant and location exist, location belongs to the merchant, exactly one orphan — and aborts rather than guessing. It is idempotent, and refuses to leave any purchase order with a NULL location.

## Parity check

Run in both projects and diff. Read-only; safe on an un-migrated database. Full query in the Verification section below.

Recorded 2026-08-17, before the production run:

| Check | Staging | Prod |
| --- | --- | --- |
| `total_rows` | 24 | 8 |
| `blank_po_number` | 0 | **2** |
| `duplicate_in_scope` | 0 | 0 |
| `distinct_scopes` | 3 | 3 |
| `check_not_blank` | PRESENT | MISSING |
| `unique_index` | PRESENT | MISSING |
| `trigger_assign_number` | PRESENT | MISSING |
| `staff_shifts` tip columns | both present | **both present** |
| `declare_cash_tips_for_shift` | PRESENT | PRESENT |

The last two rows contradict the originating ticket, which stated both columns exist on zero tables and zero views and that every RPC call throws `42703`. They are present on `public.staff_shifts` in both projects. The likely cause of the original finding is that `information_schema.columns` is privilege-filtered — a role without rights on `staff_shifts` sees nothing there, while `pg_attribute` is not filtered. **The premise behind Task 1's "superseded" disposition needs re-checking before either tip ticket is worked.** Column existence is not proof the pipeline works; the reported 89 completed shifts against 0 `employee_daily_tips` rows is still worth confirming separately.

## On the empty-string write path

The migration closes this at the database level, which is what makes it hold. Worth recording what the source search found, because it did not identify a culprit in this repo:

- The only two writers here are `createPurchaseOrder` and `addExternalExpense`. Neither could emit `''`. Both generators returned a prefix-plus-digits string or threw, and `getCurrentStoreContext()` throws unless `merchant_id` and `location_id` are both present.
- No RPC, edge function, or migration in either migration root (`utils/supabase/migrations/`, `supabase/migrations/`) inserts into `purchase_orders`.
- Earlier revisions of the store did not persist purchase orders to Supabase at all.

So the blank rows came from outside this repo's code — another surface against the same database, or a manual insert. That is precisely why the fix is a `CHECK` plus a trigger rather than a client-side guard: the database is the only layer every writer passes through. Anything that now tries to insert a blank gets a generated number; anything that bypasses the trigger hits the `CHECK`.

## Verification

Run before and after applying. The migration also self-verifies — step 0 reports the pre-state, step 7 refuses to commit unless there are no blanks, no in-scope duplicates, and the index, check, and trigger are all present.

```sql
-- Should return 0 rows after the migration
select id, po_number, created_at, merchant_id, location_id
from purchase_orders
where po_number is null or trim(po_number) = ''
order by created_at;

-- Should now include purchase_orders_po_number_not_blank
select conname, pg_get_constraintdef(oid)
from pg_constraint
where conrelid = 'public.purchase_orders'::regclass
  and contype in ('u','p','c');

-- Uniqueness will NOT appear above. A UNIQUE *constraint* can only be
-- declared on plain columns, and this one keys on an expression
-- (COALESCE(location_id::text,'')), so it exists as a unique index.
-- The ticket's original inventory query filtered on contype in ('u','p')
-- and will still show no 'u' row — check pg_indexes instead:
select indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'purchase_orders'
  and indexname = 'uq_purchase_orders_po_number_scope';

-- Should return 0 rows
select merchant_id, coalesce(location_id::text,'') as loc, po_number, count(*)
from purchase_orders
group by 1,2,3 having count(*) > 1;

-- Legacy records intact
select po_number, created_at from purchase_orders
where po_number ~ '^PO-\d{4}-\d{2}-\d{3}$' order by created_at;
```

Same-day distinctness, against a scratch merchant/location on staging:

```sql
begin;
insert into purchase_orders (merchant_id, location_id, status)
values ('<merchant>','<location>','draft') returning po_number;
insert into purchase_orders (merchant_id, location_id, status)
values ('<merchant>','<location>','draft') returning po_number;
rollback;
```

Concurrency needs two live connections: open two sessions, `BEGIN` in both, insert in each before either commits, and confirm distinct numbers. The advisory lock serializes them — the second blocks until the first commits.

Client-side regression cover: [`__tests__/purchaseOrderNumbering.test.ts`](../../../__tests__/purchaseOrderNumbering.test.ts) pins that the app sends no `po_number` and issues no count probe. The SQL generator is not covered by Jest — the testability gap is listed in that file's header.

## Status against the ticket's acceptance criteria

| Criterion | Status |
| --- | --- |
| Both empty-string rows backfilled | **Prod not yet migrated.** Staging has 0 blanks; prod still has 2. |
| Empty write path closed; creating a PO without a number impossible | Staging — `CHECK` + trigger present. Enforced for every writer, not just this client. Prod pending. |
| Uniqueness constraint at the correct scope | Staging — `uq_purchase_orders_po_number_scope` confirmed via `pg_indexes`. Prod pending. |
| Constraint scope recorded, matching the generator | Recorded above; ticket comment still to be posted. |
| Two same-day POs get distinct numbers after the constraint | Staging — `PO-0010` / `PO-0011`, 18s apart, 2026-08-17. Prod pending. |
| Legacy `PO-YYYY-MM-NNN` renders and does not violate the constraint | Staging — 9 dated-legacy rows survived the migration untouched. Prod has 4. |
| Original ticket left at Done with linking comment | **Not done** — no Notion access from this environment. |
| Screen recording sent to Abubeckr | **Not done** — cannot record or send. |
| Reviewer other than implementer signs off | **Outstanding by design.** |

Live evidence that the scope decision was right: staging carries two separate rows numbered `PO-0001` (2026-01-02 and 2026-04-12) in different scopes. Both survived the unique index. A global constraint would have failed the migration outright on that data.

Per the ticket's process note, nothing here counts as verified until a reviewer other than the implementer exercises it against a running system. This document records what was built and what remains unproven; it is not a claim that the criteria are met.

## Review

_To be completed by the reviewer._

- Reviewer:
- Date applied to staging:
- Date applied to production:
- Backfilled numbers assigned:
- Same-day distinctness observed:
- Screen recording sent to Abubeckr:
