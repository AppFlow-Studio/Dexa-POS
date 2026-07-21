# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Dexa-POS is a tablet-focused (landscape-only) Point of Sale system for restaurants and retail, built with React Native/Expo. It features offline-first architecture, real-time multi-station sync, payment terminal integration (Dejavoo, Castles), receipt printing (Star Micronics), and a Kitchen Display System (KDS).

## Commands

```bash
npm start              # Start Metro bundler (Expo dev server)
npm run android        # Run on Android with ADB reverse port forwarding + cache clear
npm run ios            # Run on iOS simulator
npm run lint           # ESLint
npm test               # Jest tests
npm run test:watch     # Jest in watch mode
npm run test:coverage  # Jest with coverage report
npm run bridge         # Set up emulator bridge (scripts/setup-emulator-bridge.sh)
npx tsc --noEmit       # Type check (must run project-wide; single-file check fails on @/ imports)
```

EAS Build profiles: `development`, `preview`, `production` (configured in `eas.json`).

## Architecture

### Tech Stack

- **Framework**: Expo SDK 53, React Native 0.79 (New Architecture + Hermes enabled)
- **Routing**: Expo Router (file-based, `app/` directory) with typed routes
- **Styling**: NativeWind 4 (Tailwind for RN), `global.css` entry point
- **State**: Zustand stores (~52 in `stores/`) with MMKV persistence
- **Backend**: Supabase (Postgres, Realtime, Auth for staff), Clerk for user auth
- **UI primitives**: `@rn-primitives/*` (shadcn-style components for RN)
- **Money math**: `decimal.js` / `big.js` — never use floating point for currency

### Path Aliases

`@/` and `~/` both resolve to the project root (configured in `tsconfig.json` and `babel.config.js`).

### Route Groups

- `app/(auth)/` — Login, PIN login, store/station selection
- `app/(main)/` — All main screens: order-processing, tables, kds, menu, inventory, settings, analytics, scheduling
- `app/(profiles-and-timeclock)/` — Employee profiles and time clock

### Provider Hierarchy (app/\_layout.tsx)

`ClerkProvider` > `TanstackProvider` > `PosSyncProvider` > `GestureHandlerRootView` > `BottomSheetModalProvider` > `ThemeProvider` > `ToastProvider` > `LoadingProvider` > `SessionKickListenerProvider` > `RemoteActionsProvider` > `CFDProvider`

**PosSyncProvider** (`contexts/PosSyncProvider.tsx`) is the central initialization hub: registers Supabase client with all stores, runs `useOrdersQuery` / `usePreviousOrdersBootstrap`, detects hardware capabilities (`detectAndStoreCapabilities`), starts terminal health checks (Castles singleton lifecycle), Star printer discovery, and employee sync. KDS mode skips POS-only init via `isKDS`.

### State Management Patterns

**Zustand + MMKV**: Stores use `zustand` with optional MMKV persistence (`lib/storage.ts`, debounced 300ms). Major stores (`useOrderStore`, `useTableSessionStore`) use **Immer middleware** for mutative updates.

**Key stores**:

- `useOrderStore` (~10K lines) — Orders keyed by local `orderId` in `ordersById`. Has `dbOrderIdIndex` for O(1) reverse lookup of `db_order_id` → local `orderId`. Uses `persistableOrderIds` to limit what gets persisted.
- `useTableSessionStore` — Dispatch pattern with internal action types (`TableEvent`, `SET`, `SYNC`, `CLEAR`, `PATCH`). `dispatchAction()` is the high-level API for components.
- `useMenuStore` — Menu items, categories, modifiers with MMKV persistence.
- `useFloorPlanStore` — Table layouts and sections.
- `useStoreSettingsStore` — Location config, tax rates map, feature flags.

**Granular selectors**: Use `useActiveOrder()` and `useOrder(orderId)` from `stores/selectors/orderSelectors.ts` instead of subscribing to full `ordersById`.

### Table Lifecycle

`lib/tableStateMachine.ts` — Pure function state machine. Local-only statuses (`seating`, `ordering`, `paying`, `closing`) never sync to backend. `isLocalOnlyStatus()` guards against realtime overwrites.

**Session side effects**: `lib/sessionActions.ts` defines `SessionAction` discriminated union (SEND_TO_KITCHEN, CLOSE_CHECK, REOPEN_CHECK, VOID_ORDER, CLEAR_TABLE, MARK_SERVED, PRESENT_CHECK, FULL_PAYMENT, FINISH_CLEANING, BEGIN_PAYING, BEGIN_CLOSING, CANCEL_INTERMEDIATE). Effects registered via `registerSessionSideEffect()`, implementations in `services/sessionEffects/` (one file per action type), all registered at startup via `registerAllSessionSideEffects()` in `_layout.tsx`. Fired asynchronously via `queueMicrotask`. `VOID_ORDER` and `CLOSE_CHECK` intentionally omit `ACTION_TO_EVENT` mapping — they have custom state machine handling.

### Hooks Structure

- `hooks/` — 33 root-level hooks (table lifecycle, hardware, realtime listeners, etc.)
- `hooks/pos/` — POS bootstrap hooks: `useOrdersQuery`, `usePreviousOrdersBootstrap`, `usePosSync`, `useInventorySync`, `useStandaloneSync`
- `hooks/orders/` — Order-specific hooks
- `hooks/realtime/` — Supabase realtime subscription hooks

### Offline-First Sync

- `services/offlineSyncService.ts` — Queue-based offline sync with retry
- `services/offlineSyncInit.ts` — Bootstrap and initialization
- `services/conflictDetectionService.ts` — Multi-station conflict resolution
- Network status via `@react-native-community/netinfo`, tracked in `useSyncStatusStore`

### Dual Pricing

`CartItem` has both `price`/`subtotal`/`taxAmount` (card) and `cashPrice`/`cashSubtotal`/`cashTaxAmount` (cash). `OrderPaymentItemCoverage` only stores card prices.

### Payment Processing

- Dejavoo terminal integration via SPIN API (`lib/payments/dejavoo-spin-api.ts`)
- Castles terminal integration via TCP socket (`services/terminals/castles-service.ts`)
  - **TCP framing**: no delimiter (raw JSON, no framing suffix)
  - **getData response**: has no `txnReturnCode` field; success = valid response with `txnType === 'getData'`
  - Terminal runs as TCP server at configurable IP:port (default port 8080)
  - **Command queue**: `async-mutex` serializes all commands (FIFO). Commands queue instead of rejecting.
  - **`return2Idle` recovery** (per Castles spec §3.8, two strategies):
    - **Success path** (`_tryReturn2Idle`): After completed transaction, send return2Idle on the same socket to dismiss the result screen (spec situation 1).
    - **Error path** (`_forceReturn2Idle`): After timeout/error (terminal may be in swipe/tap state), close socket, reconnect on a fresh socket, then send return2Idle (spec situation 2 — same-socket return2Idle won't work during active txn).
  - **Startup reset**: `resetTerminalState()` called after fresh connect to clear stuck-busy state.
  - **Shared singleton**: One `CastlesService` instance per terminal, shared across the app.
- Payment flow in `services/paymentService.ts`, refunds in `services/refundService.ts`
- Hardware detection: `services/hardware/deviceDetection.ts`

### Printing

- `services/printing/PrinterService.ts` — Queue-based print management
- Drivers in `services/printing/drivers/` (`StarMicronicsDriver`, `LandiDriver`, `NetworkDriver`/ESC-POS, `DejavooDriver`) — selected by `DriverFactory` from `printer_type`.
- Renderers in `services/printing/templates/` (`ReceiptDocumentTemplate.ts` is the IR-based renderer for Star + Landi; `ReceiptTemplate.ts` is the raw ESC/POS path).
- **Star Micronics network printers** (TSP143, etc.) use `react-native-star-io10` via `StarMicronicsDriver`. The `addTextColumns` / `addDividingLine` `convertLineStyle` path was broken at the SDK layer and is intentionally skipped — use manual char-padding via `padTwoColumn()` instead.
- **Landi C20Pro built-in printer** is a **separate** native Kotlin driver — `LandiDriver` → `@/native/LandiPrinter` → `LandiPrinterModule.kt`, using the Landi `com.sdksuite.omnidriver` SDK (NOT Star). It has a VectorPrinter path (primary) plus a simple-Printer fallback. The driver filters `image` and `barcode` nodes — the C20Pro hardware/SDK has no bitmap API exposed today (see `TODO(landi-logo)` in `LandiPrinterModule.kt`).

### Database Types

`database.types.ts` (root) — Auto-generated Supabase types. Do not edit manually. SQL migrations in `utils/supabase/migrations/`.

## Testing

Jest with `jest-expo` preset. Mocks for MMKV, SecureStore, NetInfo, and Supabase configured in `jest-setup.ts`. Tests in `__tests__/` directory. Coverage targets: `lib/`, `services/`, `stores/`, `hooks/`.

## Environment Variables

```
EXPO_PUBLIC_SUPABASE_URL
EXPO_PUBLIC_SUPABASE_ANON_KEY
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY
EXPO_PUBLIC_CFD_DISABLE_LOYALTY  # 1 or "true" to bypass CFD loyalty flow entirely
```

**`EXPO_PUBLIC_CFD_DISABLE_LOYALTY`** — kill switch for the CFD loyalty path while it's being stabilized. When set:
- Approved screen on the CFD never shows the Join Loyalty CTA (`merchantHasLoyalty` is forced to `false` in the CFD payload).
- `showLoyaltyPrompt` and `showLoyaltyConfirmation` bail to `showIdle()` instead of transitioning the CFD into the loyalty screens.
- The `onLoyaltyJoin` controller callback is a no-op (also returns to idle), so a stale Join tap from an external CFD client can't drag us into the loyalty flow.
- The on-device built-in CFD WebView path is also covered — same `merchantHasLoyalty` gate is read by `ResultScreen.tsx`.

Implementation: `contexts/CFDProvider.tsx`, gated by `cfdLoyaltyDisabled` near line 386.

**Supabase project IDs**:
- Staging: `dfwqakoyittmrwbqvxgw`
- Production: `hifouuofcaytijrkbvcy`

## Key Conventions

- KDS mode skips POS-only initialization (timeclock, PTO, draft cleanup, print queue) — gated by `isKDS` checks in `_layout.tsx`
- Supabase RPC functions (with versioned naming like `process_payment_v8`) are the primary backend API
- Real-time sync uses Supabase broadcast channels per location
- `useOrderStore.syncOrderFromBackendComplete(orderId)` expects the **local store key**, not `db_order_id`
- `getOrder()` alone can be fragile in `DraggableTable` — timing gaps in `dbOrderIdIndex` after seating mean sidebar components should use resilient fallbacks (scan by `service_location_id` or `db_order_id`)

## Workflow Orchestration

### 1. Plan Mode Default

- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately - don't keep pushing
- Use plan mode for verification steps, not just building

### 2. Subagent Strategy

- Use subagents liberally to keep main context window clean
- Offload research, exploration, and parallel analysis to subagents
- One task per subagent for focused execution

### 3. Self-Improvement Loop

- After ANY correction from the user: update `tasks/lessons.md` with the pattern
- Write rules for yourself that prevent the same mistake
- Review lessons at session start for relevant context

### 4. Verification Before Done

- Never mark a task complete without proving it works
- Ask yourself: "Would a staff engineer approve this?"
- Run tests, check logs, demonstrate correctness

### 5. Demand Elegance (Balanced)

- For non-trivial changes: pause and ask "is there a more elegant way?"
- Skip this for simple, obvious fixes — don't over-engineer

### 6. Autonomous Bug Fixing

- When given a bug report: just fix it. Don't ask for hand-holding
- Point at logs, errors, failing tests - then resolve them

## Task Management

1. Plan First: Write plan to `tasks/todo.md` with checkable items
2. Verify Plan: Check in before starting implementation
3. Track Progress: Mark items complete as you go
4. Explain Changes: High-level summary at each step
5. Document Results: Add review section to `tasks/todo.md`
6. Capture Lessons: Update `tasks/lessons.md` after corrections

## Core Principles

- Simplicity First: Make every change as simple as possible. Impact minimal code.
- No Laziness: Find root causes. No temporary fixes. Senior developer standards.
- Minimal Impact: Changes should only touch what's necessary. Avoid introducing bugs.
