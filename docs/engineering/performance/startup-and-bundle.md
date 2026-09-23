# App startup and bundle size

How the POS starts, the rules that keep startup cheap on low-end devices (Landi
C20Pro, KDS tablets), how to measure, and what is left to do. Change log and
before/after numbers: Perf Roadmap Phase 3 in [`todo.md`](todo.md). Icon
details: [`../architecture/icons.md`](../architecture/icons.md).

## How startup works

Read this before optimizing — two common assumptions are wrong.

1. **Only layouts load at startup in production.** expo-router evaluates every
   `app/**/_layout` file (plus the initial route) during boot. Other screens load
   the first time they render. In **development** it evaluates every route at
   boot (`getRoutesCore` calls `loadRoute()` for all routes when
   `NODE_ENV === 'development'`), so a dev-client build says nothing about cold
   start.
2. **Everything the layouts import statically runs before the first frame.**
   Metro does not tree shake, and Expo's default is `inlineRequires: false`. The
   layouts mount the big providers (`PosSyncProvider`, `CFDProvider`, …), so
   their whole static import graph runs at cold start: 520 of our modules and 62
   npm packages today.
3. **Persisted stores parse their data when first imported.** Each persisted
   zustand store runs a synchronous `JSON.parse` of its MMKV blob at creation.
   `lib/storage.ts` records the parse time and size per key in telemetry.
4. **The JS bundle is memory-mapped on Android.**
   `android.enableBundleCompression=false` keeps it uncompressed in the APK, so
   Hermes maps it instead of inflating ~13 MB into RAM on every launch.

## Rules for new code

| Do | Not | Where it's done today |
| --- | --- | --- |
| `import { Check } from "@/lib/icons"` | `from "lucide-react-native"` (loads all ~1,700 icons) | [icons.md](../architecture/icons.md); lint enforces |
| `import { format } from "date-fns/format"` | `from "date-fns"` (loads the whole library) | lint enforces; `import type` from the root is fine |
| `React.lazy(() => import("…"))` inside `<Suspense>` for screens or heavy components rendered from a layout, panel, or overlay | a static import | `components/profile/MyProfilePanel.tsx` (PTO, Requests), `components/charts/LazyGiftedCharts.tsx` |
| `AppRegistry.registerComponent(name, () => require("./X").default)` for surfaces native mounts on demand | requiring the component at module scope | `components/cfd-builtin/registerCFDBuiltinDisplay.ts` |
| `require()` inside the function that needs a rarely used, heavy module, with `// eslint-disable-next-line @typescript-eslint/no-require-imports` | a top-level import | `maybeAutoPrintKdsTicket` in `stores/useKDSStore.ts` |
| Gate station-specific work on station type | running it on every device | `useKioskProfile` and the terminal health check are off on KDS |
| Real data, or an empty state (`—`, an icon placeholder) | mock or demo data in app code | see [Removed mock data](#removed-mock-data-2026-09-23) |
| Keep `assets/` to files the app references | leaving unused images (each one ships in the APK) | |

To check a change, `node scripts/perf/boot-graph.js --why <module>`: if a module
meant to be lazy still prints an import chain, something imports it statically.

### Before gating anything off on KDS

KDS depends on these even though they look POS-only:

- **Floor realtime channel** (`LocationRealtimeProvider` → `useFloorRealtime`):
  `useKDSStore` resolves ticket table names from `useFloorPlanStore.tablesById`
  and, when a ticket is bumped, marks the table session `served` through
  `useTableSessionStore`.
- **Printers** (`fetchPrinters` and the receipt-printer claim sync in
  `PosSyncProvider`): KDS auto-print prints to
  `station.current_receipt_printer_id`, and the KDS settings screen lists the
  fetched printers.
- **Station heartbeat**: other devices show whether the KDS is online.

### Customer display (CFD)

- The built-in display UI (`components/cfd-builtin/CFDBuiltinDisplay.tsx`,
  including `react-native-webview`) loads only when `SecondaryDisplayModule.show()`
  makes native start the `CFDSecondaryDisplay` surface.
- The CFD server (WebSocket on port 8765, NSD/mDNS advert, `CfdForegroundService`)
  still starts on every POS station at mount. It cannot simply be gated on
  "paired": the POS keeps no record of paired CFDs, and paired tablets find this
  server again via mDNS after every restart. A per-station "has customer
  display" setting has to exist before the server can be switched off.

## Build and runtime settings

| Setting | Value | Why |
| --- | --- | --- |
| `android.enableBundleCompression` (`android/gradle.properties`) | `false` | Bundle is memory-mapped instead of inflated into RAM each cold start. Costs APK size; don't flip it back to shrink downloads |
| `telemetryEnabled` (`stores/useSettingsStore.ts`) | default `false` | Its 50 ms long-task watcher and 30 s flush run all shift. Persist v2 migration switched existing devices off. Turn on per device in Settings › General when measuring |
| `drop_console` (`metro.config.js`) | `true` | Also strips `console.error` / `console.warn` in production (1,336 calls in source, 19 left in the bundle), so Sentry breadcrumbs and the log collector lose them. Open issue |
| Hermes source maps | Gradle release compiles with `-output-source-map` | Debug info goes to the map. An export without `--source-maps` embeds it: 21.8 MB `.hbc` instead of 13.2 MB. Compare like with like |

## Measuring

**Bundle composition** — which packages and folders the bytes come from:

```sh
NODE_ENV=production npx expo export --platform android \
  --output-dir .expo/perf-export --source-maps --no-bytecode --clear
node scripts/perf/bundle-attribution.js .expo/perf-export/_expo/static/js/android/entry-*.js
rm -rf .expo/perf-export
```

**Startup graph** — what runs before the first frame:

```sh
node scripts/perf/boot-graph.js                      # summary + npm packages
node scripts/perf/boot-graph.js --why npm:date-fns   # import chain for a package
node scripts/perf/boot-graph.js --why lib/mockData   # …or for one of our modules
node scripts/perf/boot-graph.js --json before.json   # save the module list to diff later
```

**On device** — a production build on a Landi and on a KDS tablet: cold start
time, `adb shell dumpsys meminfo com.temurappflowstudios.dexapos`, and the
telemetry export (Settings › General toggle; export by long-pressing the app
version in Devices & Connections). Follow
[`perf-baseline-protocol.md`](perf-baseline-protocol.md). Ask before reloading
or driving a device someone else is using.

Gotchas:

- `expo export` refuses an output directory outside the project. Use `.expo/…`
  (gitignored) and delete it afterwards — repo-wide ESLint runs out of memory
  on multi-MB bundles.
- If an export fails to resolve `@expo/metro-config/build/async-require.js` from
  another checkout's path, the Metro cache came from that checkout. Add `--clear`.

## Current baseline (2026-09-23, production Android)

| Measure | Value |
| --- | --- |
| Metro modules in the bundle | 4,906 |
| Minified JS / Hermes bytecode (`--source-maps`) | 13.8 MB / 13.2 MB |
| Our modules / npm packages evaluated before the first frame | 520 / 62 |
| `assets/` | 1.6 MB |

## Removed mock data (2026-09-23)

Deleted on `kds-improvements`. Recover from git history if something turns out
to be needed.

- `lib/mockData.ts` (all fixtures, including `MENU_IMAGE_MAP`,
  `MOCK_MENU_ITEMS`, `MOCK_USER_PROFILE`) and 33 unused assets: menu photos,
  `tom_hardy.jpg`, Expo template icons, the unused 1.4 MB `dexalogo.png`.
- Routes: `app/(main)/open-shifts.tsx` (unreachable), `app/(main)/scheduling/reports.tsx`
  and `components/scheduling/reports/*` (static mockup), `app/(main)/settings/delivery.tsx`
  (hidden from navigation, demo data only).
- Components: `DiscountOverlay` (never opened; real discounts use
  `DiscountBottomSheet`), `TrackOrderSection`, `ConnectTerminalModal`,
  `ViewProfileModal`, `PermissionMatrixBottomSheet`, `EditPrinterModal`, seven
  end-of-day mock cards and `LegendRow`.
- State: demo delivery partners and zones, permission matrix, dual pricing,
  surcharging, funding, prep categories, `kdsEnabled`, and throttling
  `currentLoad` in `useSettingsStore`; `generateMockSalesData` in
  `lib/analyticsEngine.ts`.
- Replaced with real data: analytics filter options (`FilterControls`), the
  schedule screen's location label, profile fallbacks (`ProfileCard`,
  `ProfileInfoTab`).
- Kept on purpose: the Castles/Valor mock terminal transports (a QA tool, off by
  default, toggled in USB Diagnostics), receipt-template preview samples, the
  test-print sample, and the `lib/db/measure.ts` fixtures.

Known leftovers: `useAnalyticsStore.fetchReportData` is a no-op, so the
analytics location and employee filters don't change the report. The test
screens `app/(main)/castlestest.tsx` and `app/(main)/order-store-test.tsx` are
still reachable by deep link.

## Next levers

Not done yet, roughly in order of value. Items marked *audit* come from the
2026-09-23 read-only audit and haven't been measured on a device.

1. **Metro `inlineRequires: true`** (React Native's default; Expo turns it off).
   It defers each module until first use — the biggest lever on the 520-module
   startup graph. Risk: code that relies on import-time side effects (for
   example `useOrderStore`'s module-scope subscriptions). Try it on a branch and
   measure.
2. **Skia loads at startup on every device.** Chain: `app/_layout.tsx` →
   `PosSyncProvider` → `DriverFactory` → `StarMicronicsDriver` →
   `StarXpandRenderer` → `SkiaTicketRenderer`, and `@shopify/react-native-skia`
   installs its native module on import. Lazy-require the renderer where a Star
   ticket is rendered.
3. **Mid-boot OTA restart.** `app/_layout.tsx:229-232` downloads an update and
   calls `reloadAsync()`, so every OTA publish costs each device a second cold
   start. `app.json` already checks for updates on launch.
4. **Store hydration** *(audit)*: `skipHydration` for stores a station type
   never uses; cap the large persisted blobs (`receipt-template-store-storage`
   keeps the logo as base64, `print-queue-storage` keeps documents). The POS menu
   payload is held twice: `hooks/pos/usePosSync.ts` keeps it with
   `staleTime: Infinity` and a 2-hour `gcTime`, and `useMenuStore` holds the
   transformed copy.
5. **`drop_console`**: keep `console.error` / `console.warn` (strip only
   log/info/debug).
6. **Bundle size only** (not on the startup path unless noted): Sentry replay
   and feedback code (~180 KB), `reanimated-color-picker` (221 KB), full
   `lodash` (at startup via `stores/useLocationConfigStore.ts`), and four date
   libraries — `date-fns`, `date-fns-tz`, `luxon` (at startup via
   `lib/businessDay.ts`), `moment` (via `react-native-calendars`).

Open question: whether OTA updates are exported with source maps. An export
without them embeds debug info (see the Hermes row above); check the size of the
update bundle EAS publishes.
