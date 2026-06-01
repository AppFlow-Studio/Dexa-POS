# Castles USB — Tablet & Cable Compatibility Matrix

Populated as we test in the field via Settings → Devices & Connections → USB Diagnostics. The point is a single grep-able record of which hardware combinations work so the next merchant onboarding doesn't re-debug from scratch.

## Required tablet capabilities

For USB Castles to work at all, the tablet must expose:

- **`hasUsbHostFeature: true`** — Android USB Host hardware. Hard-fail if missing; swap tablets.
- **`usbManagerAvailable: true`** — Android USB framework. Should always be true on modern Android, but the diagnostics page surfaces it.
- USB-C or micro-USB **with OTG support** (some Android tablets advertise USB-C but don't pass through host mode).

Check both fields from the USB Diagnostics screen before plugging anything in. If `hasUsbHostFeature` is false, stop here.

## Tested tablets

| Tablet model | Android SDK | `hasUsbHostFeature` | Cable used | Terminal | Works? | Notes |
|---|---|---|---|---|---|---|
| _example: Samsung Galaxy Tab Active5_ | _34_ | _true_ | _USB-C → USB-A OTG (Anker)_ | _Saturn1000 PID 0x0070_ | _✓_ | _baud 115200, getData < 200ms_ |
| | | | | | | |

> Append a row per device the merchant ships with. Mark Works? as ✓ / ✗ / partial. For ✗ rows include the diagnoseUsb() field that failed.

## Tested cables / adapters

| Adapter / Cable | Result | Notes |
|---|---|---|
| _example: Anker USB-C to USB-A OTG (A8345)_ | _✓_ | _Used on Tab Active5; powers terminal too_ |
| _example: Generic micro-USB to USB-A_ | _✗_ | _Charge-only — listDevices returns []_ |
| | | |

Common failure: charge-only USB cable. Symptom in diagnostics: `hasUsbHostFeature: true, rawDeviceCount: 0`. The cable physically lacks the data pins.

## Known tablets that do NOT work

| Tablet | Reason |
|---|---|
| _example: Amazon Fire HD 10 (older revs)_ | _hasUsbHostFeature: false_ |
| | |

## Tested Castles models

| Model | VID | PID | Driver | Works? | Notes |
|---|---|---|---|---|---|
| Saturn1000 | 0x0CA6 | 0x0070 | CDC ACM | _pending_ | _baseline; only PID registered in CASTLES_PRODUCT_IDS today_ |
| S1P2 Pro | 0x0CA6 | _capture from USB Diagnostics_ | _likely CDC ACM_ | partial — detect + permission OK, handshake initially failed on "suspended singleton" (fixed in CastlesService.connect auto-resume) | Found by VID-fallback. After the auto-resume fix landed, re-run the wizard to confirm full handshake; if it succeeds without a Kotlin rebuild, the default USB serial prober recognises it. If it fails with a different error, capture the PID and add it to CASTLES_PRODUCT_IDS in the Kotlin module. |
| | | | | | |

If a new Castles model shows up: capture VID/PID from the USB Diagnostics screen, add the PID to `CASTLES_PRODUCT_IDS` in `modules/castles-usb/android/src/main/java/expo/modules/castlesusb/CastlesUsbModule.kt`, rebuild the dev client.

## Adding a row

1. From the diagnostics page on the new tablet, screenshot the "Host state" section.
2. Run the USB Setup sheet, screenshot success or failure copy.
3. Add a row above with whatever you observed. Don't worry about formatting — the matrix is meant to be grep-able, not polished.
