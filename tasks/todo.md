# Tasks

## Perf Roadmap — Phase 3: Data layer + Tables flow (in progress)

Plan approved 2026-06-11 (persona-reviewed: 3 blockers fixed in design). Order: T → A → B. Wave C deferred.

### Wave T — Tables & dine-in (code complete)
- [x] **Regression fix (user-reported)**: floor switch showed all tables available. Root cause chain: `_patchSessionsFromTables` cleared OTHER plans' sessions on every plan-scoped patch → each CLEAR poisoned the 30s `recentlyClearedSessions` TTL map → `fetchFloorPlanSnapshot` stripped those sessions from every fresh fetch (incl. T1a's prefetch re-warm + the cached-path hydrate). Fix: plan-scoped clear sweep (only clear sessions of tables IN the snapshot); cached-path now hydrates the session store at switch (`setActiveFloorPlan`). Regression test: `__tests__/patchSessionsPlanScoped.test.ts` (3 tests).
- [x] T0: spans `pos.floor_switch` (tab press, tag `cached`; skips no-op tap on active plan) + `pos.table_open` (markStart in `usePendingTableOverlay.openTable` → markEnd at TableOrderView renderStage≥1, tag `prefetch_hit`)
- [x] T1a (revised): `setActiveFloorPlan` ALREADY paints any cached snapshot (explorer claim wrong); real gap was `prefetchFloorPlan` early-returning on ANY cache → permanently stale entries. Now re-warms entries older than 30s, so post-switch background refreshes mostly no-op.
- [x] T1b: broadcast-debounce reconcile in `useFloorRealtime` skips when an authoritative snapshot landed <1.2s ago; (re)subscribe catch-up, heartbeat, and fallback poll deliberately NOT suppressed.
- [x] T2a: `loadFloorPlanStatus` now reuses previous per-table object identities via depth-3 value-equality (`shallowValueEqual` — conservative on unknown fields). `useShallow(s.tables)` subscribers skip re-rendering when elements identical; only genuinely changed tables propagate.
- [x] T3a: `useTableSession` mount-path fetch now `await ensureOrderPrefetched(...)` (joins the global in-flight prefetch; kills the duplicate parallel `syncOrderFromDatabase`). Post-seat + recovery call sites left as-is (no race there). Added `__DEV__` log on Priority-3 O(n) scan hits.
- [x] T3b: `prefetchCoursing` in tableOrderPrefetch (gated on `config.dining.enableCoursing`; mirrors the hook's 10s/lastSyncAt + syncing guards; fires on cached hits AND after prefetch resolves) — coursing loads at tap time instead of screen mount.
- [x] T3c: reservations 30s interval cleanup verified CORRECT as-is (explorer claim wrong; cleanup clears both task and interval). No change.
- [x] Verified: tsc 0 new errors (useFloorPlanStore:1500 error pre-exists at HEAD:1447 — line shift only), eslint 0 errors, rapidTableOrderHydration + sync suites pass (21/21). NOTE: `tableReopenCheckWiring` + `clearTableServedTransition` source-snapshot suites fail on HEAD too (pre-existing drift, asserted files untouched).
- [ ] (User) on-device: switch floor tabs (watch `[perf] pos.floor_switch` in metro/logcat; no skeleton on revisited plans), tap occupied table (`pos.table_open` with prefetch_hit=true), two-station session change re-renders only the affected table.

### Wave A — Kitchen/payment client cuts (code complete)
- [x] Pre-flight PASSED: `pg_get_functiondef(update_order_status)` identical on staging AND prod to the repo reference (returns post-update jsonb row; P0001 for both not-found and already-in-status). Note: prod copy lacks `SET search_path` (pre-existing convention violation, untouched).
- [x] A1: new `OrderService.ensureOrderOutOfDraft` helper (success → trust RPC row, NO verify; ambiguous P0001/"already in" → verify-SELECT discriminates not-found vs benign; other errors → fail). Converted **FIVE** sites (not the plan's four — exploration found more): `sendNewItemsToKitchen`, `sendNewItemsToKitchenForOrder` (payment path), `fireActiveOrderToKitchen`, both `addItemToBackend` retroactive paths, + the offlineSyncInit replay executor. Replay executor previously treated ANY P0001 as success — now not-found correctly fails to retry/dead-letter.
- [x] A1: `__tests__/ensureOrderOutOfDraft.test.ts` — 6 tests covering the three-way branch + no-SELECT-on-success + legacy message routing. All pass.
- [x] A2: payment-replay pre-checks run concurrently — two self-catching promises (NOT bare Promise.all over raw awaits; supabase-js rejects on network aborts), evaluated void-first then duplicate-charge. Outcome matrix preserved exactly; one serial RT removed per replayed payment.
- [x] Verified: tsc 0 new errors (offlineSyncInit TS2448 `createOrderParams` TDZ pre-exists at HEAD — latent bug in create_order replay logging, reported to user), eslint 0 errors, 44/44 queue-contract tests + 6/6 new.

### Wave B — send_order_to_kitchen_v1 (staging migration + flagged client)
- [ ] Migration + rollback SQL → staging only; staging test matrix incl. legacy-key dedupe + 40P01
- [ ] Client: OrderService.sendOrderToKitchen + flag + PGRST202/42883 fallback + 22023/40P01 classification

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

Plan: `~/.claude/plans/role-objective-cryptic-dusk.md` · Verify each item against Phase 0 baselines per `docs/perf-baseline-protocol.md`

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
- [x] Write repeatable Landi baseline protocol doc (`docs/perf-baseline-protocol.md`)
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

## Plan

### Phase 0 — Spike (3 days, no production code)

Goal: prove `react-native-sandbox` boots on our exact setup before committing the full migration.

- [ ] Branch `spike/cfd-sandbox`
- [ ] `bun add @callstack/react-native-sandbox`
- [ ] `npx expo prebuild` (already done, verify)
- [ ] Add minimal `<SandboxReactNativeView jsBundleSource="hello-cfd" componentName="HelloCFD" />` somewhere reachable in dev builds (a settings debug page is fine)
- [ ] Create `index.hello-cfd.js` registering a "Hello from sandbox" `<Text>`
- [ ] Configure metro to emit a second bundle, get the bundle into the Android assets/expo build pipeline
- [ ] Run on Landi C20Pro: confirm sandbox renders, `postMessage` round-trips, no crashes
- [ ] If broken, evaluate fallback (manual `ReactHost`, more surgical optimization, or wait for Expo SDK support)
- [ ] **Decision point:** ship spike findings, decide whether to proceed to Phase 1

### Phase 1 — Sandbox-host the built-in display (3–5 days)

- [ ] Replace `CFDBuiltinDisplay.tsx` body with `<SandboxReactNativeView />` mount
- [ ] Update `SecondaryDisplayPresentation.kt` if needed to support the new tree (likely no change — it still uses `createSurface` for the trivial host wrapper)
- [ ] Wire `Presentation` lifecycle (mount/unmount on display attach/detach) — keep existing `DisplayListener` logic
- [ ] Verify the tiny host tree mounts inside Presentation cleanly

### Phase 2 — CFD client bundle (3–5 days)

- [ ] Create `index.cfd.js` entry; register `CFDClientApp`
- [ ] Extract CFD UI from `app/(cfd)/cfd-display.tsx` into a routing-free root component that imports `components/cfd-client/*` directly
- [ ] In sandbox, swap the WS-receive path for `globalThis.setOnMessage` → `useCFDClientStore.setState({...})`
- [ ] Allow only the TurboModules the CFD UI needs (Reanimated, FastImage, MMKV if used, expo-keep-awake) via `allowedTurboModules`
- [ ] Build pipeline: ensure both bundles ship in the APK / EAS build profile

### Phase 3 — Wire CFDProvider to the sandbox (2–3 days)

- [ ] Replace `useCFDBuiltinStore.getState().update(updatePayload)` calls with `sandboxRef.current?.postMessage(updatePayload)` (built-in effect + showProcessing/showApproved/showDeclined/showLoyaltyPrompt/showLoyaltyConfirmation paths)
- [ ] Delete `stores/useCFDBuiltinStore.ts` and all its imports
- [ ] Delete `useCFDBuiltinDisplayProvider` from `contexts/CFDDisplayDataContext.tsx`
- [ ] Built-in idle-transition timer / loyalty timer / frozen-totals push — all become `postMessage` calls
- [ ] Keep external WebSocket CFD path unchanged — it just keeps working in parallel

### Phase 4 — QA / regression (3–5 days)

- [ ] Full cart→tip→payment→approved flow on Landi C20Pro built-in CFD; verify mirrors POS within ≤100ms
- [ ] Loyalty prompt + phone submission both directions (POS-driven and CFD-driven)
- [ ] Idle carousel rotates without affecting POS frame rate (measure with Systrace before/after)
- [ ] External WebSocket CFD continues to work on a paired second tablet
- [ ] Display hot-plug: detach/reattach secondary display while order is in progress; sandbox lifecycle survives
- [ ] App backgrounded/foregrounded; sandbox doesn't crash or leak
- [ ] Memory check: each Hermes runtime is ~9MB heap baseline; total is acceptable on Landi (≥2GB RAM)

## Risks

- **Expo SDK 53 + sandbox v0.5 untested** — exactly what Phase 0 spike de-risks. If incompatible, fall back to manual `ReactHost` (4–6 weeks instead of 2–3) or pause and ship surgical wins only.
- **Multi-host regression in RN 0.79.2** (issue #52326) — we're on 0.79.6, may be fixed; verify in spike.
- **Native module access in sandbox** — TurboModule allowlisting required. CFD UI uses Reanimated/FastImage/MMKV/expo-keep-awake/etc. Each must be allowlisted explicitly. Some may not work cross-engine if they assume a single runtime.
- **Bundle size + APK growth** — second bundle adds ~200–400KB precompiled Hermes bytecode. Acceptable.
- **Hot reload in dev** — sandbox bundle hot reload may not work without RE.Pack integration (roadmapped, not shipped). Acceptable for production builds; dev iteration may require full reloads.

## What this does NOT solve

- Animations on the **main POS** (not the CFD) that were already chunky stay chunky — this only fixes the bidirectional CFD↔POS contention.
- If POS does CPU-bound work (large list scrolls, heavy modal mounts) it still won't be smooth on its own merits — but at least the CFD won't make it worse, and vice versa.

## Verification

After Phase 4:

- Side-by-side perf comparison on Landi C20Pro: with built-in CFD attached vs detached. Goal: no measurable POS perf difference.
- Compare with Landi-without-CFD baseline. Goal: parity.
- External WebSocket CFD path: same flow exercised; no regression.

---

## Wave-0 rush-lag telemetry harness (2026-07-13) — code complete

Branches: `chore/wave0-skip-probe` (Step 0 temp logs, revert after capture) · `feat/wave0-telemetry-harness` (the harness, commit 625b68da).

- [x] Step 0 skip-probe branch (2 temp logs in lazyDebouncedWrite, order-store-storage only) — prediction on record: skip-hits = 0
- [x] lib/telemetry/{registry,keys,longTaskWatcher,init,export}.ts — interned counters, 8192-slot packed ring in dedicated `dexa-pos-telemetry` MMKV, 50ms drift watcher w/ route+stringify attribution, 30s flush + prev-session rollover, expo-sharing export
- [x] Instrumented: persist arm/skip/stringify/bytes (A#1-3,B#1), flushAllPendingWrites (C#5), rt msgs/handler/payload-sample (B#4), fan-out spans, get_order_details (B#3), own-echo slip (B#2), pos.payment.completion (C#1), perf.ts tap, resume_settle (C#7)
- [x] Settings→General toggle (default ON) + hidden long-press hooks-mute (overhead A/B, release-reachable — moved off dev-flags because that screen redirects in release); hidden export = long-press version value in Devices & Connections
- [x] 22 new tests pass; tsc error delta 0 (141 pre-existing); full-jest delta 0 (27 failures pre-existing on base)
- [ ] ON-DEVICE (needs Landi + native rebuild for expo-sharing): Step 0 probe capture → attach numbers; 30-min hooks-on vs hooks-muted overhead A/B; Charcoal Load Profile 2h capture on staging (NOT the 1,000-table rig); export screen-recording → Ali Dika verifies

### Step 0 skip-probe RESULTS (2026-07-13, Landi via USB, ~4 min order building)

- **skip-hits: 0** — prediction CONFIRMED. The ref-equality skip (`lib/storage.ts` `lastPersistedValue[name] === value`) never fires for `order-store-storage`; zustand persist hands a fresh StorageValue wrapper per setItem, so the branch is structurally dead.
- **stringify cost: 0–1ms per fire at 3.7–16KB payloads.** Payload grew ~3.7KB → ~16KB as one order accumulated items (~0.5–0.7KB/item incl. modifiers). Fire cadence during active editing ≈ 1/s (12 fires in 14s burst) — matches the Audit B model.
- **Interpretation:** at THIS payload size W1-1 is a ~1ms lever — nothing. Cost scales ~linearly with bytes, so the decisive number is real payload size at Charcoal hour-5 (25 open orders in the persisted set). Extrapolation: 150–300KB payload ⇒ ~10–20ms/fire ⇒ at ~1 fire/s bursts, a 1–6% JS-thread tax — meaningful but not obviously THE lag. Do NOT green-light or kill W1-1 yet; the harness's `persist.bytes.order-store-storage` max/avg during the Charcoal Load Profile capture decides it (Audit A #1).
- TEMP probe commit reverted on both counts: harness branch revert commit after capture; `chore/wave0-skip-probe` branch retained for the ticket record (console.warn variant — babel strips console.log in preview builds).
