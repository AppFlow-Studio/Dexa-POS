# POS Performance Architecture Audit

**Date:** 2026-07-24  
**Status:** Architecture review and implementation roadmap. No performance code changes are included in this document.

## Executive Summary

Dexa POS can achieve better startup time, screen responsiveness, rush-hour KDS performance, and long-session stability without a full rewrite.

The app already has a strong technical base:

- React Native with Hermes and the New Architecture.
- React Compiler enabled.
- FlashList virtualization for the order-entry menu.
- Zustand stores with selective subscriptions.
- Lazy and debounced MMKV persistence.
- TanStack Query configured to avoid reconnect refetch storms.
- Supabase Broadcast for realtime order and table updates.
- Offline operation queues and deadline-aware backend calls.
- Built-in performance spans, long-task detection, and telemetry export.

The remaining problems are mostly caused by too much work being started globally, duplicated bootstrap requests, large server payloads, non-virtualized KDS rendering, and synchronous work competing with important user interactions.

The recommended approach is:

1. Measure the exact merchant slowdown on a release or preview build.
2. Remove duplicated startup work and add an immediate cached menu.
3. optimize the floor-plan and Previous Orders server contracts.
4. Mount station-specific systems only when they are needed.
5. Isolate KDS, payment, printing, and foreground-recovery workloads.

Dependency upgrades alone will not resolve these problems.

## Current Architecture

```text
Expo Router / Hermes
        |
        v
Root application providers
  Clerk authentication
  TanStack Query
  POS synchronization
  Station/session listeners
  CFD runtime
  Global sheets and overlays
        |
        v
Feature screens
  Order entry
  Tables and floor plans
  KDS
  Previous Orders
  Timeclock and settings
        |
        v
Interactive state
  Zustand stores
  MMKV persistence
  Offline operation queue
        |
        v
Backend
  Supabase RPC/PostgREST
  Supabase Broadcast
  PostgreSQL
```

The intended data flow is:

```text
User action
  -> optimistic Zustand update
  -> backend RPC or offline queue
  -> database mutation
  -> realtime broadcast
  -> local reconciliation
  -> UI convergence across stations
```

This is a valid POS architecture. The performance issue is that several layers currently perform more work than the active station or screen requires.

## Existing Performance Work

The following improvements are already present and should not be reimplemented:

- Order-entry menu virtualization with FlashList.
- Progressive order-screen rendering.
- Narrower Zustand selectors in several hot components.
- Deferred boot recovery work through `InteractionManager`.
- Lazy MMKV serialization and persisted-slice memoization.
- Floor-plan table update batching and subscription deduplication.
- KDS timer isolation and reduced auto-fire interval churn.
- Realtime reconnect throttling and disabled global refetch-on-reconnect.
- Active-order response limits and demand-driven detail hydration.
- Long-task, persistence, realtime, and interaction telemetry.

The next performance effort should build on this work rather than replace it.

## Main Findings

### 1. Duplicate Menu Bootstrap

**Current behavior**

`usePosSync` performs five startup requests while `useStandaloneSync` performs six additional requests. Both paths fetch recipe data, and their responses are transformed and merged into the menu store multiple times.

The standalone sync includes menu-management data such as inactive/library entities even when a cashier only needs the active order-entry menu.

**Why it is slow**

- More network requests compete during login and store selection.
- Recipe and menu data are downloaded more than once.
- Large results are transformed repeatedly on the JavaScript thread.
- Raw query results and transformed Zustand data remain in memory together.
- Cold startup has no persisted render-ready active-menu snapshot.

**Recommended change**

- Create one versioned, location-scoped POS bootstrap contract.
- Return the complete active order-entry menu from one RPC.
- Trust the recipe data returned by that RPC instead of querying recipe tables again.
- Move standalone/inactive menu-library loading to the menu-management route.
- Persist a compact, versioned, render-ready menu snapshot in MMKV.
- Render the cached snapshot immediately and reconcile with the backend in the background.

**How this helps**

- Faster first usable menu after login.
- Fewer startup round trips.
- Less JavaScript transformation work.
- Lower peak memory during initialization.
- Better cold-start and poor-network behavior.

**Primary files**

- `hooks/pos/usePosSync.ts`
- `hooks/pos/useStandaloneSync.ts`
- `contexts/PosSyncProvider.tsx`
- `stores/useMenuStore.ts`
- Supabase migration for the versioned bootstrap RPC

### 2. Floor-Plan Fetching Is Network-Bound

**Current evidence**

Existing release telemetry recorded floor-plan RPC/loading time at approximately:

- Average: 5.85 seconds
- Maximum: 16.65 seconds
- Local result application: under 5 milliseconds

This means the main delay is the server/query pipeline, not drawing the returned tables.

**Current behavior**

Floor geometry, table relationships, sessions, and sections are fetched through multiple operations. Stale inactive floor plans can also be prefetched concurrently.

**Recommended change**

- Add one location/floor snapshot RPC.
- Separate mostly static floor geometry from frequently changing table/session status.
- Version the geometry and refetch it only when the layout changes.
- Fetch the active floor first.
- Prefetch inactive floors during idle time with concurrency limited to one or two.
- Run `EXPLAIN (ANALYZE, BUFFERS)` on the server queries and add only evidence-backed indexes.

**How this helps**

- Faster floor switching and table opening.
- Lower Supabase request concurrency.
- Smaller realtime reconciliation payloads.
- Less bandwidth and battery use.
- More predictable behavior on poor Wi-Fi.

**Primary files**

- `services/FloorPlanService.ts`
- `stores/useFloorPlanStore.ts`
- `contexts/PosSyncProvider.tsx`
- Supabase migration for the snapshot/version contract

### 3. First Item Can Wait for Order Creation

**Current behavior**

For an online connection, menu entry can be blocked until the draft has a backend `db_order_id`. Order creation also performs device-session validation before creating the order.

**Recommended change**

- Allow the first item to enter the local order immediately.
- Start order creation in parallel.
- Queue item operations behind the create-order dependency.
- Move session validation into the create RPC or cache a recent successful validation for a short, safe period.

**How this helps**

- The first menu tap feels immediate.
- Network latency no longer blocks basic order entry.
- Existing offline dependency handling is reused.
- Cashiers get consistent behavior on fast and slow networks.

**Primary files**

- `components/menu/MenuSection.tsx`
- `services/orderService.ts`
- `services/offlineSyncService.ts`
- `services/offlineSyncInit.ts`

### 4. Global Providers Do Too Much Work

**Current behavior**

The root provider tree initializes authentication, POS synchronization, remote actions, session-kick handling, CFD behavior, hardware services, and global UI.

`CFDProvider` is especially large and subscribes to many order, payment, seating, loyalty, and location values. It is mounted globally even when the station does not need an active CFD server.

**Recommended change**

Split runtime ownership into:

```text
Core runtime
  Authentication, theme, errors, basic navigation

Authenticated runtime
  Store and station identity, subscription status

POS runtime
  Orders, tables, payments, printers, customer display

KDS runtime
  KDS tickets, KDS sound, KDS-specific realtime

CFD client runtime
  Customer-facing display client only
```

Mount CFD server behavior only when station capability/configuration requires it. KDS should not initialize normal POS payment, table, or CFD-server workloads.

**How this helps**

- Less work before the first screen appears.
- Fewer background effects and subscriptions.
- Lower memory use per station type.
- Fewer competing foreground/reconnect operations.
- Clearer ownership and easier performance testing.

**Primary files**

- `app/_layout.tsx`
- `app/(main)/_layout.tsx`
- `contexts/PosSyncProvider.tsx`
- `contexts/CFDProvider.tsx`

### 5. Hidden Global UI Still Executes Hooks

**Current behavior**

Several global drawers, sheets, and panels are mounted from the main layout. The payment-detail sheet is a particularly large module and runs its hooks and store selectors before returning `null` when closed.

**Recommended change**

- Add small controller components that subscribe only to `isOpen`.
- Mount the heavy sheet body only after it opens.
- Unmount or retain it based on measured reopen cost.
- Apply the same pattern to profile, search, and optional management overlays where safe.
- Replace full active-order subscriptions with exact field selectors where possible.

**How this helps**

- Less mount work on every POS screen.
- Fewer hidden subscriptions reacting to order changes.
- Reduced memory retained by closed overlays.
- Less parent rerendering during busy order mutations.

**Primary files**

- `app/(main)/_layout.tsx`
- `components/menu/PaymentDetailBottomSheet.tsx`
- `components/profile/MyProfilePanel.tsx`
- `components/bill/BillSection.tsx`

### 6. Synchronous MMKV Inspection During Startup

**Current behavior**

`PosSyncProvider` runs a storage-size diagnostic that reads every key and stored value across the general, secure, and sync MMKV buckets.

**Recommended change**

- Move storage-size inspection after interactions or into the diagnostics/export workflow.
- Run it periodically in the background rather than during initial provider mount.
- Keep critical persisted-store hydration synchronous only where immediate offline correctness requires it.
- Consider manual hydration for mode-specific stores that are not needed at boot.

**How this helps**

- Removes avoidable synchronous startup work.
- Improves startup on devices with accumulated operational data.
- Preserves storage diagnostics without delaying cashiers.

**Primary files**

- `contexts/PosSyncProvider.tsx`
- `lib/storage.ts`

### 7. KDS Rendering Does Not Scale Efficiently

**Current behavior**

The KDS ticket grid uses a `ScrollView` with nested column and ticket maps. All tickets in the active status are mounted, including all visible item and modifier rows.

The page also subscribes to a global per-second timer. Card memoization reduces some work, but the page still performs timer-related traversal.

**Recommended change**

- Keep second-by-second updates inside the small timer text component.
- Update urgency color only when a ticket crosses a threshold.
- Remove the KDS page-level one-second subscription.
- Precompute display items and modifier signatures when ticket data changes.
- Virtualize each visual column independently with FlashList or another masonry-safe approach.
- Do not use a normal row-major `numColumns` migration because it can reorder variable-height tickets.

**How this helps**

- Stable performance with 50 or more tickets.
- Fewer mounted React Native views.
- Less work every second.
- Smoother scrolling and ticket interaction during rush.

**Primary files**

- `app/(main)/kds.tsx`
- `stores/useKDSStore.ts`
- KDS card/display helpers

### 8. KDS Backend Work Can Scan Too Broadly

**Current behavior**

The KDS RPC aggregates order items before applying the narrowest location/order scope. It also performs nested modifier and acknowledgement work.

Header-only broadcasts can cause full-board authoritative refetches.

**Recommended change**

- Begin the RPC with a location-scoped order CTE.
- Join order items only to those orders.
- Pre-aggregate modifiers and acknowledgements.
- Add an order-scoped KDS delta RPC or richer ticket broadcast payload.
- Keep one canonical normalization and sort pipeline.

**How this helps**

- Lower database CPU as platform order volume grows.
- Smaller and faster KDS refreshes.
- Less client normalization work.
- Faster rush/prioritize/status updates across stations.

**Primary files**

- `stores/useKDSStore.ts`
- `hooks/realtime/useOrdersRealtime.ts`
- `supabase/migrations/*get_kds_tickets_v2*.sql`

### 9. Previous Orders Fetches Full Details Too Early

**Current behavior**

Previous Orders resolves business-day bounds and then performs a wide order query containing items, payments, and discounts. The screen clears its in-memory list on navigation away.

**Recommended change**

- Add `get_previous_orders_page_v1`.
- Compute business-day bounds inside the RPC.
- Return compact order-row summaries using keyset pagination.
- Load complete order details only when the merchant opens an order.
- Retain recent summary pages briefly and refresh them in the background.

**How this helps**

- Faster Previous Orders entry and scrolling.
- Smaller database responses.
- Lower transform and memory cost.
- No unnecessary refetch after quick navigation away and back.

**Primary files**

- `stores/usePreviousOrdersStore.ts`
- `app/(main)/previous-orders.tsx`
- `services/orderService.ts`
- Supabase migration for the compact history RPC

### 10. Realtime Broadcasts Fan Out to Multiple Stores

**Current behavior**

Each order broadcast is sent to the order, Previous Orders, and KDS stores. Existing telemetry found significant local mutation echoes, although individual handlers are usually fast.

**Recommended change**

- Add a mutation/request origin identifier.
- Suppress only confirmed local echoes.
- Normalize client and server monetary values to integer cents before comparison.
- Preserve important server-side status changes and cross-station payments.
- Introduce this behind a feature flag with burst-replay convergence tests.

**How this helps**

- Less repeated reconciliation during high transaction volume.
- Fewer unnecessary store writes and derived calculations.
- Reduced CPU usage on the busiest register.

**Risk**

This is correctness-sensitive. It should be implemented after lower-risk startup, floor, menu, and render work.

### 11. Foreground Recovery Is Fragmented

**Current behavior**

Multiple independent AppState and network listeners can refresh Clerk tokens, realtime authentication, settings, employees, active orders, floor state, heartbeat, terminals, and printers when the app resumes.

**Recommended change**

Create an application lifecycle coordinator with staged priorities:

```text
Immediate
  Authentication validity, active payment recovery, realtime state

Next frame
  Active order and active floor convergence

After interactions
  Employee/settings refresh, terminal pre-warm

Background
  Printer discovery, inactive floor prefetch, storage diagnostics
```

Use one shared network-state source and poll only when connectivity is uncertain or queued work exists.

**How this helps**

- Faster first tap after screen-off or app resume.
- Fewer simultaneous network requests.
- More predictable recovery sequencing.
- Easier diagnostics when one subsystem is slow.

### 12. Printing Competes With Payment UI

**Current behavior**

Star receipts are rendered as graphics. PNG encoding is synchronous and can begin around the payment-success render. Completed print jobs and generated temporary images can also accumulate during a long session.

**Recommended change**

- Allow the success screen to paint before starting receipt rasterization.
- Serialize Star raster generation through a render semaphore.
- Remove completed print jobs after a short diagnostics retention period.
- Delete generated temporary images after printer SDK consumption.
- Add age-based queue cleanup and printer-job priority aging.
- Prevent timeout recovery from starting a second drain while the original native operation may still be running.

**How this helps**

- Smoother payment completion.
- Lower long-session memory and cache growth.
- Fewer duplicate/overlapping print operations.
- More predictable receipt and kitchen-ticket ordering.

**Primary files**

- `components/bill/ paymentView/PaymentSuccessView.tsx`
- `services/printing/PrinterService.ts`
- `services/printing/renderers/StarXpandRenderer.ts`
- `services/printing/renderers/SkiaTicketRenderer.ts`
- `stores/usePrintQueueStore.ts`

### 13. Dejavoo Requests Need a Client Deadline

**Current behavior**

The Dejavoo payment request uses `fetch` without an AbortController deadline. A stalled proxy can leave the POS waiting for the operating system network timeout.

**Recommended change**

- Add an explicit client deadline.
- On timeout, transition to payment verification/recovery rather than treating the payment as definitely failed.
- Keep idempotency and recent-payment checks in the recovery path.

**How this helps**

- Removes unbounded "Processing" states.
- Gives the cashier a deterministic recovery experience.
- Reduces the perception that the entire app is frozen.

**Primary file**

- `lib/payments/dejavoo-spin-api.ts`

### 14. Offline Queue Persistence Can Grow Under Bad Wi-Fi

**Current behavior**

The offline queue can contain hundreds of operations. Queue transitions serialize the full operation array to MMKV.

**Recommended change**

- First measure queue serialization during a real bad-Wi-Fi test.
- Batch non-critical persistence transitions.
- Consider per-operation SQLite or append-only storage if measurements justify it.
- Process independent orders with bounded concurrency while retaining strict per-order dependency ordering.

**How this helps**

- Better performance during extended outages.
- Lower repeated JSON serialization cost.
- More scalable replay after connectivity returns.

**Risk**

The offline queue is transaction-sensitive. This should follow measured evidence and extensive replay/idempotency testing.

## Prioritized Roadmap

### Phase 0: Measure the Merchant Complaint

No architecture change should begin until the slow workflow is identified.

Capture:

- Device model and Android version.
- Build type and app version.
- Location and station type.
- Time since app launch.
- Number of open orders/tables/KDS tickets.
- Network type and quality.
- Whether printing or a terminal transaction was active.
- Exact interaction that felt slow.

Run the existing telemetry export after reproducing the issue.

### Phase 1: Low-Risk Client Improvements

1. Defer the synchronous MMKV size scan.
2. Mount payment details and profile bodies only while open.
3. Narrow the remaining full-order component subscriptions.
4. Remove KDS page-level per-second work.
5. Clean completed print jobs and temporary image files.
6. Add missing mount/render telemetry around Tables and table detail.

These changes require no database migration.

### Phase 2: Bootstrap and Server Contracts

1. Consolidate active POS menu bootstrap.
2. Persist a versioned active-menu snapshot.
3. Lazy-load standalone menu-management data.
4. Build the floor-plan snapshot/version RPC.
5. Add compact Previous Orders pagination.
6. Optimize the KDS RPC and add order-scoped refresh.

These changes require migrations and staged rollout.

### Phase 3: Mode-Specific Runtime

1. Split core, authenticated, POS, KDS, and CFD runtime ownership.
2. Gate CFD server work by station capability/configuration.
3. Stage foreground recovery through one lifecycle coordinator.
4. Avoid hydrating stores that the current station mode does not need.

### Phase 4: High-Risk Hot-Path Work

1. Confirmed local realtime echo suppression.
2. Offline queue persistence redesign if measurements justify it.
3. First-item/order-creation dependency restructuring.
4. Printing drain ownership and priority redesign.

Each high-risk change should ship separately behind a kill switch.

## Performance Metrics

Measure before and after each phase:

| Metric                                     | Meaning                                       |
| ------------------------------------------ | --------------------------------------------- |
| `pos.boot_to_order` P50/P95                | PIN success to fully interactive order screen |
| Menu first-content time                    | Store selection to usable active menu         |
| `pos.add_to_cart` P50/P95                  | Item tap to painted cart row                  |
| `pos.floor_switch` P50/P95                 | Floor tab tap to painted floor                |
| `pos.table_open` P50/P95                   | Table tap to usable table order               |
| Previous Orders first-content time         | Screen entry to visible summaries             |
| KDS dropped/slow frames                    | Rush behavior with 50+ tickets                |
| Payment success paint time                 | Approval/completion to responsive success UI  |
| Receipt enqueue/raster/physical print time | Separates UI, rendering, and hardware delay   |
| Resume settle time                         | Foreground event to responsive first tap      |
| Long tasks over 100 ms                     | JavaScript thread stalls                      |
| JS/native memory after four hours          | Long-session growth                           |
| RPC duration and payload bytes             | Backend/network contribution                  |

Target budgets should be agreed with product and QA after collecting a current release baseline.

## QA Matrix

Test performance changes on:

- Landi built-in tablet and printer.
- Standard Android tablet with Star Micronics printer.
- Castles terminal flow.
- Dejavoo terminal flow.
- POS station.
- KDS station with 50+ tickets.
- CFD-capable and non-CFD stations.
- Fast Wi-Fi, throttled Wi-Fi, disconnect/reconnect, and offline replay.
- Fresh install, warm launch, overnight resume, and four-hour soak.

Always use a preview/release build for final measurements. Development builds include logging, Metro, and debugging overhead and are not valid for performance sign-off.

## Verification Workflow

1. Enable **Performance diagnostics** in POS Settings.
2. Reproduce the reported slow workflow.
3. Include cold start, menu loading, item entry, table switching, payment, printing, background/resume, and KDS where applicable.
4. Open **Settings -> Devices & Connections**.
5. Export the performance telemetry JSON.
6. Record Android Studio CPU and memory traces for the same workflow when possible.
7. Compare P50/P95 interaction spans, long tasks, memory, RPC time, and payload size before and after each change.
8. Attach the telemetry export and screen recording to the performance ticket.

## Decision Guidance

If the complaint is:

| Reported symptom              | Start with                                                 |
| ----------------------------- | ---------------------------------------------------------- |
| Slow login or blank menu      | Menu bootstrap and cached menu snapshot                    |
| Slow floor/table navigation   | Floor snapshot RPC and prefetch policy                     |
| First item tap feels delayed  | Order-creation dependency                                  |
| KDS worsens during rush       | KDS timer isolation, virtualization, and RPC scope         |
| Payment approval hangs        | Dejavoo deadline or terminal-specific diagnostics          |
| UI freezes after payment      | Star raster scheduling and print queue                     |
| Slow after screen-off/resume  | Lifecycle coordinator                                      |
| Slow only after several hours | Memory, print queue, temp files, offline queue, soak trace |
| Previous Orders loads slowly  | Compact summary RPC and retained pagination cache          |

## Conclusion

The repository does not need a general architecture rewrite. It needs tighter runtime ownership and smaller, better-timed units of work.

The highest-value improvements are:

1. One compact, cached menu bootstrap.
2. A versioned floor-plan snapshot contract.
3. Mode-specific providers and lazy hidden UI.
4. Scalable KDS rendering and backend scoping.
5. Isolated printing/payment work.
6. Measured, staged foreground and realtime optimization.

This approach improves performance while preserving the POS requirements that matter most: offline operation, cross-station convergence, payment safety, printing reliability, and predictable recovery.

## Supporting Repository Evidence

- `PERF-AUDIT-B-REALTIME.md`
- `PERF-AUDIT-C-HARDWARE.md`
- `docs/perf-baseline-protocol.md`
- `tasks/todo.md`
- `tasks/perf-handoff.md`
- `tasks/perf-nav-kds-results.md`
- `tasks/sustained-perf-and-badwifi.md`
- `tasks/memory-state-audit.md`
