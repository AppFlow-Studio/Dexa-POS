# Per-Station Menu Scope - POS and Kiosk

## Summary

Menu visibility stopped at station *type*: `location_menus.is_visible_on_pos`
applied to every register and `is_visible_on_kiosk` to every kiosk at a
location. "Kiosk 1 shows only Sushi, Kiosk 2 shows everything" could not be
represented.

Each station now carries an explicit menu scope, applied on top of the
existing channel toggle:

- `stations.menu_scope` — `'all'` (default, today's behaviour) or `'selected'`.
- `station_menus (station_id, menu_id)` — the chosen menus when `'selected'`.
- A menu renders on a station iff its channel flag is on for that station's
  type **and** (scope is `'all'` or the menu is in `station_menus`).
- **Fail closed.** `'selected'` with zero menus renders nothing, never the full
  menu. A deleted menu cascades out of `station_menus` and the station goes
  empty rather than suddenly showing everything.
- **One fail-open path:** a station missing from the map (a snapshot written
  before this shipped) resolves to `'all'`.

Builds on the Done channel-visibility ticket `3be8280c` (Saucy "Whole Menu"),
documented in `menu-channel-visibility.md`.

Owner: Ali Jaffal (end to end). Reviewers: Ali Dika (migration, RLS, RPC),
Haidar + Abubeckr (portal placement). Website half:
`DexaPOS-Website/docs/features/menu-management/FEATURE-2026-09-19-PER-STATION-MENU-SCOPE-WEB.md`.

## Resolved dependencies

- **`'self_service'` vs `'kiosk'`.** Kiosk.tsx and every routing gate read
  `station_type === "self_service"`; `"kiosk"` is the *channel* name on
  `location_menus` / `channel_visibility`. The map excludes `station_type =
  'kds'` only; the tablet maps `self_service → kiosk` channel, everything else
  `→ pos` (`channelForStationType`, mirroring `stationKind`).
- **Change signal.** The tablet polls `get_pos_menu_version_v1` every 5 min
  (`useMenuVersionWatch`) and refetches `get_pos_bootstrap_v2` only when the
  token moves; `PosSyncProvider` then rebuilds the store only when the envelope
  `version` differs from the applied one. Neither watermark could see
  `station_menus` or `stations.menu_scope`, and `stations.updated_at` moves on
  every heartbeat so it cannot be used. The migration adds a content hash
  (`get_station_menu_scope_watermark_v1`) folded into **both** the bootstrap
  v2 version (suffix bumped to `-channels-v3-station-scopes-<hash>`) and a
  new `get_pos_menu_version_v2` probe, which the tablet now polls. v1 stays
  verbatim and in lockstep with bootstrap v1, as its header requires.

## Scope

- Migration (shared, identical copy in both repos):
  `utils/supabase/migrations/20260919120000_station_menu_scope.sql`.
- Tablet: one shared selector, `useVisibleMenus()`, replacing every
  `useMenuStore(s => s.menus)` read on an order-entry surface.
- Tablet: cart hygiene on a fresh snapshot; empty states on POS and kiosk.
- Tablet: both offline snapshots (MMKV and the SQLite mirror) carry
  `station_menu_scopes`.

## Non-scope (flagged only)

- Per-station *category* visibility — category-level channel toggles do not
  exist yet.
- Server-side rejection of orders for items outside a station's scope.
- The existing `is_active OR` bug and `menu_items.available_channels` not being
  honored on POS, both flagged in `3be8280c`.
- Guarding a direct `UPDATE stations SET menu_scope` outside the RPC. Anyone who
  can already edit a station row can flip it; the RPC and `station_menus` RLS
  both require `location.menu.manage`.

## Plan

1. Migration: column + CHECK, junction table + trigger + RLS + indexes,
   watermark, bootstrap v2 redefinition, probe v2, `set_station_menu_scope`.
2. Tablet types + bootstrap fetch carry `station_menu_scopes`.
3. Shared selector and hook; rail, search, three kiosk templates and kiosk
   search switched to it.
4. Cart pruning after a live snapshot, with toast.
5. Snapshot persistence: MMKV rides along automatically; SQLite mirror gains
   `menu_station_scopes` (schema v13, additive).
6. Focused tests; docs; QA runbook.

## Progress

- [x] Migration file written (both repos, byte-identical).
- [x] `types/menu.ts`: `StationMenuScope`, `StationMenuScopeMap`,
      `PosSyncData.station_menu_scopes`.
- [x] `hooks/pos/usePosSync.ts` reads the map off the envelope.
- [x] `hooks/pos/useMenuVersionWatch.ts` polls `get_pos_menu_version_v2`.
- [x] `stores/useMenuStore.ts` holds `stationMenuScopes`, set by the same
      `setMenuData` for live and cache paths.
- [x] `lib/menu/stationMenuScope.ts`: `selectVisibleMenus`,
      `resolveStationMenuScope`, `channelForStationType`.
- [x] `hooks/menu/useVisibleMenus.ts`: `useVisibleMenus`,
      `useIsStationMenuScopeEmpty`, `useStationMenuChannel`.
- [x] POS rail (`MenuSection`) and POS item search (`SearchBottomSheet`) use
      the selector; `filterPosOrderEntryMenus` still layers the device-local
      hidden list on top.
- [x] Kiosk templates A/B/C and `useKioskSearchEntries` use the selector; the
      per-screen `isMenuVisibleOnChannel(m, "kiosk")` checks are gone.
- [x] Empty states: `MenuUnavailableState` gains "No menus assigned to this
      station"; kiosk templates render `KioskNoMenusState`.
- [x] `services/stationMenuScopePrune.ts` removes unsent, unpaid active-order
      lines whose origin menu is still in the tree but no longer visible here,
      and kiosk lines whose item is reachable only through hidden menus. Toast
      via `toastService`. Called from `PosSyncProvider` after `setMenuData` on
      a live sync only.
- [x] SQLite mirror: `menu_station_scopes` table, schema v13 with additive
      upgrades 11→13 and 12→13, entity children, station policy, write/read,
      census log.
- [x] Tests: `__tests__/stationMenuScope.test.ts`,
      `__tests__/stationMenuScopePrune.test.ts`, round-trip cases added to
      `__tests__/db/menuMirror.test.ts` and `__tests__/menuOfflineCache.test.ts`.
- [ ] Apply the migration to staging, then production.
- [ ] Device QA per the matrix below; screen recording to Abubeckr.
- [ ] Reviewer other than the implementer signs off.

## Deviations from the ticket (call them out in review)

- The `station_menu_scopes` map and its watermark **do not filter on
  `stations.is_active`** (the ticket's SQL skeleton did). A deactivated station
  that somehow still runs would otherwise fall open to `'all'`, and a station
  deactivated then reactivated should come back with the same selection. Cost:
  a few extra keys in the map.
- `set_station_menu_scope('all', …)` **clears `station_menus`** so rows exist
  only when the scope is `'selected'`. The portal keeps the draft locally if a
  manager wants to flip back.
- Cart pruning is limited to **unsent, unpaid, non-voided lines on the active
  order**. Sent or paid lines are order items; removing them would corrupt the
  check, and voiding is a staff decision.

## Verification

- `npx tsc --noEmit` (project-wide) — see the session log in the PR.
- Targeted Jest: the four test files above plus `posMenuVisibility` and
  `menuChannelVisibility`.
- SQL verification queries are at the foot of the migration file.

## Files

- `utils/supabase/migrations/20260919120000_station_menu_scope.sql`
- `types/menu.ts`
- `hooks/pos/usePosSync.ts`
- `hooks/pos/useMenuVersionWatch.ts`
- `stores/useMenuStore.ts`
- `lib/menu/stationMenuScope.ts`
- `hooks/menu/useVisibleMenus.ts`
- `services/stationMenuScopePrune.ts`
- `contexts/PosSyncProvider.tsx`
- `components/menu/MenuSection.tsx`
- `components/menu/SearchBottomSheet.tsx`
- `components/menu/MenuUnavailableState.tsx`
- `components/kiosk/shared/KioskNoMenusState.tsx`
- `components/kiosk/shared/useKioskMenuSearch.ts`
- `components/kiosk/template-a/KioskMenuView.tsx`
- `components/kiosk/template-b/KioskMenuViewB.tsx`
- `components/kiosk/template-c/KioskMenuViewC.tsx`
- `lib/db/schema.ts`, `lib/db/entities.ts`, `lib/db/policy.ts`,
  `lib/db/descriptors/menu.ts`
- `__tests__/stationMenuScope.test.ts`, `__tests__/stationMenuScopePrune.test.ts`,
  `__tests__/db/menuMirror.test.ts`, `__tests__/menuOfflineCache.test.ts`

## Open QA

Matrix: {register, self_service} × {all, selected with 1, selected with 0,
selected with a channel-hidden menu} × {online, offline cold start}. Plus: a
menu deleted while selected; a station deactivated then reactivated.

1. Migration on staging. Verification query 1 in the migration returns `0, 0`;
   no rail changes anywhere before a toggle.
2. Kiosk 1 → Selected → Sushi. Within one probe tick (≤ 5 min, or Settings →
   "Check for menu changes") Kiosk 1 shows only Sushi; Kiosk 2 on All is
   unchanged. Repeat on a register.
3. Channel toggle wins: set Sushi `is_visible_on_kiosk = false`; Kiosk 1 shows
   the empty state and the portal shows the inline warning on the Sushi row.
4. Selected with zero menus → "No menus assigned to this station" on POS and
   kiosk; the full menu never appears.
5. Airplane mode after (2): cold start still shows only Sushi. Test with
   `EXPO_PUBLIC_LOCAL_MENU` both unset (MMKV) and `1` (SQLite mirror).
6. Item search on the scoped station returns nothing that exists only in
   hidden menus (POS search sheet and kiosk search overlay).
7. Add a Sushi item to the cart on a register, then hide Sushi from that
   station in the portal; on the next snapshot the line is removed with the
   "Cart updated" toast. A line already sent to the kitchen stays.
8. Delete a selected menu on a throwaway staging merchant: `station_menus` has
   no orphan; the station goes empty, not to the full menu.
9. RLS: a server-role user cannot insert into `station_menus`; a user from
   another merchant reads no rows.
10. Screen recording: portal toggle → two kiosks side by side → offline cold
    start. Send to Abubeckr. Not Done until reviewed.
