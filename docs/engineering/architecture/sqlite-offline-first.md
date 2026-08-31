# SQLite Offline-First — Execution Plan

**Status:** Ready to execute. The **read track ships with no server dependency**; the write track
is gated on one server-side precondition (§0). Nothing implemented.
**Revised:** 2026-08-28 · branch `sqlite-integration` · Expo SDK 53 / RN 0.79.6
**Supersedes:** `sqlite-local-first-read-model.md` (2026-08-25 and 2026-08-28 revisions). Both
earlier drafts were built on a read-only mirror and an explicit "the mirror never accepts an
unconfirmed write" rule. **That rule is deleted.** The local database is now the write target
and the read source; the server is its peer, not its owner.
**Related:** `db-perf-waves-2026-08-13.md` · `memory-state-audit.md` ·
`aud-14-offline-queue-persistence-measurement-report.md` · `services/conflictDetectionService.ts`

---

## 0. The pivot, and the one thing that has to be true

The goal is offline-first: the device writes locally, the server and the device hold the same
data, and they stay converged.

**The concern, stated once.** This codebase already tried local-first writes and reverted to
online-first because "local rows got created and the server rows sometimes didn't." Repeating
the attempt without changing what _caused_ that will reproduce it. So §1 establishes the actual
cause from the code, and §2–§3 establish the one precondition that removes it. Everything after
assumes that precondition is met.

**The precondition, stated as a gate:**

> ### The Identity Gate
>
> **The client must mint the row's real primary key at creation time, and the server must accept
> it unchanged.** A row's identity must never change between creation and sync.
>
> This requires new server RPCs (Phase 6). It is not optional and it cannot be worked around on
> the device.

Good news, established in §2: the database already accepts client-supplied primary keys. Only
the RPC layer is in the way.

**Where the gate sits, and why that matters for scheduling.** The gate blocks the **write track
only**. Phases 1–5 build the local database, the delta sync engine and every read screen, and
they need **no server change at all**. So:

- **File the RPC ticket on day one, then stop waiting on it.** The backend work happens in
  parallel with months of read-track delivery instead of blocking the start.
- **If the server work never lands, the project still succeeds — it just stops at Phase 5.**
  That is the read mirror: offline reads, instant paging, local reporting, two caches deleted, a
  P1 fixed. A good outcome on its own, not a consolation prize.
- Nothing in Phases 1–5 has to be rewritten if the gate opens later (§4.3).

This ordering is deliberate: **the risky half is also the half that can be cancelled**, and it
is sequenced last so cancelling it costs nothing already built.

---

## 1. Why the last attempt failed — identity instability

Not "sync is hard." Something much more specific, and fixable.

**Local IDs are not UUIDs.** `lib/offlineIdRegistry.ts:123`:

```ts
export function generateLocalId(entityType: EntityType): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substr(2, 9);
  case "order": return `${LOCAL_ORDER_PREFIX}${timestamp}_${random}`;  // local_order_1767113883512_k3f9a
}
```

**No `create_order` variant accepts an ID.** Verified against `database.types.ts`: `create_order`,
`create_order_v2` (×2 overloads) and `create_order_v3` (×2) all take location/merchant/type/
customer args and **return** the server-generated UUID. `create_order_v3` added
`p_idempotency_key` — which dedupes the _call_, but the row's identity still originates on the
server. Same for items: `add_order_item_v4` takes `p_order_id` and mints the item id server-side.

**So every row is born with one identity and acquires a different one at sync time.** That single
fact is the source of all of it. When `local_order_…` becomes `550e8400-…`, every reference has
to be rewritten, atomically, across at least:

| Reference                                  | Where                                                                             |
| ------------------------------------------ | --------------------------------------------------------------------------------- |
| `ordersById` key                           | `useOrderStore`                                                                   |
| `dbOrderIdIndex`                           | `useOrderStore` — 12+ hand-maintained sites (`:4740`, `:7157`, `:7232`, `:7246`…) |
| `workingSetOrderIds` / `_workingSetLookup` | `useOrderStore:5258`                                                              |
| `persistableOrderIds`                      | `useOrderStore:4742-4744`                                                         |
| Queue op `entity_id`                       | `offlineSyncService`                                                              |
| Local→backend map                          | `offlineIdRegistry` (530 lines, its own MMKV persistence)                         |
| Table session order refs                   | `useTableSessionStore`                                                            |
| KDS ticket order refs                      | `useKDSStore`                                                                     |
| Payment item coverage                      | `usePaymentStore`                                                                 |
| Seating index                              | `useSeatingStore.byOrderId`                                                       |

Miss one → an orphan. Race one → a duplicate. **That is exactly the reported failure**, and it is
why the codebase now carries six separate layers of defense against it — idempotency keys,
`offlineIdRegistry`, `reconcileLostOrderCreations`, `markOperationBlocked`, `cartShapeReconcile`,
`orderHeaderReconcile` — plus an explicit in-code guard for _"stale `dbOrderIdIndex` and merging
would leak items from this order"_ (`useOrderStore.ts:5353`) and a CLAUDE.md warning that
`getOrder()` is fragile in `DraggableTable` because of "timing gaps in `dbOrderIdIndex` after
seating."

None of those layers is wrong. They are all treating one disease.

---

## 2. The unlock — the database already accepts client-minted keys

Read from `database.types.ts` on this branch:

```ts
orders.Insert       = { id?: string; location_id: string; ... }   // ← id is OPTIONAL
order_items.Insert  = { id?: string; order_id: string; ... }      // ← id is OPTIONAL
```

`id?` means the column has a default (`gen_random_uuid()`) **and will accept a supplied value.**
The table layer is already offline-first-ready. Only the RPC layer refuses to pass an ID through.

And the client already has the tools:

- `uuid@^13.0.0` is a dependency; `useOrderStore.ts:69` already does `import { v4 as uuidv4 }`.
- `orders.sync_version` exists (`number | null`) and is already used for optimistic concurrency
  by `useOnlineOrderActions.ts:150-185` and `offlineSyncService.ts:2880`.
- `services/conflictDetectionService.ts` (607 lines) already implements `detectConflict`,
  `canMergeChanges`, `mergeOrders`, `isNewerVersion`, `wasPaymentProcessed`, `isLockedForPayment`.
- `lib/realtime/mutationOrigin.ts` + `p_origin_id` already suppress our own broadcast echoes.

**So the gap between here and offline-first is narrower than it looks.** It is: new RPC overloads
that accept an ID, a local database, and a convergence engine. The conflict primitives exist.

### What stable identity deletes

Once a row's UUID is minted on the device and never changes, these stop being necessary — not
worked around, _unnecessary_:

| Deleted                                                    | Size                             |
| ---------------------------------------------------------- | -------------------------------- |
| `lib/offlineIdRegistry.ts`                                 | 530 lines + its MMKV persistence |
| `dbOrderIdIndex` and its maintenance                       | 12+ sites in `useOrderStore`     |
| `isLocalId` / `resolveToBackendId` / `resolveId` branching | every call site                  |
| `reconcileLostOrderCreations()`                            | `offlineSyncInit.ts:262`         |
| The rekey path in `useOrderStore`                          | `:4734-4776`                     |
| The stale-index guard                                      | `:5353`                          |

That is the real prize of the write track, and it is worth having on its own merits — **even if
Phases 7–9 never happen**, Phase 6 leaves the codebase meaningfully safer while changing no
behavior.

---

## 3. What "always in sync" can and cannot mean

Two writers on a network partition cannot be _identical at all times_ — that is not a design
choice, it is CAP. What is achievable, and what this plan promises, is stronger than it sounds:

> **Convergence.** Given no further writes and restored connectivity, every device and the server
> reach **byte-identical state for every entity, deterministically, regardless of the order
> updates arrived in.**

Three properties make that true, and each is a design obligation below:

1. **Stable identity** (§2) — the same row is recognizable everywhere, always.
2. **Commutative merge** (§5) — merge(A,B) == merge(B,A). Arrival order cannot change the result.
3. **Idempotent apply** — replaying an update that already landed is a no-op.

Where a merge genuinely cannot be commutative — money — the answer is not a cleverer merge. It is
to keep that operation online-only, explicitly (§6).

---

## 4. Architecture

```
       OFFLINE-FIRST WRITE                          CONVERGENCE
       ───────────────────                          ───────────
  action
    │
    ├─ mint UUID (client, v4)
    │
    └─► ONE SQLite TRANSACTION ─────────┐
          • write the row(s)            │  ← this atomicity is the whole point.
          • append intent to outbox     │    No dual write. Nothing can half-happen.
        COMMIT ─────────────────────────┘
            │
            ├──► UI reads local. Immediately. Online or off.
            │
            └──► outbox drains (when connected)
                     │  push: RPC with the client-minted id + sync_version
                     │  ├─ accepted   → mark synced, bump local sync_version
                     │  └─ conflict   → pull server row, merge (§5), re-push
                     │
                     └─ pull: delta since watermark → merge → apply
                              realtime broadcast → same merge path
```

**The store hierarchy is unchanged.** Zustand stays the UI's reactive layer; it becomes a
_projection of SQLite_ rather than an independent copy. One direction of flow: SQLite → Zustand →
render. Writes go the other way through a single API. Two stores can no longer disagree about an
order, because neither owns it.

### 4.1 The transactional outbox is the load-bearing part

Today the write path is a dual write: Zustand `set()` (persisted to MMKV on a 900 ms debounce) and
a separate queue append (`setSyncJSON` to a different MMKV key). A crash between them loses one
side. Both drafts of the read-mirror plan worked around this; offline-first cannot.

```ts
await db.withTransactionAsync(async () => {
  await db.runAsync(`INSERT INTO orders (id, ...) VALUES (?, ...)`, [orderId, ...]);
  await db.runAsync(`INSERT INTO outbox (id, op, entity, entity_id, payload, base_version)
                     VALUES (?, 'create_order', 'order', ?, ?, 0)`, [opId, orderId, json]);
});
```

Either the order exists _and_ is queued to sync, or neither happened. There is no third state.
This is what makes "local created, server didn't" not merely unlikely but **unrepresentable**.

### 4.2 One table, not two zones

The previous draft split `mirror_*` (server-owned) from `local_*` (device-owned). Offline-first
collapses that: there is one `orders` table, and rows in it may be **local-only, syncing, synced,
or conflicted** — a column, not a separate table.

```sql
sync_status TEXT NOT NULL   -- 'local' | 'pending' | 'synced' | 'conflict'
```

The Prime Rule is gone. What replaces it as the structural safety property:

> **The Identity Invariant.** Every row's primary key is a v4 UUID minted at creation and never
> rewritten. `UPDATE … SET id = ?` does not exist in this codebase. Enforced by a trigger:
> `CREATE TRIGGER no_id_rewrite BEFORE UPDATE OF id ON orders BEGIN SELECT RAISE(ABORT, …); END;`

### 4.3 Building reads first without paying for it twice

Reads ship before writes (§9), so three decisions have to be made now — while the DB is still
read-only — or the write track turns into a rewrite.

**① The schema ships offline-first from day one, inert.** The `_`-prefixed local-only columns
(`_sync_status`, `_base_version`, `_lamport`, `_device_id`) are created in Phase 1 and simply
unused — during the read track every row arrives from the server, so `_sync_status` is always
`'synced'`. A handful of dormant columns costs nothing and means the write track adds behavior,
not a migration on a database that by then holds real data.

**② While reads are the only consumer, the database is disposable — exploit that.** A pure
projection can always be dropped and refetched, so during Phases 1–5 a schema change is
`DROP` + rebuild + resync, with no migration to write and no way to corrupt anything. **That
freedom ends at Phase 7**, the first phase where SQLite holds data the server does not. Two
settings flip at exactly that boundary, and they are the boundary:

|                      | Phases 1–5 (reads)                    | Phase 7+ (writes)                          |
| -------------------- | ------------------------------------- | ------------------------------------------ |
| Schema change        | Drop and rebuild                      | Forward-only migration ladder              |
| `PRAGMA synchronous` | `NORMAL` — a lost commit is a refetch | **`FULL`** — a lost commit is a lost order |

Make that flip a single reviewed commit with both changes in it. It is the moment the local
database stops being a cache.

**③ Screens read through a selector API, never through the storage layer.** During the read track
the resolution rule is _live work → Zustand, settled → SQLite_; after the write track it collapses
to _everything → SQLite_. If screens encode that rule, every screen changes twice. So screens call
`useOrders(filter)` / `useOrder(id)` and the rule lives **inside the hook**, exactly as
`stores/selectors/orderSelectors.ts` already does today. The source swap then lands in one file
per entity and no screen notices.

That third point is the one that decides whether this reordering is free or expensive. Build the
selector boundary in Phase 3, the first read page, before there are twelve call sites to fix.

---

## 5. Merge semantics — the heart of it

Whole-row last-writer-wins is wrong for a POS: two servers adding items to the same table offline
would lose one server's items. Merge is **per-field, per-entity**, and every rule below is chosen
to be commutative and to fail in the direction that loses the _least_ and is _safest for the
guest_.

| Entity / field                                  | Rule                                                                                                  | Why this direction                                                                                                                                        |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Order item set**                              | **Add-wins union**, keyed by item UUID                                                                | Two stations each add items offline → guest gets both. Losing an ordered item is worse than an extra line the server can void                             |
| **Item removal / void**                         | **Remove-wins** (tombstone beats a concurrent add)                                                    | Un-voiding an item the manager voided is worse than losing a re-add. The tombstone already exists on remote: `order_items.is_voided` / `voided_at` (§7.4) |
| **Item quantity**                               | LWW on `(updated_at, device_id)`                                                                      | The UI sets an absolute quantity from a picker, not an increment, so LWW is faithful to the gesture. **Not** a counter — do not treat it as one           |
| **Item modifiers**                              | Replace whole set, LWW on the parent item                                                             | `replace_order_item_modifiers_v2` is already replace-semantics server-side. Keep them aligned                                                             |
| **Order status**                                | **Monotonic advance** along the `lib/tableStateMachine.ts` partial order; never regresses             | `paid` must never fall back to `open`. Merge = take the further-advanced state                                                                            |
| **Order header** (customer, type, table, notes) | LWW per field on `(updated_at, device_id)`                                                            | Independent scalars. Per-_field_, so a name edit and a table move on two devices both survive                                                             |
| **Payments**                                    | **Server authoritative. No merge.**                                                                   | §6                                                                                                                                                        |
| **Totals / tax**                                | **Derived, never merged** — recomputed from the merged item set                                       | Merging a computed total against its inputs is how money goes wrong. Compute after merge, both sides, `decimal.js`                                        |
| **Table session**                               | Monotonic status; local-only statuses (`seating`/`ordering`/`paying`/`closing`) never sync — as today | `isLocalOnlyStatus()` already guards this                                                                                                                 |
| **Menu / inventory / customers / staff**        | **Server-authoritative pull.** Device does not originate                                              | Nothing here is created offline on a POS. Delta-pull only — §8.2                                                                                          |

**Tie-break.** Every LWW rule compares `(updated_at, device_id)` — never `updated_at` alone. Two
devices can write in the same millisecond; without a deterministic tiebreak the merge is not
commutative and the two sides settle differently. `device_id` already exists on `orders`.

**Clock skew is real.** Device clocks drift, and a tablet with a wrong clock could otherwise win
or lose every merge. Stamp each write with **both** the device clock and a **Lamport counter** per
(device, entity); compare the Lamport pair first and fall back to wall clock only for display.
Wall-clock time is for humans; causality is for merges.

**Reuse, don't rebuild.** `services/conflictDetectionService.ts` already has `detectConflict`,
`canMergeChanges` and `mergeOrders` operating on `sync_version`. The work is to make its merge
per-field and commutative per the table above, and to give it a test suite (§10) — not to write a
new one beside it.

---

## 6. The money boundary — where offline-first stops, deliberately

This is the one place the goal cannot be met in full, for a physical reason rather than an
architectural one, so it gets an explicit line rather than a best effort.

| Operation                                               | Offline? | Rule                                                                                                                                                           |
| ------------------------------------------------------- | :------: | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Build/modify an order, items, modifiers, courses, seats |    ✅    | Fully offline-first                                                                                                                                            |
| Send to kitchen / KDS routing                           |    ✅    | Queues; fires on reconnect. Print locally now                                                                                                                  |
| **Cash payment**                                        |    ✅    | The cash drawer _is_ the device. Local is truth; server reconciles                                                                                             |
| **Card authorization**                                  |    ❌    | Requires the processor. Cannot be queued — a queued "approval" is a lie to the cashier and a chargeback to the merchant                                        |
| Tip adjust, refund, void payment                        |    ❌    | Operates on a processor-side transaction                                                                                                                       |
| **Settlement / batchout / EOD commit**                  |    ❌    | **Server authoritative, always.** Local computes the _preview_ only                                                                                            |
| Order locking for payment                               |    ❌    | `is_order_locked` is a server mutex. An offline device cannot hold it; on reconnect, **lock-wins** and local edits to a locked order are rejected and surfaced |

**The degraded-mode UX matters as much as the rule.** Offline, the card button is disabled with a
plain reason — `Card payment needs a connection. Cash is available.` — not a spinner and not a
silent failure. Store-and-forward card capture with a floor limit is a _merchant risk decision_,
not an engineering one; if it is ever wanted, it is its own project with its own sign-off.

---

## 7. Schema

### 7.1 How faithful the clone is — and where it deliberately isn't

Every column below was read from `database.types.ts` on this branch. Three different fidelity
rules apply, and conflating them is how a local schema drifts from the remote one:

| Part of a row                                                                                               | Rule                                                                  | Why                                                                                                                 |
| ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **Identity** — `id`, and every foreign key (`order_id`, `location_id`, `menu_item_id`, `staff_profile_id`…) | **Byte-identical to remote.** Same UUID, same name                    | Convergence is defined by both sides agreeing on which row is which. A renamed or re-derived key breaks it silently |
| **Watermarks and versions** — `updated_at`, `created_at`, `sync_version`, `version`                         | **Byte-identical to remote**                                          | The delta cursor is a direct comparison against a server value. A local re-interpretation desynchronizes the pull   |
| **`payload`**                                                                                               | **Verbatim server JSON, unmodified**                                  | The render path stays `_transformFetchedOrder`. New server fields appear with no device migration                   |
| **Promoted columns**                                                                                        | A **verified subset of real remote columns, keeping the remote name** | Filtering/sorting/search need real columns. Keeping the name means there is no translation layer to get wrong       |
| **Table shape**                                                                                             | **Not** the remote table graph — the shape the app already consumes   | See below                                                                                                           |

**The one place we deliberately do not clone: the menu.** Remotely a menu item's effective price
and availability are spread across `menu_items` (merchant-level `price`, `cash_price`,
`availability`), a location override carrying `custom_price` / `custom_cash_price` /
`is_available`, plus `category_items`, `menu_item_menus` and `menu_item_modifier_groups`.
`get_pos_bootstrap_v1` already resolves all of that server-side.

Cloning those normalized tables would mean **re-implementing price resolution in SQLite** — a
second source of truth for what an item costs. That is precisely the drift that ends with a device
ringing up the wrong price. So the local menu tables mirror **the resolved output of the RPC**,
not the tables behind it. One resolver, server-side, forever.

**Money.** Remote money columns are Postgres `numeric` (typed `number` in `database.types.ts`).
SQLite has no decimal type and `REAL` is floating point, which the project rule forbids
(`decimal.js`, never floats, per CLAUDE.md). So:

> Money is promoted as **`INTEGER` minor units** for aggregation and sorting only, converted once
> at ingest by a single tested helper. **`payload` keeps the server's exact value**, and every
> display path reads `payload` through `decimal.js` as it does today. A promoted integer is never
> the value shown to a human or written back to the server.

That gives SQL `SUM()` for analytics without ever putting currency through a float, and the
conversion has exactly one implementation to test.

### 7.2 Tables

```sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA synchronous = NORMAL; -- Track A only. Flips to FULL at the Phase 5→6 boundary — see §7.3.

-- ORDERS. Column names match public.orders exactly.
CREATE TABLE orders (
  id            TEXT PRIMARY KEY,   -- client-minted v4 UUID (Phase 6+). Never rewritten.
  location_id   TEXT NOT NULL,
  merchant_id   TEXT NOT NULL,
  order_number  TEXT NOT NULL,
  display_number TEXT,
  order_type    TEXT NOT NULL,
  order_source  TEXT NOT NULL,
  status        TEXT NOT NULL,
  payment_status TEXT NOT NULL,     -- separate enum from status; both are needed
  check_status  TEXT,
  customer_id   TEXT, customer_name TEXT, customer_phone TEXT, customer_email TEXT,
  table_number  TEXT, seat_number TEXT, session_id TEXT,
  assigned_server_id TEXT, created_by_staff_id TEXT, station_id TEXT, device_id TEXT,

  -- Dual pricing is structural here, not a variant. Minor units (§7.1).
  subtotal_minor        INTEGER NOT NULL,
  tax_amount_minor      INTEGER NOT NULL,
  total_amount_minor    INTEGER NOT NULL,
  discount_amount_minor INTEGER NOT NULL,
  service_charge_minor  INTEGER NOT NULL,
  tip_amount_minor      INTEGER NOT NULL,
  amount_due_minor      INTEGER NOT NULL,
  amount_paid_minor     INTEGER NOT NULL,
  card_subtotal_minor   INTEGER, card_tax_amount_minor INTEGER, card_total_minor INTEGER,
  cash_subtotal_minor   INTEGER, cash_tax_amount_minor INTEGER, cash_total_minor INTEGER,
  cash_amount_due_minor INTEGER, cash_discount_amount_minor INTEGER,
  effective_total_minor INTEGER,  -- what the app actually charges; used by analytics

  -- Void / cancel: these ARE the tombstones. See §7.4.
  voided_at TEXT, void_reason TEXT, voided_by TEXT,
  cancelled_at TEXT, cancellation_reason TEXT,

  sent_to_kitchen_at TEXT, ready_at TEXT, completed_at TEXT,
  is_offline    INTEGER,             -- exists on remote already
  reopen_count  INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,       -- delta watermark
  sync_version  INTEGER,             -- remote column, used for optimistic concurrency

  -- LOCAL-ONLY columns. Not present on remote, never pushed. Inert until Phase 7.
  _sync_status  TEXT NOT NULL DEFAULT 'synced',  -- local|pending|synced|conflict
  _base_version INTEGER,
  _lamport      INTEGER NOT NULL DEFAULT 0,
  _device_id    TEXT,
  _business_day TEXT,                -- derived at ingest via lib/businessDay.ts. NOT a remote column.
  _server_seen_at TEXT NOT NULL,
  payload       TEXT NOT NULL
);
CREATE INDEX idx_o_loc_created ON orders(location_id, created_at DESC) WHERE voided_at IS NULL;
CREATE INDEX idx_o_bizday      ON orders(location_id, _business_day);
CREATE INDEX idx_o_number      ON orders(location_id, order_number);
CREATE INDEX idx_o_phone       ON orders(location_id, customer_phone);
CREATE INDEX idx_o_updated     ON orders(location_id, updated_at);
CREATE INDEX idx_o_unsynced    ON orders(_sync_status) WHERE _sync_status != 'synced';

CREATE TRIGGER no_order_id_rewrite BEFORE UPDATE OF id ON orders
  BEGIN SELECT RAISE(ABORT, 'order id is immutable'); END;

-- ORDER ITEMS. Column names match public.order_items exactly.
CREATE TABLE order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  menu_item_id TEXT, menu_id TEXT, category_id TEXT,
  item_name TEXT NOT NULL,           -- NOT "name"
  category_name TEXT, menu_name TEXT,
  quantity INTEGER NOT NULL,
  unit_price_minor INTEGER NOT NULL,
  subtotal_minor   INTEGER NOT NULL,
  tax_amount_minor INTEGER,
  cash_unit_price_minor INTEGER, cash_subtotal_minor INTEGER, cash_tax_amount_minor INTEGER,
  discount_amount_minor INTEGER, pre_discount_subtotal_minor INTEGER,
  item_status TEXT NOT NULL, kitchen_status TEXT,
  course_number INTEGER, seat_number INTEGER, display_order INTEGER,
  is_voided INTEGER, voided_at TEXT, void_reason TEXT,   -- the item tombstone (§7.4)
  is_to_go INTEGER, is_prioritized INTEGER, rush INTEGER,
  special_instructions TEXT, kitchen_notes TEXT,
  selected_size_id TEXT, selected_size_name TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  _sync_status TEXT NOT NULL DEFAULT 'synced',
  _lamport INTEGER NOT NULL DEFAULT 0, _device_id TEXT,
  payload TEXT NOT NULL
);
CREATE INDEX idx_oi_order ON order_items(order_id) WHERE is_voided IS NOT 1;
CREATE INDEX idx_oi_menu  ON order_items(menu_item_id);

-- ORDER PAYMENTS. NOTE: remote has NO updated_at/created_at — see §8.2.
CREATE TABLE order_payments (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  location_id TEXT, device_id TEXT,
  payment_method TEXT,
  amount_minor INTEGER NOT NULL,
  tip_amount_minor INTEGER, amount_tendered_minor INTEGER, change_given_minor INTEGER,
  dual_pricing_fee_minor INTEGER, discount_portion_minor INTEGER,
  is_cash_priced INTEGER, is_voided INTEGER, is_returned INTEGER, is_settled INTEGER,
  card_last_four TEXT, card_type TEXT, auth_code TEXT,
  covers_items TEXT,                 -- remote is text[]; stored as JSON array
  idempotency_key TEXT,
  initiated_at TEXT NOT NULL,        -- the closest thing to a watermark on this table
  approved_at TEXT, captured_at TEXT, failed_at TEXT, voided_at TEXT,
  payload TEXT NOT NULL
);
CREATE INDEX idx_op_order ON order_payments(order_id);

-- MENU: the RESOLVED shape from get_pos_bootstrap_v1, not the remote table graph (§7.1).
CREATE TABLE menu_items (
  id TEXT PRIMARY KEY,               -- menu_items.id — the merchant-level item id
  location_id TEXT NOT NULL, merchant_id TEXT,
  menu_id TEXT, category_id TEXT,    -- resolved by the RPC, not joined locally
  name TEXT NOT NULL, description TEXT,
  price_minor INTEGER NOT NULL,      -- effective price AFTER location override
  cash_price_minor INTEGER,
  availability INTEGER NOT NULL,     -- resolved: merchant availability AND location is_available
  image TEXT,                        -- file:// path from menuImageCache. NEVER base64.
  tax_category TEXT, is_tax_exempt INTEGER,
  dietary_flags TEXT, allergens TEXT, meal_types TEXT,   -- remote text[] → JSON arrays
  display_order INTEGER,
  version INTEGER,                   -- menu_items.version, a real remote column
  updated_at TEXT, _server_seen_at TEXT NOT NULL, payload TEXT NOT NULL
);
CREATE INDEX idx_mi_loc_cat ON menu_items(location_id, category_id, display_order);
CREATE INDEX idx_mi_avail   ON menu_items(location_id, availability);

CREATE TABLE menu_categories (
  id TEXT PRIMARY KEY, location_id TEXT, merchant_id TEXT, menu_id TEXT,
  name TEXT NOT NULL, description TEXT, image TEXT,
  display_order INTEGER, is_active INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT, payload TEXT NOT NULL
);

CREATE TABLE menu_item_modifier_groups (
  menu_item_id TEXT NOT NULL, modifier_group_id TEXT NOT NULL, display_order INTEGER,
  PRIMARY KEY (menu_item_id, modifier_group_id)
);
CREATE TABLE modifier_groups (
  id TEXT PRIMARY KEY, location_id TEXT, name TEXT,
  updated_at TEXT, payload TEXT NOT NULL
);

-- INVENTORY. Names match public.inventory_items / vendors.
CREATE TABLE inventory_items (
  id TEXT PRIMARY KEY, location_id TEXT NOT NULL, vendor_id TEXT,
  name TEXT, category TEXT,
  current_stock REAL,                -- a physical quantity, not money — REAL is correct here
  unit_type TEXT, reorder_point REAL,
  cost_per_unit_minor INTEGER,       -- money → minor units
  stock_mode TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT, updated_at TEXT, _server_seen_at TEXT NOT NULL, payload TEXT NOT NULL
);
CREATE INDEX idx_ii_loc    ON inventory_items(location_id, is_active);
CREATE INDEX idx_ii_low    ON inventory_items(location_id, current_stock);
CREATE INDEX idx_ii_vendor ON inventory_items(vendor_id);

CREATE TABLE vendors (
  id TEXT PRIMARY KEY, location_id TEXT NOT NULL, name TEXT,
  is_active INTEGER NOT NULL DEFAULT 1, updated_at TEXT, payload TEXT NOT NULL
);

-- CUSTOMERS. Names match public.customers exactly.
CREATE TABLE customers (
  id TEXT PRIMARY KEY, merchant_id TEXT,
  name TEXT, phone TEXT, email TEXT,
  is_active INTEGER, vip_level TEXT,
  total_orders INTEGER, visits INTEGER,
  lifetime_spend_minor INTEGER, avg_spend_minor INTEGER,
  last_order_date TEXT, last_visit TEXT,   -- NOT "last_order_at"
  created_at TEXT, updated_at TEXT, _server_seen_at TEXT NOT NULL, payload TEXT NOT NULL
);
CREATE INDEX idx_c_phone ON customers(phone);
CREATE INDEX idx_c_name  ON customers(name);

-- STAFF: a JOIN of location_members × staff_profiles. NO PIN COLUMN — see §11.
-- location_members holds pin_plain / pin_code / pin_hashed. None of them appear here.
CREATE TABLE staff (
  location_member_id TEXT PRIMARY KEY,   -- location_members.id
  staff_profile_id   TEXT NOT NULL,      -- location_members.staff_profile_id
  location_id        TEXT NOT NULL,
  role_code          TEXT NOT NULL,      -- from location_members
  employment_type    TEXT,
  is_active          INTEGER NOT NULL,   -- location_members.is_active
  display_name       TEXT,               -- from staff_profiles
  first_name         TEXT, last_name TEXT, avatar_url TEXT,
  updated_at         TEXT, _server_seen_at TEXT NOT NULL
);
CREATE INDEX idx_s_loc ON staff(location_id, is_active);

-- The transactional outbox. Local-only, no remote counterpart. §4.1.
CREATE TABLE outbox (
  id TEXT PRIMARY KEY, op TEXT NOT NULL, entity TEXT NOT NULL, entity_id TEXT NOT NULL,
  depends_on TEXT REFERENCES outbox(id),
  base_version INTEGER, idempotency_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT, created_at TEXT NOT NULL, payload TEXT NOT NULL, last_error TEXT
);
CREATE INDEX idx_ob_ready ON outbox(status, next_attempt_at) WHERE status IN ('pending','failed');
CREATE INDEX idx_ob_dep   ON outbox(depends_on);

CREATE TABLE sync_state (
  entity TEXT NOT NULL, location_id TEXT NOT NULL,
  watermark TEXT, watermark_id TEXT,
  last_success_at TEXT, last_attempt_at TEXT, last_error TEXT,
  last_manifest_at TEXT, retention_floor TEXT, row_count INTEGER,
  PRIMARY KEY (entity, location_id)
);
```

**Local-only columns carry a `_` prefix** (`_sync_status`, `_lamport`, `_business_day`,
`_server_seen_at`). Anything without the prefix exists on remote under that exact name. That one
convention makes "would this column ever be pushed?" answerable by looking at it, and it makes an
accidental push of a local-only field a review-visible mistake rather than a runtime surprise.

### 7.3 The `synchronous` flip

`synchronous = FULL` is the one deliberate performance sacrifice in this document, and it _defines_
the Track A → Track B boundary. Under WAL, `NORMAL` can lose the last commits on an OS crash or
power loss. Through Phases 1–5 that is fine — SQLite holds a projection and a lost commit is a
refetch. From Phase 6 it holds the only copy of a guest's order, and it is not.

So `NORMAL` through Track A, and the flip to `FULL` ships in the same reviewed commit that closes
the drop-and-rebuild escape hatch (§4.3 ②). Measure the cost at that flip — one fsync per commit,
and orders commit at human speed.

The `_`-prefixed offline-first columns are created in Phase 1 and sit unused until Phase 7. A
dormant column costs nothing and means the write track adds behavior instead of migrating a
database that by then holds real data.

### 7.4 Correction: tombstones mostly _do_ exist

An earlier revision of this document claimed there are no tombstones anywhere, from
`grep -c "deleted_at" database.types.ts` → 0. The grep was right; the conclusion was too broad.

**Voids and cancellations are soft deletes, and they already ride the `updated_at` watermark:**

| Entity                                  | Tombstone                                                | Rides the delta?        |
| --------------------------------------- | -------------------------------------------------------- | ----------------------- |
| Order                                   | `voided_at`, `void_reason`, `voided_by`, `cancelled_at`  | ✅ — `updated_at` bumps |
| Order item                              | `is_voided`, `voided_at`, `void_reason`                  | ✅ — `updated_at` bumps |
| Menu item                               | `availability` = false; location override `is_available` | ✅                      |
| Inventory item, vendor, customer, staff | `is_active` = false                                      | ✅                      |

That materially improves the remove-wins rule (§5): the common case — a manager voids an item on
another station — is a **status change the delta already delivers**, not a disappearance the
device has to infer.

What remains genuinely invisible is a **hard `DELETE`**, which has no marker of any kind. That is
what the manifest reconcile (§8.2) is for, and it is now correctly sized as a rare-case safety net
rather than the primary delete mechanism. The `deleted_at` / `sync_tombstones` server ticket is
still worth filing — it closes the last gap — but it is **no longer a hard blocker for Phase 7**,
because item voids already have a real tombstone.

## 8. The sync protocol

### 8.1 Push — draining the outbox

```
loop over outbox WHERE status IN ('pending','failed') AND next_attempt_at <= now
                 AND (depends_on IS NULL OR depends_on resolved)
                 ORDER BY created_at:

  call RPC with { client id, idempotency_key, base_version }

  ├─ 200 + version accepted  → txn: outbox.done + row.sync_status='synced' + sync_version=returned
  ├─ 409 version conflict    → pull server row, merge (§5), write merged row + new outbox op, retry
  ├─ 4xx permanent           → status='failed', surface to operator. Never silently drop
  └─ network error           → backoff, attempts++, stays pending. Idempotency key makes retry safe
```

Two properties worth naming:

- **Ordering is per-entity, not global.** Items for order A must not head-of-line block order B.
  `depends_on` expresses the real dependency (an item waits for its order's create _only if_ the
  server hasn't seen the order yet — and with client-minted IDs, it usually doesn't need to).
- **Retry is free.** Same client UUID + same idempotency key = the server can dedupe perfectly.
  This is what `p_idempotency_key` on `create_order_v3` / `add_order_item_v4` already exists for.

### 8.2 Pull — the delta engine

Unchanged from the previous draft, and it is the part that was already right. Per-entity
descriptors, `(watermark, watermark_id)` keyset resume, transactional apply, resumable paging,
prune-inside-insert. Three schema facts it must still handle, all verified on this branch:

- **Only _hard_ deletes are invisible.** There is no `deleted_at` anywhere (0 hits across 634
  table definitions), but voids and deactivations are real soft deletes that ride the `updated_at`
  watermark normally — `orders.voided_at`, `order_items.is_voided`, `is_active`, `availability`
  (§7.4). So the delta already carries the common case. Ship the **manifest reconcile** (id +
  watermark pairs only, ~120 KB for 2,000 orders) on business-day rollover as the safety net for
  genuine hard deletes, and file the server tombstone ticket to close the last gap.
- **`order_payments` has no `updated_at`/`created_at`** (only `initiated_at`, `approved_at`,
  `voided_at`) → payments sync as children of their parent order's watermark.
- **`get_pos_bootstrap_v1` / `get_pos_inventory_sync` take no `since`** → Phase 2 ships PostgREST
  delta; file `get_pos_delta_v1` as `SECURITY DEFINER`, the pattern that already makes
  `get_active_orders_v1` 13 ms against the 536–1108 ms embed (~97,000 s of RLS across 254 days).

Incoming rows go through **the same merge function as the outbox conflict path**. One merge
implementation, exercised by both directions — otherwise push and pull settle differently and
convergence is lost.

### 8.3 Realtime

Broadcasts route into the identical merge path. `p_origin_id` echo suppression
(`lib/realtime/mutationOrigin.ts`) already prevents re-applying our own writes. Realtime is a
latency optimization; the delta pull is the correctness backstop. A channel reconnect triggers a
delta pull, not a full refetch.

---

## 9. Phases

**Two tracks, one boundary.** Track A is the local read database: no server dependency, nothing
it can corrupt, and every phase in it ships user-visible value. Track B turns that database into
the write target and needs the Identity Gate (§0).

|                | Phases | Server work needed                     | Worst failure                 | Value if the project stops here                                                  |
| -------------- | ------ | -------------------------------------- | ----------------------------- | -------------------------------------------------------------------------------- |
| **A · Reads**  | 1–5    | **None**                               | Stale data → drop and refetch | Offline reads, instant paging, local reporting, two caches deleted, one P1 fixed |
| **B · Writes** | 6–9    | `create_order_v4`, `add_order_item_v5` | Lost or duplicated orders     | Full offline operation                                                           |

The line between Phase 5 and Phase 6 is the most consequential in this document: it is where the
local database stops being a cache and starts being the only copy of something. `synchronous` and
the migration policy flip there, in one reviewed commit (§4.3).

Every phase is behind its own `EXPO_PUBLIC_*` flag, default off, rollback = unset it. **Do not
start the next phase until the current one has run a full service period on real hardware.**

---

### Track A — the read database _(no server work required)_

#### Phase 1 · Foundation _(no user-visible change)_ — ✅ **BUILT + MEASURED**

**Flag:** none — inert until something reads it.

**Status: code complete, 103/103 local-DB tests green, `tsc --noEmit` clean. Measurement
pass ran on device 2026-08-28 (Samsung SM-P613) — caps derived (see "Still outstanding"
for the numbers). The one remaining Phase 1 item is the `boot.persist_parse_ms.*`
ranking, which does not block Phase 2.**

| Delivered                                | File                                                                                                                               |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Schema, DDL + naming contract            | [lib/db/schema.ts](lib/db/schema.ts)                                                                                               |
| Open / pragma / version / rebuild        | [lib/db/index.ts](lib/db/index.ts)                                                                                                 |
| Station scoping                          | [lib/db/policy.ts](lib/db/policy.ts)                                                                                               |
| Retention + freshness descriptors        | [lib/db/entities.ts](lib/db/entities.ts)                                                                                           |
| The single write boundary                | [lib/db/write.ts](lib/db/write.ts)                                                                                                 |
| Money ↔ minor-units, one helper          | [lib/db/money.ts](lib/db/money.ts)                                                                                                 |
| Purge paths                              | [lib/db/teardown.ts](lib/db/teardown.ts), [lib/db/purgeFlag.ts](lib/db/purgeFlag.ts)                                               |
| Cap-sizing harness                       | [lib/db/measure.ts](lib/db/measure.ts)                                                                                             |
| Freshness hook + component               | [hooks/db/useLocalFreshness.ts](hooks/db/useLocalFreshness.ts), [components/db/SyncFreshness.tsx](components/db/SyncFreshness.tsx) |
| Boot wiring, station purge, size monitor | [contexts/PosSyncProvider.tsx](contexts/PosSyncProvider.tsx)                                                                       |
| Env-switch purge flag                    | [lib/storage.ts](lib/storage.ts)                                                                                                   |
| Per-key boot hydration instrumentation   | [lib/storage.ts](lib/storage.ts), [lib/telemetry/keys.ts](lib/telemetry/keys.ts)                                                   |

**Three decisions worth recording, because they were not in the plan:**

1. **The env-switch purge is a flag, not a call.** `reconcileEnvironmentOnBoot()` is
   synchronous and runs at module load; deleting a SQLite file is async. A
   fire-and-forget delete from there races the first write of the _new_ environment's
   data and can take that out instead. So the switch records an intent synchronously and
   `initLocalDb()` honours it before opening anything — race-free, and it survives a crash
   in between. `lib/db/purgeFlag.ts` is a constants-only leaf so this cannot become an
   import cycle with `lib/storage.ts`.
2. **Tests run against a real SQL engine.** `__mocks__/expo-sqlite.js` is backed by
   `node:sqlite` (built into Node 22+). Everything Phase 1 has to prove is SQL behaviour —
   the retention `DELETE`, `ON DELETE CASCADE`, the immutable-id trigger, partial indexes,
   `ON CONFLICT` upserts, transaction rollback. A hand-written fake would pass all of them
   while proving none.
3. **The immutable-id trigger ships now, in Track A**, even though client-minted UUIDs are
   Phase 6. It costs nothing today and means no code written during Track A can establish
   a rekeying habit that Phase 6 would then have to unpick.

**Still outstanding before Phase 2:**

- [x] **Run the measurement pass on the lowest-spec device.** Ran 2026-08-28 on a Samsung
      SM-P613 (the fleet's low-mid tablet). Results (bytes/row incl. indexes):
      `order_items 403 · order_payments 1120 · inventory_items 795 · customers 786 ·
staff 328 · menu_items 1212`. **Orders' insert-diff reads 0 on a pre-populated
      table** (rows reuse existing pages, so `PRAGMA page_count` doesn't move); the orders
      number is the REAL payload from the mirror's actual rows — **1387 B/row over 2,000
      orders** (second run; first run's insert-diffs for the other tables are the valid
      ones, since later runs reuse those pages). Derivation: at a conservative 50 MB
      mirror budget, no table is budget-bound (per-order ≈ 3.4–3.7 KB incl. items +
      payments → orders ≈ 14k, customers ≈ 66k, inventory ≈ 66k, staff ≈ 160k), so the
      caps are **workload-derived** and stay at their
      current values — `orders 2000` ≈ 47 days at the busiest location (B1: 42.6
      orders/day), and customers 5000 / inventory 2000 / staff 500 are generously above
      real volume (18 staff, ~54 menu items on the test device). Caps flipped from
      `PROVISIONAL` to derived in [lib/db/entities.ts](lib/db/entities.ts).
- [x] Boot the app on device and confirm zero behavior change — the device ran the full
      POS boot (menu, floor plan, employees, terminals) with the local DB open and the
      delta loop live; no behavior change observed. The Phase 2 shadow runs exercised the
      same device across several boots.
- [ ] Capture the `boot.persist_parse_ms.*` ranking across the 31 persisted keys — this is
      what orders any future persistence work, and the ranking may well say "don't bother".

**Build** Add `expo-sqlite`. `lib/db/index.ts`: open, WAL, `synchronous = NORMAL`,
`foreign_keys = ON`. Full schema per §7 — **including the offline-first columns, inert** (§4.3 ①).
`lib/db/policy.ts` with `stationKind()` + `canStore()` enforced _inside the single write helper_.
Descriptor-driven retention pruned in the insert transaction. Teardown wired into
`clearCacheData()`, `reconcileEnvironmentOnBoot()` and station change. `useLocalFreshness` +
`<SyncFreshness>`. **Write nothing, read nothing.**

**Instrumentation is the real deliverable here** — it sets every number the later phases need:
bytes-per-row per table (sets the retention caps), `boot.persist_parse_ms.<key>` and
`boot.persist_bytes.<key>` for all 31 persisted MMKV keys, resident heap at boot and after a
scripted 200-order churn against the 134 MB budget, and DB file size logged beside
`getStorageSizeStats()`.

**Test** Boots with the DB created, zero behavior change. All three purge paths empty it —
including a simulated staging→prod switch, which is the one that leaks production PII onto a
staging device if it is wrong. Station policy: boot as `kds` and `self_service` → `canStore('orders')`
false on both; re-provision POS → kiosk → excluded tables dropped. Retention: insert `cap + 500`
rows → exactly `cap` survive, newest kept, `retention_floor` = oldest survivor. Schema: no PIN
column anywhere, and no write path reads `EmployeeProfile.pin`.

**Done when** the DB exists, all three purges empty it, policy and retention are enforced at the
write boundary, and every Phase 1 measurement has a number.

---

#### Phase 2 · Delta sync engine _(pull only)_ — ✅ **WIRED (flag-gated, default off)**

**Flag:** `EXPO_PUBLIC_DELTA_SYNC`

**Status: code complete, 103/103 local-DB tests green, `tsc --noEmit` clean, full suite at
its known baseline (10 pre-existing failures, unchanged).** Wired into `PosSyncProvider` via
[hooks/db/useDeltaSync.ts](hooks/db/useDeltaSync.ts) — registers the orders descriptor,
pulls on a 30 s cycle, manifest reconcile daily. Inert until the flag is set and Phase 3
read screens exist.

| Delivered                                                      | File                                                         |
| -------------------------------------------------------------- | ------------------------------------------------------------ |
| The pull cycle, manifest reconcile, cursor helpers             | [lib/db/syncEngine.ts](lib/db/syncEngine.ts)                 |
| Descriptor contract (`pullDelta` / `pullManifest` / watermark) | [lib/db/entities.ts](lib/db/entities.ts)                     |
| Orders descriptor — keyset query + row mapping                 | [lib/db/descriptors/orders.ts](lib/db/descriptors/orders.ts) |
| Realtime through the same write boundary                       | [lib/db/realtimeApply.ts](lib/db/realtimeApply.ts)           |
| Watermark now advances **inside** the write transaction        | [lib/db/write.ts](lib/db/write.ts)                           |
| A fake PostgREST that really implements keyset filtering       | [**tests**/db/fakeSupabase.ts](__tests__/db/fakeSupabase.ts) |

**Three things testing found that the plan had wrong or missing:**

1. **`TEXT PRIMARY KEY` permits NULL in SQLite.** Every primary key was nullable, and
   because NULLs are distinct in a unique index, a malformed server row could have
   inserted repeatedly as separate NULL-keyed rows. All ten single-column PKs are now
   `NOT NULL`; schema bumped to v2.
2. **Voided items must be mirrored, not filtered.** The existing `useOrdersQuery` embed
   filters `order_items.is_voided = false`. The mirror must NOT: the void _is_ the
   tombstone (§7.4), and dropping it would make a voided item silently reappear.
3. **The empty manifest needs a safety valve.** An empty id-list for a window we hold rows
   in is far more likely to be a broken query, an RLS change or a filtered response than a
   genuine mass deletion — and the cost of being wrong is wiping real history. The
   reconcile now refuses to act on it.

**Two properties worth naming, both asserted directly:**

- **The watermark never outruns the data.** The cursor is written in the same transaction
  as the rows, so a rollback leaves it where it was. Tested twice — once with a write
  failure, once with a network failure — including the recovery path.
- **Realtime never advances the cursor.** A broadcast for an order newer than the cursor
  must not move it, or every order in between is skipped forever. Asserted, along with the
  proof that the skipped range is still pulled afterwards.

**Verification results (A1 run 2026-08-28):**

**A1 FAILED — and it was the blocking one.** `public.orders` carries **30 indexes and not one
includes `updated_at`.** The nearest misses:

| Index                                                           | Why it can't serve the delta                                                           |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `idx_orders_location_created_at (location_id, created_at DESC)` | Wrong column, wrong direction                                                          |
| `idx_orders_sync (last_synced_at, sync_version)`                | Not location-leading, and `last_synced_at` is not the change clock                     |
| `idx_orders_history_bootstrap`                                  | Partial on terminal statuses — a status transition would vanish from the cursor's view |

Without an index, each 200-row page makes Postgres read **every order at the location** and
sort it — the delta would have been _more_ expensive than the full fetch it replaces.

→ Fix: [utils/supabase/migrations/sqlite_p2_orders_delta_index.sql](utils/supabase/migrations/sqlite_p2_orders_delta_index.sql)
adds `(location_id, updated_at, id)`. **Not partial** (the delta must see every status) and
**`CONCURRENTLY`**, which means it _cannot run inside a transaction block_ — Supabase's
migration runner wraps files in `BEGIN/COMMIT`, so this one runs manually.

**✅ Applied 2026-08-28 — STAGING ONLY.** Verified present on staging via `pg_indexes`.
**NOT applied to production** — verified absent there (a live A2 run shows a `Seq Scan` +
`Sort`). Applying it to prod is a prod write and is **deliberately gated on the operator**
(no prod writes without sign-off). Until it lands on prod, delta pulls against prod fall
back to a full scan per page.

**A2 run 2026-08-28 — staging: PASS. Production: BLOCKED (index absent).**

Staging run: `Index Only Scan using idx_orders_location_updated`, **no Sort node**, `Index
Cond: location_id = …`, ~0.1 ms. Two notes:

- The first sample returned **0 rows** (test location had nothing updated since the chosen
  watermark) — the plan shape, not the cost. The live run below is the cost sample.
- The `updated_at` OR predicate lands as a **Filter**, not part of the `Index Cond`. That
  means the scan starts at the location's first index entry, not at the watermark — fine at
  small history, wasteful at a location with tens of thousands of old rows. If a future live
  run at scale shows it costing real time, express the keyset as a row-value comparison
  `(updated_at, id) > (wm, id)` (RowCompare = a true seek) instead of the PostgREST OR form.

Production live run (busiest location `5afc6641-…`, 24 h window): **`Seq Scan` on `orders` +
`Sort` (quicksort)**, `Rows Removed by Filter: 4711`, 2.7 ms at ~4.8 k rows. This is exactly
the A1 failure mode — it only looks cheap because the table is small today. Re-run A2 on
prod after the index lands (operator-gated) and confirm Index Scan / no Sort.

**A3 — PASS (payments), one item-path gap.** `void_payment` and `adjust_tips_v2` both touch
the parent `orders` row (and `process_payment_v8`, `close_check`, `reopen_check`,
`cancel_order`, `send_order_to_kitchen_v1` all do too). The A4 trigger stamps the watermark
on any of those. Verified by function-body scan, not just regex, for the two flagged RPCs.

Gap found while verifying: **`remove_order_item` does NOT bump the parent order's
`updated_at`** (it hard-DELETEs the item and calls `recalculate_order_discount`, which only
touches `order_items`). `add_order_item_v3`'s non-idempotent overload has the same gap.
`update_order_item_v2` and `void_order_item` DO bump (via `calculate_order_totals_fast` /
`increment_order_sync_version`). Impact: an item removed from a long-open order stays in the
mirror until another order-touching op or settlement — active orders are read from Zustand
(§4.3 ③) and settlement bumps the order, so this is **not a Phase 2/3 blocker**, but it is a
real convergence gap for the mirror. Follow-up ticket: bump `orders.updated_at` (or call
`increment_order_sync_version`) at the end of `remove_order_item` and the non-idempotent
add path.

**A5 — 0 tied rows in 30 days on staging** (staging is low-traffic; the `(updated_at, id)`
tiebreak is still load-bearing — recheck on prod after the index lands).
**A6 — PASS**: zero missing promoted columns across `orders`, `order_items`,
`order_payments`.
**A7 — PASS**: `order_payments` has no `updated_at`/`created_at`; the parent-touch design
holds.
**A8 — PASS**: `order_items` and `order_payments` FKs are **RESTRICT** — an order with items
or payments cannot be hard-deleted, so the manifest reconcile can stay on business-day
cadence.
**A9 — PASS**: zero rows with `updated_at < created_at`.

**Sizing (Section B, production 2026-08-28) — feeds the retention caps:**

- **B1** busiest location: 42.6 orders/day → the 2000-row cap holds **~47 days** of history
  (second busiest: 22.7/day → ~88 days).
- **B2** avg 2.54 items/order, p95 7, max 17; avg 0.93 payments.
- **B3** server-side ≈ 1,457 bytes/order row (with all 30 indexes) — the local mirror is
  smaller (trimmed payload, only the indexes we build).
- **B4** peak delta churn 55 orders/min (one burst) — a single 200-row page per 30 s cycle
  is comfortably above peak.

**A1 also exposed a schema gap the column audit missed:** `order_payments.status` (the
`payment_status` enum) was never mapped. It is the _authoritative_ payment state — the remote
revenue index `idx_order_payments_fees_location_period` keys on it, not on the
`is_voided`/`is_returned`/`is_settled` booleans, which are denormalized and can disagree.
Added, along with the settlement/refund lineage columns (`terminal_id`,
`settlement_batch_id`, `parent_payment_id`, `transaction_id`, `split_portion_index`) that
Phase 6 needs and that arrive free with the row. Schema bumped to v3, and a round-trip test
now fails loudly if a descriptor ever emits a column the schema lacks — that failure mode is
otherwise silent, because the atomic write just rolls back and leaves the mirror empty.

One more find worth carrying forward: **`is_order_reportable(status, payment_status)` exists
server-side** (used by `idx_orders_reportable`). Phase 6 analytics should call that rather
than inventing its own definition of a countable order.

**A4 PASSED, better than hoped — and then exposed a worse bug than A1.**

The good news first: `update_orders_updated_at` is an **unconditional `BEFORE UPDATE FOR EACH
ROW`** trigger calling `update_updated_at_column()`. No `WHEN`, no column list — _any_ write
to an order bumps its watermark. `order_items` has the same. So the delta is **structurally
safe**, not contingent on ~90 RPCs each remembering to touch `updated_at`. That is the
strongest possible answer and it downgrades VERIFY-PAYMENT-TOUCH from a gate to a detail
(see D2).

The bad news: that trigger stamps `now()`, and **in Postgres `now()` is transaction-START
time, not commit time.** A row's watermark is assigned when its transaction begins but only
becomes visible when it commits. That loses rows permanently:

```
10:00:00.000  txn A begins, updates order X   -> X.updated_at = .000
10:00:00.100  txn B begins, updates order Y   -> Y.updated_at = .100
10:00:00.150  txn B COMMITS                     (Y visible)
10:00:00.200  delta pull sees Y, not X. Cursor -> .100
10:00:00.500  txn A COMMITS                     (X visible)
10:00:01.000  delta pull: WHERE updated_at > .100
              X is .000 — never fetched again. Gone.
```

No retry heals it: the engine correctly believes it read past that instant. The manifest
reconcile does not help either — it detects deletions, not missed updates. This is worse than
A1, because A1 was slow and visible while this is silent and permanent.

→ Fix: `WATERMARK_LAG_MS` in [lib/db/syncEngine.ts](lib/db/syncEngine.ts). The cursor settles
**5 s behind** the newest row seen, so any in-flight transaction has committed before the
cursor passes its start time. Cost is re-reading the last few seconds each cycle — free,
because upserts are idempotent and the window is tiny. Mid-backlog the exact row cursor is
still used (nothing can hide ahead of you when you are an hour behind), and the cursor never
regresses. A lagged boundary carries no tiebreak id, so `applyKeyset` switches to inclusive
`gte` there — re-reading the boundary rather than skipping it.

Verified as a real regression test, not a vacuous one: setting `WATERMARK_LAG_MS = 0` makes
`"does not skip a row that commits late with an earlier timestamp"` fail.

A4 also confirmed **`orders_broadcast_trigger_deferred` fires on `DELETE`**, so hard deletes
do reach an online device via realtime — `deleteOrderFromRealtime` is a real path, and the
manifest reconcile only has to cover the offline window.

**Shadow-compare — mechanics verified 2026-08-28 (staging device, location `8835e749-…`).**

On-device run with `EXPO_PUBLIC_DELTA_SYNC=1`. Device: Samsung SM-P613 (low-mid spec).
Findings, via the dev-only `[LocalDB][shadow]` log (count + window edges):

- **Cold sync**: mirror reached `2000` on a 4,058-order location — the retention cap, and
  `oldest` (by `created_at`) sat at 2026-05-01, i.e. the newest 2,000 rows, pruned to
  exactly cap. Retention correct.
- **Steady state**: count pinned at 2000 across subsequent cycles; no creep, no drops.
- **Live roll**: creating orders on the store bumped `newest` 13:15:31 → 13:17:05 while
  `oldest` advanced (May 1 09:22 → 09:30). One mirror reading matched the server row's
  `updated_at` **byte-for-byte** (13:15:31.887326); the next caught a new order within one
  30 s cycle. The window rolls with live activity.
- **The nested-transaction crash is gone**: all writes went through `dbWriteMutex`
  (added after the first on-device run failed with `cannot start a transaction within a
transaction`). No write errors in this run.

**Notable bug fixed on the way**: expo-sqlite does not serialize `withTransactionAsync` on
one connection. Two overlapping transactions (delta cycle + reconcile + effect re-runs)
failed every mirror write on the first on-device run. Fix: a single FIFO `Mutex`
(`dbWriteMutex` in [lib/db/write.ts](lib/db/write.ts)) around every transaction —
`writeBatch`, the manifest-reconcile delete, and the station purge.

**Still outstanding before integration:**

- [x] **Apply the delta index migration** — **staging only** (verified via `pg_indexes`).
      **Production is operator-gated: no prod writes without sign-off.**
- [x] **A2 staging** — Index Only Scan on `idx_orders_location_updated`, no Sort, ~0.1 ms.
- [ ] **A2 production** — blocked: index absent on prod → `Seq Scan` + `Sort`. Re-run after
      the operator applies the migration (and watch whether the `updated_at` Filter should
      become a RowCompare Index Cond).
- [x] **Run A3–A9** — A3 PASS (payments touch the order) + one item-path gap
      (`remove_order_item` doesn't bump the parent watermark → follow-up ticket); A5 0 ties
      (staging); A6/A7/A8/A9 PASS. Details above.
- [x] **VERIFY-PAYMENT-TOUCH** — `void_payment` ✅ and `adjust_tips_v2` ✅ both bump
      `orders.updated_at` (function-body scan).
- [x] **Section B sizing (production)** — B1–B4 recorded above; retention caps are now
      **derived** (device measurement ran 2026-08-28 — details under Phase 1).
- [ ] **`_business_day` is a naive UTC date** (`TODO(business-day-config)`). The real rule
      is per-location timezone + rollover hour. Analytics (Phase 6) is the first consumer
      that cares — wire the config before then.
- [x] **Wire the sync loop** — [hooks/db/useDeltaSync.ts](hooks/db/useDeltaSync.ts)
      registers the orders descriptor and pulls on a 30 s cycle behind
      `EXPO_PUBLIC_DELTA_SYNC`.
- [x] **Shadow-compare mechanics** — count pinned at cap, window rolls with live orders,
      mirror `updated_at` matched the server byte-for-byte; no write errors (mutex fix).
      Recorded above.
- [ ] **Shadow-compare service-period soak** — leave a staging device running through a
      full service period and confirm the same stability (count at cap, rolling, no
      errors) before the Phase 3 flag flips.

**Build** `lib/db/entities.ts` (per-entity descriptors) and `lib/db/syncEngine.ts` — the
`(watermark, watermark_id)` keyset pull cycle of §8.2, transactional apply, resumable paging,
prune-inside-insert. First descriptor: `orders`. Realtime broadcasts routed through the same
write helper so push and pull share one code path.

**Handle the three schema facts**, all verified on this branch: the **manifest reconcile** for
hard-delete detection (voids and deactivations already ride the watermark — §7.4); payments synced
as children of their parent order (`order_payments` has no `updated_at`); and PostgREST delta for
now with `get_pos_delta_v1` (`SECURITY DEFINER`) filed as a ticket — the pattern that already makes
`get_active_orders_v1` 13 ms against the 536–1108 ms embed.

**File both server tickets here**: the delta RPC above, and `deleted_at` / `sync_tombstones`.
Neither blocks this phase, and neither blocks Phase 7 either — item voids already have a real
tombstone (§7.4). Both are efficiency and completeness wins with five phases of runway.

**Test** Cold sync populates the window and the watermark advances. A second sync with no server
changes returns **zero rows and writes nothing**. Kill the app at page 3 of 9 → resumes at page 3,
no gap, no duplicate. Two rows sharing a millisecond → both land, neither loops. Hard-delete a row
server-side → still present after a delta pull (expected), gone after a manifest reconcile.
**Shadow-compare for a full service period**: mirror row IDs === server row IDs.

**Done when** delta pulls are resumable, tie-safe and idempotent, and the shadow comparison is
clean for a service period. Nothing reads the DB yet.

**Watch for** the watermark advancing past rows that failed to apply. It **must** be written
inside the same transaction as the upserts — outside it, one partial failure skips rows forever.

---

#### Phase 3 · Previous Orders _(the headline, and the selector boundary)_ — ✅ **BUILT (flag-gated, default off)**

**Flag:** `EXPO_PUBLIC_LOCAL_PREVIOUS_ORDERS` · **Page:** [previous-orders.tsx](<app/(main)/previous-orders.tsx>)

**Status: code complete — 126/126 local-DB tests green (23 new: 10 for the local query, 6 for
the query plan + summary cap, 7 for the delta nudge), no type errors in any Phase 3 file, full
suite at baseline (10 pre-existing suite failures, unchanged).** Not yet run on device behind
the flag; `previousOrdersOfflineCache` stays as fallback until proven.


| Delivered                                                                                                                  | File                                                                 |
| -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| SQL emitter beside `buildHistoryOrderQuery` (one source of filter truth) + page query                                      | [lib/db/historyQuery.ts](lib/db/historyQuery.ts)                     |
| Local-first resolution + the resolution rule (default paging local-only / filtered server-corrected / offline local+scope) | [stores/usePreviousOrdersStore.ts](stores/usePreviousOrdersStore.ts) |
| Scope line + honest empty state when the source is the local window                                                        | [previous-orders.tsx](<app/(main)/previous-orders.tsx>)              |
| Dedicated read connection, so screen reads never queue behind a delta write                                                | [lib/db/index.ts](lib/db/index.ts)                                   |
| Realtime → "pull now" nudge, so a just-created order lands in ~1.2 s instead of ≤30 s                                      | [lib/db/deltaNudge.ts](lib/db/deltaNudge.ts)                         |

The local page rows are rebuilt from the mirror's verbatim `payload`s into `FetchedOrderData`
and run through the **same** `_transformFetchedOrder` as the server path — rendering cannot
diverge between sources. `delivery_platform` is not a promoted column, so provider/search
filter on it read `json_extract(payload, '$.delivery_platform')`.

**Window: 20,000 orders** (raised 2026-08-28) ≈ 15 months at the busiest location, ~69 MB
of data / ~80 MB on disk worst case. **Backfill on a cap raise is automatic:**
`sync_state.retention_cap` records the cap at last sync, and `syncEntity` resets the cursor
once when the configured cap exceeds it (no server call, fires exactly once). Completeness
beyond the window is handled by the resolution rule below — the cap is the **offline**
coverage bound, not the correctness bound.

**Build** Repoint list, pagination, search and filters at SQL.
`services/historyOrderFilters.ts` already models filters declaratively via
`buildHistoryOrderQuery` — add a SQL emitter beside the PostgREST one so there stays exactly one
source of filter truth. Keep `previousOrdersOfflineCache` untouched as fallback; delete it only
once this is proven.

**This phase also builds the selector boundary** (§4.3 ③) — `useOrders(filter)` owns the
live-vs-settled rule so screens never encode it. Do this here, at the first page, not at the
twelfth.

**The resolution rule — local-first, server-corrected, never a silent miss.** `useOrders(filter)`
returns `{ rows, source: "local" | "server" | "offline-local", scopeHint }` and applies:

- **Default / recent-history paging** → local SQLite. Zero round trips (the headline win).
- **Filtered / searched query, ONLINE** → local renders instantly (first paint), then the
  server resolves the same query and its result **replaces** the local one. The server is
  authoritative for correctness: a search for an order outside the 20k window still returns
  it. No false negatives — an online search is never shown empty on the strength of local
  data alone.
- **Filtered / searched query, OFFLINE** → local window, with a visible scope line:
  _"showing data through <date>; older data needs a connection"_ — never a bare empty state.
- **Any local page that reaches the retention boundary while online** → the server's
  corresponding page fills the gap.

**Test** Enter offline → rows render with `Offline — showing data from …`. Page forward and back
offline → **works**, which it does not today. Search offline hits the whole retained window, not
one page. **Search online for an order outside the local window → returned (server fallback).**
A refund on another station appears within one revalidation cycle.

**Test the cost, not just the answer** (added by the review below, after the partial-index
find): `EXPLAIN QUERY PLAN` on the page and the count must name the index and show no temp
b-tree. Result-correctness tests cannot see a missing index — ten of them didn't.

**Done when** entry paints with no skeleton, paging costs **zero** round trips, offline
pagination works, and no online query can return an empty result that a server query would
have filled.

**Watch for** the seam where the old bug lived: orders that exist locally but not on the server
must render from Zustand with the existing `_offlineUnsynced` badge
(`usePreviousOrdersStore.ts:807`) — never from SQLite. And the false-negative trap: an online
search that returns nothing locally must resolve against the server before showing an empty
state.

---

### Phase 3 review — post-build pass, 2026-08-28

Six changes after re-reading the built code. The filter-parity work held up: the `neq`/NULL
mirroring and the shared `_transformFetchedOrder` are the two things that would have bitten
later, and both are right. What follows is what the first pass got wrong.

**① The index was Phase 3's own A1 — and the ten green tests did not notice.**

The schema shipped `idx_o_loc_created ... WHERE voided_at IS NULL`. **Partial.** SQLite uses a
partial index only when the query's WHERE provably implies its predicate, and Previous Orders
never mentions `voided_at` — it cannot, the Voided tab exists. So the index built for this
query was unusable **by this query**, and every page, every `COUNT(*)` and every summary fell
back to `idx_o_updated`'s location prefix plus a full sort of the location's window. Invisible
at 43 orders/day (B1); a full sort of 20,000 rows per page turn at the retention cap.

Exactly the A1 failure mode, on the local side: correct results say nothing about cost, and
cost is invisible until the mirror is full.

→ `idx_o_loc_created_v2 (location_id, created_at DESC, id ASC)`, not partial, covering the
default `ORDER BY` term for term — index scan, no temp b-tree. The old name is dropped
explicitly (`CREATE IF NOT EXISTS` cannot redefine an index that already exists), and no schema
version bump is needed because `SCHEMA_STATEMENTS` re-run on every open — a bump would have
dropped and re-pulled 20k rows on every device to add one index.

Verified as a real regression test, not a vacuous one: restoring the partial index makes the
plan test report `SEARCH o USING INDEX idx_o_updated | USE TEMP B-TREE FOR ORDER BY` and fail.
The test asserts against the SQL that **ships** — `buildHistoryPageStatements` is exported for
that reason, because a test that rebuilds its own `SELECT` keeps passing after the real one
stops using an index.

**② Reads were serialized behind writes for no reason.** All three read paths took
`dbWriteMutex`. That mutex exists because expo-sqlite will not serialize `withTransactionAsync`
on one connection — a **writer** constraint (Phase 2's nested-transaction crash). Under WAL a
reader on a *separate* connection never blocks on a writer and never sees a half-applied
transaction, so a page turn was queueing behind whatever batch the delta happened to be
writing — the exact latency this phase exists to remove.

→ `getReadDb()` ([lib/db/index.ts](lib/db/index.ts)) opens a second connection
(`useNewConnection: true`) after the schema exists; `runOnRead()` in the query module takes the
mutex **only** when that open failed and reads share the write handle. Correct either way, only
slower in the fallback. The reader closes before `destroyLocalDb()` deletes the file — a second
open handle makes the delete fail on Android, and a purge that silently fails is the one
failure mode that path exists to prevent.

**③ The summary projection was unbounded.** `queryLocalHistorySummaries` selected *every* row
in the window on every refresh to produce a handful of tab counts. Fine for "today"; a
month-wide window at the 20k cap marshals the whole window across the bridge. Now capped at
`HISTORY_SUMMARY_CAP = 5000` with a `truncated` flag — the same number, the same newest-first
order and the same truncation semantics as the server projection it mirrors.

**④ Filtered paging cost a round trip per page.** `refresh()` already knew how to prove the
mirror current (freshness + the count/`updated_at` signature probe); `goToPage` did not, and
forced the server on any non-default filter. Both now share **`canTrustMirror`**, so entry and
paging can never disagree about when the mirror is authoritative, and its verdict is cached for
15 s — under the 30 s delta cycle — so paging through a search costs at most one probe instead
of one fetch per page. The correctness boundary does not move: anything reaching past the
retained window still goes to the server.

**⑤ The scope line was not honest.** It read _"showing the most recent {totalMatchingCount}
orders"_ — but that count is *matches for the current filter in the current window*, so under a
status filter it claimed "the most recent 3 orders" while the device held thousands. It now
reads the mirror's `retention_floor` via `getOrdersMirrorState()`: _"showing orders stored on
this device, back to Mar 14, 2026"_ — the promised "data through &lt;date&gt;", and the number
that actually describes offline coverage.

**⑥ A created order was not fully in the mirror for up to 30 s** _(reported from the floor,
root-caused here)_.

Two paths, one symptom. An order created on **this** station arrives as an own-echo broadcast,
and the mirror write is deliberately skipped for echoes (`_layout.tsx`) — so nothing writes it
locally until the next cycle. An order from **another** station *is* written by
`applyOrdersFromRealtimeIfNew`, but from a **trimmed** broadcast payload with no `order_items`
embed — so it renders item-less until the delta re-fetches it. Both wait on the 30 s tick.

→ [lib/db/deltaNudge.ts](lib/db/deltaNudge.ts): the realtime handler says "pull now", the delta
does the fetching. Fixed by pulling **sooner**, not by writing more from the broadcast — the
delta is the correctness path and already knows how to fetch a complete row with its embed.
Debounced 1.2 s, so a burst of twenty broadcasts is one pull.

**With a hard 5 s max-wait, which is the part that matters.** A pure trailing debounce
**starves** under sustained traffic: peak measured churn is 55 orders/min (B4) — broadcasts
closer together than the debounce window — so every nudge would reschedule the last one and the
pull would never fire. That is the 30 s wait again, with extra steps. Asserted directly: 30
broadcasts at 1 s intervals must produce ≥ 4 pulls and < 10.

The nudge also fires listeners **synchronously**, ahead of the debounced pull, and
`usePreviousOrdersStore` registers `invalidateMirrorTrust` on it. Invalidation cannot be
debounced: a cached "the mirror is current" verdict has to die the instant we learn the backend
moved, or ④ would hide a just-created order behind a verdict issued seconds before it existed.
The two halves of that are asserted as separate tests.

**⑦ The cold-sync banner got a real percentage** _(added 2026-08-30)_.

"Syncing order history for the first time…" was honest but unbounded — on a
4,600-order location it sat there for minutes with no way to tell a slow sync from a stuck one.
It now reads _"Syncing order history — 42% · 1,900 / 4,600"_ with a bar, via
[components/db/SyncProgressBanner.tsx](components/db/SyncProgressBanner.tsx) on both Previous
Orders and the order-entry section.

Three things the denominator had to get right:

- **It counts rows PENDING FROM THE CURSOR, not rows at the location.** The obvious shortcut is
  wrong in exactly the case that matters — a cold sync interrupted and resumed picks up at its
  watermark, so a whole-location count would start the bar partway and finish it early.
  `EntityDescriptor.countPending` reuses the descriptor's own keyset filter, so it counts exactly
  the rows the loop is about to walk.
- **It is opt-in per call, and steady state does not pay for it.** The count is a round trip;
  running it on every 30 s tick all shift, to describe a sync that finishes in one near-empty
  page, would make the feature net negative. `useDeltaSync` passes `onProgress` only while
  `hasCompletedCycle` is false. Asserted: with progress off the cycle costs exactly one request,
  with it on, exactly two.
- **Rows received, not rows stored, and the denominator can only be revised UP.** Retention prunes
  the mirror to 20,000 while a cold sync legitimately walks every order the location has, so a bar
  driven by row count would stick at 100% for the rest of the backlog. And `count: "estimated"`
  can undershoot — clamping `total` to at least `received` is what stops the bar reading 112%.

A null total renders an indeterminate sweep, never `0%`: "we cannot count" and "no progress" are
different statements, and only one of them is true. No spinner either — this screen's loading
language is a bar (`LoadingBar`, previous-orders.tsx), and a progress strip is the last place to
break it.

**Deliberately not done — both are real, neither is a fast fix:**

- **`useOrders(filter)` was never built.** This phase claims the selector boundary (§4.3 ③) as
  a deliverable — "do this here, at the first page, not at the twelfth" — but `grep` finds no
  `useOrders` and no `scopeHint` anywhere. The live-vs-settled rule still lives in ~240 lines of
  `useMemo` in [previous-orders.tsx](<app/(main)/previous-orders.tsx>) (`offlineLiveOrders` /
  `liveOpenById` / `historyMinusLive`). Phase 5 copies that seven times unless it moves first.
  Moving it is a refactor of working, untested UI and wants a device run, not a fast pass.
  **Decide before Phase 5 starts, not during.**
- **`ilike` vs `LIKE`.** ✅ **CLOSED in Phase 4** (it rode that phase's schema bump, as filed).
  SQLite's `LIKE` is case-insensitive for **ASCII only**; Postgres `ilike` is not, so a search for
  "josé" matched online and missed offline. `LOWER` and `COLLATE NOCASE` are ASCII-only too, so
  the fold has to happen in JS on the way in: `orders._search_customer_name` holds
  `toLocaleLowerCase()` of the name (`caseFold()` in
  [descriptors/orders.ts](lib/db/descriptors/orders.ts)), and the search matches it against the
  folded term. `customer_name` keeps its own arm so an older row still matches on ASCII.

**Still outstanding for Phase 3** (unchanged by this pass): the on-device run behind the flag,
and the service-period soak before `previousOrdersOfflineCache` can be deleted.

---

#### Phase 4 · Menu _(retires two caches, fixes a P1)_ — ✅ **BUILT (flag-gated, default off)**

**Flag:** `EXPO_PUBLIC_LOCAL_MENU` · **Pages:** [menu/](<app/(main)/menu/>),
[order-processing.tsx](<app/(main)/order-processing.tsx>), kiosk ordering

**Status: code complete — 151/151 local-DB tests green (24 new), `tsc --noEmit` clean, ESLint
clean, full suite at its known baseline (10 pre-existing suite failures / 30 tests, measured
before and after and identical). Not yet run on device behind the flag; `menuOfflineCache` and
`menuLibraryCache` both stay in place until the mirror has soaked.**

| Delivered                                                             | File                                                                     |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Schema v7 — `menus` root, `menu_bootstrap` envelope, location-leading composite keys | [lib/db/schema.ts](lib/db/schema.ts)                                     |
| Payload → rows → payload, and the image strip                         | [lib/db/descriptors/menu.ts](lib/db/descriptors/menu.ts)                 |
| Wholesale replace inside the write transaction (`EntityBatch.replaceScope`) | [lib/db/write.ts](lib/db/write.ts)                                       |
| Composite `ON CONFLICT` targets (`TABLE_CONFLICT_KEYS`)               | [lib/db/schema.ts](lib/db/schema.ts), [lib/db/write.ts](lib/db/write.ts) |
| Snapshot entity semantics (no `pullDelta`, version as watermark)      | [lib/db/entities.ts](lib/db/entities.ts)                                 |
| Boot hydrate from the mirror, MMKV as fallback; write + freshness stamp at the `usePosSync` seam | [contexts/PosSyncProvider.tsx](contexts/PosSyncProvider.tsx)             |
| Banner reads local freshness                                          | [components/menu/MenuStaleBanner.tsx](components/menu/MenuStaleBanner.tsx) |
| Case-folded search column (the Phase 3 `ilike` carry-over)            | [lib/db/descriptors/orders.ts](lib/db/descriptors/orders.ts), [lib/db/historyQuery.ts](lib/db/historyQuery.ts) |

**Four decisions worth recording, because none of them were in the plan:**

**① The menu is a SNAPSHOT entity, and it stays out of the 30 s delta loop.**

Every other mirrored entity has a per-row change clock. The menu does not and cannot: effective
price and availability are resolved server-side out of five override tables, so "which rows
changed since X" is not a question the remote schema can answer without re-implementing price
resolution on the device — the one thing §7 rules out forever. `get_pos_bootstrap_v1` therefore
returns the whole tree behind one opaque `version` token, and `watermarkColumn` is that token
rather than a column.

That leaves the cadence question, and the answer is: **don't add one.** Giving the menu a
`pullDelta` would have put a full bootstrap fetch on the 30 s tick — the exact 536–1108 ms
payload Phase 2 exists to stop fetching — _in addition to_ the one `usePosSync` already makes.
So the mirror is written at the existing seam in `PosSyncProvider`, where the payload has
already arrived: one fetch, one cadence, no duplicated round trip. `syncableEntities()` filters
on `typeof pullDelta === "function"`, so leaving it off is all it takes.

**② The keys are location-leading, and a test found that the hard way.**

The first cut keyed `menus` on `id` alone. It passed the round trip, the replace, the images and
the policy — and then failed "only clears the location it is replacing", because a global
merchant-wide menu has the **same id at every location** and is **resolved differently at each**
(`price_levels.level_5_location_menu`). One location's write overwrote the other's row, and the
next resync left the surviving location holding the wrong prices under the right id. Correct-
looking data, wrong money — and invisible until someone switches stores.

Same class one level down: `menu_categories.id` and `menu_items.id` are the remote **junction**
ids, unique per (menu, category) and (category, item) but **not per menu**. A global category in
two menus produces the same `category_items.id` twice; keying on it alone drops every menu's
items but the last. Hence `(location_id, id)` and `(location_id, menu_id, id)`.

Neither is expressible with the old upsert, which hardcoded `ON CONFLICT(cols[0])` — so
`TABLE_CONFLICT_KEYS` now declares the target beside the DDL, and `upsertRow` excludes every key
column from the `SET`. A schema test fails the build if a composite-PK table is missing from it,
because the failure mode otherwise is silent: SQLite raises a constraint error, the write
boundary swallows it into a rolled-back batch, and it surfaces as "the mirror is empty".

**③ An upsert cannot express a deletion, so the batch had to grow one.**

An item taken off the menu simply has no row in the next payload. Retention can't help — a menu
is bounded by its own size, not by time, which is why its cap is `null`. So `EntityBatch` gained
`replaceScope`: tables cleared for the location **inside the same transaction as the insert**, so
a failed sync can never leave a location holding nothing (an empty grid being the exact P1 this
phase removes). It is deliberately opt-in and documented as illegal for keyset-delta entities —
a page is a fragment, and clearing the location would wipe the history the fragment extends. The
replace scope is checked against station policy too: a `DELETE` against a table this station may
not hold is as much a violation as a write.

**④ The banner reads local freshness for its STAMP, not for its trigger.**

The plan says "`MenuStaleBanner` reads local freshness" and, separately, "tight `staleAfterMs`,
loud banner". Those two pull against each other once you wire them: `staleAfterMs` is 2 minutes
and `usePosSync` is `staleTime: Infinity` with no polling, so a freshness-triggered banner would
be amber on every station within two minutes of boot, permanently — and a banner that is always
up is one nobody reads.

So the trigger stays `isFromCache || isError` (the two states that genuinely mean "this may not
be current"), and freshness supplies what it is actually good for: a **durable** stamp of the
last live _confirmation_ — including the version-unchanged path, where nothing is rewritten but
the server did confirm the menu — plus the honest offline case, which now says "no connection,
last confirmed at 2:45 PM" instead of implying a sync is on its way. `syncState.lastSyncedAt` is
an in-memory copy of whatever payload hydrated the store and on a cache boot is the snapshot's
own age; the mirror's `sync_state` row survives a relaunch.

**The revalidation gap this exposed, stated plainly.** `usePosSync` never refetches while it
holds data. `useMenuSnoozeReconcile` polls 86 state every 60 s, so availability stays live — but
**a price edited on the website mid-service does not reach a running POS until restart.** That
is a pre-existing bug, not one this phase introduces, and fixing it means giving `pos_sync` a
revalidation cadence (or a cheap version-only probe RPC, which does not exist yet). Filed rather
than done, because it is a change to the online path and Phase 4 is about the offline one.

**Build** Mirror the `get_pos_bootstrap_v1` payload into real tables. Image `file://` paths from
`services/menuImageCache.ts` — **never base64**. `MenuStaleBanner` reads local freshness. Delete
`stores/menuOfflineCache.ts` **and** `stores/menuLibraryCache.ts` after a clean week — that closes
the three-copies-of-the-menu duplication.

**Test** Boot offline → full menu, correct prices, correct 86 state. Snooze an item on another
station → reflected after revalidation. **`todo.md`'s P1 becomes unreproducible:** burn all three
`usePosSync` retries at boot and confirm the grid still paints instead of showing "No Menu
Available".

**Done when** the menu grid paints on the first frame every launch, online or off, and both caches
are deleted.

**Watch for** **prices.** A stale menu rings up yesterday's prices. Tight `staleAfterMs`, loud
banner.

**⑤ Two boot-path holes the tests found, both silent.**

Neither would have crashed, which is what makes them worth recording — both leave the flag
looking like it works while the mirror does nothing.

- **The DB-open race.** `initLocalDb()` is kicked off from a *sibling* effect in the same commit,
  so an `isLocalDbReady()` check at the top of a read or write loses the race at every cold boot:
  the read falls back to MMKV, the write is skipped, and the mirror stays empty. Every entry point
  now `await`s `initLocalDb()` (idempotent, shares its in-flight promise) instead of asking
  whether it happens to be open.
- **The flag-flip hole.** On the first boot after `EXPO_PUBLIC_LOCAL_MENU` is set, the store
  hydrates from MMKV, the live sync returns the *same* version, and the caller takes the
  version-unchanged skip path. Stamping freshness there and returning leaves the mirror empty
  **forever** — the version never changes again, so the skip path is the only one that ever runs.
  `touchMenuFreshness` now checks whether the mirror actually holds that version and writes it in
  full when it does not.

**What the tests actually assert** ([**tests**/db/menuMirror.test.ts](__tests__/db/menuMirror.test.ts),
against a real SQL engine): the round trip is exact (`readMenuSnapshot` deep-equals the payload
that was written — which is what makes "one transform, no drift" true rather than intended);
source order survives a null/tied `display_order` via `_ordinal`; the read opens the database
itself rather than assuming it is open; two locations' resolutions of the same menu id stay apart,
each with its own price; one category in two menus keeps both appearances and both prices; a
discontinued item disappears; an empty payload is refused rather than replacing a good snapshot;
no base64 reaches any menu table; a kiosk may hold the menu and a KDS may not, replace scope
included; the version lands as the watermark, the stamp advances without touching a row, and the
mirror is rewritten in full when it holds a different version or none; the three boot reads are
index scans with no temp b-tree; and `effective_price` promotes to exact minor units while the
server's value survives verbatim in `payload`.

Three of those are **verified as real regression tests, not vacuous ones** — each guard was
removed and the test confirmed to fail:

| Remove                                          | What fails                                     |
| ------------------------------------------------ | ---------------------------------------------- |
| `location_id` from the menu conflict keys       | the cross-location and composite-key cases     |
| the `_search_customer_name` arm from the search | the accented search — every ASCII case still passes, which is exactly why the bug survived ten green tests in Phase 3 |
| `idx_mi_menu`                                   | the query-plan case                            |

**Still outstanding for Phase 4:**

- [ ] **Run it on device behind the flag.** Cold boot with the radio off and confirm the grid
      paints from SQLite (the hydrate log reports `source` and `hydrateMs` — compare against the
      MMKV path with the flag off, which is the number that decides whether the mirror is
      actually the better boot).
- [ ] **The P1 reproduction:** burn every `usePosSync` retry at boot and confirm the grid paints
      instead of "No Menu Available".
- [ ] **Prices side by side.** A full menu rendered from the mirror against the same menu
      rendered live — the round-trip test proves the payload survives, not that the resolved
      prices on screen match, and this is the phase's "watch for".
- [ ] **A service-period soak** before either MMKV cache is deleted. `menuOfflineCache` and
      `menuLibraryCache` are both untouched, so rollback is unsetting the flag.
- [ ] **File the price-revalidation ticket** (④ above): `pos_sync` never refetches while it holds
      data, so a website price edit does not reach a running POS until restart.
- [ ] **Re-derive `menu_items` bytes/row.** The Phase 1 measurement predates this schema (rows
      now carry the whole junction entry including nested modifier groups), so the 1212 B/row
      figure is stale. The menu is uncapped, so this is a budget input, not a cap input.

---

#### Phase 5 · The remaining read pages

**Build** Same pattern per page, one flag and one service period each. By now this is repetition,
which is why they share a phase — but each still ships and soaks independently.

| Page                                                                                                                                     | Flag                  | Today                              | Watch for                                                                                                                                                                                                                                                                                                                              |
| ---------------------------------------------------------------------------------------------------------------------------------------- | --------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [inventory/](<app/(main)/inventory/>) — ✅ **BUILT (flag-gated, default off)**                                                            | `…_LOCAL_INVENTORY`   | 28 `.from()`, rebuilt every launch | Stock is time-sensitive — `staleAfterMs: 60_000`, not 5 min. Drop the redundant `.from("inventory_items")` at `useInventorySync.ts:57` once delta is trusted                                                                                                                                                                           |
| [analytics.tsx](<app/(main)/analytics.tsx>) — ✅ **BUILT (flag-gated, default off)** · EOD deferred                                        | `…_LOCAL_ANALYTICS`   | 13 `.from()`, **dead offline**     | **Numbers must match the server dashboard exactly** — run side by side before flipping. Past `retention_floor`, say so: _"Showing the last N orders. Older data needs a connection."_ Never silently under-report revenue. EOD preview must match server settlement on **ten consecutive real close-outs**; server stays authoritative |
| Customer directory — ✅ **BUILT (flag-gated, default off)**. NOT `customers-list.tsx`, which is a stub; see the build notes                | `…_LOCAL_CUSTOMERS`   | ~~Debounced network type-ahead~~ **200-row MMKV cache, filtered in JS** | Start with `LIKE`; add FTS5 only if measurement demands it                                                                                                                                                                                                                                                                             |
| [loyalty/](<app/(main)/loyalty/>)                                                                                                        | `…_LOCAL_LOYALTY`     | 15 `.from()`                       | —                                                                                                                                                                                                                                                                                                                                      |
| Staff roster — [scheduling/](<app/(main)/scheduling/>), [open-shifts.tsx](<app/(main)/open-shifts.tsx>), [pto.tsx](<app/(main)/pto.tsx>) | `…_LOCAL_STAFF`       | Network-only rosters               | **Read-only consumers only.** `useEmployeeStore` keeps login, session and PINs. If a change starts touching `pin-login.tsx`, stop — different ticket                                                                                                                                                                                   |
| [online-orders/](<app/(main)/online-orders/>)                                                                                            | `…_LOCAL_BOARDS`      | Board refetched on entry           | Double-render between the local row and the realtime row — key strictly on order id. Preserve `placed_at` business-day scoping (commit `82eb80e7`)                                                                                                                                                                                     |
| [kds.tsx](<app/(main)/kds.tsx>) history                                                                                                  | `…_LOCAL_KDS_HISTORY` | 50-ticket cap, 1 h window          | Retires `KDS_DONE_TICKET_LIMIT` and `_recalledTicketIds` (the persisted, TTL-less Set flagged HIGH in `memory-state-audit.md`)                                                                                                                                                                                                         |

**Done when** every read page paints from disk and works offline.

---

### Phase 5 · Inventory — build notes, 2026-08-30

**Status: code complete — 204/204 local-DB and gate tests green (45 new), `tsc --noEmit` clean,
ESLint clean on every touched file, full suite at its known baseline (10 pre-existing suite
failures / 30 tests, measured before and after and identical). Not yet run on device behind the
flag.**

| Delivered                                                                          | File                                                                                     |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Schema v8 — `_ordinal` and location-leading composite keys on `inventory_items` / `vendors` | [lib/db/schema.ts](lib/db/schema.ts)                                                     |
| The ONE sync transform, shared by the live path, the store and the mirror           | [lib/inventory/inventorySyncPayload.ts](lib/inventory/inventorySyncPayload.ts)            |
| Raw rows → rows → raw rows, and the wholesale replace                               | [lib/db/descriptors/inventory.ts](lib/db/descriptors/inventory.ts)                        |
| Snapshot entity semantics (no `pullDelta`, uncapped retention)                      | [lib/db/entities.ts](lib/db/entities.ts)                                                  |
| Entry hydrate from the mirror + write at the existing sync seam                     | [app/(main)/inventory/\_layout.tsx](<app/(main)/inventory/_layout.tsx>)                   |
| Banner reads local freshness and states that writes are unavailable                 | [components/inventory/InventoryStaleBanner.tsx](components/inventory/InventoryStaleBanner.tsx) |
| The offline write gate — one choke point in the store                               | [stores/useInventoryStore.ts](stores/useInventoryStore.ts)                                |
| Button-level gate so the refusal precedes the work                                  | [hooks/inventory/useInventoryWriteGate.ts](hooks/inventory/useInventoryWriteGate.ts)      |

**Five decisions worth recording.**

**① WRITES STAY ONLINE-ONLY, and this is the phase's headline policy, not a limitation.**

Inventory is the first mirrored section that has writes on it, so Track A's read/write boundary
stops being theoretical here. Every one of the 15 mutating actions is refused while the device is
offline. Two reasons, and the second is the one that settles it:

- Identity is minted server-side (`add_order_item`-style RPCs, plain table inserts), which is
  exactly the instability §1 blames for the last local-first attempt being reverted.
- **Stock movements are not idempotent.** A queued "received 12 cases" replayed after a reconnect
  double-counts, and unlike a duplicated order there is no receipt anyone will ever compare it
  against. Silently wrong inventory is worse than a blocked button.

Offline stock counts and receiving are the thing staff will actually ask for, and they belong in
**Track B (Phase 7+)** where the outbox can make them safe. Filed, not built.

The gate is enforced at **one choke point in the store**, for the same reason `lib/db/write.ts`
checks station policy at one: a call site that forgets is then impossible rather than merely
unlikely — there are ~20 of them across 10 screens. `useInventoryWriteGate` disables the primary
controls so the refusal arrives before a purchase order is filled in, which is the actual UX
change; the writes already failed offline, just late and with the wrong reason.

**It refuses by THROWING, and that detail is load-bearing.** The purchase-order screens are built
around `await action(); showSuccess()` with a `catch`. A gate that returned quietly would slot in
above that and produce a green "Payment logged" for a payment that never happened — strictly
worse than the raw network error it replaced. Throwing leaves every existing handler behaving as
it does today and only improves the reason.

**Nothing in the UI writes the mirror.** It is only ever written from a server payload, so it
cannot drift from the server while Track A owns it, and rollback is unsetting the flag.

**② Inventory is a SNAPSHOT entity, and `updated_at` is the trap.**

`inventory_items` carries an `updated_at`, so a keyset delta would run happily — and mirror the
wrong thing. Stock resolves out of `location_inventory_stock`, and effective cost and reorder
point out of `location_inventory_overrides`, both per location; `get_pos_inventory_sync` is what
joins them. A delta would clone the merchant-level row and miss every per-location resolution: a
catalog that looks right and reports the wrong stock, which is worse than one that is visibly
missing. Re-implementing the resolution on-device is the second-source-of-truth §7 rules out
forever.

So there is no `pullDelta`, `syncableEntities()` skips it, and the mirror is written at the
existing `useInventorySync` seam in the section layout — one fetch, one cadence, no duplicated
round trip. Same shape as the menu, reached from a different direction.

**③ The mirror stores the RAW WIRE ROWS, not a mapped catalog.**

`payload` holds `{rpc, row}` per item and the selected vendor row per vendor, and the read
rebuilds those inputs and runs `mapInventorySyncPayload` — the same function the live sync runs.
That turns "offline shows what online shows" into "the inputs round-trip", which is a property a
test asserts rather than an intention two mapping copies have to keep agreeing on.

It also found an existing duplication: that mapping was written twice, character for character,
in `useInventorySync` and `useInventoryStore.fetchInventoryItems`, so the catalog could resolve
differently depending on which path happened to populate it. Both now call the shared function.

**④ The keys are location-leading, applied from the Phase 4 lesson rather than after it.**

Stock and cost are resolved per location, so the same item id means different numbers at
different stores. Today's selects filter on `location_id`, so only location-owned rows arrive and
a single-column key would *happen* to work — which is precisely what silently broke on `menus`
when a device switched stores. `PRIMARY KEY (location_id, id)` on both tables, registered in
`TABLE_CONFLICT_KEYS`, and a test that fails if two locations' resolutions of one item collapse.

**⑤ The retention cap was REMOVED, not tuned.**

The plan derived 2,000 rows for inventory from the Phase 1 measurement. That is incompatible with
a wholesale replace: the pull returns the complete catalog every time, so pruning would delete
rows the payload still contains and leave the mirror permanently disagreeing with the server
about which items exist. `maxRows: null`, exactly as the menu concluded — a replaced entity is
bounded by its own size, not by time. At ~795 B/row even 2,000 items is ~1.6 MB, so the cap was
never the binding constraint.

**One online-path change, stated plainly.** `useInventorySync` gains `refetchOnMount: "always"`.
With `staleTime: Infinity` and no polling, the catalog was a session-long cache — open Inventory
an hour into service and you were reading boot-time stock, and the 60 s `staleAfterMs` would have
made the freshness stamp permanently meaningless (the Phase 4 ④ trap). Refetching on entry is the
smallest cadence that makes the numbers current where someone is actually looking at them. It is
a change to the ONLINE path, which Phase 4 deliberately deferred for the menu; it is taken here
because "stock is time-sensitive" is this page's stated watch-for and the fix is one line scoped
to one query.

**What the tests assert** ([**tests**/db/inventoryMirror.test.ts](__tests__/db/inventoryMirror.test.ts)
and [**tests**/inventory/inventoryWriteGate.test.ts](__tests__/inventory/inventoryWriteGate.test.ts),
against a real SQL engine): the raw round trip is exact; the mirror maps through the same function
as the live path; RPC-resolved items stay ahead of direct-only ones; an RPC row with no direct row
is dropped and a direct row with no RPC row survives unresolved; a discontinued item and a removed
vendor both disappear; an empty payload is refused rather than replacing a good catalog; a replace
clears only its own location; two locations' resolutions of one item stay apart; a kiosk and a KDS
may not hold the catalog, replace scope included; cost promotes to exact minor units while the
server value survives verbatim; the promoted `current_stock` is the per-location resolved number
the screen shows; the catalog is uncapped; the stamp and watermark land; both reads are index scans
with no temp b-tree; the read opens the database itself rather than assuming it is open; all 15
mutations are refused offline, refused *before* Supabase is touched, and refused by throwing; and
the sale-driven stock decrement is deliberately NOT gated.

Three guards were verified as real regression tests by removing them and confirming failure:

| Remove                                    | What fails                                                    |
| ----------------------------------------- | ------------------------------------------------------------- |
| `location_id` from the inventory conflict keys | the whole suite — the constraint error rolls back every batch |
| `replaceScope`                            | both deletion cases and the policy-scope case                 |
| `idx_ii_ord`                              | the query-plan case                                           |

**Still outstanding for inventory:**

- [ ] **Run it on device behind the flag.** Cold-enter the section with the radio off and confirm
      the catalog paints from SQLite (the read log reports item/vendor counts and `ms`).
- [ ] **Stock side by side.** The mirror against the same catalog rendered live — the round-trip
      test proves the inputs survive, not that the resolved stock on screen matches.
- [ ] **Confirm the write gate on a real tablet**, including the mid-tap race: go offline with a
      PO detail screen open and confirm the failure reads "You're offline", not "Success".
- [ ] **A service-period soak** before anything is deleted.
- [ ] Drop the redundant `.from("inventory_items")` — still load-bearing today (it is the row
      universe, not a redundancy, so this needs the RPC to return inactive-at-location rows first).

**Remaining Phase 5 pages** — EOD, loyalty, staff roster, online-orders boards, KDS history —
are unstarted. Each still ships and soaks independently.

---

### Phase 5 · Analytics — build notes, 2026-08-31

**Status: code complete — 22 new tests, 206/206 local-DB tests green, `tsc --noEmit` clean,
ESLint clean on every touched file (0 errors), full suite at its known baseline (10 pre-existing
suite failures / 30 tests, measured by stashing the change and re-running: identical before and
after; total tests 2058 → 2080). Not yet run on device behind the flag, and the side-by-side
against the server dashboard has not been done.**

**The reason this page was cheap: it needed almost no new mirroring.** Orders, `order_items` and
`order_payments` have been on disk since Phase 3, and 11 of the page's 13 `.from()` calls read
nothing else. This phase is therefore mostly a SQL emitter plus the honesty machinery around
what it cannot answer — no new entity, no new delta, no change to the sync loop.

| Delivered                                                                       | File                                                                             |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Schema v9 — `order_payments.total_amount_minor`, `order_items.price_paid_minor`, `idx_op_loc_initiated` | [lib/db/schema.ts](lib/db/schema.ts)                       |
| Both promoted columns mapped on the way in                                       | [lib/db/descriptors/orders.ts](lib/db/descriptors/orders.ts)                      |
| The server path's reductions, extracted as pure functions                        | [lib/analytics/summarize.ts](lib/analytics/summarize.ts)                          |
| The SQL aggregate — orders, payments, items, customers, staff                    | [lib/db/analyticsQuery.ts](lib/db/analyticsQuery.ts)                              |
| Flag branch, retention-floor fallback, sessions top-up, staff-name resolution     | [stores/useAnalyticsStore.ts](stores/useAnalyticsStore.ts)                        |
| Null-sessions stat cards + the coverage banner                                    | [app/(main)/analytics/analytics-dashboard.tsx](<app/(main)/analytics/analytics-dashboard.tsx>) |
| The Main Menu tile stays live offline, gated on the same flag                     | [components/MainMenu.tsx](components/MainMenu.tsx)                               |

**Six decisions worth recording.**

**① "NUMBERS MUST MATCH THE SERVER DASHBOARD EXACTLY" IS NOW A TEST, NOT A SQUINT.**

This is the phase's headline and the reason for the one refactor it contains. The plan's
acceptance bar was "run side by side before flipping" — a manual check, done once, by whoever
remembers. It cannot be done at all while the server's reduce lives inside an async store action
that takes a Supabase client, because there is no way to reach it from a test.

So the reductions moved out of `fetchData` into `lib/analytics/summarize.ts` as pure functions of
their rows. The server path still calls them and behaves identically; the local path does not
call them at all — it computes in SQL, which is the whole point of mirroring. What the split buys
is that BOTH implementations are now reachable from one test with one fixture, and the parity
case asserts they agree. That is the same move inventory's ③ made with `mapInventorySyncPayload`,
reached from the opposite direction: inventory made the mirror share the mapping, analytics makes
the two mappings testable against each other.

The manual side-by-side is still owed before the flag flips. It is now a confirmation rather than
the only evidence.

**② THE TWO SEMANTIC TRAPS ARE PostgREST NULLs AND FALSY-VS-NULLISH, and only one is intuitive.**

`.not('status','in','("draft")')` and `.eq('is_voided', false)` both evaluate to NULL for a NULL
column and therefore EXCLUDE the row. SQLite's three-valued logic agrees exactly, so `!= 'draft'`
and `= 0` are already faithful — the trap is the form a reader reaches for instinctively,
`is_voided IS NOT 1`, which reads as "not voided" in English and silently MATCHES NULL rows. A
test pins it: the same fixture counted three ways, where `IS NOT 1` alone returns 2 rows and the
correct predicates return 1.

The second trap is that the server reduce is inconsistent with itself about zero:
`total_amount || amount` in the by-method sum, `total_amount ?? (amount + tip)` in the line item.
A payment with a total of exactly 0 therefore behaves differently in the two, and both behaviours
are reproduced — `NULLIF(x, 0)` for the `||` sites, plain `COALESCE` for the `??` ones. Preserved
rather than fixed, for the reason ⑥ gives.

**③ THE PARTIAL INDEX ONLY WORKS IF THE PREDICATE SAYS THE MAGIC WORDS.**

`idx_oi_order` is `ON order_items(order_id) WHERE is_voided IS NOT 1`. SQLite will only use a
partial index when the query's WHERE clause SYNTACTICALLY implies the index predicate — it does
not reason that `= 0` implies `IS NOT 1`. Written the faithful way and nothing else, the Top
Items plan is `SEARCH o USING idx_o_loc_created_v2 | SCAN oi`: a full scan of every order item in
the mirror, ~50k rows at the 20k-order retention cap, to produce a 15-row list.

The fix is `oi.is_voided IS NOT 1 AND oi.is_voided = 0` — the first conjunct unlocks the index,
the second is the exact server semantics, and together they select precisely what `= 0` selects.
That last clause is asserted rather than assumed: a test counts the same rows both ways. This is
the same class of bug as the Phase 3 `idx_o_loc_created` partial index that its own query could
not use, found this time by reading the plan instead of by a slow page.

**④ THE FOUR GUARDS WERE VERIFIED BY BREAKING THEM.**

| Change                                          | What fails                                                    |
| ----------------------------------------------- | ------------------------------------------------------------- |
| `<= ?` → `< ?` on the end bound                  | the inclusive-bound case                                      |
| `oi.is_voided = 0` → `IS NOT 1`                  | the NULL-flag case                                            |
| add `(status IS NULL OR …)` to the draft filter  | the NULL-status case                                          |
| drop `initiated_at` from `idx_op_loc_initiated`  | the payments plan case                                        |
| drop the `IS NOT 1` conjunct from the items pred | the Top Items plan case                                       |

The last two are worth calling out: the FIRST version of the plan test asserted only that the
index NAME appeared, and it passed when the index lost the column that makes it useful. An index
can keep its name and stop working. The assertions now name the seek terms.

**⑤ SESSIONS ARE THE ONE HOLE, AND IT IS A SCHEMA FACT, NOT AN OMISSION.**

`table_sessions.updated_at` is NULLABLE, so it has no usable keyset watermark — mirroring it
would mean a new entity with a broken cursor, which is a different and larger piece of work than
this phase. So the three Overview session cards read from the network when there is one, and
render "—" with "needs a connection" when there is not. Not 0: a zero there reads as "nobody sat
down today", which is a wrong answer rather than a missing one. That distinction is the same rule
as the retention banner and it is the only rule this page really has.

**⑥ TWO SERVER-PATH QUIRKS ARE REPRODUCED RATHER THAN FIXED, DELIBERATELY.**

`PAYMENT_APPROVED_STATUSES` is `['approved', 'settled', 'captured']` and only `captured` is a
real member of the remote `payment_status` enum — the other two match nothing, and have not since
whenever the enum last changed. Likewise the falsy/nullish inconsistency in ②. Both are
preserved, because a local path that quietly corrects the server shows a merchant two different
totals for the same day, which is worse than one consistent wrong total. They are now named
constants read by BOTH paths, so the fix — when someone decides to make it — lands on both at
once with the parity test to prove it.

**One entry-point change, stated plainly.** `MainMenu`'s `offlineAllowedRoutes` gains
`/analytics`, so the tile is no longer greyed out without a connection — otherwise everything
above is unreachable in the state it was built for. Unlike the other entries in that set, this
one is CONDITIONAL on `EXPO_PUBLIC_LOCAL_ANALYTICS`: with the flag unset the page is still 13
network queries and would paint nothing, so the documented rollback (unset the flag) has to grey
the tile back out rather than leave a dead entry point behind. The page is read-only, so unlike
inventory there is no write gate to build alongside it.

**What the tests assert**
([**tests**/db/analyticsQuery.test.ts](__tests__/db/analyticsQuery.test.ts), against a real SQL
engine, seeded through the real mirror write path): the SQL aggregate equals the server reduce
over one shared fixture, summary by summary; drafts and NULL-status orders are excluded; the end
bound is inclusive (unlike Previous Orders'); every summary is location-scoped; payments scope on
their own `initiated_at` and ignore the parent order's `created_at`; card and cash split with
per-side tips; voided and returned payments count as refunds and never as captured; a
non-captured status is excluded; a 0 `total_amount` falls back to `amount` in the sum but stays 0
in the line item; the card list is newest-captured-first; voided AND NULL-flagged items are both
excluded; only paid orders' items count; a 0 quantity counts as 1; a 0 subtotal falls back to the
v9 `price_paid_minor`; both lists cap at 15; customers key on id, then name, then email; staff
prefer `assigned_server_id`; cents sum exactly where the float reduce drifts to
0.30000000000000004; payments seek on both index columns; Top Items drives from the orders window
and seeks items per order; and the read returns null when the DB is closed so the caller can fall
back.

**Still outstanding for analytics:**

- [ ] **The side-by-side.** Same location, same range, local vs server, on a tablet — the parity
      test proves the two implementations agree on one fixture, not that the fixture resembles a
      real service period.
- [ ] **Run it on device behind the flag**, cold, with the radio off — from the Main Menu tile,
      which is the path that was just opened and the one an operator will actually take.
- [ ] **Confirm the coverage banner** by requesting a range older than `retention_floor` while
      offline, and confirm the same range ONLINE falls back to the server instead.
- [ ] **A service-period soak.**
- [ ] **EOD is NOT in this phase.** It is the harder half of the original table row — server stays
      authoritative, the preview must match settlement on ten consecutive real close-outs — and it
      shares nothing with the dashboard's aggregate but the mirror underneath it. Separate ticket.
- [ ] The loyalty summary is fetched by the server path and rendered by nothing (`loyalty` is in
      the dashboard's `TabId` union but absent from `TABS`), so two queries — one an unbounded
      merchant-wide select — run on every online load and feed nothing. The local path returns
      null, matching what renders. Deleting the fetch is an online-path change left out of scope.

---

### Phase 5 · Customers — build notes, 2026-08-31

**Status: code complete — 25 new tests, 231/231 local-DB tests green, `tsc --noEmit` clean,
ESLint 0 errors on every touched file, full suite back at its known baseline (10 pre-existing
suite failures / 30 tests; total 2080 → 2105). Not yet run on device behind the flag.**

**THE PLAN'S ROW FOR THIS PAGE WAS WRONG IN BOTH COLUMNS, and finding that out changed the
work.** `customers-list.tsx` is a twelve-line stub that renders the string "customers-list" —
there is no page to convert. And the "Today" column said "debounced network type-ahead", which
does not exist anywhere: `fetchAndCacheCustomers` pulls `.limit(200)` ordered by
`last_order_date` into MMKV, and the four screens that need to find a person — the bill's
CustomerSheet, the waitlist form, the reservations panel, the host station's form — each filter
THAT ARRAY in JS.

So the defect this phase actually fixes is not an offline gap. **A customer who last visited a
few months ago at a busy location cannot be found at all — with or without a connection.** The
type-ahead is not a network search that degrades offline; it is a client-side scan of a
truncated list that is equally truncated online. Offline coverage is the second benefit.

| Delivered                                                                        | File                                                                        |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Schema v10 — `location_id`, composite key, `_ordinal`, promoted `address`, three folded search columns | [lib/db/schema.ts](lib/db/schema.ts)                  |
| Snapshot semantics (no `pullDelta`), and why the cap is coherent here             | [lib/db/entities.ts](lib/db/entities.ts)                                     |
| The mapper, the wholesale replace, the raw round trip                             | [lib/db/descriptors/customers.ts](lib/db/descriptors/customers.ts)           |
| The superset search, top-customers, freshness                                     | [lib/db/customersQuery.ts](lib/db/customersQuery.ts)                         |
| Mirror write at the existing fetch seam + the offline-pending merge               | [services/customer.ts](services/customer.ts)                                 |
| One debounced hook, shared by every consumer                                      | [hooks/customers/useCustomerDirectory.ts](hooks/customers/useCustomerDirectory.ts) |
| FlashList directory + the three consumer conversions                              | [CustomerSheet.tsx](components/bill/CustomerSheet.tsx) · [WaitlistBottomSheet.tsx](components/tables/WaitlistBottomSheet.tsx) · [ReservationsPanel.tsx](components/panels/ReservationsPanel.tsx) |

**Six decisions worth recording.**

**① THE QUERY IS A SUPERSET FILTER, AND THE PER-SCREEN FILTERS STAY IN JS.**

This is what kept the change small. The four screens match on different fields with different
rules — the sheet includes address, the waitlist normalizes phones to digits and demands three
of them, the reservations panel matches raw phone text. Moving those into SQL would have meant
four SQL predicates kept in step with four JS ones by hand, which is the divergence
`historyQuery.ts` exists to prevent, multiplied by four.

So `searchLocalCustomers` narrows the directory to a SUPERSET of what any screen could match
(name, phone, address) and each screen runs its OWN unchanged filter over the result. Per-screen
semantics are untouched — provably, because that code was not edited. The only thing that
changes is the size of the pool: the whole directory instead of the most recent 200.

**② IT IS A SNAPSHOT BECAUSE `updated_at` IS NULLABLE — the third distinct reason so far.**

The menu is a snapshot because price resolution is server-side; inventory because stock
resolution is; customers because `public.customers.updated_at` is `string | null`. A keyset
cursor on a nullable column is not a cursor: `.gte(col, since)` drops every NULL row silently,
so a customer whose `updated_at` was never written would be invisible to the mirror forever.
That is exactly the fact that kept `table_sessions` out of the analytics mirror one section
above; the difference is that a customer directory is small enough to replace wholesale and a
session history is not.

**③ `location_id` ON A MERCHANT-SCOPED TABLE — the bend, and why it beat the alternative.**

Remote `customers` has no location at all. The local table gets one anyway, meaning "the
location this row was mirrored for", exactly as the menu's does. The alternative was teaching
`write.ts` about a second scope column — but `pruneToRetention`, `writeSyncState`'s floor and
row count, `replaceScope`'s clear, the purge and the dev shadow-compare are ALL written against
`WHERE location_id = ?`, and `sync_state`'s primary key is `(entity, location_id)`. Generalizing
that to save one column on one table would have touched the transaction path all four existing
entities depend on. The cost of the bend is that a device serving two locations of one merchant
holds the directory twice — bounded at ~3.9 MB, and a device is location-bound in practice.

**④ THE CAP IS COHERENT HERE, WHICH IT WAS NOT FOR THE MENU OR INVENTORY.**

Both of those had their caps REMOVED, because a wholesale replace cannot coexist with row
pruning: the pull returns the complete set, so pruning deletes rows the payload still contains.
Customers is different, and the difference is worth stating precisely: **the fetch is itself a
top-N**, so the payload is already a bounded window rather than the whole directory, and the
retention cap is simply that window's size. The two numbers must be equal or the mirror either
prunes rows the payload holds or claims coverage it never fetched — so a test asserts
`CUSTOMER_FETCH_LIMIT === retention.maxRows` rather than a comment asking for it.

**⑤ OFFLINE-PENDING CUSTOMERS ARE MERGED OVER THE MIRROR, and this is a correctness rule.**

`services/customer.ts` already had a working MMKV offline create/link queue, which this phase
does not touch — it is Track B's problem and it works. But a customer created offline exists
ONLY in that queue until it syncs. Reading the directory from the mirror alone would mean the
customer an operator just created vanishes from the list they created it in. They are merged
unconditionally rather than filtered by the query, because there are at most a handful and the
caller's own filter narrows them correctly anyway.

The MMKV cache also stays as the fallback path, and deliberately keeps its 200-row footprint:
it is no longer trying to be the directory, so writing 5,000 rows through it on every fetch
would pay the serialization cost twice for a list nothing reads while the mirror is healthy.

**⑥ FLASHLIST WHERE THE LIST IS UNBOUNDED — AND NOWHERE ELSE.**

CustomerSheet's `SectionList` became a `FlashList`, which needed the A/B/C grouping FLATTENED
into one array of headers and rows told apart by `getItemType` — FlashList has no sections, and
that is its own recommended shape for sectioned data: the two cell kinds recycle into separate
pools, so a header can never be reused as a customer row (the classic wrong-height flicker when
sections are faked with a single item type). The grouping logic itself is unchanged.

The waitlist and reservations suggestion dropdowns were left as plain `.map()` calls **on
purpose**: both are `.slice(0, 4)`. Virtualizing four rows costs more than it saves, and
applying FlashList everywhere the word "customer" appears would have been cargo cult.

**Five guards were verified as real regression tests by breaking them:**

| Change                                                | What fails                                                       |
| ----------------------------------------------------- | ---------------------------------------------------------------- |
| drop the digits guard on the phone LIKE arm            | every name/address search — an empty digit string matches all     |
| stop escaping LIKE metacharacters                      | the literal `%` / `_` case                                        |
| fold the search columns at query time instead of ingest | the non-ASCII name case                                          |
| drop `replaceScope`                                    | both deletion cases                                               |
| drop `location_id` from the conflict target            | the whole suite — the constraint error rolls back every batch     |

The escaping case is worth calling out: the FIRST version of it searched `"100%"` against
`"100% Beef"` and `"Bob"`, and it PASSED with the escaping removed — `%100%%` still excludes a
row with no "100" in it, so the test discriminated nothing. It now uses fixtures where failing
to escape genuinely widens the match (`"%B"` matching `"Bob"`, `"a_c"` matching `"abc"`).

**What the tests assert**
([**tests**/db/customersMirror.test.ts](__tests__/db/customersMirror.test.ts), against a real SQL
engine): the server rows round-trip unchanged and in the server's order; a NULL `updated_at`
does not lose a row; one malformed payload does not empty the directory; a merged-away customer
disappears; an empty payload is refused rather than replacing a good directory; a replace clears
only its own location; two locations' rows for the same customer id stay apart; search matches
non-ASCII names case-insensitively, phones however they are punctuated, and addresses; a name
query does not fall through to the phone arm; LIKE metacharacters are literal; a query under two
characters returns the directory; search is location-scoped and capped; the server's NULLS-FIRST
ordering is preserved rather than re-derived; top-customers ranks across the whole directory and
excludes zero-order customers; the fetch limit equals the retention cap; a kiosk and a KDS may
not hold the directory; freshness and row count land; money promotes to exact minor units while
the server value survives verbatim; and the directory read is an index scan with no temp b-tree.

**Still outstanding for customers:**

- [ ] **Run it on device behind the flag** — open the bill's customer sheet with the radio off
      and confirm the directory paints from SQLite (the write log reports row counts and `ms`).
- [ ] **Confirm the offline-create merge on a real tablet**: go offline, create a customer, and
      confirm they appear in the sheet's list immediately and survive the reconnect without
      duplicating.
- [ ] **Find someone who is NOT in the most recent 200** — the whole point. Needs a location with
      a real directory; the fixture proves the mechanism, not the coverage.
- [ ] **Measure the type-ahead at 5,000 rows.** The plan says "start with `LIKE`; add FTS5 only
      if measurement demands it" — the measurement has not been taken. A `%contains%` match
      cannot use a b-tree, so this is a scan of one location's directory per keystroke-batch.
- [ ] **A service-period soak** before the MMKV cache is retired for reads.
- [ ] `app/(main)/customers-list.tsx` is still a stub. Building a real customer-management page is
      a feature, not this phase — but the mirror and the query layer are now there for it.

---

> ### ⎯ The boundary ⎯
>
> **Everything above is a cache. Everything below is not.**
> Before Phase 6 starts: flip `synchronous` to `FULL`, close the drop-and-rebuild escape hatch,
> and switch to the forward-only migration ladder — one commit, reviewed as a unit (§4.3 ②).
> Confirm the Identity Gate RPCs have shipped. If they have not, **stop here.** Phase 5 is a
> complete, valuable product.

---

### Track B — the write database _(needs the Identity Gate)_

#### Phase 6 · Stable identity _(still fully online — no behavior change)_

**Flag:** `EXPO_PUBLIC_CLIENT_IDS` · rollback falls back to `create_order_v3`.

**Server** New overloads accepting a client id, otherwise identical:
`create_order_v4(p_order_id uuid, …)`, `add_order_item_v5(p_item_id uuid, p_order_id uuid, …)`.
Both **idempotent on the id** — re-calling with an existing id returns the existing row rather
than erroring. That one behavior is what makes every retry in §8.1 safe.

**Client** `uuidv4()` instead of `generateLocalId()` for orders and items. Nothing else changes:
still online-first, still the same stores. Then delete what §2 lists — `offlineIdRegistry` (530
lines), `dbOrderIdIndex` and its 12+ maintenance sites, the rekey path, `reconcileLostOrderCreations`,
the stale-index guard.

**Test** 500 orders across flaky network: every order's id at creation === its id on the server.
Kill mid-create and retry → exactly one row. `grep` proves no rekey path survives.

**Done when** no row's identity changes anywhere, and ~600 lines of mapping machinery are deleted
rather than bypassed.

**Watch for** the rollout window where both schemes coexist. Rows written by the old build keep
resolving through the registry until they settle; the registry is deleted only once zero
`local_`-prefixed ids remain in any persisted store on any device. Do not skip this.

---

#### Phase 7 · The outbox _(first offline writes — order items only)_

**Flag:** `EXPO_PUBLIC_OFFLINE_WRITES_ITEMS`

**Build** The transactional outbox (§4.1, §8.1). Item add/update/remove writes local-first and
drains. Order _creation_ stays online — narrower blast radius, and creation has the most
downstream fan-out. Merge rules for the item set only: add-wins union, remove-wins tombstone,
quantity LWW.

**Test** The convergence suite (§10) restricted to items. Airplane mode for a full service period
on a real device: add, modify, remove; reconnect; assert local === server every time. Force-quit
mid-drain. Battery-pull mid-commit.

**Done when** items converge across a real offline service period, and the outbox survives
force-quit mid-drain with zero loss and zero duplication.

**Watch for** the order being voided on another station while this device edits it. Remove-wins
means the void applies and local items are tombstoned — the operator must **see** that, not
discover a silently empty order.

---

#### Phase 8 · Offline order creation

**Flag:** `EXPO_PUBLIC_OFFLINE_WRITES_ORDERS`

**Build** Full lifecycle offline: create, seat, modify, send-to-kitchen (queued, prints locally
now), close. Order-header field merge, monotonic status advance, table-session coupling.

**Test** Full convergence suite. **Two devices offline on the same table** — the genuinely hard
case. Then three. Then one device offline for an entire shift. Clock skew: one tablet 10 minutes
fast, merges still deterministic.

**Done when** two stations independently build orders on the same table offline and converge to
one correct order with no lost items.

**Watch for** **order numbers.** If `order_number` is a server sequence, two offline devices
collide. Either device-prefix it (`ST1-0042`) or assign at sync time and show the local one as
visibly provisional. **Decide before Phase 8 starts, not during** — it touches receipts.

---

#### Phase 9 · Cash payments offline

**Flag:** `EXPO_PUBLIC_OFFLINE_CASH`

Cash only, per the money boundary (§6). The drawer is the device, so local is truth and the server
reconciles. Card auth, tips, refunds, voids and settlement stay online-required — structurally, not
by policy.

**Done when** a cash sale completes end to end with no connectivity and reconciles correctly on
reconnect.

---

## 10. Testing — convergence is a property, so test it as one

Example-based tests will not find the bug that killed the last attempt. This is the phase gate
that matters most, and it is cheap relative to what it prevents.

**Property test.** Model N devices and a server. Generate random operation sequences and random
partition/heal schedules. Replay. Assert:

1. **Convergence** — all replicas byte-identical after heal.
2. **Commutativity** — `merge(A,B) == merge(B,A)` for every pair.
3. **Idempotence** — applying any update twice changes nothing.
4. **Monotonicity** — status never regresses; a tombstoned item never resurrects.
5. **No loss** — every item added on any replica is present or explicitly tombstoned. Never absent.

Run it in CI with a fixed seed corpus plus fresh random seeds per run. **A failing seed is a
release blocker**, and the seed is the reproduction.

**Device tests, per phase.** Airplane mode for a full service period. Force-quit mid-drain. Two
devices offline on one table. Clock skew: set one tablet 10 minutes fast and confirm merges still
settle deterministically. Battery-pull during a commit (this is what `synchronous = FULL` is for).

**Shadow mode before every flag flip.** Compute the local answer and the server answer, log
disagreements, ship nothing until the log is quiet for a service period.

---

## 11. Carried over unchanged from the read-mirror draft

These were right and the pivot does not touch them:

- **PINs never enter SQLite.** `expo-sqlite` is unencrypted; `pin_plain` is a plaintext credential
  today, protected only by AES-256 MMKV (`secureMMKVStorage`). The `staff` table (§7.2) is a join
  of `location_members` × `staff_profiles` that **omits all three PIN columns** — `pin_plain`,
  `pin_code` **and** `pin_hashed`. Structural, not a convention. Offline PIN login already works
  from the persisted `useEmployeeStore`.
  **Worth noting for the separate ticket:** `location_members.pin_hashed` already exists on
  remote, unused by the app, which is most of the schema work for hashing the PIN already done.
  Still out of scope here.
- **Station scoping.** POS gets everything; kiosk gets the menu; KDS gets tickets. Enforced by
  `canStore()` at the _write_ boundary so an excluded device can never acquire the data. Purge on
  station change.
- **PII purge paths — all three.** `clearCacheData()`, `reconcileEnvironmentOnBoot()` (the
  staging↔prod switch), and station change. **With one change: the outbox must be drained or
  explicitly discarded before an env-switch purge**, because under offline-first it may hold the
  only copy of unsent orders. A silent wipe there is real data loss, not a cache miss.
- **Retention.** Descriptor-driven caps, pruned inside the insert transaction. Caps set by the
  Phase 1 measurement, never carried over from the MMKV-era constants. From Phase 7 on, **never
  prune a row with `sync_status != 'synced'`** — retention may only evict data the server already
  has. During Track A every row is synced by definition, so the rule is inert until it isn't.
- **Freshness UI.** `useLocalFreshness` + `<SyncFreshness>`, per-entity thresholds. Offline-first
  makes this _more_ important: the operator must be able to tell "saved here, not yet sent" from
  "saved everywhere."
- **Migrations.** Forward-only `PRAGMA user_version` ladder — **from Phase 6 onward.** Through
  Track A the DB is a pure projection, so drop-and-rebuild is legitimate and schema churn is free
  (§4.3 ②). The escape hatch closes at the boundary, in the same commit that flips `synchronous`
  to `FULL`. After that, every schema change is a real migration.
- **The delta engine** (§8.2) and the page inventory (previous-orders, menu, inventory, analytics,
  EOD, customers, loyalty, scheduling, online-orders, KDS, tables, kiosk).

---

## 12. Risks

| Risk                                                    | Mitigation                                                                                                                                                                                               |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **The old divergence bug returns**                      | Its cause was identity instability (§1), removed by Phase 6 and enforced by an immutable-id trigger. Phase 6 ships and soaks _alone_, online-first, before any offline write exists                      |
| **The Identity Gate is not met**                        | **The project stops at Phase 5 and is still a success** — that is the whole reason reads are sequenced first. No Track A work is wasted or rewritten                                                     |
| **Track A work has to be redone for writes**            | Offline-first columns ship inert from Phase 1; screens read through a selector API, not the storage layer; the id column holds the same UUID either way (§4.3)                                           |
| **The boundary is crossed by accident**                 | `synchronous = FULL` and the migration-ladder switch are one reviewed commit, gating Phase 6. Until it merges, the DB is a cache and behaves like one                                                    |
| **Merge loses an item**                                 | Add-wins union + no-loss property test (§10). A failing seed blocks release                                                                                                                              |
| **A void gets undone by a concurrent add**              | Remove-wins, backed by the tombstones that already exist on remote — `order_items.is_voided` / `voided_at`, which ride the delta normally (§7.4)                                                         |
| **A hard `DELETE` leaves an orphan row locally**        | Manifest reconcile on business-day rollover. Rare by construction: the app voids and deactivates, it does not hard-delete                                                                                |
| **Local schema drifts from remote**                     | Promoted columns keep the exact remote name; local-only columns carry a `_` prefix; money conversion has one tested helper (§7.1). A column with no prefix and no remote counterpart is a review failure |
| **Wrong prices from re-derived menu resolution**        | The menu mirrors the _resolved_ `get_pos_bootstrap_v1` output, never the normalized table graph. Price resolution stays server-side, single-implementation (§7.1)                                        |
| **Clock skew corrupts merges**                          | Lamport counters decide causality; wall clock is display-only. Explicitly tested with a skewed device                                                                                                    |
| **Local data lost on power failure**                    | `synchronous = FULL`; transactional outbox; battery-pull test                                                                                                                                            |
| **Unsent orders wiped by an env switch**                | Drain-or-confirm before purge (§11). This is new and it is the most likely way to lose real money                                                                                                        |
| **Order number collisions offline**                     | Decided before Phase 8: device-prefixed, or provisional-and-visibly-so                                                                                                                                   |
| **Card payment queued offline**                         | Structurally impossible — no offline code path exists for auth. Degraded UX states the reason plainly (§6)                                                                                               |
| **Two-writer complexity lands on the on-call engineer** | Every merge rule is one row in §5, one function, one property test. If a rule cannot be expressed that way, the entity is not ready to be offline-first                                                  |
| **PII / PIN exposure**                                  | Unchanged from §11                                                                                                                                                                                       |

---

## 13. Recommendation

**Commit to Track A now. Decide Track B later, with data.**

Phases 1–5 need no server work, cannot corrupt anything, and deliver the loudest complaints in the
product: Previous Orders that always loads, a menu grid that can come up empty (the open P1), a
dashboard that is dead offline. Every one is shippable and reversible on its own flag.

Two things happen on day one, though, and both are cheap:

1. **File the two server tickets** — `create_order_v4` / `add_order_item_v5` (the Identity Gate)
   and `deleted_at` / `sync_tombstones`. They then land in parallel with five phases of read work
   instead of blocking the start. Neither is a hard blocker — the second closes the hard-delete
   gap that the manifest reconcile otherwise covers.
2. **Build the selector boundary in Phase 3**, not later (§4.3 ③). It is the single decision that
   makes reads-before-writes free rather than a partial rewrite.
   → **This did not happen.** Phase 3 shipped without `useOrders(filter)`; the rule still lives
   in the screen. See the Phase 3 review. The advice stands, the deadline has moved to "before
   Phase 5 starts" — and it gets more expensive at every page, exactly as predicted here.

**The Phase 5 → 6 boundary is the real decision point**, and by then it is an informed one: the
delta engine will have shadow-compared clean for a service period, the retention caps will be
measured rather than guessed, and the RPCs will either exist or not. If they don't, stopping at
Phase 5 is a complete product, not an abandoned project.

If Track B does go ahead, **Phase 6 is still worth shipping alone** — it deletes ~600 lines of the
most bug-prone machinery in the repo and makes the previous failure mode unrepresentable, while
the app stays online-first and behaviorally identical. Only Phase 7 actually turns on offline
writes, and by then everything underneath it has run in production for months.
