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
