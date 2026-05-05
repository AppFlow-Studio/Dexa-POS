# Tasks

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
