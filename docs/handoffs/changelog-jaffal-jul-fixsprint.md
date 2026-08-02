# Changelog — `jaffal-jul-fixsprint`

Branch `jaffal-jul-fixsprint`, commits `d8124c0c`..`654063bd` (as of 2026-07-28).
~27k insertions / 14k deletions across 89 files (package-lock.json is most of it).
All commits authored by Ali except `7b8eccde` (PR #158, alidika200) and the final
staging merge `654063bd`.

## 1. Boot/perf sprint (d8124c0c → cc209e0d)

- `d8124c0c` enhance order creation speed — `services/orderService.ts`, `utils/orderTransformers.ts`.
- `fdbedacc` **MMKV boot scan removed**: `getStorageSizeStats()` no longer enumerates every key
  in all 3 buckets; uses react-native-mmkv v4's native O(1) `size`. `keyCount` moved behind the
  breach branch via `getBucketKeyCount()`. `size` added to the MMKV jest mock (its absence would
  have made every threshold compare false). Caveat: `size` = allocated file size, trips earlier
  than the old summed-UTF-16 `totalBytes`. → `lib/storage.ts`, `contexts/PosSyncProvider.tsx`.
- `cc5adedd` **single app-resume lifecycle coordinator** — new `lib/lifecycle/appLifecycleCoordinator.ts`
  (+441-line test). AppState listeners 19→7, NetInfo subscribers 5→2 (routed through
  `offlineSyncService.subscribeOnlineStatus`). Coordinator drains only on a real `background`,
  not an `inactive` flicker; suspend tasks still fire on first leave-foreground edge.
  Telemetry: `lib/telemetry/keys.ts`, `lib/telemetry/resumeRequests.ts` (resume.requests,
  resume.peak_concurrent); Supabase fetch wrapper promoted from __DEV__-only to always-on.
  **Screen wake lock is now native** — `FLAG_KEEP_SCREEN_ON` in `MainActivity.kt`, not
  expo-keep-awake (JS path fails silently when the native module is missing from an older
  binary under OTA JS updates). ⚠️ Do NOT add any JS keep-awake hook to the root tree —
  expo-keep-awake clears that same flag when its last tag releases.
  Inventory doc: `docs/engineering/performance/appstate-netinfo-listener-inventory.md`.
- `877bce1b` floor fallback poll backed off (was a flat 5s cadence causing 6 full floor loads /
  10 min, ~2MB MMKV writes on a Tab S6 Lite); stopped persisting discarded session data.
  → `stores/useFloorPlanStore.ts`, `hooks/realtime/useFloorRealtime.ts`.
- `cc209e0d` **print path phase-1**: new `lib/afterPaint.ts` (rAF → runAfterInteractions, 1.5s
  timeout) defers auto-print past the painted frame (`PaymentSuccessView`, both auto-print sites
  in `usePaymentStore`). Star raster serialized behind a single-permit semaphore. Completed print
  jobs retained ~10 min then dropped, all jobs capped at 2h, pruned on drain-idle (no timer).
  Rendered PNGs deleted after the Star SDK consumes them + throttled orphan sweep
  (`services/printing/utils/tempImageCleanup.ts`). Phase-4 (single-drain ownership guard,
  priority aging) intentionally excluded — ships kill-switched separately.

## 2. Previous orders redesign (b6d4794d → bd42bb01)

- New screen design for `app/(main)/previous-orders.tsx` (+679) with new components:
  `components/previous-orders/ChannelTabBar.tsx`, `OrdersSelectDropdown.tsx`, `PaginationBar.tsx`,
  `ProviderChipRow.tsx`, `ProviderGlyph.tsx`; reworked `PreviousOrderRow.tsx`,
  `components/menu/OrdersTable.tsx`, `PreviousOrdersSection.tsx`, `DatePillRow.tsx`.
- New filter/query layer: `lib/previousOrdersFilters.ts`, `services/historyOrderFilters.ts`,
  `hooks/pos/useHistoryFilterControls.ts`, `lib/fetchedOrderPlatform.ts`,
  `stores/previousOrdersOfflineCache.ts`; `stores/usePreviousOrdersStore.ts` heavily reworked.
- `7f8c52d0` `EMPTY_DRAFT_EXCLUSION_OR` — one shared draft-exclusion predicate used by all
  history queries so filters stay consistent.
- `85bd1ee9` order insertion optimized to cut main-thread cost during checkout.
- Tests: `historyOrderFilters`, `previousOrdersFilters`, `previousOrdersCacheFreshness`,
  `previousOrdersPlatformIdentity`.

## 3. Skia table rendering / tables UI (e6352d0e → a97eb6d7)

- Shape-aware rendering: `shapeId` prop threaded into `SkiaTableContent`, shape detection by
  table type, font hinting adjustments (`components/tables/skia/skiaTableFont.ts`).
  Related but separate: the Skia blank-canvas / module-level object-cache work.
- Tables sidebar UI pass: `components/panels/TablesPanel.tsx`, `tables/Sidebar.tsx`,
  `TableListItem.tsx`. `8aca938c` removed a red debug background.

## 4. From PR #158 / staging merge (not Ali's work)

Auth + access-control + KDS: `lib/posAccessControl.ts`, `services/posAccessService.ts`,
`lib/authFlow.ts`, `hooks/useSessionKickListener.ts`, `KickedOutModal`, `ClerkSessionKeeper`,
station-select/pin-login; KDS server-authoritative "done"
(`utils/supabase/migrations/20260717120000_kds_server_authoritative_done.sql`,
`stores/useKDSStore.ts`), KDS rush priority sort. Docs in `docs/features/kds/kds-server-authoritative-done.md`,
`docs/features/billing/billing-pos-suspended-access.md`.

## Known gaps

Overnight resume, screen-off/on, and payment-in-flight-across-background are **untested on
device** — instrumentation exists, numbers do not. Blocked on Landi tablet access, same as the
cold-start idle-lag P1.
