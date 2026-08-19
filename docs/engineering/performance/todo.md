# P1 — Order processing shows no menu items until a manual "Sync POS"

## Report

Staff opened order-processing, the menu grid was empty ("No Menu Available —
There are currently no menus scheduled for this time"). Only Settings →
Syncing → **Sync POS** brought the items back.

## Root cause

The menu is 100% network-dependent on every cold start, and a failed boot sync
has **no recovery path**.

1. `stores/useMenuStore.ts` has **no MMKV persistence** — `create(...)` with no
   `persist` middleware (despite the `lastSelectedMenuId` comment claiming
   "persisted to avoid blank state on launch"). Every cold start begins with
   `menus: []`.
2. The TanStack Query cache is **in-memory only** — no persister is configured
   anywhere (`contexts/TanstackProvider.tsx`), so `['pos_sync', locationId]`
   dies with the process.
3. `hooks/pos/usePosSync.ts` can reach a **terminal error state**:
   `retry: 2` (client default) + `staleTime: Infinity` +
   `refetchOnReconnect: false` + `refetchOnWindowFocus: false`, and
   `PosSyncProvider` never unmounts — so `refetchOnMount` never fires again.
   Once the 3 attempts are burned, **nothing ever refetches it**. Only the
   manual `invalidateQueries(['pos_sync', …])` in `settings/syncing.tsx`
   (or a menu edit) revives it.
4. The timeout math makes 3 attempts easy to burn on bad WiFi:
   `withDeadline(..., DEADLINES.menuSync = 60_000)` wraps five parallel
   requests. Three 60s timeouts = 3 minutes, and because
   `connectionQuality`'s timeout window is only 30s, consecutive 60s timeouts
   are pruned before they can accumulate — the connection never trips to
   `slow`, so retries are never *paused* (which would have resumed on
   recovery); they're *spent*.
5. The failure is **invisible**. The `setSyncState` wiring in
   `PosSyncProvider` (lines 670–677) is commented out, so
   `useMenuStore.syncState` is permanently `{isLoading:false, isError:false}`.
   The UI falls through to MenuSection's scheduling copy, which points staff at
   *menu schedules* rather than at a sync failure.

So: a single bad-network window at app launch → blank menu for the rest of the
session, misdiagnosed on screen, curable only from a settings screen.

## Plan

- [x] 1. `services/menuImageCache.ts` — export `menuImagePath(itemId)` so the
      snapshot can reference on-disk images instead of base64.
- [x] 2. New `stores/menuOfflineCache.ts` — MMKV snapshot of the last good
      `PosSyncData`, per location, base64 images swapped for `file://` paths,
      7-day TTL. Mirrors `previousOrdersOfflineCache`.
- [x] 3. `lib/storage.ts` — sweep `menu_offline:` in `clearCacheData()`.
- [x] 4. `contexts/PosSyncProvider.tsx`
      - write the snapshot after every successful sync
      - hydrate from the snapshot at boot when the store is still empty
      - self-healing retry loop with backoff while the menu is empty
      - re-enable the `setSyncState` wiring
- [x] 5. `hooks/pos/usePosSync.ts` — `refetchOnReconnect: true` for this one
      query (no-op when data is present; fires only when there's no menu).
- [x] 6. `components/menu/MenuSection.tsx` — tell the truth in the empty state
      ("couldn't load the menu" + Retry) instead of blaming scheduling.
- [x] 7. Tests + typecheck.

## Review

### What changed

**`stores/menuOfflineCache.ts` (new)** — per-location MMKV snapshot of the last
good `PosSyncData`, 7-day TTL. Stores the raw RPC payload, so rehydration goes
through the exact same `setMenuData` transform a live sync does (no second code
path to drift). Base64 `image` blobs are swapped for the `file://` path
`resolveMenuImage` already writes them to, keeping a multi-MB payload out of
MMKV. Refuses to persist an empty menu — that would overwrite a good snapshot
with the blank state the cache exists to prevent.

**`contexts/PosSyncProvider.tsx`**
- Writes the snapshot after every successful sync.
- Hydrates from it at boot when `menus` is still empty. Declared *after* the
  `posSyncData` effect so a live sync always wins the ordering.
- **Self-healing retry loop**: while the location is set and there's still no
  `pos_sync` data, schedules a `refetch` on 10s → 20s → 40s → 60s backoff.
  Resets on success; skips while a fetch is in flight or `paused`
  (offline — `onlineManager` owns resuming that one).
- Re-enabled the commented-out `setSyncState` wiring, fed from `isFetching`
  rather than `isLoading` (once the query errors, its status is `error`, so
  `isLoading` stays false through every retry and a retry-in-flight would have
  rendered as a hard failure).

**`hooks/pos/usePosSync.ts`** — `refetchOnReconnect: true` (safe here and only
here: `staleTime: Infinity` means it can *only* fire when there's no menu at
all), `retry: 4` with exponential backoff.

**`components/menu/MenuUnavailableState.tsx` (new)** — splits the two causes
behind one symptom. `menus.length > 0` keeps the scheduling copy; `=== 0` now
says the menu couldn't be downloaded and offers a Retry button, so staff never
has to know Settings → Syncing exists. Kept as a leaf so subscribing to
`syncState` doesn't re-render the menu grid.

**`lib/storage.ts`** — `clearCacheData()` sweeps `menu_offline:`.

### Verification

- `npx tsc --noEmit` — clean.
- `npx jest __tests__/menuOfflineCache.test.ts` — 8/8 pass.
- Full suite: 1419 passed / 30 failed. The same 11 suites (30 tests) fail on a
  stashed clean tree — pre-existing, mostly a `uuid` ESM transform issue. Net
  effect of this change is +8 passing, 0 regressions.
- `npx eslint` on all touched files — 0 errors, and the warning set is
  byte-identical to before (all pre-existing).

## Round 2 — in-menu sync affordances

The fix above stopped the blank menu, but two states were still unhelpful:
a first sync rendered a text screen rather than the shape of the menu, and a
menu restored from the snapshot looked *completely normal* — so an operator
could ring up yesterday's prices with no signal and no way to refresh without
leaving for Settings.

- [x] `types/menu.ts` + `useMenuStore` — `PosSyncState.isFromCache`, set via
      `setMenuData(data, { fromCache })`. A cache hydrate now also *preserves*
      the live query's `isLoading`/`isError`/`error` rather than claiming the
      fetch finished — restoring a snapshot says nothing about the live request.
- [x] `components/menu/MenuGridSkeleton.tsx` (new) — chip row + 5-column tile
      grid mirroring `numColumns` / `estimatedItemSize` (240 with images, 86
      without), so the swap to the real grid isn't a jolt. Static, matching the
      house skeleton style (`ModifierScreenSkeleton`, `TableLayoutSkeleton`) —
      a pulse would animate on the thread the boot sync is competing for.
      Sized to content, not `flex:1`: its sibling grid slot is already flex-1,
      so a flex share here would halve the column and clip tiles mid-row.
- [x] `MenuUnavailableState` — shows the skeleton for a first load, but holds
      the "Menu Not Loaded" explanation steady once a sync has actually failed
      (the backoff retry loop would otherwise flash skeleton↔error every
      10–60s); the button carries the in-flight state instead.
- [x] `components/menu/MenuStaleBanner.tsx` (new) — slim strip above the grid,
      shown only when `isFromCache` or `isError`: "Menu may be out of date —
      showing the last synced menu from 2:45 PM. Tap to sync now." with a Sync
      button. Self-hiding, and suppressed when there is no menu at all so it
      can't stack a second retry under MenuUnavailableState's.
- [x] `__tests__/menuSyncStateProvenance.test.ts` — 7 tests over the
      live/cache/error transitions.

### Not done / follow-ups

- The 60s `DEADLINES.menuSync` deadline wraps five parallel requests, and
  `connectionQuality`'s 30s timeout window means consecutive 60s `pos_sync`
  timeouts get pruned before they can accumulate — so the connection never
  trips to `slow` on menu-sync failures alone. Worth revisiting whether that
  window should be relative to the deadline it's judging.
- `useMenuStore` still has no `persist` middleware; the comment on
  `lastSelectedMenuId` ("persisted to avoid blank state on launch") is still
  inaccurate. The snapshot cache covers the blank-menu symptom, but the
  last-selected-menu preference genuinely does not survive a restart.
- `uuid` is ESM and isn't in Jest's `transformIgnorePatterns`, which is what
  breaks the 11 pre-existing suites. `menuSyncStateProvenance.test.ts` works
  around it by stubbing the lazy `useModifierSidebarStore` require inside
  `setMenuData`. Fixing the config would likely revive all 11 — left alone
  here because those suites haven't run in a while and may have real drift
  hiding behind the import error.


---

## Appendix — Perf Roadmap & built-in-CFD sandbox planning notes

_Carried over from `alidika-dev-pos` during the staging merge; kept here so the planning history is not lost._

## Perf Roadmap — Phase 2: Render structural (code complete)

- [x] F8 — Menu grid migrated FlatList → **FlashList 1.7.6** (`npx expo install` pinned the SDK-53 version). **Requires a native rebuild** — FlashList ships native views (`AutoLayoutView`/`CellContainer`); old dev clients throw "View config not found for AutoLayoutView". Rebuild via `npm run android` (emulator) / EAS development build (Landi).
- [x] F8 fix — **`disableAutoLayout` required on New Architecture**: FlashList v1's native AutoLayoutView misdraws a dark rectangle over the viewport area below short content (newArch bug). Verified via adb UI dump (scroll viewport sized correctly; only the native overlay wrong) + before/after screencaps. Safe here: auto-layout correction targets variable-size cells; menu tiles are uniform. Also set `drawDistance={500}`. `MenuSection.tsx`: FlashList + `estimatedItemSize` (240 image-tiles / 78 text-tiles), `getItemType` separates spacer cells from MenuItem recycling pool, gutters moved to a `gridCell` wrapper (FlashList has no `columnWrapperStyle`). `MenuItem.tsx`: container width `19%` → `100%` (fills its cell). Recycling-safety: MenuItem has no local state; `OptimizedListImage` already takes `recyclingKey`. **Needs visual check on device** (gutter parity, last-row alignment).
- [x] F8 (deferred) — KDS ticket grid + orders carousel migrations stay gated on Phase 0 FPS baselines per plan.
- [x] F9 — Subscription/getState audit on hot screens: **verified already-clean, no changes needed.** Flagged `getState()` sites are inside effects/handlers (correct pattern); tables screen uses granular selectors; `useStationOrders` is O(n)-bounded with `useStableOrderList` stabilization; order-processing uses per-field selectors. The audit's render findings did not reproduce.
- [x] F10 — KDS derivations: **verified already memoized** (kds.tsx wraps the filter/aggregate/sort pipeline in one useMemo). No change.
- [x] Found dead code: `components/bill/PaymentModal.tsx` + `components/bill/ paymentView/SplitPaymentView.tsx` are never imported (SplitPaymentView still destructures the removed `orders[]` store field — would crash if ever mounted). Reported to user for deletion.
- [x] Verified: tsc 0 new errors (ItemCustomizationDialog 2 errors pre-existing), eslint 0 errors, 26/26 core tests.
- [ ] (User/on-device) menu grid: visual parity + fling-scroll FPS vs baseline; category-switch latency.

### Phase 2 review
Phase 2 shrank under verification: of the audit's three structural render findings, two (F9 subscriptions, F10 KDS memoization) were already in the target state — React Compiler plus earlier perf waves had done the work. The remaining genuine win was the FlashList grid migration. Lesson: this codebase's render layer is more optimized than fresh audits assume; verify before churning.

## Perf Roadmap — Phase 1: Quick wins (code complete)

Plan: `~/.claude/plans/role-objective-cryptic-dusk.md` · Verify each item against Phase 0 baselines per `docs/engineering/performance/perf-baseline-protocol.md`

- [x] F1 — `useOrderPayments` staleTime 0 → 60s (`hooks/orders/useOrderPayments.ts`) **+ realtime gate fix**: payments-query invalidation in `useOrdersRealtime.ts` was online-orders-only; now fires for all orders (unmounted = mark-stale only, no network) so the 60s cache has no cross-station freshness gap. Prefetch stays online-only.
- [x] F2 — POS boot block in `app/_layout.tsx` (draft cleanup, PrinterService start, payment/refund journal scans) moved from `useIsomorphicLayoutEffect` (blocked first paint) into `InteractionManager.runAfterInteractions`, with cancel on unmount.
- [x] F3 — `PosSyncProvider`: **deduped double sync** — floor plans + tax rates were fetched twice per store selection by two parallel effects; single owner now (the clear-then-sync effect). Employee sync + the floor/tax/template effect both deferred via InteractionManager. Note: `initializeOfflineSync` was already fire-and-forget (audit claim wrong, no change).
- [x] F4 — `OrderLineSection`: removed `itemLayoutAnimation` (LinearTransition spring re-animated every visible card on any data change). `entering` slide stays (iOS-only already).
- [x] F5 — Modifier precompute now warms the WHOLE active category (rAF-chunked, list order, modifier-bearing items only) instead of first 6/12; image prefetch still capped to visible window. Added FIFO cap (400 entries) to `preWarmCache` in `useModifierSidebarStore`.
- [x] F6 — `react-native-gifted-charts` lazy: confirmed expo-router import mode is `sync` (routes execute at boot), created `components/charts/LazyGiftedCharts.tsx` (React.lazy + Suspense facade) and swapped all 7 import sites. No static imports of the lib remain.
- [x] F7 — TanStack: explicit defaults (`networkMode: 'offlineFirst'`, `refetchOnReconnect: false`, `refetchOnWindowFocus: false`) + `lib/network/setupTanstackOnlineManager.ts` wires `onlineManager` to `getIsOnline()` (NetInfo + connectionQuality slow-mode, both subscriptions). `refetchOnReconnect:false` preserves pre-wiring behavior — reconnect recovery stays owned by useOrderSyncRecovery/sync queue (bad-WiFi cross-check honored).
- [x] Verified: tsc 0 new errors (9 implicit-any errors in `GiftedChartsSalesTrendChart.tsx` confirmed pre-existing by revert test), eslint 0 errors, 49/49 tests across sync/order/payment suites.
- [ ] (User/on-device) re-run baseline protocol on Landi; compare `pos.*` spans + cold start vs baseline.

### Phase 1 review
The two audit corrections that mattered: (1) the payments-query realtime invalidation was gated to online orders, so raising staleTime without un-gating it would have created a 60s cross-station payment blind spot; (2) PosSyncProvider was double-fetching floor plans and tax rates on every store selection — the dedupe is likely worth as much as the deferral. F7's onlineManager wiring deliberately pairs with `refetchOnReconnect: false`; flipping that to true later would re-introduce a reconnect stampede and must go through the bad-WiFi cross-check.

## Perf Roadmap — Phase 0: Measurement (code complete)

Plan: `~/.claude/plans/role-objective-cryptic-dusk.md` (approved 2026-06-11)

- [x] `lib/perf.ts` — interaction-span helper wrapping Sentry (startInactiveSpan + double-rAF end for tap-to-paint; cross-screen marks with 2-min TTL)
- [x] Instrument `pos.add_to_cart` (useOrderStore.addItemToActiveOrder — both draft fast path and regular path; tags `draft`, `merged`)
- [x] Instrument `pos.open_modifier_sheet` (MenuItem.handlePress; tags `item_id`, `has_modifiers`, `prewarmed`)
- [x] Instrument `pos.send_to_kitchen` (useOrderStore.sendNewItemsToKitchen — tap → optimistic state flip + toast paint; tags `item_count`)
- [x] Instrument `pos.open_payment` (usePaymentStore.open — guards → set({isOpen}) → paint; tags `method`, `view`)
- [x] Instrument `pos.boot_to_order` (markStart at pin-login success → markEnd at order-processing renderStage 2; TTL-cancels on KDS routes)
- [x] Instrument `pos.queue_flush` (offlineSyncService.processQueue — real flushes only; tags ready/blocked/pending counts, success/fail counts)
- [x] Write repeatable Landi baseline protocol doc (`docs/engineering/performance/perf-baseline-protocol.md`)
- [x] Type check + lint (0 errors; only pre-existing warnings) + 26 tests pass (offlineSyncBlocking, wave26AddItem, payment-store-sc)
- [ ] (User/on-device) run baseline protocol on Landi, fill budget-table baselines
- [ ] (User/Sentry UI) confirm slow/frozen frames per transaction; build `transaction.op:pos.interaction` dashboard

### Phase 0 review
Spans are standalone transactions (`op: pos.interaction`, `forceTransaction: true`) so they appear in Sentry Performance under the global 30% prod sample rate. Tap→paint spans end via double-rAF after the state commit, so the measured window includes the painted frame. `__DEV__` builds also log `[perf] <name>: <ms>ms` to console for on-device iteration without the dashboard. The `pos.boot_to_order` mark auto-cancels (attribute `cancelled:true`) after 2 minutes so KDS-routed logins never report phantom boots; `markEnd` is a no-op on plain navigations to order-processing.

## Completed

- [x] Speed up MenuSection for low-end devices
  - Hoisted `MenuItem` styles so each tile avoids a color-scheme subscription and style factory
  - Replaced repeated temporary-menu array scans with a memoized Set lookup
  - Reduced menu FlatList initial render and batch sizes to smooth category switches
  - Verified edited files have no diagnostics and targeted modifier/order-processing tests pass
- [x] Speed up order-processing screen safely
  - Tightened order-line list stability so visible order changes update without stale cached rows
  - Reduced render-time allocations in order-processing hot lists
  - Preserved draft/station filtering and existing order actions
  - Verified edited files have no diagnostics and targeted order-processing Jest guard passes
- [x] Fix DraggableTable "Loading..." on floor plan tiles — replaced fragile `getOrder()` with resilient `effectiveOrder` memo (O(1) fast path + O(n) fallback by `service_location_id`)
- [x] Fix merge-mode table selection tap
  - Identify gesture path blocking tap selection in merge mode
  - Update table gesture handling to allow tap-to-select while merge mode is active
  - Verify selection highlight and MergeActionBar counts update on tap
- [x] Fix sidebar table row tap in TablesPanel
  - Locate tap handler wiring in TablesPanel + Sidebar table list
  - Confirm TableListItem expects table vs handler signature
  - Fix handler so taps route correctly (match SeatedPanel)
  - Validate tap works in sidebar table list

## Pending

- [x] Fix cash full-refund display in Previous Orders
  - Use payment-level refund completion instead of comparing cash refunds to card totals
  - Show cash-priced subtotal/tax/net totals when the order was paid with cash pricing
  - Verify with targeted tests/type checks
- [ ] Clean up OrderLineItemsView modal design — layout is cramped/broken
  - Item names wrapping mid-word ("Macchiato" breaks to "Macchiat o")
  - Modifier text truncated ("+$" cut off on Syrup Flavors)
  - Left ITEMS column too narrow, causing excessive wrapping
  - File: `components/order/OrderLineItemsView.tsx`
- [ ] Fix merge-mode tap still opening context sheet
  - Ensure table gesture handlers re-render when merge mode toggles
  - Tie interaction mode to merge mode so stale handlers cannot fire
  - Validate tap selects without opening context sheet in merge mode

## Review

- Cash full refunds in Previous Orders: row refund state now compares each payment's refunded amount to that payment's actual charged amount, so cash-priced full refunds no longer show as partial. Expanded totals use cash subtotals/tax/net for cash-priced orders, and full refunds suppress the secondary refund badge to avoid duplicate Refunded pills. `npm test -- --runTestsByPath __tests__/paymentStatus.test.ts` passes. `npx tsc --noEmit` is still blocked by existing `lib/mockData.ts` inventory fixture errors unrelated to this change.

- MenuSection performance: Menu tiles now do less per-item setup work, temporary unlocked menu checks are O(1), and FlatList renders 15 initial cells / 10-cell batches instead of 25 / 20. `npm test -- --runTestsByPath __tests__/wave26AddItemStaleStateCleanup.test.ts __tests__/wave27OwnershipRecheck.test.ts` passes.
- Order-processing performance: `useStableOrderList` now fingerprints fields rendered by the order line and order badges, avoiding stale rows when totals/customer/status/display fields change. The order-line selector and grid render path also avoid several unnecessary date/array allocations. `npm test -- --runTestsByPath __tests__/wave27OwnershipRecheck.test.ts` passes. `npx tsc --noEmit` is still blocked by existing `lib/mockData.ts` fixture type errors unrelated to this change.
- Merge mode: tap-to-select works without long-press interference; long-press actions are disabled while merge mode is active.

---

# Built-in CFD JS-engine isolation (sandbox migration)

## Why

Today the directly-connected secondary display on Landi C20Pro mounts via `app.reactHost.createSurface(...)` — same Hermes runtime as the main POS. Idle carousel `setInterval`s, Reanimated fades, screen transitions, and React reconciliations on the secondary display compete for the same JS thread budget. This is the root cause of POS sluggishness on Landis with built-in CFD that the surgical fingerprint/dep-narrowing changes can't fully solve.

External CFDs over WebSocket are naturally fast because they're a separate device. We want the built-in display to behave the same way: separate JS engine, separate thread, talking to the main POS over an in-process channel.

## Approach: `@callstack/react-native-sandbox` v0.5+

Library spawns isolated React Native instances (own Hermes runtime + JS thread) within the same Android process. Component-based API (`<SandboxReactNativeView />`), `postMessage`/`onMessage` for host↔sandbox communication, TurboModule allowlisting per sandbox.

**Setup matches our requirements:**

- New Architecture enabled ✓ (`app.json: "newArchEnabled": true`)
- React Native 0.79.6 ≥ 0.78 ✓
- Hermes ✓
- Android shipped March 2026 ✓

**Transport: WebSocket to localhost** (chosen). The built-in CFD becomes "an external CFD that happens to live on the same device" — sandbox runs the existing external-CFD app verbatim, auto-connecting to `127.0.0.1:8765` instead of going through QR pairing. The 330µs TCP loopback is far below the 16ms frame budget; tradeoff worth it for zero new transport code.

**Architecture after migration:**

```
Main app (Hermes engine #1, JS thread #1)
└─ CFDProvider (unchanged)
   └─ CFDController.broadcast(payload) → WebSocketServer.broadcast()
      ↓ TCP loopback
Sandbox (Hermes engine #2, JS thread #2, mounted inside Android Presentation)
└─ Existing external-CFD app (app/(cfd)/cfd-display.tsx + components/cfd-client/*)
   ├─ TcpClient connects to 127.0.0.1:8765 (auto-paired, no QR)
   ├─ Hydrates useCFDClientStore from WS frames
   └─ Renders cart / payment / loyalty / idle screens
```

The CFD UI is **literally the same code** that runs on external CFD tablets today — same bundle, same WS client, same store, same screens. Only difference: when launched in built-in-sandbox mode, it skips QR pairing and connects to localhost.

**This deletes:** `stores/useCFDBuiltinStore.ts`, `useCFDBuiltinDisplayProvider`, the built-in payload-assembly effect in CFDProvider (~lines 1396–1503), all built-in-specific timers (`builtinIdleTimerRef`, the loyalty-confirmation built-in writes). The existing WebSocket effect already broadcasts on every relevant change; the built-in CFD just becomes another client.

## Critical files

- `android/app/src/main/java/com/temurappflowstudios/dexapos/secondarydisplay/SecondaryDisplayPresentation.kt:44-50` — currently calls `app.reactHost.createSurface(...)`. Will mount a tiny RN tree containing only `<SandboxReactNativeView />`.
- `components/cfd-builtin/CFDBuiltinDisplay.tsx` — currently renders the full CFD UI reading `useCFDBuiltinStore`. Will be reduced to a thin host that mounts the sandbox view and forwards `postMessage` payloads.
- `contexts/CFDProvider.tsx` — built-in payload effect (lines ~1396–1503 today) becomes `sandboxRef.current?.postMessage(payload)` instead of `useCFDBuiltinStore.update(payload)`. The `useCFDBuiltinStore` push path can be deleted.
- `stores/useCFDBuiltinStore.ts` — DELETED. The sandbox uses `useCFDClientStore` (already exists).
- `index.cfd.js` (new) — separate entry point, registers `CFDClientApp` via `AppRegistry.registerComponent`.
- `metro.config.js` — multi-entry bundle output.
- `app/(cfd)/cfd-display.tsx` and `components/cfd-client/*` — extracted/adapted into the sandbox bundle (no expo-router; direct render).
- `services/cfd/CFDController.ts` — no change. It already broadcasts to N WS clients; nothing about the sandbox path touches the controller.
- Sandbox-side message bridge — small new module that translates `globalThis.setOnMessage` payloads into `useCFDClientStore` writes, mirroring what the WS client currently does on receipt of a `state_update` frame.
