# SQLite as a Local Read Mirror

**Status:** Proposal — not approved, not scheduled, nothing implemented.
**Drafted:** 2026-08-25 · branch `kiosk-improvements` · Expo SDK 53 / RN 0.79.6
**Related:** `docs/engineering/performance/db-perf-waves-2026-08-13.md` ·
`docs/features/offline-sync/aud-14-offline-queue-persistence-measurement-report.md`

---

## 0. Read this first — the constraint that shapes everything

We moved order entry to **online-first** because local-first writes could not be
reconciled reliably: local rows got created and the server rows sometimes didn't. That
decision is correct and this proposal **does not touch it**.

The reason a local mirror is safe when local-first writes were not comes down to one
structural fact:

| | Writers | Failure mode | Recovery |
| --- | --- | --- | --- |
| **Local-first writes** (what burned us) | **Two** — local optimistic state *and* the server both originate truth | Divergence. Local has an order the server doesn't. Merging is a judgement call with no correct answer | Reconciliation logic, which is where the bugs lived |
| **Local read mirror** (this proposal) | **One** — server responses only | Staleness. The mirror is behind, never in conflict | Drop it and refetch. Nothing is lost |

The mirror is a **projection**, not a peer. It holds nothing original. That gives us one
non-negotiable rule that the rest of this document is built around:

> ### The Prime Rule
> **The mirror never accepts a write that has not been confirmed by the server.**
> No optimistic state. No local-only orders. No pending cart items.
> If it isn't in the server's response, it does not go in the mirror.

Anything in flight stays exactly where it lives today — Zustand, MMKV, and the offline
queue. The UI reads the mirror for **settled history** and Zustand for **live work**. That
boundary is what stops the divergence class of bug from returning, and every phase below
is testable specifically against it.

---

## 1. Corrections to the previous draft of this document

Two claims in the first draft were wrong. Both were made from doc-reading rather than
code-reading, and both are corrected here:

**❌ "Item adds are head-of-line blocked behind `create_order` because `queueItemAddition`
serializes per order."**
Wrong. `queueItemAddition` (`stores/useOrderStore.ts:1117`) **defaults to parallel**. The
serial chain is the fallback, gated behind `EXPO_PUBLIC_DISABLE_ADD_PARALLEL`, which is
**not set** in `.env`. The in-file comment is explicit: *"skip the per-order serial chain
so 10 rapid taps fire 10 RPCs in parallel (HTTP/2 multiplexes on one connection)."*

**❌ "Writes are already local-first — that work is done."**
Misleading. Writes *were* built local-first; the posture was deliberately moved to
online-first because reconciliation was unreliable. The `OFFLINE-FIRST` comment on
`addItemToBackend` describes failure handling, not the current product posture.

---

## 2. What the write path actually looks like today

Read from the code, not the docs. Five distinct layers exist to fight the
"local created, server didn't" problem:

| Layer | File | Status |
| --- | --- | --- |
| Idempotency keys on every write RPC | `lib/network/featureFlags.ts` | **ON** — `EXPO_PUBLIC_IDEMPOTENT_ALL=1` |
| Local→backend ID registry | `lib/offlineIdRegistry.ts` | Always on |
| Lost-create sweep | `offlineSyncInit.ts:262` `reconcileLostOrderCreations()` | Always on |
| Blocked-op state machine (Wave 2.8) | `offlineSyncService.ts:1344` `markOperationBlocked()` | **ON** by default (`bad_wifi.blocked_add_item_v1`) |
| Cart-shape reconcile — push local→server (Wave 3.0f-3) | `services/cartShapeReconcile.ts` | **ON** — `EXPO_PUBLIC_CART_SHAPE_RECONCILE=1` |
| Order-header reconcile — pull server→local (Wave 3.0d-5) | `services/orderHeaderReconcile.ts` | **ON** — `EXPO_PUBLIC_ORDER_HEADER_RECONCILE=1` |

`markOperationBlocked` is the clearest artifact of the pain: an op whose order ID never
resolves is blocked without burning retries, re-evaluated each cycle, capped at
`MAX_BLOCK_COUNT`, then dead-lettered with a Sentry breadcrumb. That entire state machine
exists because a local order could fail to become a server order.

**This is the machinery we are not touching.** It is the write path, it is online-first,
and it stays that way. Everything below is downstream of it.

### Where the actual latency is

From `db-perf-waves-2026-08-13.md` (prod `pg_stat_statements`, 254 days):

- `orders` + `order_items` + `order_item_modifiers` embed: **536–1108 ms mean**, 14 of the
  top 25 workloads, **~27 h** total DB time.
- Same shape with RLS bypassed: **8.5 ms**. The 60–130× gap is RLS policy evaluation.
- `get_active_orders_v1` (`SECURITY DEFINER`) returns the same data in **13 ms**.

**SQLite does not fix that** — the RLS waves do (1–2 applied to staging, 3–5 held in
`_pending_review/`). But note what the 27 hours is spent on: **re-fetching rows the device
already has.** A mirror removes those queries from the server entirely. The two efforts
compound; they don't compete.

---

## 3. Why reading is the half that's broken

Eight of the heaviest stores have **zero** `persist()` blocks — verified against `stores/`:

| Store | Query surface | Consequence |
| --- | --- | --- |
| `useAnalyticsStore` | 20 raw `.from()` | **No offline guard at all** — dashboard is dead offline |
| `useInventoryStore` | 53 `.from()` | Largest table surface in the app, rebuilt every launch |
| `useLoyaltyDataStore` | 26 `.from()` | Refetched on every open |
| `usePreviousOrdersStore` | server-only + `goToPage` per page | **A round trip per page of history** |
| `useMenuStore` | `get_pos_bootstrap_v1` | Re-fetched every launch |
| `useCustomerStore` | network-only | Type-ahead is debounced-network |
| `useReservationStore` | network-only | Rebuilt every launch |
| `useWaitlistStore` | network-only | Rebuilt every launch |

The codebase already diagnoses this in the headers of the two caches built to paper over it:

> The menu is fetched fresh on every launch: `useMenuStore` has no persistence and the
> TanStack cache is in-memory only, so before this cache existed a single bad network
> window at boot left `menus: []`.
> — `stores/menuOfflineCache.ts`

> This cache exists for ONE purpose: when the device is offline, the screen would
> otherwise be empty, so we show the last successfully-fetched set instead.
> — `stores/previousOrdersOfflineCache.ts`

Both are single-key JSON blobs — 200-row cap, 24 h TTL, **no pagination, no filtering, no
search, no joins**. They are the shape of a missing query engine. There are **308
`ActivityIndicator` usages** across `app/` and `components/`, most waiting on data the
device already has.

---

## 4. Architecture

```
        WRITE PATH — unchanged, online-first          READ PATH — new
        ────────────────────────────────────          ───────────────
  action ─► Zustand (live) ─► RPC (idempotent)          UI
                │                    │                   │
                └─► offline queue ───┘                   ├─ live work?  ─► Zustand
                                     │                   └─ settled?    ─► SQLite mirror
                     server response ┤                                        ▲
                                     └────────────────────────────────────────┘
                                        ONLY the server response writes here
```

### 4.1 The read-resolution rule

Every migrated screen resolves data in this order, and the order is what keeps the
divergence bug from returning:

1. **Is there live, in-flight work for this entity?** → read Zustand. The mirror does not
   know about it and must not.
2. **Otherwise** → read the mirror, and render a freshness stamp (§6).
3. **In the background** → revalidate from the server; on success, write the mirror and
   update the stamp.

Never merge (1) and (2) inside the mirror. Merge them in the selector, in memory, at read
time. The mirror stays a clean projection of server truth.

### 4.2 Schema

```sql
-- Settled order history. Populated ONLY from server responses.
CREATE TABLE orders_mirror (
  db_order_id    TEXT PRIMARY KEY,      -- server UUID. Local IDs are NEVER keys here.
  location_id    TEXT NOT NULL,
  order_number   TEXT,
  order_type     TEXT,
  status         TEXT,
  order_source   TEXT,
  customer_name  TEXT,
  customer_phone TEXT,
  total_cents    INTEGER,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,         -- server updated_at; drives staleness probes
  server_seen_at TEXT NOT NULL,         -- when WE received it; drives the freshness stamp
  payload        TEXT NOT NULL          -- full JSON for exact-fidelity render
);
CREATE INDEX idx_om_loc_created ON orders_mirror(location_id, created_at DESC);
CREATE INDEX idx_om_status      ON orders_mirror(location_id, status, created_at DESC);
CREATE INDEX idx_om_phone       ON orders_mirror(location_id, customer_phone);
CREATE INDEX idx_om_number      ON orders_mirror(location_id, order_number);

CREATE TABLE order_items_mirror (
  id TEXT PRIMARY KEY, db_order_id TEXT NOT NULL, menu_item_id TEXT,
  name TEXT, quantity INTEGER, price_cents INTEGER, payload TEXT NOT NULL
);
CREATE INDEX idx_oim_order ON order_items_mirror(db_order_id);

CREATE TABLE order_payments_mirror (
  id TEXT PRIMARY KEY, db_order_id TEXT NOT NULL, method TEXT,
  amount_cents INTEGER, tip_cents INTEGER, created_at TEXT, payload TEXT NOT NULL
);
CREATE INDEX idx_opm_order ON order_payments_mirror(db_order_id);

-- Staff roster. NOTE THE ABSENCE OF A PIN COLUMN — see §5.2. PINs stay in
-- secureStorage (encrypted MMKV); expo-sqlite is unencrypted. Structural, not a convention.
CREATE TABLE staff_mirror (
  location_member_id TEXT PRIMARY KEY,
  staff_profile_id   TEXT NOT NULL,
  location_id        TEXT NOT NULL,
  display_name       TEXT,
  full_name          TEXT,
  role_code          TEXT,
  avatar_url         TEXT,
  is_active          INTEGER NOT NULL DEFAULT 1,
  server_seen_at     TEXT NOT NULL
);
CREATE INDEX idx_sm_loc ON staff_mirror(location_id, is_active);

-- One row per (entity, location). The freshness stamp reads from here.
CREATE TABLE mirror_sync_state (
  entity          TEXT NOT NULL,
  location_id     TEXT NOT NULL,
  last_success_at TEXT,          -- ISO. "Last synced 2 minutes ago" comes from this.
  last_attempt_at TEXT,
  last_error      TEXT,
  synced_through  TEXT,          -- oldest created_at we hold — the retention floor
  row_count       INTEGER,
  PRIMARY KEY (entity, location_id)
);
```

Two deliberate choices:

- **`db_order_id` is the only primary key.** A local order ID can never enter the mirror.
  This is the Prime Rule expressed in the schema, not in a code comment — it is structurally
  impossible to mirror an unsynced order.
- **`payload` holds the full JSON.** Promote to real columns only what needs filtering,
  sorting or search. New server fields then need no device migration, and
  `_transformFetchedOrder` stays the single render path — no second renderer to drift.

### 4.3 Population — no new sync machinery

Write into the mirror from paths that already receive server data:

| Existing source | Writes |
| --- | --- |
| `usePreviousOrdersStore.refreshPreviousOrders` / `goToPage` | orders + items + payments |
| `useOrdersQuery`, `usePreviousOrdersBootstrap` | active + recent orders |
| `usePosSync` (`get_pos_bootstrap_v1`) | menu, tax rates, snoozes |
| `useInventorySync` | inventory items, vendors |
| Supabase realtime `orders` broadcasts | upsert |
| `offlineSyncService` **on confirmed replay success only** | the now-settled order |

That last row is the one to review carefully in code review: it fires *after* the server
confirms, using the returned `db_order_id`. Never on enqueue, never optimistically.

### 4.4 Library

**`expo-sqlite`.** SDK 53 ships the modern async API (`openDatabaseAsync`,
`SQLiteProvider`, `useSQLiteContext`, `withTransactionAsync`) — added in SDK 51. No new
native dependency, no config plugin, works with `newArchEnabled: true`. Use WAL mode and
wrap every batch in `withTransactionAsync`.

`op-sqlite` is faster but adds a native dependency for throughput this workload has not
been shown to need. Revisit only if Phase 1 measurement says so.

---

## 5. Using local storage aggressively — and where to stop

"Abuse it to its extent" is the right instinct for reads. Three limits shape it: **what**
we store, **which devices** store it, and **how many rows**.

### 5.1 What to store

**Store aggressively:**
- Order history, items and payments, up to the row cap in §5.4.
- Full menu tree including modifier groups — the images already live on disk via
  `menuImageCache`, so mirror the `file://` paths, never base64 (the same trick
  `menuOfflineCache.stripInlineImages` already uses).
- Customer and loyalty tables — small and searched constantly.
- Inventory items, vendors, purchase orders.
- **Staff roster** — names, roles, avatars, `staff_profile_id`. See §5.2.
- Schedules, shifts, punch history.

**Never store:**
- Anything unsynced (Prime Rule).
- Card data, tokens, or full PAN.
- Base64 images.
- **PINs** — see §5.2. This one is not negotiable.

### 5.2 Staff and PINs — mirror the roster, never the PIN

Requested, and worth doing for the roster. But the PIN half has to be handled differently
than the rest, for a reason that only shows up in the code:

**PINs are stored in plaintext today.** `syncEmployees` selects `pin_plain` from
`location_members` and maps it straight onto `EmployeeProfile.pin`
(`services/employeeSyncService.ts`). Verification is a plain string compare —
`employees.find(emp => emp.pin === pin)` (`stores/useEmployeeStore.ts:184,275`, and again
at `app/(auth)/pin-login.tsx:675`). Nothing is hashed anywhere in the app; `bcryptjs` is
present in the dependency list but unused on this path.

The only thing protecting those PINs at rest is that `useEmployeeStore` persists through
`secureMMKVStorage` — the **AES-256 encrypted** MMKV bucket (`lib/storage.ts`).

`expo-sqlite` has **no encryption**. SQLCipher requires `op-sqlite` or a paid Expo
extension. So mirroring PINs into SQLite would take a plaintext credential out of an
encrypted store and write it to an unencrypted file. That is strictly worse than today.

**And it buys nothing — offline PIN login already works.** `useEmployeeStore` is
persisted, so the roster and PINs survive a restart, and `pin-login.tsx:675` already has a
working offline resolution path that reads from it.

| Data | Where it lives | Why |
| --- | --- | --- |
| Staff roster — name, role, avatar, `staff_profile_id`, `location_member_id` | **SQLite mirror** | Read constantly by order attribution, tips, scheduling, timeclock. Not a credential |
| **PIN (`pin_plain`)** | **`secureStorage` only — unchanged** | Plaintext credential. Encrypted MMKV is the strongest at-rest protection we currently have. Never joins the mirror |

Enforce it in the schema, the same way the Prime Rule is enforced: **`staff_mirror` has no
PIN column.** Then it cannot be mirrored by accident.

> **Separate ticket, out of scope here:** `pin_plain` + `===` comparison is worth fixing on
> its own merits — hash the PIN, compare the hash. Also note `lib/storage.ts` hardcodes the
> MMKV encryption key (`dexa-pos-secure-key-v1`) with its own comment saying *"In
> production, derive from device-specific key."* Neither is caused by this proposal, and
> neither should be fixed inside it.

### 5.3 Station scoping — POS only, not kiosk or KDS

Kiosks and KDS units are the cheapest hardware in the building and need the least data.
Mirroring history, customers or staff onto a self-service tablet in the dining room is
storage we don't need and PII exposure we don't want.

The idiom already exists — `PosSyncProvider` gates roughly twenty subsystems on
`const isKDS = selectedStation?.station_type === "kds"` (`contexts/PosSyncProvider.tsx:112`),
and `lib/authFlow.ts:11` maps `self_service` → kiosk. Extend it rather than inventing a
parallel mechanism:

```ts
// lib/mirror/policy.ts
type StationKind = 'pos' | 'kds' | 'kiosk';

export function stationKind(stationType?: string | null): StationKind {
  if (stationType === 'kds') return 'kds';
  if (stationType === 'self_service') return 'kiosk';
  return 'pos';
}

const MIRROR_POLICY: Record<StationKind, ReadonlySet<MirrorEntity>> = {
  pos:   ALL_ENTITIES,
  kiosk: new Set(['menu']),          // an ordering surface needs the menu, nothing else
  kds:   new Set(['kds_tickets']),   // tickets only; item names ride along on the ticket
};
```

| Entity | POS | Kiosk | KDS |
| --- | :---: | :---: | :---: |
| Menu | ✅ | ✅ | ❌ |
| KDS tickets / history | ✅ | ❌ | ✅ |
| Order history, payments | ✅ | ❌ | ❌ |
| Customers, loyalty | ✅ | ❌ | ❌ |
| **Staff roster** | ✅ | ❌ | ❌ |
| Inventory | ✅ | ❌ | ❌ |
| Scheduling, shifts | ✅ | ❌ | ❌ |

Two rules that make this safe rather than merely configured:

- **Enforce at the write boundary, not the read.** A single `canMirror(entity)` guard inside
  the mirror's write helper. A screen that shouldn't have the data can then never acquire it,
  even if someone later points it at the mirror by mistake.
- **Purge on station change.** If a device is re-provisioned POS → kiosk, drop every entity
  the new policy excludes. Wire this next to the existing station-selection flow, and treat
  it like the env-switch purge.

### 5.4 Row caps — bound the tables, don't just age them

Row caps beat time windows for predictable storage: a fixed time window is a different
number of rows at every location, a cap is the same everywhere. Time stays available as a
secondary bound where the data genuinely expires, but it is not the primary control.

**The numbers are deliberately not set here.** The existing constants in the codebase
(`MAX_CACHED_ORDERS`, `KDS_DONE_TICKET_LIMIT`, and the rest) were chosen for in-memory
JSON blobs with no query engine — a completely different set of constraints. Carrying them
across would be patching an old limit into a new design. These caps get chosen from
measurement, against the mechanism below.

| Table | Cap (per location) | Secondary bound | Prune key |
| --- | ---: | --- | --- |
| `orders_mirror` | *TBD* | — | `created_at DESC` |
| `order_items_mirror` | follows parent | — | cascade on order delete |
| `order_payments_mirror` | follows parent | — | cascade on order delete |
| `customers_mirror` | *TBD* | — | `last_seen_at DESC` |
| `staff_mirror` | *TBD* | — | active only |
| `inventory_mirror` | *TBD* | — | active only |
| `menu_mirror` | uncapped | — | replaced wholesale each sync |
| `kds_tickets_mirror` | *TBD* | *TBD* | `fire_time DESC` |

#### How to derive each cap

Phase 0 ships the instrumentation to answer this rather than guessing:

1. **Measure actual row cost.** Write 1,000 real rows per table on device, read
   `page_count × page_size`, and record **bytes per row including indexes** — the `payload`
   JSON column dominates, and it differs a lot between an order with two items and one
   with twenty.
2. **Set a device storage budget** for the whole mirror. This is the only genuinely
   top-down number, and it should come from the worst hardware in the fleet, not the best.
3. **Establish the workload each table has to serve.** For `orders_mirror` that is the
   question "how far back does a real cashier look up a check?" — answerable from
   `usePreviousOrdersStore` telemetry on which pages actually get requested, not from
   intuition.
4. **Cap = min(budget ÷ bytes-per-row, workload requirement × safety factor).** If the
   workload number exceeds the budget number, the budget wins and the freshness stamp
   explains the boundary to the operator.

Record the chosen values and the measurements behind them in §11 so the next person
changing a cap knows what it was derived from.

#### Enforcement

Prune inside the same transaction as the insert, not on a timer — a timer can be missed,
and a burst can overshoot the cap between ticks.

```sql
DELETE FROM orders_mirror
 WHERE location_id = ?
   AND db_order_id NOT IN (
     SELECT db_order_id FROM orders_mirror
      WHERE location_id = ? ORDER BY created_at DESC LIMIT ?   -- cap, injected
   );
```

Caps are a single exported config object, not literals scattered through call sites, so
tuning one is a one-line change and the values are auditable in one place.

Set `synced_through` to the oldest surviving `created_at` on every prune. That value is what
tells Analytics (§7, Phase 3) it must state the window it actually has instead of silently
under-reporting.

### 5.5 Guardrails

- **Retention:** prune on insert (§5.4), with a sweep on business-day rollover
  (`useBusinessDayRollover` already runs) as the backstop.
- **PII:** the mirror carries names, phones and emails. It must be dropped by the paths that
  already clear PII — `clearCacheData()` and the env-switch purge in `lib/storage.ts`
  (`reconcileEnvironmentOnBoot`). Miss this and a staging↔prod switch leaves production
  customer data on a staging device.
- **Size:** log the DB file size alongside `getStorageSizeStats()` in the existing storage
  monitor so growth is visible before it's a problem.
- **Schema version:** a version bump drops and rebuilds rather than migrating. The mirror is
  disposable; migration logic is a bug surface with no upside here.

---

## 6. Freshness UI — "Last synced 2 minutes ago"

This is a requirement, not a nicety. If a screen can show data the device fetched an hour
ago, it must say so. **We already have this pattern** — generalize it rather than invent it:

- `PosSyncState` (`types/menu.ts:265`) — `{ isLoading, isError, error, lastSyncedAt, isFromCache }`
- `MenuStaleBanner` (`components/menu/MenuStaleBanner.tsx`) — warning strip, tap to resync,
  with the existing `formatSyncedAt()` helper
- `MenuUnavailableState` — separates "first sync running" from "sync failed" from "nothing
  scheduled", which is exactly the distinction every migrated screen needs

### What to build

**`useMirrorFreshness(entity, locationId)`** — reads `mirror_sync_state`, returns:

```ts
{
  lastSuccessAt: string | null,
  ageMs: number | null,
  state: 'live' | 'fresh' | 'stale' | 'offline' | 'never',
  isRevalidating: boolean,
  retry: () => Promise<void>,
}
```

**`<SyncFreshness entity=… />`** — one shared component, three presentations:

| State | Condition | Presentation |
| --- | --- | --- |
| `live` | revalidated < 30 s ago, online | Nothing. Don't nag when it's current |
| `fresh` | < 5 min | Quiet muted line: `Last synced 2 minutes ago` |
| `stale` | > 5 min, or `isFromCache` | Amber strip, tap to sync — the `MenuStaleBanner` treatment |
| `offline` | no connectivity | Amber strip: `Offline — showing data from 2:14 PM` |
| `never` | no mirror rows yet | Skeleton + retry — the `MenuUnavailableState` treatment |

**Relative time, refreshed on a timer.** `formatSyncedAt()` currently renders absolute
(`" from 2:45 PM"`). Add a relative formatter (`just now` / `2 minutes ago` / `1 hour ago`
/ falls back to absolute past ~6 h) and tick it every 30 s while mounted. Absolute time is
still the right call for the `offline` state, where the operator wants the actual clock
time, so keep both.

**Placement:** header-right on list screens, under the title on dashboards. Never a modal,
never blocking. The data is already on screen — the stamp explains it, it doesn't gate it.

---

## 7. Phased plan — one page per phase

Every phase is **one screen**, shippable and testable alone, behind its own flag, with a
one-line rollback. Do not start the next until the current one has run a full service
period on a real device.

### Phase template

Each phase below carries the same five fields:

- **Flag** — `EXPO_PUBLIC_MIRROR_<PAGE>`, default off. Rollback is unsetting it.
- **Build** — what changes.
- **Test** — including the divergence test, which is the same on every phase:
  > With the flag on, create an order, kill the network mid-sync, force-quit, relaunch.
  > **The unsynced order must appear from Zustand, must NOT be in the mirror, and must not
  > be duplicated when it later syncs.** Then restore network, let it settle, confirm it
  > appears exactly once.
- **Done when** — the acceptance bar.
- **Watch for** — the specific failure mode of that page.

---

### Phase 0 — Foundation (no user-visible change)

**Build:** Add `expo-sqlite`. Create `lib/mirror/db.ts` (open, WAL, schema v1, version-bump
drop-and-rebuild). Create the order tables, `staff_mirror` and `mirror_sync_state`. Add
`lib/mirror/policy.ts` with `stationKind()` + `canMirror()` (§5.3) and the row caps (§5.4),
both enforced **inside the write helper** so no later phase can bypass them. Wire teardown
into `clearCacheData()`, `reconcileEnvironmentOnBoot()`, and station change. Add
`useMirrorFreshness` and `<SyncFreshness>`. **Write nothing, read nothing.**

**Test:**
- App boots with the DB created; zero behavior change anywhere.
- `clearCacheData()` empties it; a simulated staging→prod env switch drops it.
- **Station policy:** boot as `kds` and as `self_service` → only the permitted tables are
  created/writable; `canMirror('orders')` is false on both. Re-provision POS → kiosk → the
  excluded tables are dropped.
- **Row caps:** insert `cap + 500` synthetic orders → exactly `cap` survive, newest kept,
  and `synced_through` equals the oldest survivor. Re-run after any cap change.
- **Cap sizing:** the bytes-per-row instrumentation (§5.4) reports a figure for every table,
  on the lowest-spec device in the fleet.
- **PIN:** grep the built bundle and the schema — `staff_mirror` has no PIN column, and no
  mirror write path reads `EmployeeProfile.pin`.

**Done when:** the DB exists, is dropped by all three purge paths, enforces station policy
and row caps, and no screen reads it.

**Watch for:** the env-switch and station-change purges. If either is wrong, everything
after it leaks PII — across environments, or onto a dining-room kiosk.

---

### Phase 1 — Previous Orders *(the headline; start here)*

**Flag:** `EXPO_PUBLIC_MIRROR_PREVIOUS_ORDERS`

**Build:** Write to the mirror from `refreshPreviousOrders` and `goToPage`. Repoint the
list, pagination, search and filters at SQL. Keep `previousOrdersOfflineCache` in place and
untouched as the fallback — delete it only after this phase is proven. Add `<SyncFreshness>`
to the header.

**Test:** The divergence test, plus: enter the screen offline → rows render with
`Offline — showing data from …`; page forward and back offline → **works**, which it does
not today; search offline → hits the full mirrored window, not one page; refund an order on
another station → returns within one revalidation cycle.

**Done when:** entry paints from local with no skeleton, paging costs no round trip, and
offline pagination works.

**Watch for:** orders that exist locally but not on the server must render from Zustand
with their existing "Offline" badge (`_offlineUnsynced`, `usePreviousOrdersStore.ts:807`) —
**not** from the mirror. This is the exact seam where the old bug lived.

---

### Phase 2 — Online Orders board

**Flag:** `EXPO_PUBLIC_MIRROR_ONLINE_ORDERS`

**Build:** Mirror the board query; keep realtime as the live layer, upserting into the
mirror on each broadcast.

**Test:** Divergence test. Board renders instantly on entry; a new online order still
arrives live via realtime; business-day scoping (`placed_at`, per commit `82eb80e7`) is
preserved exactly.

**Done when:** board paints from local and realtime still lands within its normal latency.

**Watch for:** double-render between the mirror row and the realtime row for the same order.
Key strictly on `db_order_id`.

---

### Phase 3 — Analytics dashboard

**Flag:** `EXPO_PUBLIC_MIRROR_ANALYTICS`

**Build:** Replace the 20 raw `.from()` queries with aggregates over `orders_mirror` /
`order_payments_mirror`. Business-day scope and card/cash breakdown (per `916ee575`) computed
in SQL.

**Test:** Divergence test. **Numbers must match the current server-backed dashboard exactly**
for the same window — run both side by side before flipping. Then: open offline → renders
with a freshness stamp, which is a capability that does not exist today.

**Done when:** figures match server output for the mirrored window, and the screen opens
offline.

**Watch for:** the retention floor. If the selected range predates `synced_through`, say so
explicitly — `Showing the last N orders. Older data needs a connection.`, N read from
`synced_through` and the active cap — never silently under-report
revenue.

---

### Phase 4 — End of day + Batchout

**Flag:** `EXPO_PUBLIC_MIRROR_EOD`

**Build:** Local pre-compute of the close-out preview from the mirror. **The server stays
authoritative for the committed settlement figure** — local drives the preview only.

**Test:** Divergence test. Preview matches the server total on ten consecutive real
close-outs before this is trusted.

**Done when:** the preview renders instantly and matches server settlement every time.

**Watch for:** this screen decides money. If preview and server ever disagree, the server
wins and the UI must show that it did. Do not let a local number be the one someone acts on.

---

### Phase 5 — Customers

**Flag:** `EXPO_PUBLIC_MIRROR_CUSTOMERS`

**Build:** Mirror the customer table; index on phone and name; repoint type-ahead at local
`LIKE` / FTS.

**Test:** Divergence test. Search returns instantly with no debounce-network; a customer
added on another station appears after revalidation.

**Done when:** type-ahead is instant and works offline.

**Watch for:** a customer created offline lives in the queue, not the mirror — surface them
from Zustand in the same list.

---

### Phase 6 — Inventory

**Flag:** `EXPO_PUBLIC_MIRROR_INVENTORY`

**Build:** Mirror items, vendors and purchase orders. Repoint the 11 inventory screens
read-side only; writes keep their current RPC path unchanged.

**Test:** Divergence test per screen. Stock levels match server after a deduction.

**Done when:** all 11 screens read local and the list paints instantly.

**Watch for:** stock is time-sensitive. Use a short freshness threshold here — `stale` after
60 s, not 5 min.

---

### Phase 7 — Menu *(replaces `menuOfflineCache`)*

**Flag:** `EXPO_PUBLIC_MIRROR_MENU`

**Build:** Mirror the `get_pos_bootstrap_v1` payload into real tables. Keep image
`file://` paths, never base64. `MenuStaleBanner` switches to reading mirror freshness.
Delete `stores/menuOfflineCache.ts` once this holds for a full week.

**Test:** Divergence test. Boot offline → full menu with correct prices and 86 state;
snooze an item on another station → reflected after revalidation; the `menus: []`
empty-grid failure becomes unreproducible.

**Done when:** the menu grid paints on first frame every launch, online or off.

**Watch for:** **prices**. A stale menu means ringing up yesterday's prices —
`MenuStaleBanner` exists precisely for this. Keep the threshold tight and the banner loud.

---

### Phase 7.5 — Staff roster *(POS only)*

**Flag:** `EXPO_PUBLIC_MIRROR_STAFF`

**Build:** Mirror `staff_mirror` from `syncEmployees`. Repoint the **read-only** consumers —
order attribution, tip distribution, scheduling pickers, timeclock lists — at the mirror.
`useEmployeeStore` keeps owning login, session, and PINs, unchanged.

**Test:** Divergence test. Staff picker renders instantly and offline. Deactivate a staff
member on another device → gone after revalidation.
**Then the one that matters:** PIN login still works offline, still resolves from
`useEmployeeStore`, and `staff_mirror` still has no PIN column.

**Done when:** every read-only staff list is local, and the PIN path is provably untouched.

**Watch for:** scope creep into auth. If a change to this phase starts touching
`pin-login.tsx`, stop — that is a different ticket (§5.2).

---

### Phase 8 — Loyalty · Phase 9 — Scheduling and people · Phase 10 — KDS history

Same template, descending value. `EXPO_PUBLIC_MIRROR_LOYALTY`,
`EXPO_PUBLIC_MIRROR_SCHEDULING`, `EXPO_PUBLIC_MIRROR_KDS_HISTORY`. Each is low-risk by this
point; the patterns are established and the shared components exist.

---

### Explicitly out of scope

- **The write path.** Online-first stays. No phase changes how an order or item is created.
- **The offline operation queue.** Moving it to SQLite is gated behind the AUD-14
  measurement, which is explicit: *"Do not infer a performance defect or approve an
  optimization from source inspection alone."* If its gate (persistence P95 > 16.7 ms, or
  repeated >100 ms stalls overlapping persistence) is not met, **do not do it**.
- **`useOrderStore` persistence.** 18,614 lines, and `lib/storage.ts` has an entire
  apparatus built around its 50–300 KB blob. Row-level writes would make that apparatus
  unnecessary, but it is open-heart surgery on the most complex file in the repo. Default to
  never.

---

## 8. What this will not fix

| Not fixed | Why | What does |
| --- | --- | --- |
| RLS penalty (60–130×) | Server-side | Waves 1–5 |
| Realtime WAL RLS (74,414 s) | Server-side | Broadcast payload-trim work |
| `create_order` / `add_item` latency | Online-first writes must reach the server | RLS waves |
| Local-created-but-not-synced orders | A write-path problem | Existing reconcile layers (§2) |
| Payment terminal round-trips | Hardware | — |
| Print latency | Hardware | `PrinterService` work |
| Settings / key-value reads | MMKV is already memory-mapped | Leave on MMKV |

---

## 9. Risks

| Risk | Mitigation |
| --- | --- |
| **Divergence returns** | The Prime Rule + `db_order_id`-only primary key make an unsynced order structurally unmirrorable. Every phase re-runs the divergence test |
| Stale money shown as current | `<SyncFreshness>` mandatory on every financial screen; server authoritative for settlement |
| Silent under-reporting past the retention floor | Analytics must state the window when the range exceeds `synced_through` |
| **PIN leaked to unencrypted storage** | `staff_mirror` has **no PIN column** — structural, not a convention. PINs stay in `secureStorage` (AES-256 MMKV). `expo-sqlite` is unencrypted, so this is the one hard line (§5.2) |
| **PII on kiosk / KDS hardware** | `canMirror()` enforced at the write boundary; excluded tables dropped on station change. Verified in Phase 0 |
| PII at rest | Drop the DB in `clearCacheData()`, the env-switch purge, **and** station change. Verified in Phase 0 |
| Storage growth | Per-table row caps (§5.4) enforced in the insert transaction, not on a timer; DB size logged next to `getStorageSizeStats()` |
| Silent truncation at the row cap | `synced_through` updated on every prune; screens must state the window when a query reaches past it |
| Two read paths during rollout | One flag per page; the network path stays until each flag retires |
| Schema drift | Version bump drops and rebuilds — no migration logic |

---

## 10. Recommendation

Ship **Phase 0 and Phase 1** only, then stop and measure with the `perf.pos.*` telemetry
already in the app. Phase 1 delivers the loudest complaint — Previous Orders always loading
— touches no write path, and its rollback is unsetting one env var.

Everything after Phase 1 is the same pattern applied to a new screen, so the decision to
continue should be made with real numbers from a real service period, not from this document.

---

## 11. Review

_To be completed per phase. For each: screen-entry time before/after, page-change time,
offline behavior, and the divergence-test result._

| Phase | Shipped | Entry before → after | Divergence test | Notes |
| --- | --- | --- | --- | --- |
| 0 | ☐ | — | — | |
| 1 | ☐ | | | |

### Row caps as chosen

Filled in from the Phase 0 measurement (§5.4). Record the derivation, not just the number,
so a future change is an informed one.

| Table | Bytes/row (measured) | Device budget share | Workload requirement | **Cap chosen** | Set by / date |
| --- | ---: | ---: | ---: | ---: | --- |
| `orders_mirror` | | | | | |
| `customers_mirror` | | | | | |
| `staff_mirror` | | | | | |
| `inventory_mirror` | | | | | |
| `kds_tickets_mirror` | | | | | |

**Measurement device:** _lowest-spec model in the fleet — record model and Android version._
**Total mirror budget:** _TBD_
