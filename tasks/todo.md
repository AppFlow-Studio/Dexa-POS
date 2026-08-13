# Kiosk USB Printer — Detection + Config UI

## Goal
Let a self-service kiosk (Android) detect connected USB printers (and the built-in
printer, since hardware is "mixed/unknown") and configure one from the kiosk settings.
**Scope now: detection + config UI + persisted config.** Actual USB print transport is a
follow-up (explicitly out of scope).

## What already exists (reuse — do NOT rebuild)
- **Native USB enumeration**: `native/HardwareDetection.ts` → `detectNativeHardware()` returns
  `connectedUsbDevices: {vendorId, productId, deviceName, deviceClass}[]` plus `hasPrinter`/`hasUsbHost`.
  `hardwareEvents` (`NativeEventEmitter`) fires `onHardwareChanged` on USB attach/detach.
  → The device list is returned by native but **not yet surfaced in any JS UI**.
- **Printer data model already supports USB**: `PrinterConfig.connectionType: "usb"`,
  `usbDevicePath`, `serialNumber` (`types/printer.ts`); `printers` table has the columns
  (`connection_type`, `usb_device_path`, `serial_number`, `station_id`) → **no DB migration needed**.
- **Provisioning pattern**: `services/hardware/printerProvisioning.ts` (`addStarPrinter`,
  `addBuiltinPrinter`, `addDejavooPrinter`) → each inserts a `printers` row + calls
  `usePrinterStore.getState().fetchPrinters(locationId)`.
- **Kiosk settings shell**: `components/kiosk/shared/KioskDiagnosticsScreen.tsx` —
  `SectionId` type + `SECTIONS` array + section switch; Payment-Terminal panel is the
  register→pick→edit→display template to mirror.

## Key design decisions
1. **Persist to the `printers` table** (not a throwaway device-local store). A USB printer is
   station-bound (physically attached to this kiosk), so mirror `addBuiltinPrinter`'s
   `station_id` binding. The follow-up print-path work then only needs to add the USB
   transport driver — no config re-plumb.
2. **Detection is JS-only — no native rebuild required.** Consume the existing
   `connectedUsbDevices` + `onHardwareChanged`. (Optional native descriptor enrichment is a
   noted nice-to-have, not required to ship.)
3. **Cover "mixed/unknown" hardware**: the panel offers BOTH (a) the built-in printer if
   `hasPrinter` (→ existing `addBuiltinPrinter`), and (b) the USB device list (→ new
   `addUsbPrinter`). User picks whatever their kiosk actually has.
4. Store as `printer_type: "generic_escpos"`, `connection_type: "usb"` with ESC/POS defaults;
   stash `usbVendorId`/`usbProductId`/`deviceName` in `metadata` for later matching.

## Wave 1 — Surface USB devices to JS
- [ ] `lib/usbPrinterVendors.ts`: vendor-ID → `{name, likelyPrinter}` map
  (Star 0x0519, Epson 0x04b8, Bixolon 0x154f, iMin 0x0fe6, GoDEX 0x28e9, Zebra 0x0a5f, …) +
  helpers `describeUsbDevice(dev)` and `isLikelyUsbPrinter(dev)` (deviceClass===7 OR known vendor).
- [ ] `hooks/hardware/useUsbDevices.ts`: on mount calls `detectNativeHardware()`, subscribes to
  `onHardwareChanged` for hotplug refresh, returns `{ usbDevices, usbPrinterCandidates,
  hasBuiltinPrinter, hasUsbHost, refresh(), loading }`.
  - Verify the `hardwareEventListener` singleton isn't already claimed by PosSyncProvider in
    kiosk mode; if it is, subscribe directly via `hardwareEvents.addListener(...)` rather than
    the single-subscription helper. (Verification step.)
- **Test**: temporary render on the kiosk dev-settings button; plug/unplug a USB device (or use
  the built-in) and confirm the list updates live.

## Wave 2 — `addUsbPrinter()` provisioning
- [ ] Add `addUsbPrinter(supabase, stationId, locationId, merchantId, device, role, paperWidth)`
  to `printerProvisioning.ts`:
  - Dedup by `location_id` + (`usb_device_path` || `serial_number` || `vendorId:productId` in
    metadata); reactivate a matching inactive row (mirror `addBuiltinPrinter`).
  - Insert `printer_type:'generic_escpos'`, `connection_type:'usb'`, `usb_device_path`,
    `serial_number`, `station_id`, ESC/POS defaults (`paper_width` 58/80,
    `max_chars_per_line` 32/48, `supports_auto_cut:true`, `supports_cash_drawer_kick:false`),
    `metadata:{ usbVendorId, usbProductId, deviceName }`.
  - `is_default_receipt` only if nothing else holds it; then `fetchPrinters(locationId)`.
- **Test**: call from the panel, confirm a row lands in `printers` (staging) with correct
  fields and appears in `usePrinterStore`.

## Wave 3 — Kiosk "Printers" settings section
- [ ] Add `"printers"` to `SectionId` + a `SECTIONS` entry (Lucide `Printer` icon) between
  "menu" and "terminal"; wire `{activeSection === "printers" && renderPrintersPanel()}`.
- [ ] `renderPrintersPanel()` (mirror terminal-panel styling):
  - **Current printer** card: active receipt printer for this station/location from
    `usePrinterStore` (name, connection, status) + Remove/Switch.
  - **Detect** button → `useUsbDevices().refresh()`.
  - **Built-in** row when `hasBuiltinPrinter` → "Use built-in printer" → `addBuiltinPrinter`.
  - **USB devices** list: each candidate shows vendor label + deviceName + `VID:PID`, a
    "likely printer" badge, and a paper-width toggle (58/80) → "Use this printer" →
    `addUsbPrinter`, then set as station receipt printer via existing `setStationReceiptPrinter`.
  - Empty/permission states: no USB host, nothing connected, or built-in only.
- **Test on device**: open kiosk settings (long-press logo + PIN, or dev button), confirm
  detection lists real devices, provision one, reopen → persisted + shown as current.

## Out of scope (explicit follow-up)
- **Actual USB printing**: needs a USB ESC/POS transport driver (native `usb-serial-for-android`
  or `UsbManager` bulk-transfer to the printer OUT endpoint) wired into `DriverFactory`
  (`generic_escpos` + `usb`). `NetworkDriver` is currently a stub. Also: add printer vendor IDs
  to `android/app/src/main/res/xml/device_filter.xml` for zero-touch USB permission, and request
  USB permission on first print. None of this is required for detection/config.

## Risks / verification
- Enumeration + vendorId/productId/deviceName need **no USB permission**; serial number /
  opening the device **do** — serial may be null until the print-path wave (dedup falls back to
  VID:PID + device path).
- Confirm `detectNativeHardware()` runs in kiosk (`self_service`) mode (PosSyncProvider gating).
- No migration; `database.types.ts` `printers` row already exposes the USB columns.
- I can typecheck (`npx tsc --noEmit`) but **cannot verify USB detection without your device** —
  I'll state plainly what was/wasn't verified.

## Review

### Done
- **Wave 1** — `lib/usbPrinterVendors.ts` (vendor map + `describeUsbDevice` / `isLikelyUsbPrinter`
  / `usbDeviceKey` / `sortUsbDevicesForPicker`) and `hooks/hardware/useUsbDevices.ts` (reads
  `detectNativeHardware()` on mount, refreshes from the full `onHardwareChanged` snapshot on
  hotplug — subscribes to `hardwareEvents` directly so it doesn't collide with the singleton
  `hardwareEventListener`).
- **Wave 2** — `addUsbPrinter()` in `services/hardware/printerProvisioning.ts`: station-bound
  insert of a `generic_escpos` + `usb` `printers` row with ESC/POS defaults, VID:PID/deviceName
  in metadata, dedup by serial→VID:PID, default-receipt deference mirroring `addBuiltinPrinter`.
- **Wave 3** — New **Printers** section in `KioskDiagnosticsScreen.tsx` (SectionId + SECTIONS +
  switch): current-printer card (with non-destructive **Unassign**), Detect button, 58/80mm
  paper-width toggle, built-in-printer option (`addBuiltinPrinter` via
  `getCachedCapabilities()` ?? `detectDeviceCapabilities()`), and a live USB device list with
  "Use" → `addUsbPrinter` + `setStationReceiptPrinter`. New `UsbDeviceCard` presentational
  component.

### Verified
- `npx tsc --noEmit` — **clean, 0 errors** project-wide.
- `npx eslint` on all 4 touched files — **0 errors**, 4 warnings all pre-existing (terminal
  `terminalStatus` unused, 2 terminal exhaustive-deps, `printerRowToConfig` unused import) —
  none from new code.
- No existing tests reference these modules.

### NOT verified — needs the device
- Real USB detection: whether the kiosk's actual printer shows up in `connectedUsbDevices`
  and whether `hasPrinter` is set for a built-in. All static checks only — no device run.
- The dedup / provisioning round-trip against the staging `printers` table.

### Out of scope (unchanged) — follow-up to actually print
- USB ESC/POS transport driver + `DriverFactory` wiring (`generic_escpos`+`usb`), printer
  vendor IDs in `device_filter.xml`, USB-permission request on first print.
