# Kiosk Diagnostics UI Redesign

Goal: Redesign KioskDiagnosticsScreen to match the app's settings aesthetic — add a
left sidebar, clean spacing, confident easy-to-press buttons.

## Plan
- [ ] Add sidebar + content two-column layout (landscape kiosk)
- [ ] Sidebar: brand header, live connectivity pill, section nav with active states
- [ ] Sidebar footer: End Station Session (destructive) + Close
- [ ] Content: section header (title + subtitle) + scrollable cards
- [ ] Sections: Overview, Kiosk Profile, Menu Layout, Payment Terminal, About
- [ ] Confident buttons: larger touch targets, solid-teal primaries, white text
- [ ] Preserve ALL business logic (handlers/state/effects) byte-for-byte
- [ ] Type check passes

## Review

### Done
- Rebuilt `KioskDiagnosticsScreen.tsx` as a sidebar + content workspace matching
  the POS settings surface. All business logic (terminal handlers, state,
  effects, end-session) preserved byte-for-byte — only the presentation layer
  changed. Kept the linter's `terminalTypeLabel()` swaps.
  - Left nav rail: brand header, live Online/Offline pill, 5 sections
    (Overview / Kiosk Profile / Menu Layout / Payment Terminal / About) with
    teal active states (left bar + tint); End Station Session + Close pinned to
    the footer.
  - Content: per-section header (title + subtitle) + scrollable card canvas.
  - Confident buttons: bigger touch targets, solid-teal primaries with white
    text (Register/Save/primary Test), softer card elevation.
- Appearance color pickers: tapping a swatch/pipette opens a full color WHEEL
  modal (`reanimated-color-picker` Panel3 hue+saturation wheel + BrightnessSlider),
  commit on "Use color"; hex text field kept for precision.
  - Pure-JS lib on top of the reanimated + gesture-handler already bundled →
    NO native rebuild. Modal content wrapped in GestureHandlerRootView
    (required for gestures inside a RN Modal).

### Verification
- `npx tsc --noEmit` — no errors in either file (or the new dep).
- `npx eslint` — 0 errors; 4 warnings, all pre-existing (unused `terminalStatus`
  / `setRegisterFormType`, two exhaustive-deps on preserved effects).
- reanimated babel plugin present (last), package pinned `^5.1.2`.

### Note for running
- New dependency → start Metro with a cache clear (`npm run android` already
  does `--clear`, or `npx expo start -c`).
- The diagnostics screen is reachable via the manager-PIN gate, or the
  `__DEV__`-only "⚙︎ Settings (dev)" shortcut on the kiosk screen.
