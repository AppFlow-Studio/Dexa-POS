# KDS Display Size (Board UI Scale)

## Summary

Operators need to size the KDS board — tickets, header tabs, text — for the
screen and the cooks' viewing distance. `kds_displays.font_scale` already
existed and the dashboard's station editor already set it (0.8 / 1.0 / 1.25 /
1.5), and the HQ KDS mirror already rendered with it, but the tablet ignored
it.

## Behavior

- The board scale is `automatic device scale × font_scale`, clamped to
  `MIN_KDS_UI_SCALE`–`MAX_KDS_UI_SCALE` (0.6–2.0). Like the CFD scale it
  replaces the POS `uiScaleOverride` on the board rather than stacking on it.
- Column count is its own setting ("Tickets per row": 3 or 4, from
  `kds_displays.columns`; the dashboard also offers 2–6). A larger size makes
  each ticket's content larger within its column (same as the HQ mirror).
- The header's right-hand controls wrap onto a second line instead of running
  off screen at larger sizes.
- The KDS settings panel opened over the board stays at the normal scale, so
  the page does not resize under the operator while they pick a size.
- Editable from KDS settings → Per-Station Settings → Display (on the KDS
  itself, or for any KDS station from a POS), and from the dashboard.
- A change made on another device reaches a running board the same way other
  display settings do: on refresh, on closing KDS settings, or on remount.

## Settings no longer flip back while saving

Settings apply locally, then save. A read already in flight — the display
fetch when KDS settings opens, a previous save's refetch, the config poll —
returned the old value and flipped the control back until the next read
flipped it forward. The sound section was worst: it mirrored the store into
local state and re-synced on every refetch.

- `lib/pendingWrites.ts` — reads overlay local edits until the server has
  accepted them and a read started after that has returned.
- Per-station settings (`kds_displays`) save through
  `useKDSStore.updateKDSDisplay`: optimistic, reverted with a toast on
  failure, no refetch needed. The panel reads straight from the store.
- Location config (`updateConfig`): the 500 ms debounce kept only its last
  call's arguments, so changing two settings inside the window never saved
  the first. Edits now accumulate and flush together.

## Implementation

- `lib/uiScale.ts` — `KDSScaleProvider` + KDS context consulted by
  `useUiScale()`; also re-injects `--ui-scale` so Tailwind-sized components
  in the tree follow it. `override={null}` opts a subtree back out.
- `app/(main)/kds.tsx` — default export wraps the screen in
  `KDSScaleProvider` with `kdsDisplayConfig.fontScale`; the settings panel is
  wrapped in `override={null}`; board height cache is namespaced by scale;
  header right group wraps.
- `app/(main)/settings/kds.tsx` — Display Size and Tickets per Row option
  cards in `StationDisplayPanel`; every per-station control saves through
  `updateKDSDisplay`.

## Verification

- `__tests__/kdsUiScale.test.tsx` — provider applies the scale, ignores the
  POS override, clamps to the KDS range, and a nested `null` opts out.
- `__tests__/settingsSaveRace.test.ts` — stale reads before/after a save
  don't revert it (both paths), failed saves revert, and debounced config
  edits all reach the RPC. The race tests fail with the overlay disabled.

## Open QA

- On a KDS tablet: set each size, confirm tickets, status/type tabs and
  modals resize, the header wraps rather than clipping at Large/Extra Large,
  and the settings panel itself does not resize.
- From a POS, change a KDS station's size, then tap Refresh on that KDS.
- Switch between 3 and 4 tickets per row; the board re-flows left to right.
- On a slow connection, change several settings quickly (sound presets,
  toggles, option cards): none flips back. With the network off, a
  per-station change reverts with a "Couldn't save setting" toast.
