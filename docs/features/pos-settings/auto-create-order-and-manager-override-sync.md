# Auto Create Order + Manager Override Timeout — pos_config sync

Two settings rendered in POS Settings but had no `locations.pos_config` key, so
they were written to device-local MMKV only.

## Reported symptoms

1. "After updating the app on the tablet, Auto Create Order stopped functioning."
2. "Manager Override Timeout is set to Always Require PIN, but the user was not
   prompted for a PIN each time a locked menu/category was accessed."

## Verified findings

Confirmed against the codebase before implementing:

- `pos_config` had 12 namespaces (`dining`, `kds`, `printing`, `cashDrawer`,
  `onlineOrdering`, `tips`, `preAuth`, `waitlist`, `payment`, `notifications`,
  `timeclock`, `fraudDetection`). No `ordering`, no `security`. ✅ as reported.
- Both settings lived in `useStoreSettingsStore` (MMKV, `store-settings-storage`)
  and appeared nowhere in `useLocationConfigStore` / `locationConfigSync`. ✅
- No server-side manager-PIN RPC exists; `ManagerPinModal` checks the PIN
  client-side via `useEmployeeStore.findEmployeeByPin` + a `MANAGER_ROLES` test. ✅

### Correction to the original diagnosis

The ticket stated the timeout setting "has no server-side value, so no gate reads
it — the Settings screen writes to a key nothing consumes." **That was wrong.**
`ManagerPinModal` did read `managerOverrideTimeoutMinutes`, and
`usePinOverrideStore.setUnlocked` honored it correctly (`0` starts no session).

The actual defect was a second, unbounded grant mechanism in front of that gate:

- On PIN success the modal called `addTemporaryMenuAccess` /
  `addTemporaryCategoryAccess`, appending to a permanent set in `useMenuStore`.
- The gate consulted that set *before* the session check:
  `isMenuAvailableNow(menu.id) || temporaryActiveMenuSet.has(menu.name)`.
- `clearTemporaryAccess()` — documented `// Call this on logout` — **was never
  called anywhere in the codebase**.

So the second access to the same resource short-circuited on the stale grant and
never reached the timeout logic. Adding a `pos_config` key alone would not have
fixed symptom 2; this was a client state-lifetime bug.

### Open question on symptom 1

The stated mechanism ("update cleared local storage, taking the setting with it")
predicts the *opposite* of the report: the default is `autoCreateOrder: true`, so
a wiped store yields auto-create **on**. The persist key `store-settings-storage`
has never changed. The likely trigger for storage loss was `22c43a4d` ("port
SDK-57-line features onto SDK 53 rollback"), since a version rollback typically
forces uninstall/reinstall. **Ask the merchant which direction it actually
failed** — syncing the key is correct regardless, but the diagnosis is incomplete.

## Decisions

- **Kept the existing number model** rather than the proposed
  `"always" | "session" | "minutes"` enum. The client already used
  `managerOverrideTimeoutMinutes: 0 | 5 | 15 | 30 | 60` where `0` *is* "always".
  A `"session"` mode does not exist today and would be new behavior, not a
  reconnection. This avoids a migration, a UI rework, and a redundant second key.
- **`verify_manager_pin` RPC + audit trail split to a follow-up ticket** — the
  audit-table destination is still unconfirmed (an open dependency on the ticket
  itself), and the leak fix resolves the merchant-visible symptom without it.
- **No structural migration needed.** `pos_config` is JSONB and
  `update_location_pos_config(p_location_id, p_namespace, p_config)` accepts any
  namespace with no whitelist; `resolveEffectivePosConfig` deep-merges new
  namespaces against defaults, and `useLocationConfigStore`'s `merge` backfills
  them for already-persisted blobs. The migration is a backfill only.

## Changes

- [x] `types/locationConfig.ts` — `OrderingConfig` + `SecurityConfig` namespaces,
      defaults matching the previous device-local defaults (`autoCreateOrder: true`,
      `managerOverrideTimeoutMinutes: 0`) so no merchant sees a behavior change.
- [x] `utils/supabase/migrations/add_pos_config_ordering_security.sql` — atomic
      backfill of both blocks, stamps `_updated_at`, bumps `_version` (the sync
      trigger) only for rows actually missing a block. Existing values win.
- [x] `usePinOverrideStore` — added `pendingGrant`, the navigation to run once
      the PIN is accepted. This is what makes "always require PIN" workable: the
      approved action completes immediately instead of relying on a lingering
      grant. `lockNow()` now clears temporary access.
- [x] `ManagerPinModal` — reads the timeout from `useLocationConfigStore`; runs
      `pendingGrant` before closing. Hint text now covers the always-require case.
- [x] `useMenuStore.revokeTemporaryAccess(menuNames, categoryNames)` — drops
      specific grants rather than all of them.
- [x] `MenuSection` — passes the completion callback into `requestPinOverride`,
      plus an effect that bounds every grant's lifetime (see below).

### Why the grant is still issued under "always require PIN"

First attempt withheld the temporary grant entirely when the timeout was `0`.
That broke opening the menu at all: the grant is **load-bearing for rendering**,
not just for gating. `MenuSection`'s "ensure a valid available menu is selected"
effect re-checks `isMenuAvailableNow(id) || temporaryActiveMenuSet.has(name)` and
auto-switches `activeMeal` away when it fails, so the just-unlocked menu was
reverted immediately; `filteredMenuItems` likewise returns `[]` for an
unavailable category.

The grant is therefore always issued, and the timeout controls its **lifetime**:

- timeout `0` — the grant covers only the selection it opened. Navigating
  elsewhere revokes it, so returning re-prompts.
- timed session — grants are cleared once the session is no longer unlocked
  (also on `lockNow()`).
- [x] `order-processing.tsx`, `usePaymentStore` — read `autoCreateOrder` from the
      synced config.
- [x] `settings/order-line.tsx` — both controls write via `updateConfig`.
- [x] `useStoreSettingsStore` — removed both now-superseded local fields (type,
      defaults, `partialize`) so there is a single source of truth.

## Verification

- Focused manager-access lifetime tests added on 2026-08-21: Always Require PIN
  creates no reusable session, timed access expires at its configured boundary,
  and closing the PIN request clears its one-time pending navigation.
- `npx tsc --noEmit` — clean.
- `npx jest` — 1465 passing, 29 failing across 10 suites. **Identical to the
  baseline on a stashed tree** (pre-existing `uuid` ESM transform config issue and
  others); zero regressions from this change.
- `npx eslint` on all changed files — 2 errors, both pre-existing
  `react/no-unescaped-entities` at `order-line.tsx:629`, in code this change does
  not touch (diff hunks: lines 4, 132–142, 542, 817, 858).

## Not done — needs device/human

- Update-survival test (install **over** an existing build, not a fresh install).
- Always-prompt test on device, including the same category twice consecutively.
- `"minutes"` window suppress/re-prompt test on device.
- Screen recording to Abubeckr; ticket stays open until reviewed.
- Reviewer sign-off from someone other than the implementer.
- Portal Settings UI parity — confirm with Abubeckr before building the web side.

## Follow-ups

1. `verify_manager_pin` RPC with permission gating (`location.menu.*`) and audit
   rows. PIN verification is client-side today, against locally cached employee
   records — a manager PIN is trusted without server confirmation.
2. Settings sweep: any other POS setting rendering in the UI without a
   `pos_config` key carries the same latent bug. `requirePinPerOrder` is a
   candidate — its comment claims it is "synced from the backend location
   setting", but it is device-local with no hydration path.
