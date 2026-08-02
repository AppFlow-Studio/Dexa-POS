# Expo SDK 57 Forced Rollback - Senior Decision Brief

## Purpose

This document describes what a forced rollback from Expo SDK 57 to Expo SDK 53 would require. It is a decision and execution brief only. No rollback has been performed.

## Executive Summary

The current `origin/staging` tip is `a4d73f30`. The last staging ancestor still using Expo SDK 53 is `aa80ef4b` (`Merge Table-And-Order-Syncing into main`, July 21, 2026).

A one-commit revert will not restore SDK 53:

- PR #158 (`7b8eccde`) first moved the project to Expo 57 / React Native 0.86.
- PR #161 (`4ee75d9e`) mixed additional SDK work with Valor, ATOM/Landi, payment, and UI changes.
- PR #163 (`a4d73f30`) added performance, Previous Orders, Skia, and further SDK fixes.

Resetting staging to `aa80ef4b` would remove 278 changed files across payments, printing, KDS, billing, Previous Orders, station access, native terminals, and performance work. It may also create incompatibility with database migrations that have already been deployed.

**Recommendation:** continue stabilizing SDK 57. If leadership requires SDK 53, create a dedicated rollback branch from the current staging tip and selectively restore the SDK 53 toolchain while forward-porting post-baseline features. Do not reset or force-push shared staging.

## Verified Rollback Boundary

| Point | Commit | Expo | React Native | React | Reanimated |
| --- | --- | --- | --- | --- | --- |
| Last SDK 53 staging ancestor | `aa80ef4b` | `~53.0.25` | `0.79.6` | `19.0.0` | `~3.19.5` |
| First SDK 57 merge | `7b8eccde` | `~57.0.6` | `0.86.0` | `19.2.7` | `~4.5.2` |
| Current staging | `a4d73f30` | `~57.0.8` | `0.86.0` | `19.2.3` | `4.5.0` |

The staging history after `aa80ef4b` includes:

1. `0d7c2084` - migration update.
2. `7b8eccde` - PR #158 and initial SDK 57 upgrade.
3. `d05a3aab` - billing access and KDS improvements.
4. `15544013` - online-order UUID label fix.
5. `4ee75d9e` - PR #161, payments, terminals, PanelSheet, and SDK updates.
6. `dc7652f1` - Landi Pay, Valor, and SDK integration merge.
7. `a4d73f30` - PR #163, performance, Previous Orders, Skia, and SDK fixes.

## Rollback Options

### Option A: Stabilize SDK 57

**Recommended.** Resolve the dependency, native, bottom-sheet, FileSystem, FlashList, lint, and test regressions identified in the companion audit. This retains all feature work and avoids another major compatibility migration.

### Option B: Selective SDK 53 Rollback

**Recommended only if rollback is mandatory.** Start from current staging, restore the SDK 53-compatible dependency and native foundation, then adapt every post-`aa80ef4b` feature to React Native 0.79 and the SDK 53 library versions.

This is a multi-day engineering and hardware-QA effort, not a package version change.

### Option C: Reset Staging to `aa80ef4b`

**Emergency-only and not recommended.** It provides the fastest return to the old source state but drops all subsequent work, risks database/client contract drift, and disrupts other developers. Shared staging must not be force-pushed or hard-reset.

### Option D: Revert Only PR #161 or PR #163

**Invalid rollback.** SDK 57 was already present in PR #158, so reverting either later PR leaves the app on SDK 57 while removing unrelated features.

## Work At Risk

A full source reset to `aa80ef4b` would remove or regress:

- Valor and ATOM/Landi terminal support.
- Batch-out, pre-authorization, and payment-flow changes.
- Subscription suspension and billing-access enforcement.
- Server-authoritative KDS Done behavior and rush/prioritized ordering.
- Previous Orders redesign, caching, filtering, and platform identity.
- Printing queue, raster cleanup, printer health, and receipt work.
- Lifecycle resume, realtime recovery, and performance telemetry.
- Skia table and font improvements.
- Station login, device synchronization, and access controls.
- Tests and fixes added after July 21.

The raw change from `aa80ef4b` to current staging is 278 files, approximately 50,675 insertions and 29,383 deletions.

## Proposed Forced-Rollback Procedure

1. Freeze merges into staging for the rollback window and record the current staging commit.
2. Create `rollback/sdk53-stabilization` from current `origin/staging`; preserve `a4d73f30` with a protected tag or release reference.
3. Use `aa80ef4b` only as the SDK 53 compatibility reference. Do not reset the rollback branch to it.
4. Restore the SDK 53 package set, lockfile, Expo config, Babel config, Android Gradle configuration, manifest settings, and React Native native templates as one reviewed compatibility change.
5. Keep post-baseline feature code and adapt it to SDK 53-compatible APIs.
6. Rebuild generated assets, including the CFD bundle, under the SDK 53 toolchain.
7. Verify the existing production/staging database contract before changing any migration or RPC.
8. Validate a clean dependency install and clean Android debug/release builds from a fresh checkout.
9. Complete the full regression and hardware matrix below.
10. Ship the rollback as a new native binary with a distinct runtime version. Do not deliver it as an OTA update to an SDK 57 runtime.
11. Merge through a reviewed PR only after senior approval and QA sign-off.

## Required Compatibility Adaptations

| Area | Required rollback treatment |
| --- | --- |
| Bottom sheets | Keep the shared `bottomSheet.tsx` adapter, but implement it with the SDK 53-compatible Gorhom sheet. Do not manually revert 69 consumer imports. Revalidate accepted/ignored configuration at each behavior-sensitive call site. |
| File system | Replace SDK 57 `expo-file-system/legacy` imports with the SDK 53-compatible API and verify update, cache, telemetry, receipt-template, Skia, and printer cleanup paths. |
| FlashList | Adapt v2-only usage back to FlashList 1.7.6 contracts, including sizing and ref behavior. |
| Reanimated and gestures | Remove Reanimated 4 / Worklets-only assumptions and validate gesture behavior against Reanimated 3 and Gesture Handler 2. |
| Native Android | Reconcile React Native 0.86 APIs in `MainApplication`, `MainActivity`, display modules, and payment-terminal bridges with React Native 0.79. |
| Testing | Restore SDK 53-compatible Jest, React Native Testing Library, ESLint, and TypeScript combinations before treating automated checks as gates. |
| Printing | Preserve post-baseline printer features while correcting SDK 53 FileSystem and native compatibility. |
| Previous Orders | Preserve the redesign and caching logic while adapting FlashList and lifecycle behavior. |
| KDS and billing | Preserve the current application behavior and shared database contracts; these are not SDK-only changes. |

## Database And Website Impact

The database should **not** be rolled back automatically with the app. The staging delta after `aa80ef4b` includes at least:

- `supabase/migrations/20260717120000_kds_server_authoritative_done.sql`
- `utils/supabase/migrations/stations_and_devices/get_location_stations_with_status.sql`

These changes may already be deployed and support current KDS and station behavior. The SDK 53 rollback client must be tested against the current database. If a payload is incompatible, add a backward-compatible function/version rather than reversing live data or replacing a shared RPC without impact analysis.

The website does not need an Expo or dependency rollback. It only needs shared-contract verification for RPCs used by both clients. Website work should remain deployed unless a specific API incompatibility is proven.

## Verification Gates

The rollback branch is not releasable until all of the following pass:

- Clean `npm ci` from a fresh checkout with all `patch-package` patches applying.
- Clean Android debug and release builds without local Gradle init scripts or developer-machine-only workarounds.
- Cold start, login, PIN, station selection, suspend/restore, logout, and session recovery.
- Menu/category loading, modifiers, order creation, editing, sending, payment, refund, void, and reprint.
- Cash, card, split payment, Valor, ATOM/Landi, batch-out, and pre-authorization where enabled.
- Star Micronics and Landi built-in printing, receipt raster cleanup, printer recovery, and historical reprint.
- KDS send, prioritize, rush, recall, cross-station Done, retention, and auto-advance.
- Previous Orders sorting, filters, pagination/cache, platform logos, and detail navigation.
- Tables, merge, transfer, unmerge, offline queue, reconnect, background/foreground, and realtime resubscription.
- Customer-facing display and generated CFD bundle.
- Targeted automated tests plus restored lint/type/test gates with no upgrade-caused failures.
- Physical tablet recording showing the critical POS, KDS, terminal, and printing workflows.

## Go / No-Go Criteria

Proceed only when:

- The rollback builds from a clean environment.
- No post-`aa80ef4b` business feature is silently lost.
- Current database contracts work with the rollback client.
- Payment terminals and both printer targets pass physical QA.
- The new binary/runtime can be deployed independently from SDK 57.
- Engineering, QA, and product explicitly approve the remaining risk.

Stop the rollback if terminal integrations cannot be safely ported to React Native 0.79, if shared KDS/payment behavior regresses, or if the selective rollback becomes riskier than finishing the SDK 57 stabilization.

## Recovery Plan

- Preserve current staging at `a4d73f30` before rollback work starts.
- Do not delete or rewrite the SDK 57 history.
- Keep rollback work isolated until QA completes.
- If the SDK 53 build fails release gates, abandon the rollback branch and resume stabilization from the preserved SDK 57 staging tip.
- If deployed, retain a tested path to reinstall the last known production binary while the new runtime is monitored.

## Senior Decision Requested

Choose one path before implementation:

1. Approve SDK 57 stabilization and use the existing audit remediation plan.
2. Approve a selective SDK 53 rollback branch with full feature forward-port and hardware QA.
3. Declare an emergency source reset acceptable and explicitly accept the listed feature and database-contract risks.

## Related Documents

- `tasks/expo-sdk57-staging-regression-senior-summary.md`
- `tasks/expo-sdk57-staging-regression-audit.md`

