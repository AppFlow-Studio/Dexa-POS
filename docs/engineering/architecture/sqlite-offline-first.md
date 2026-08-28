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
the attempt without changing what *caused* that will reproduce it. So §1 establishes the actual
cause from the code, and §2–§3 establish the one precondition that removes it. Everything after
assumes that precondition is met.

**The precondition, stated as a gate:**

> ### The Identity Gate
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
`p_idempotency_key` — which dedupes the *call*, but the row's identity still originates on the
server. Same for items: `add_order_item_v4` takes `p_order_id` and mints the item id server-side.

**So every row is born with one identity and acquires a different one at sync time.** That single
fact is the source of all of it. When `local_order_…` becomes `550e8400-…`, every reference has
to be rewritten, atomically, across at least:

| Reference | Where |
| --- | --- |
| `ordersById` key | `useOrderStore` |
| `dbOrderIdIndex` | `useOrderStore` — 12+ hand-maintained sites (`:4740`, `:7157`, `:7232`, `:7246`…) |
| `workingSetOrderIds` / `_workingSetLookup` | `useOrderStore:5258` |
| `persistableOrderIds` | `useOrderStore:4742-4744` |
| Queue op `entity_id` | `offlineSyncService` |
| Local→backend map | `offlineIdRegistry` (530 lines, its own MMKV persistence) |
| Table session order refs | `useTableSessionStore` |
| KDS ticket order refs | `useKDSStore` |
| Payment item coverage | `usePaymentStore` |
| Seating index | `useSeatingStore.byOrderId` |

Miss one → an orphan. Race one → a duplicate. **That is exactly the reported failure**, and it is
why the codebase now carries six separate layers of defense against it — idempotency keys,
`offlineIdRegistry`, `reconcileLostOrderCreations`, `markOperationBlocked`, `cartShapeReconcile`,
`orderHeaderReconcile` — plus an explicit in-code guard for *"stale `dbOrderIdIndex` and merging
would leak items from this order"* (`useOrderStore.ts:5353`) and a CLAUDE.md warning that
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
worked around, *unnecessary*:

| Deleted | Size |
| --- | --- |
| `lib/offlineIdRegistry.ts` | 530 lines + its MMKV persistence |
| `dbOrderIdIndex` and its maintenance | 12+ sites in `useOrderStore` |
| `isLocalId` / `resolveToBackendId` / `resolveId` branching | every call site |
| `reconcileLostOrderCreations()` | `offlineSyncInit.ts:262` |
| The rekey path in `useOrderStore` | `:4734-4776` |
| The stale-index guard | `:5353` |

That is the real prize of the write track, and it is worth having on its own merits — **even if
Phases 7–9 never happen**, Phase 6 leaves the codebase meaningfully safer while changing no
behavior.

---

## 3. What "always in sync" can and cannot mean

Two writers on a network partition cannot be *identical at all times* — that is not a design
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
*projection of SQLite* rather than an independent copy. One direction of flow: SQLite → Zustand →
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

Either the order exists *and* is queued to sync, or neither happened. There is no third state.
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

| | Phases 1–5 (reads) | Phase 7+ (writes) |
| --- | --- | --- |
| Schema change | Drop and rebuild | Forward-only migration ladder |
| `PRAGMA synchronous` | `NORMAL` — a lost commit is a refetch | **`FULL`** — a lost commit is a lost order |

Make that flip a single reviewed commit with both changes in it. It is the moment the local
database stops being a cache.

**③ Screens read through a selector API, never through the storage layer.** During the read track
the resolution rule is *live work → Zustand, settled → SQLite*; after the write track it collapses
to *everything → SQLite*. If screens encode that rule, every screen changes twice. So screens call
`useOrders(filter)` / `useOrder(id)` and the rule lives **inside the hook**, exactly as
`stores/selectors/orderSelectors.ts` already does today. The source swap then lands in one file
per entity and no screen notices.

That third point is the one that decides whether this reordering is free or expensive. Build the
selector boundary in Phase 3, the first read page, before there are twelve call sites to fix.

---

## 5. Merge semantics — the heart of it

Whole-row last-writer-wins is wrong for a POS: two servers adding items to the same table offline
would lose one server's items. Merge is **per-field, per-entity**, and every rule below is chosen
to be commutative and to fail in the direction that loses the *least* and is *safest for the
guest*.

| Entity / field | Rule | Why this direction |
| --- | --- | --- |
| **Order item set** | **Add-wins union**, keyed by item UUID | Two stations each add items offline → guest gets both. Losing an ordered item is worse than an extra line the server can void |
| **Item removal / void** | **Remove-wins** (tombstone beats a concurrent add) | Un-voiding an item the manager voided is worse than losing a re-add. The tombstone already exists on remote: `order_items.is_voided` / `voided_at` (§7.4) |
| **Item quantity** | LWW on `(updated_at, device_id)` | The UI sets an absolute quantity from a picker, not an increment, so LWW is faithful to the gesture. **Not** a counter — do not treat it as one |
| **Item modifiers** | Replace whole set, LWW on the parent item | `replace_order_item_modifiers_v2` is already replace-semantics server-side. Keep them aligned |
| **Order status** | **Monotonic advance** along the `lib/tableStateMachine.ts` partial order; never regresses | `paid` must never fall back to `open`. Merge = take the further-advanced state |
| **Order header** (customer, type, table, notes) | LWW per field on `(updated_at, device_id)` | Independent scalars. Per-*field*, so a name edit and a table move on two devices both survive |
| **Payments** | **Server authoritative. No merge.** | §6 |
| **Totals / tax** | **Derived, never merged** — recomputed from the merged item set | Merging a computed total against its inputs is how money goes wrong. Compute after merge, both sides, `decimal.js` |
| **Table session** | Monotonic status; local-only statuses (`seating`/`ordering`/`paying`/`closing`) never sync — as today | `isLocalOnlyStatus()` already guards this |
| **Menu / inventory / customers / staff** | **Server-authoritative pull.** Device does not originate | Nothing here is created offline on a POS. Delta-pull only — §8.2 |

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

| Operation | Offline? | Rule |
| --- | :---: | --- |
| Build/modify an order, items, modifiers, courses, seats | ✅ | Fully offline-first |
| Send to kitchen / KDS routing | ✅ | Queues; fires on reconnect. Print locally now |
| **Cash payment** | ✅ | The cash drawer *is* the device. Local is truth; server reconciles |
| **Card authorization** | ❌ | Requires the processor. Cannot be queued — a queued "approval" is a lie to the cashier and a chargeback to the merchant |
| Tip adjust, refund, void payment | ❌ | Operates on a processor-side transaction |
| **Settlement / batchout / EOD commit** | ❌ | **Server authoritative, always.** Local computes the *preview* only |
| Order locking for payment | ❌ | `is_order_locked` is a server mutex. An offline device cannot hold it; on reconnect, **lock-wins** and local edits to a locked order are rejected and surfaced |

**The degraded-mode UX matters as much as the rule.** Offline, the card button is disabled with a
plain reason — `Card payment needs a connection. Cash is available.` — not a spinner and not a
silent failure. Store-and-forward card capture with a floor limit is a *merchant risk decision*,
not an engineering one; if it is ever wanted, it is its own project with its own sign-off.

---

## 7. Schema

### 7.1 How faithful the clone is — and where it deliberately isn't

Every column below was read from `database.types.ts` on this branch. Three different fidelity
rules apply, and conflating them is how a local schema drifts from the remote one:

| Part of a row | Rule | Why |
| --- | --- | --- |
| **Identity** — `id`, and every foreign key (`order_id`, `location_id`, `menu_item_id`, `staff_profile_id`…) | **Byte-identical to remote.** Same UUID, same name | Convergence is defined by both sides agreeing on which row is which. A renamed or re-derived key breaks it silently |
| **Watermarks and versions** — `updated_at`, `created_at`, `sync_version`, `version` | **Byte-identical to remote** | The delta cursor is a direct comparison against a server value. A local re-interpretation desynchronizes the pull |
| **`payload`** | **Verbatim server JSON, unmodified** | The render path stays `_transformFetchedOrder`. New server fields appear with no device migration |
| **Promoted columns** | A **verified subset of real remote columns, keeping the remote name** | Filtering/sorting/search need real columns. Keeping the name means there is no translation layer to get wrong |
| **Table shape** | **Not** the remote table graph — the shape the app already consumes | See below |

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

`synchronous = FULL` is the one deliberate performance sacrifice in this document, and it *defines*
the Track A → Track B boundary. Under WAL, `NORMAL` can lose the last commits on an OS crash or
power loss. Through Phases 1–5 that is fine — SQLite holds a projection and a lost commit is a
refetch. From Phase 6 it holds the only copy of a guest's order, and it is not.

So `NORMAL` through Track A, and the flip to `FULL` ships in the same reviewed commit that closes
the drop-and-rebuild escape hatch (§4.3 ②). Measure the cost at that flip — one fsync per commit,
and orders commit at human speed.

The `_`-prefixed offline-first columns are created in Phase 1 and sit unused until Phase 7. A
dormant column costs nothing and means the write track adds behavior instead of migrating a
database that by then holds real data.

### 7.4 Correction: tombstones mostly *do* exist

An earlier revision of this document claimed there are no tombstones anywhere, from
`grep -c "deleted_at" database.types.ts` → 0. The grep was right; the conclusion was too broad.

**Voids and cancellations are soft deletes, and they already ride the `updated_at` watermark:**

| Entity | Tombstone | Rides the delta? |
| --- | --- | --- |
| Order | `voided_at`, `void_reason`, `voided_by`, `cancelled_at` | ✅ — `updated_at` bumps |
| Order item | `is_voided`, `voided_at`, `void_reason` | ✅ — `updated_at` bumps |
| Menu item | `availability` = false; location override `is_available` | ✅ |
| Inventory item, vendor, customer, staff | `is_active` = false | ✅ |

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
  `depends_on` expresses the real dependency (an item waits for its order's create *only if* the
  server hasn't seen the order yet — and with client-minted IDs, it usually doesn't need to).
- **Retry is free.** Same client UUID + same idempotency key = the server can dedupe perfectly.
  This is what `p_idempotency_key` on `create_order_v3` / `add_order_item_v4` already exists for.

### 8.2 Pull — the delta engine

Unchanged from the previous draft, and it is the part that was already right. Per-entity
descriptors, `(watermark, watermark_id)` keyset resume, transactional apply, resumable paging,
prune-inside-insert. Three schema facts it must still handle, all verified on this branch:

- **Only *hard* deletes are invisible.** There is no `deleted_at` anywhere (0 hits across 634
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

| | Phases | Server work needed | Worst failure | Value if the project stops here |
| --- | --- | --- | --- | --- |
| **A · Reads** | 1–5 | **None** | Stale data → drop and refetch | Offline reads, instant paging, local reporting, two caches deleted, one P1 fixed |
| **B · Writes** | 6–9 | `create_order_v4`, `add_order_item_v5` | Lost or duplicated orders | Full offline operation |

The line between Phase 5 and Phase 6 is the most consequential in this document: it is where the
local database stops being a cache and starts being the only copy of something. `synchronous` and
the migration policy flip there, in one reviewed commit (§4.3).

Every phase is behind its own `EXPO_PUBLIC_*` flag, default off, rollback = unset it. **Do not
start the next phase until the current one has run a full service period on real hardware.**

---

### Track A — the read database *(no server work required)*

#### Phase 1 · Foundation *(no user-visible change)* — ✅ **BUILT**

**Flag:** none — inert until something reads it.

**Status: code complete, 60/60 tests green, `tsc --noEmit` clean.** Not yet run on a
device — the one acceptance item still outstanding is the on-device measurement pass
(see "Still outstanding" below).

| Delivered | File |
| --- | --- |
| Schema, DDL + naming contract | [lib/db/schema.ts](lib/db/schema.ts) |
| Open / pragma / version / rebuild | [lib/db/index.ts](lib/db/index.ts) |
| Station scoping | [lib/db/policy.ts](lib/db/policy.ts) |
| Retention + freshness descriptors | [lib/db/entities.ts](lib/db/entities.ts) |
| The single write boundary | [lib/db/write.ts](lib/db/write.ts) |
| Money ↔ minor-units, one helper | [lib/db/money.ts](lib/db/money.ts) |
| Purge paths | [lib/db/teardown.ts](lib/db/teardown.ts), [lib/db/purgeFlag.ts](lib/db/purgeFlag.ts) |
| Cap-sizing harness | [lib/db/measure.ts](lib/db/measure.ts) |
| Freshness hook + component | [hooks/db/useLocalFreshness.ts](hooks/db/useLocalFreshness.ts), [components/db/SyncFreshness.tsx](components/db/SyncFreshness.tsx) |
| Boot wiring, station purge, size monitor | [contexts/PosSyncProvider.tsx](contexts/PosSyncProvider.tsx) |
| Env-switch purge flag | [lib/storage.ts](lib/storage.ts) |
| Per-key boot hydration instrumentation | [lib/storage.ts](lib/storage.ts), [lib/telemetry/keys.ts](lib/telemetry/keys.ts) |

**Three decisions worth recording, because they were not in the plan:**

1. **The env-switch purge is a flag, not a call.** `reconcileEnvironmentOnBoot()` is
   synchronous and runs at module load; deleting a SQLite file is async. A
   fire-and-forget delete from there races the first write of the *new* environment's
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

- [ ] **Run the measurement pass on the lowest-spec device.** `lib/db/measure.ts` is built
      but has not been run. Until it has, the retention caps in `lib/db/entities.ts` are
      explicitly marked `PROVISIONAL` and are **not** derived values. Record the results in
      §11 with the derivation, not just the number.
- [ ] Boot the app on device and confirm zero behavior change.
- [ ] Capture the `boot.persist_parse_ms.*` ranking across the 31 persisted keys — this is
      what orders any future persistence work, and the ranking may well say "don't bother".

**Build** Add `expo-sqlite`. `lib/db/index.ts`: open, WAL, `synchronous = NORMAL`,
`foreign_keys = ON`. Full schema per §7 — **including the offline-first columns, inert** (§4.3 ①).
`lib/db/policy.ts` with `stationKind()` + `canStore()` enforced *inside the single write helper*.
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

#### Phase 2 · Delta sync engine *(pull only)*

**Flag:** `EXPO_PUBLIC_DELTA_SYNC`

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

#### Phase 3 · Previous Orders *(the headline, and the selector boundary)*

**Flag:** `EXPO_PUBLIC_LOCAL_PREVIOUS_ORDERS` · **Page:** [previous-orders.tsx](app/(main)/previous-orders.tsx)

**Build** Repoint list, pagination, search and filters at SQL.
`services/historyOrderFilters.ts` already models filters declaratively via
`buildHistoryOrderQuery` — add a SQL emitter beside the PostgREST one so there stays exactly one
source of filter truth. Keep `previousOrdersOfflineCache` untouched as fallback; delete it only
once this is proven.

**This phase also builds the selector boundary** (§4.3 ③) — `useOrders(filter)` owns the
live-vs-settled rule so screens never encode it. Do this here, at the first page, not at the
twelfth.

**Test** Enter offline → rows render with `Offline — showing data from …`. Page forward and back
offline → **works**, which it does not today. Search offline hits the whole retained window, not
one page. A refund on another station appears within one revalidation cycle.

**Done when** entry paints with no skeleton, paging costs **zero** round trips, and offline
pagination works.

**Watch for** the seam where the old bug lived: orders that exist locally but not on the server
must render from Zustand with the existing `_offlineUnsynced` badge
(`usePreviousOrdersStore.ts:807`) — never from SQLite.

---

#### Phase 4 · Menu *(retires two caches, fixes a P1)*

**Flag:** `EXPO_PUBLIC_LOCAL_MENU` · **Pages:** [menu/](app/(main)/menu/),
[order-processing.tsx](app/(main)/order-processing.tsx), kiosk ordering

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

---

#### Phase 5 · The remaining read pages

**Build** Same pattern per page, one flag and one service period each. By now this is repetition,
which is why they share a phase — but each still ships and soaks independently.

| Page | Flag | Today | Watch for |
| --- | --- | --- | --- |
| [inventory/](app/(main)/inventory/) | `…_LOCAL_INVENTORY` | 28 `.from()`, rebuilt every launch | Stock is time-sensitive — `staleAfterMs: 60_000`, not 5 min. Drop the redundant `.from("inventory_items")` at `useInventorySync.ts:57` once delta is trusted |
| [analytics.tsx](app/(main)/analytics.tsx) + EOD | `…_LOCAL_ANALYTICS` | 13 `.from()`, **dead offline** | **Numbers must match the server dashboard exactly** — run side by side before flipping. Past `retention_floor`, say so: *"Showing the last N orders. Older data needs a connection."* Never silently under-report revenue. EOD preview must match server settlement on **ten consecutive real close-outs**; server stays authoritative |
| [customers-list.tsx](app/(main)/customers-list.tsx) | `…_LOCAL_CUSTOMERS` | Debounced network type-ahead | Start with `LIKE`; add FTS5 only if measurement demands it |
| [loyalty/](app/(main)/loyalty/) | `…_LOCAL_LOYALTY` | 15 `.from()` | — |
| Staff roster — [scheduling/](app/(main)/scheduling/), [open-shifts.tsx](app/(main)/open-shifts.tsx), [pto.tsx](app/(main)/pto.tsx) | `…_LOCAL_STAFF` | Network-only rosters | **Read-only consumers only.** `useEmployeeStore` keeps login, session and PINs. If a change starts touching `pin-login.tsx`, stop — different ticket |
| [online-orders/](app/(main)/online-orders/) | `…_LOCAL_BOARDS` | Board refetched on entry | Double-render between the local row and the realtime row — key strictly on order id. Preserve `placed_at` business-day scoping (commit `82eb80e7`) |
| [kds.tsx](app/(main)/kds.tsx) history | `…_LOCAL_KDS_HISTORY` | 50-ticket cap, 1 h window | Retires `KDS_DONE_TICKET_LIMIT` and `_recalledTicketIds` (the persisted, TTL-less Set flagged HIGH in `memory-state-audit.md`) |

**Done when** every read page paints from disk and works offline.

---

> ### ⎯ The boundary ⎯
> **Everything above is a cache. Everything below is not.**
> Before Phase 6 starts: flip `synchronous` to `FULL`, close the drop-and-rebuild escape hatch,
> and switch to the forward-only migration ladder — one commit, reviewed as a unit (§4.3 ②).
> Confirm the Identity Gate RPCs have shipped. If they have not, **stop here.** Phase 5 is a
> complete, valuable product.

---

### Track B — the write database *(needs the Identity Gate)*

#### Phase 6 · Stable identity *(still fully online — no behavior change)*

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

#### Phase 7 · The outbox *(first offline writes — order items only)*

**Flag:** `EXPO_PUBLIC_OFFLINE_WRITES_ITEMS`

**Build** The transactional outbox (§4.1, §8.1). Item add/update/remove writes local-first and
drains. Order *creation* stays online — narrower blast radius, and creation has the most
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
  `canStore()` at the *write* boundary so an excluded device can never acquire the data. Purge on
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
  makes this *more* important: the operator must be able to tell "saved here, not yet sent" from
  "saved everywhere."
- **Migrations.** Forward-only `PRAGMA user_version` ladder — **from Phase 6 onward.** Through
  Track A the DB is a pure projection, so drop-and-rebuild is legitimate and schema churn is free
  (§4.3 ②). The escape hatch closes at the boundary, in the same commit that flips `synchronous`
  to `FULL`. After that, every schema change is a real migration.
- **The delta engine** (§8.2) and the page inventory (previous-orders, menu, inventory, analytics,
  EOD, customers, loyalty, scheduling, online-orders, KDS, tables, kiosk).

---

## 12. Risks

| Risk | Mitigation |
| --- | --- |
| **The old divergence bug returns** | Its cause was identity instability (§1), removed by Phase 6 and enforced by an immutable-id trigger. Phase 6 ships and soaks *alone*, online-first, before any offline write exists |
| **The Identity Gate is not met** | **The project stops at Phase 5 and is still a success** — that is the whole reason reads are sequenced first. No Track A work is wasted or rewritten |
| **Track A work has to be redone for writes** | Offline-first columns ship inert from Phase 1; screens read through a selector API, not the storage layer; the id column holds the same UUID either way (§4.3) |
| **The boundary is crossed by accident** | `synchronous = FULL` and the migration-ladder switch are one reviewed commit, gating Phase 6. Until it merges, the DB is a cache and behaves like one |
| **Merge loses an item** | Add-wins union + no-loss property test (§10). A failing seed blocks release |
| **A void gets undone by a concurrent add** | Remove-wins, backed by the tombstones that already exist on remote — `order_items.is_voided` / `voided_at`, which ride the delta normally (§7.4) |
| **A hard `DELETE` leaves an orphan row locally** | Manifest reconcile on business-day rollover. Rare by construction: the app voids and deactivates, it does not hard-delete |
| **Local schema drifts from remote** | Promoted columns keep the exact remote name; local-only columns carry a `_` prefix; money conversion has one tested helper (§7.1). A column with no prefix and no remote counterpart is a review failure |
| **Wrong prices from re-derived menu resolution** | The menu mirrors the *resolved* `get_pos_bootstrap_v1` output, never the normalized table graph. Price resolution stays server-side, single-implementation (§7.1) |
| **Clock skew corrupts merges** | Lamport counters decide causality; wall clock is display-only. Explicitly tested with a skewed device |
| **Local data lost on power failure** | `synchronous = FULL`; transactional outbox; battery-pull test |
| **Unsent orders wiped by an env switch** | Drain-or-confirm before purge (§11). This is new and it is the most likely way to lose real money |
| **Order number collisions offline** | Decided before Phase 8: device-prefixed, or provisional-and-visibly-so |
| **Card payment queued offline** | Structurally impossible — no offline code path exists for auth. Degraded UX states the reason plainly (§6) |
| **Two-writer complexity lands on the on-call engineer** | Every merge rule is one row in §5, one function, one property test. If a rule cannot be expressed that way, the entity is not ready to be offline-first |
| **PII / PIN exposure** | Unchanged from §11 |

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

**The Phase 5 → 6 boundary is the real decision point**, and by then it is an informed one: the
delta engine will have shadow-compared clean for a service period, the retention caps will be
measured rather than guessed, and the RPCs will either exist or not. If they don't, stopping at
Phase 5 is a complete product, not an abandoned project.

If Track B does go ahead, **Phase 6 is still worth shipping alone** — it deletes ~600 lines of the
most bug-prone machinery in the repo and makes the previous failure mode unrepresentable, while
the app stays online-first and behaviorally identical. Only Phase 7 actually turns on offline
writes, and by then everything underneath it has run in production for months.
