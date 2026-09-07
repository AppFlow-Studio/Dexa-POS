# CFD Display Scale

Settings > Customer Display > **Display Scale** sets a scale multiplier that
applies **only** to customer-facing display (CFD) screens. The POS keeps its
own independent `uiScaleOverride` (Settings > General > UI Scale); neither
setting affects the other.

The two are deliberately separate because the CFD is a physically different
screen — an external tablet or an on-device secondary display — read by a
customer at a different distance than the operator reads the POS.

## Status

- [x] `cfdUiScaleOverride` in `useSettingsStore` (persisted via MMKV)
- [x] `CFDScaleProvider` / `useCFDScaleOverride` in `lib/uiScale.ts`
- [x] Payload plumbing across all three CFD transports
- [x] Settings UI on the Customer Display screen
- [x] Tests (`__tests__/cfdUiScale.test.tsx`)

## How it reaches the display

The setting is stored POS-side but consumed on the CFD, and the CFD runs in
three different runtimes — an external tablet (its own app and its own MMKV),
the on-device secondary display, and the CFD WebView bundle (which cannot
touch MMKV at all; see the `Platform.OS === "web"` split at the top of
`lib/uiScale.ts`). So it travels **in the CFD payload**, exactly like
`pricingDisplayMode`:

```
useSettingsStore.cfdUiScaleOverride     (POS, persisted)
  └─ CFDProvider                        selector + mirror effect + WS payload
       ├─ useCFDBuiltinStore            → on-device WebView (snapshot + updates)
       ├─ useCFDClientStore             → external CFD tablet
       └─ cfdWebDisplayProvider         → WebView bundle
            └─ CFDDisplayDataContext.cfdUiScaleOverride
                 └─ CFDScreenRouter → CFDScaleProvider
                      └─ useUiScale()  ← every CFD screen already calls this
```

The last step is what keeps the change small: all ~12 CFD screens already call
`useUiScale()`, and that hook now consults `CFDScaleContext`. Inside a CFD tree
the CFD override and clamp range apply; everywhere else the POS override does.
No CFD screen component needed editing.

`CFDBuiltinDisplay` wraps the native loyalty overlay in `CFDScaleProvider`
separately, because that overlay renders *outside* `CFDScreenRouter`.

## Gotchas

**`null` is a meaningful value.** It means "no override, follow the automatic
per-device scale" — it is not "absent". The payload-apply paths in
`useCFDClientStore` and `cfdWebDisplayProvider` therefore test
`'cfdUiScaleOverride' in payload` rather than using `??` to carry forward. With
`??`, setting the control back to **Default** could never propagate, and the
display would stay stuck at the last non-null scale.

**Provider ordering in the WebView.** The WebView bundle is the one CFD
runtime where NativeWind utility classes resolve through the `--ui-scale` CSS
variable. `UiScaleProvider` therefore has to sit *below* `CFDWebDisplayProvider`
(where the override arrives) and below `CFDScaleProvider` — see `CFDScaledRoot`
in `web/cfd-entry.tsx`. Hoisting it above the display data, as it originally
was, silently publishes the unscaled POS value: inline `useUiScale()` sizing
still scales, but any `className`-based sizing would not.

**The bundle is a build artifact.** `cfd-web-build/cfd.bundle.js` and
`android/app/src/main/assets/cfd-web/cfd.bundle.js` are committed. Changes to
anything the WebView renders need `npm run build:cfd-web` to take effect on
device.

**The fingerprint gate.** `CFDProvider` skips the payload flush when its
`wsFingerprint` is unchanged. `cfdUiScaleOverride` is part of that fingerprint
and of the effect's dependency array; without both, changing the setting alone
would never push an update to a connected display.

## Clamp range

`MIN_CFD_UI_SCALE = 0.6`, `MAX_CFD_UI_SCALE = 2.0` — wider than the POS range
(`0.6`–`1.25`) on the top end, since CFD panels vary far more in size than POS
tablets. The multiplier applies on top of the CFD's own automatic per-device
scale, so the clamp bounds the final result, not the multiplier.

Options offered in the UI: Small (0.85), Default (`null`), Large (1.15),
Extra Large (1.35).
