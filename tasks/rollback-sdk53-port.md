# Rollback branch — port SDK-57-line features onto SDK 53 (drop the SDK-57 upgrade)

Branch: `rollback` (base `c3aa79b7`). Checkpoint: `rollback-pre-port` (`git reset --hard rollback-pre-port` undoes everything).

## What was done
Ported the feature chain (tip `a4d73f30`) onto the SDK-53 branch WITHOUT the SDK-57 upgrade.
190 files changed (52 new, 138 modified). `package.json`/lockfile unchanged — still Expo 53 / RN 0.79.6 / reanimated 3.19 / gesture-handler 2.24.

- [x] Wave 0 — checkpoint branch + baseline
- [x] Wave 1 — pulled net-new + non-overlap feature files; audited 19 core files (11 taken, 5 kept, 3 hand-merged to strip perf-wave / flash-list-v2 hunks)
- [x] Wave 2 — integration wiring: PanelSheet adapter (`@expo/ui` stripped), Valor health-check + Valor USB auto-connect + ATOM loopback detect (`PosSyncProvider`, `terminalHealthCheck`), `AtomBridgePackage` registered in `MainApplication.kt`, Valor USB vendor id in `device_filter.xml`, Valor rehydration in `orderTransformers.ts`
- [x] Wave 3 — reinstalled SDK-53 deps; **tsc 105 errors = zero new** (below 114 baseline); **full jest = 11 failing suites = exactly the pre-existing baseline, zero net-new failures, +16 new tests all pass**; ESLint on hand-edited files clean
- [ ] Wave 4 — **ATOM native rebuild (needs your device/toolchain)**: `npx expo prebuild` + `npm run android`, then confirm `isAtomBridgeAvailable()` on device
- [ ] Wave 5 — on-device smoke: PanelSheet open/close, Valor mock sale, batch-out email, online-order UUID label, inventory/scheduling/menu/analytics/CFD screens

## Features included
Valor + ATOM terminals (incl. native), batch-out auto-email, full PanelSheet migration (~30 sheets), online-order UUID fix, and the selected extras: Inventory & POs, Scheduling + Profiles, Menu management UI, Sales Analytics, POS Access Control + Settings, KDS server-authoritative ready-time, CFD client screens, Telemetry hooks.

## Intentionally kept at rollback (#164) version
SDK-57 infra (package.json, babel, app.json, gradle/manifest/MainActivity, patches). Previous-orders / Skia table overlap (already tested on SDK 53 via #164). Perf-wave/telemetry publishers, moti→reanimated churn, gesture-API churn.

## Follow-ups / known limitations
1. **`process_payment_v17` deferred (payments-critical).** `services/orderService.ts` still calls **v16** (unconditional). Valor payments PROCESS at the terminal but persist WITHOUT card metadata (last4/rrn/approvalCode) and without `terminal_type='valor'` until: (a) `process_payment_v17` is deployed (website-repo migration, staging then prod), then (b) flip the single call site in `orderService.ts` v16→v17. Kept v16 to avoid breaking ALL card payments if v17 isn't live. Client-side Valor rehydration (`orderTransformers.ts`) is already in place and forward-compatible with v17.
2. **ATOM native rebuild required** (Wave 4) — JS-only reload won't load `AtomBridge`.
3. **DB migrations** for Valor/ATOM/KDS are staging-only per convention (apply to `dfwqakoyittmrwbqvxgw`, commit `.sql`, deploy prod manually). Not part of this client merge.
4. **SessionKickListener kick-reason UI** not ported (its hook is in the #164 overlap; provider kept at rollback to stay consistent).
5. Test infra: added global jest mocks for `react-native-tcp-socket` and `@/modules/castles-usb` (needed once the ported hook imports valor-service); added `IS_REACT_ACT_ENVIRONMENT` to the PanelSheet test.

## Pre-existing (NOT caused by this port)
11 jest suites fail on clean rollback too (connectionQuality timers, order-calculator, paymentService.idempotency, broadcastMergeStationId, clearTableServedTransition, hydrateWorkspaceFlipAway, offlineSyncOwnershipShortCircuit, tableReopenCheckWiring, useOnlineOrderActions, wave22ReadOnlyGates, wave24UpdateOrderDetails). 114 tsc errors pre-exist on clean rollback.

## Not committed
Changes are left in the working tree for review — no commit/push was made.
