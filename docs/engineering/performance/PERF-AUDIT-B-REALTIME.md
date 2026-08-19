# Realtime, Fetch & Invalidation Audit (HEAD)

## 0. Code pin + anchor status

- Branch `Table-And-Order-Syncing` @ `91ad9674` (clean tree at audit start). `app.json` version **2.1.6**, `package.json` 1.0.1.
- (a) Fresh-object partialize in useOrderStore persist — **PRESENT** (`stores/useOrderStore.ts:17431` `const filteredOrdersById: Record<string, OrderProfile> = {}`).
- (b) SplitPaymentView whole-store hook — **PRESENT** (`components/bill/ paymentView/SplitPaymentView.tsx:40` `const { activeOrderOutstandingTotal } = useOrderStore();`).
- (c) kds.tsx ScrollView+.map — **PRESENT** (`app/(main)/kds.tsx:3825` `<ScrollView key={`kds-${activeStatus}-${columnCount}`}` over `columnizedTickets.map`).

## 1. Subscription inventory

Repo-wide: **zero** `.on('postgres_changes')` call sites (grep count = 0). Zero `qr-session` consumers in this app (storefront-only topic). All client realtime is broadcast:

| # | file:line | Topic | Events | Owner / mount | Lifecycle |
|---|---|---|---|---|---|
| 1 | `hooks/realtime/useOrdersRealtime.ts:388-395` | **`location:{id}:orders`** ← matches the trigger topic | INSERT/UPDATE/DELETE | `LocationRealtimeProvider` ← `app/(main)/_layout.tsx:242 (KDS), :279 (POS)` | `useRealtimeChannel` unsubscribes on unmount; unsub on background / resub on active (`useRealtimechannel.ts:327-366`); exponential backoff capped 60s (`:31, 208-221`) |
| 2 | `hooks/realtime/useFloorRealtime.ts:191-198` | `location:{id}:tables` | 8 events incl. SESSION_ORDER_UPDATE (`:79-91`) | same provider | same |
| 3 | `useOrdersRealtime.ts:455-461` | `location:{id}:kitchen` | ORDER_INSERT/UPDATE | `useKitchenRealtime` — **no live mount** | dead code |
| 4 | `useFloorRealtime.ts:278-284` | `session:{id}:events` | SESSION_EVENT | session detail view only | unmount |
| 5 | `hooks/useRemoteActionsListener.ts:142` | `station:{stationId}` | 7 remote actions | `RemoteActionsProvider` (root) | `removeChannel` `:178` |
| 6 | `hooks/useSessionKickListener.ts:244` | `station-kick:{deviceId}` | "kick" | kick provider (root) | `removeChannel` `:294` + 30s poll fallback `:309` |
| 7 | `hooks/usePinSignIn.ts:72-78` | `station-kick:{other}` | one-shot send | login | immediate removal |
| 8 | `stores/useLocationConfigStore.ts:104-133` | `location:{id}:settings` | CONFIG_UPDATE send | config writes | safety-timer removal |

**Channels alive on a POS terminal**, floor plan OR open order (these are provider-level; Slot navigation doesn't unmount them): **4 persistent** (orders, tables, station, station-kick). The session-long overlays (PaymentBottomSheet, PaymentDetailBottomSheet, OnlineOrderDrawer, MenuSearchSheet, CFDProvider) mount **no additional Supabase channels** — CFD talks over the local WebSocket. Re-subscribe churn: `useRealtimeChannel` deps are stable (topic/enabled/memoized events); the known churn source is Clerk JWT refresh tearing down both location channels (documented at `useFloorRealtime.ts:210-219`), mitigated by the staleness-gated catch-up.

## 2. Double fan-out verdict

| Table | Broadcast pipe consumer | postgres_changes consumer | Verdict |
|---|---|---|---|
| orders | `useOrdersRealtime.ts:388` → `_handleOrderBroadcast` fan-out | **none** (0 grep hits repo-wide) | **NO double fan-out** |
| order_items | carried inside order broadcast (v1) / `item_count` (v2) | none | NO |
| order_payments | embedded `order_payments` block on INSERT/payment-change broadcasts; separately re-fetched via `['order-payments']` query | none | NO |

The client consumes **one pipe**. The 13-table postgres_changes publication has zero client consumers — it is pure server-side WAL/replication cost; dropping tables from it is a server-only fix with **zero client code impact** (verify no OTHER app consumes it before dropping).

## 3. Handler cost, persist-arming, payload use

**`useOrdersRealtime.handleMessage`** (`useOrdersRealtime.ts:333-386`): per event — observer-gated `invalidateQueries(['order-payments', orderId])` (`:356-363`), payments `prefetchQuery` only for `order_source==='online'` (`:367-371`), then `onOrderChange` → main-layout fan-out (`app/(main)/_layout.tsx:201-209`) inside `unstable_batchedUpdates` to **three** stores.

**`useOrderStore._handleOrderBroadcast`** (`:4992-6154`) — the expensive one:
- Coalescing: 50ms per-order queue-last throttle (`:4088, 5011-5031`); no global coalescing (25 distinct orders → 25 parallel pipelines).
- Persist-arming: any `set()` inside arms the 300ms lazy writer with the full 150–300 KB partialize. Paths that DO `set()`: remote `upsertOrder` merge (`:6130-6136` → `:6732-6764`), meaningful own-order merges, `pendingBackendUpdates` queuing (`:5980-5990`). Paths that do NOT (early return, no arm): throttle queue (module dicts), own-station pending-items block (`:5100-5126`), **no-meaningful-change skip** (`:5215-5218`), view_scope reject (`:6086-6098`).
- Working-set distinction: **none for merging** — with `view_scope='location'` every remote non-draft order at the location is merged and **arms persist** even though the persisted subset (persistable ∪ active ∪ workingSet ∪ unsynced) may be unchanged; fresh-object partialize (`:17431-17462`) defeats the adapter's ref-equality skip (`lib/storage.ts:361-368`), so each arm = full stringify. Remote drafts are rejected (`:6229-6235`); `view_scope='own'` rejects all remote POS orders (`:6241-6247`).
- Sync work per remote merge: `transformBroadcastToOrder` (~50-field map, `utils/orderTransformers.ts:656-793`), Immer `freeze` write, `queueMicrotask(recalculateOrder)` full totals pass (`:6769-6776`), possible `_debouncedOrderRefresh` → `get_order_details` RPC on item_count mismatch (`:6041-6049` → `:16416-16424`, 500ms debounce + 5s/order cooldown `:938`).

**`useKDSStore.handleOrderBroadcast`** (`useKDSStore.ts:2249-2290`): kitchen-relevance pre-gate then 80ms per-order debounce — cheap for non-kitchen events. **`usePreviousOrdersStore._handleOrderBroadcast`** (`:1543-1580`): O(1) lookup, surgical patch — cheap. **`useFloorRealtime.handleMessage`** (`useFloorRealtime.ts:160-189`): signal-only → `get_location_table_status_v2` RPC, 300ms debounce + 1.5s min-interval (`:39-47`).

**Payload-trim check** — fields actually read from the ~70-field broadcast order (transformer `orderTransformers.ts:656-793` + handler guards `useOrderStore.ts:5181-5213`): id, order_number, display_number, station_id, location_id, order_type, status, check_status, reopen_count, payment_status, table_number, session_id, server_name, assigned_server_id, created_by_staff_id, customer_{name,phone,email,id}, delivery_address, card_total, total_amount, cash_total, card_tax_amount, tax_amount, discount_amount, service_charge (+6 SC snapshot fields), amount_paid, amount_due, cash_amount_due, item_count, sync_version, order_source, delivery_platform, split_payment_path, created_at, sent_to_kitchen_at, completed_at, _broadcast_version, order_items / order_payments / payment_items / reversals / order_refund_items blocks (~45 fields read).
**Never read** (~20 fields ≈ 25–30% of header bytes): external_id, merchant_id, created_by_user_id, seat_number, special_instructions, subtotal, tip_amount (header-level), card_subtotal, cash_subtotal, effective_subtotal, effective_tax_amount, effective_total, payment_pricing_mode, cash_discount_applied, cash_discount_amount, started_preparing_at, ready_at, cancelled_at, voided_at, voided_by, void_reason, cancellation_reason, updated_at, **is_offline** (only read on full-fetch path `orderTransformers.ts:1318`, never from broadcasts — so it is NOT used as an echo guard). Payments block: `terminal_response` IS read (RRN extraction, `orderTransformers.ts:1173-1183`) but only 2 keys of the blob — the rest of the ~45-field × N-payments block is the largest per-byte trim candidate on payment-write broadcasts.

## 4. Mutation echo

None of the three hot mutations use `useMutation` — all are **queue-first store actions** (useMutation exists only for close/reopen/void-check, tip-adjust, refunds: `hooks/orders/useOrderActions.ts:12,53,101`, close_check onSuccess invalidates `['orderHistory','list']` + `['orderHistory','filterCounts']` `:32-36`).

- **Add item**: `addItemToActiveOrder` optimistic push + deferred totals (`useOrderStore.ts:7835-8065`, `:4738-4750`) → `queueOperation({type:"add_item"})` (`:1583-1600`) → `scheduleSync()` **3s debounce** even online (`offlineSyncService.ts:750-764`) → executor RPC (`offlineSyncInit.ts:1884+`). Priority ladder `offlineSyncService.ts:85-139`.
- **Send to kitchen**: `send_to_kitchen` op (priority 4) via session side-effects; **payment**: `process_payment` op (priority 5).

**Echo loop** for one add-item tap: local set() ×2 (item + totals) → queue write (sync-MMKV) → ≤3s → RPC → server writes order_items + orders → trigger → broadcast arrives back → `handleMessage` → `_handleOrderBroadcast`:
- **Self-origin filter exists and is layered** (no explicit "drop own station at entry"): (i) pending-items block, own-station only, 3–10s dynamic (`:5100-5126`) — returns before any set(); (ii) `noMeaningfulChange` compare incl. item_count and `sync_version` kitchen-advance (`:5181-5218`) — returns before set(); (iii) own-station mutation window 3s suppresses the full-refetch triggers (`:6008-6014, 6035-6053`); (iv) conflict detection skipped for own station (`:5227`). `sync_version` **is** used (stale-broadcast guard + kitchen advance); `is_offline` is **not**.
- Persist arming by the echo: only when the echo is "meaningful" (typically when server-recomputed totals differ from the local calculator by ≥1¢, or the echo lands after the block expires) — slip-through, not the rule.

**Count for ONE add-item tap @ 25 open orders (this terminal)**: network round-trips **1** (add_item RPC; +1 `apply_service_charge_v1` iff SC drift ≥$0.01, `:4874-4893`); broadcast msgs received back **1** (+1 per SC write); handler invocations **4** (handleMessage + 3-store fan-out); useOrderStore `set()` **2–3** (item, totals, rarely echo-merge); persist fires **1–2** full-slice stringifies; sync-queue MMKV writes **2** (enqueue + complete).

## 5. Invalidation → refetch map

| Call site | Key | Trigger | Refetch payload | Class |
|---|---|---|---|---|
| `useOrdersRealtime.ts:361-362` | `['order-payments', orderId]` | broadcast, only if observer mounted | payments for one order | GROWS (payments/order) |
| `hooks/pos/useOrderSyncRecovery.ts:43-45` | `['orders','active',locId]` | channel reconnect (throttled: skip-if-fetching + 15s min gap `:7, 28-46`); 30s fallback poll while channel down (`:60`) | **`get_active_orders_v1`** ~150–250 KB | **GROWS** |
| `contexts/PosSyncProvider.tsx:760-764` | `['orders','active',locId]` | app resume, only if cache >2min old | same RPC | GROWS |
| `hooks/orders/useOrderActions.ts:32-36, 80-81, 126-127`; `useRefundMutation.ts:519-520`; `useTipAdjustMutation.ts:266` | `['orderHistory','list']` (+active in some) | mutation onSuccess | history page 50 | GROWS |
| `AdvancedRefundModal.tsx:288,360,502,527`; `TipAdjustSheet.tsx:119` | `['orderHistory']` root | refund/tip | whole history family | GROWS, broad |
| `app/(main)/settings/syncing.tsx:55-62` | `['orders']`, `['inventory']`, `['standalone_sync']` | manual button | broad | GROWS, broad |
| `menu/add-item.tsx:154`, `edit-item.tsx:227`, `usePosSync.ts:157-165` | `['pos_sync',locId]` | menu edit/manual | full menu sync | STATIC-ish (menu size) |
| `useInventoryStore.ts:774,870` | `['inventory_sync',locId]` | inventory edits | inventory | GROWS |
| **`services/remoteActions.ts:83`** | **no key — everything** | remote force_refresh | ALL mounted queries | broadest possible |

**`get_active_orders_v1` refire triggers, effective rush frequency**: realtime reconnect (throttled 15s) ≈ 0–4/hr on stable Wi-Fi; resume >2min stale ≈ per pocketing of the tablet; 30s poll ONLY while channel down; manual sync button. **Steady-state at rush: ~0/min** — the 150–250 KB fetch is not part of the hot loop. The hot-loop refetch is `get_order_details` (per remote item_count change, §3).

## 6. Polling

| Timer | Period | Fetch | Class | Fires while hidden? |
|---|---|---|---|---|
| `useLocationStations` | 30s `refetchInterval` (`hooks/useLocationStations.ts:33`) | `get_location_stations_with_status` | STATIC | while any consumer mounted; Slot unmounts blurred screens |
| Settings→Stations inline | 30s (`settings/stations.tsx:75`) / station-select 60s (`station-select.tsx:265-279`) | same RPC | STATIC | screen-mounted only |
| Session-kick layer 2 | 30s (`useSessionKickListener.ts:309`) | `check_device_session_status` | STATIC | yes (root provider) |
| Heartbeat / terminal / printer | 60s / 90s / 2m (`heartbeat.ts:14`, `terminalHealthCheck.ts:24`, `starPrinterHealthCheck.ts:28`) | heartbeat RPC / probes | STATIC | pause on background |
| Floor heartbeat | 45s staleness-gated (`useFloorRealtime.ts:56, 227-233`) | `get_location_table_status_v2` | GROWS (sessions) | provider-level, yes |
| Floor fallback | 5s **only while channel down** (`:59, 239-244`) | full floor snapshot | GROWS | — |
| KDS tickets | none healthy; 30s display-filtered; 15s disconnected (`kds.tsx:2500-2513`) | `get_kds_tickets` | GROWS | KDS station only |
| Offline queue fallback | 60s `processQueueNow()` (`offlineSyncService.ts:449`) | queued RPCs if any | — | yes |

## 7. Query config table

Defaults (`contexts/TanstackProvider.tsx:5-26`): staleTime 5m, gcTime 5m, retry 2, `networkMode: offlineFirst`, `refetchOnReconnect: false`, `refetchOnWindowFocus: false` (focusManager unwired), refetchOnMount default(stale).

| Query | Key | Overrides | Select cost |
|---|---|---|---|
| Active orders | `['orders','active',locId,stationId]` | staleTime 2m, gcTime 3m, no focus/reconnect (`useOrdersQuery.ts:138-143`) | `get_active_orders_v1` p_limit 200; hydration fingerprint-deduped (`:148-150`) |
| Order payments | `['order-payments',orderId]` | defaults | per-order payments |
| POS sync (menu) | `['pos_sync',locId]` | staleTime Infinity, gcTime 2h (`usePosSync.ts:32-144`) | `get_pos_full_sync` + recipes + tax rates |
| History | `['orderHistory','list',...]` | defaults; infinite 50/page (`useOrderHistory.ts:12,103`) | orders select + embeds |
| Stations | `['location-stations',locId]` | staleTime 30s, **refetchInterval 30s** (`useLocationStations.ts:32-33`) | stations RPC |

No `placeholderData`/`keepPreviousData` on the hot queries; no heavy select-transforms (orders hydration cost lives in the store, gated by fingerprint).

## 8. Reconnect storm

A Wi-Fi blip → restore does **not** produce a thundering herd; the pieces and their spacing:
1. Channel resubscribes: per-channel exponential backoff capped 60s (`useRealtimechannel.ts:31, 208-221`); no cross-channel jitter (both location channels retry on their own schedules).
2. `onlineManager.setOnline(true)` via `setupTanstackOnlineManager.ts:26-36` — but `refetchOnReconnect: false` globally, so **no stale-query stampede** (explicit design note `TanstackProvider.tsx:11-20`); it only unpauses paused retries.
3. `useOrderSyncRecovery` fires ONE `['orders','active']` invalidation on reconnect, skip-if-fetching + 15s min gap (`useOrderSyncRecovery.ts:28-46`) → one 150–250 KB `get_active_orders_v1`.
4. Floor catch-up is staleness-gated (`useFloorRealtime.ts:207-222`), usually the lightweight session refresh.
5. Offline queue: NetInfo online → `connectionQuality.reset()` + flush (`offlineSyncService.ts:700-730`), ops sequential with `syncInProgress` gate; queued ops replay one RPC at a time.
6. Persist storm: the recovery fetch → hydration → store writes → a handful of full-slice persist fires; bounded, not a storm.
Worst case is a **flapping** network: each flap re-runs 3+5 (bounded by the 15s invalidation gap and the sequential queue), plus NetInfo reachability probes (`offlineSyncService.ts:424-432`).

## 9. Per-minute load model — ONE busy terminal at rush

Assumptions: 25 open orders; 30 order-writes/min floor-wide; the busy terminal originates 60% (18/min own, 12/min remote); `view_scope='location'`; all open orders locally hydrated (tableOrderPrefetch); ~10 session-events/min on the tables topic.

| Metric | Arithmetic | /min |
|---|---|---|
| Realtime msgs received | 30 (orders topic) + 10 (tables) + 0 (postgres_changes — none) | **~40** |
| Handler invocations | orders: 30 × (1 handleMessage + 3 store handlers) = 120; tables: 10 × 1 | **~130** |
| useOrderStore `set()` | local mutations 18×2 = 36; remote merges 12×1 = 12; get_order_details responses ≤12×1 = 12; own-echo slip-through ~3 | **~60** |
| Persist fires (300ms ceiling = 200/min) | ~60 set()/min ≈ 1/s, mostly >300ms apart → most arm-fire individually; bursts coalesce ⇒ ~0.7×set() | **~40** × 150–300 KB = **6–12 MB/min JSON.stringify on the JS thread** |
| Refetches | `get_order_details` ≤12 (item_count mismatches, 5s/order cooldown); floor status ~7 (1.5s throttle); `get_active_orders_v1` ~0 | **~19** |
| Bytes ingress | broadcasts 30×~8 KB + get_order_details 12×~20 KB + floor 7×~10 KB | **~0.55 MB/min** |

The asymmetry matches the field signal: broadcast load is identical fleet-wide, but **persist-fire volume scales with the terminal's own mutation rate** (36 of ~60 set()/min are local) — the busiest terminal pays 2–3× the stringify tax of the idle one, on top of the same merge load.

**Fix-lever recompute:**

| Lever | msgs processed | store writes | persist fires | Notes |
|---|---|---|---|---|
| baseline | 40 | 60 | ~40 (6–12 MB/min) | |
| (a) self-echo suppression (drop `station_id===self` at handler entry) | 40 received / **22 processed** (−45%) | ~57 (−5%) | ~38 (−5%) | echoes already mostly early-return; saves parse+guard work, small |
| (b) persist-arming split (remote/non-working-set merges + detail-sync writes don't arm persist) | 40 | 60 | **~28 (−30%)**, and each avoided fire is a full-slice stringify → **−30-40% stringify MB/min** | biggest JS-thread lever; pairs with fixing fresh-object partialize (ref-equality skip currently dead) |
| (c) pipe dedupe | n/a — single pipe confirmed | — | — | server-only: drop 13-table publication (verify no other consumer) |
| (d) broadcast payload trim (~20 unread header fields + terminal_response blob except RRN keys) | 40 (−30-40% **bytes**) | 60 | ~40 | cuts parse cost + realtime egress; biggest effect on payment-write broadcasts |
| (a)+(b)+(d) combined | −45% processed, −35% bytes | −5% | **−35%** fires, −40% stringify MB | |

## Per-event cost summary — one order-write elsewhere, cost to this terminal

1 broadcast (~5–15 KB; + payments block if payment-related) → envelope parse → 4 handler entries → 50ms throttle check → remote-merge: transform (~50 fields) + Immer freeze + `recalculateOrder` + **persist arm (full 150–300 KB stringify within 300ms)** → if item_count changed: +1 `get_order_details` (~10–30 KB) after 500ms → second big merge + second persist arm → possible SC-drift RPC → possible second broadcast. Fleet-wide: 1 write ≈ 2–5 client RPCs + N stringifies.

## Top 10 findings ranked by contribution to busiest-terminal lag

1. **Persist stringify volume scales with own mutation rate** — ~40 full-slice (150–300 KB) stringifies/min at rush; the one variable that separates the busy terminal from the idle one.
2. **Remote merges arm persist for orders outside the persisted subset** (`upsertOrder` set() at `:6732` + fresh-object partialize `:17431` killing the ref-equality skip `lib/storage.ts:361-368`) — ~24 avoidable full-slice fires/min.
3. **item_count-mismatch → `get_order_details` per remote write** (`:6041-6049`) — up to 12 RPC + big-merge cycles/min on the hot loop.
4. **Unconditional 3-store fan-out per broadcast** (`_layout.tsx:201-209`) — 120 handler entries/min, all on the JS thread that's also running the till.
5. **Unguarded console volume in exactly these paths** (~170 unguarded in useOrderStore; prior audit) — multiplies per-event cost under Hermes.
6. **Payment broadcasts carry the full payments block** (~45 fields × N payments incl. `terminal_response`) parsed by every device; client reads 2 keys of the blob.
7. **`recalculateOrder` per remote upsert** (`:6769-6776`) — full Decimal totals pass for orders this station isn't viewing.
8. **Floor signal→RPC at the 1.5s ceiling** (`useFloorRealtime.ts:47`) — up to 40 `get_location_table_status_v2`/min/station when session events stream.
9. **Queue-first + 3s debounce on every local op** (`offlineSyncService.ts:750-764`) — each tap costs sync-queue MMKV writes + dispatcher overhead even online, adding fixed JS work per mutation on the busiest terminal.
10. **SC-drift echo** (`:16207-16272` after detail syncs) — bounded but each fire is a server write → another fleet broadcast.

## Fix-lever savings table

| Lever | msgs processed | store writes | persist fires / stringify MB | bytes ingress |
|---|---|---|---|---|
| Self-echo suppression at handler entry | **−45%** | −5% | −5% | 0 |
| Persist-arming split (non-working-set) + partialize identity fix | 0 | 0 | **−30-40%** | 0 |
| Pipe dedupe | 0 client (single pipe; server-only publication trim) | 0 | 0 | 0 |
| Broadcast payload trim (unread ~20 header fields + processor blob) | 0 | 0 | 0 | **−30-40%** |

## Unknowns requiring runtime measurement

1. Actual persist fire rate + stringify wall time at rush — counters/spans in `lazyDebouncedWrite` (`lib/storage.ts:361-385`); decides how much of the busy-terminal lag lever (b) recovers.
2. Own-echo slip-through rate (how often `noMeaningfulChange` fails on own echoes because server totals differ by ≥1¢) — count entries past `:5215` where `isOwnStationOrder`.
3. Real `get_order_details` rate at rush — PostgREST logs by RPC name per station.
4. Actual broadcast payload sizes (header-only vs payment-write) — realtime inspector or byte counter in `handleMessage`.
5. Production `view_scope` of the busy terminal — if `'own'`, lever (b) shrinks and the model's remote-merge column drops to ~0.
6. Whether the tables-topic `SESSION_ORDER_UPDATE` fires on plain order writes (server emitter not in this repo) — determines floor-RPC coupling to order traffic.
7. Whether any other system consumes the postgres_changes publication before dropping tables from it.
