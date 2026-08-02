# Castles USB — End-to-End Validation Plan

Checklist to run against real hardware once the dev client is on an Android tablet that passes the USB diagnostics page. The plan deliberately covers all four ways USB can go wrong in production (detect failure, permission failure, handshake failure, detach mid-sale) plus a happy-path sale and a wedge recovery via the supervisor's existing modal.

## Prerequisites

- [ ] Android tablet with `hasUsbHostFeature: true` (verify via Settings → Devices & Connections → USB Diagnostics)
- [ ] Castles Saturn1000 powered on, idle
- [ ] OTG-capable USB-C-to-USB-A (or micro-USB) cable, data-capable not charge-only
- [ ] Dev client build installed on the tablet (`eas build --profile development --platform android`)
- [ ] Metro running, app loaded over the dev client
- [ ] Logs visible (`adb logcat -s ReactNativeJS:V CastlesUsbModule:V CastlesService:V CastlesSupervisor:V` or Xcode/AS console)
- [ ] `EXPO_PUBLIC_CASTLES_MOCK` is NOT set (or is `0`) — we want real hardware paths

## Test 1 — Detect happy path

1. Plug Saturn1000 into tablet via USB-OTG.
2. Navigate to Settings → Devices & Connections.
3. Tap "USB Diagnostics" (top-right).
4. Expected:
   - `USB Host feature` row → green ✓ "Supported"
   - `Raw USB devices visible to OS` → 1+
   - `Recognised serial devices` → 1
   - Castles device card shown with **permission ✓** (or "no permission" the first time)
   - VID `0x0CA6`, PID `0x0070` displayed
5. ❌ If any field is yellow/red, note which one and stop. The interpretation hint on the page tells you what to fix.

## Test 2 — USB Setup wizard

1. Back on Devices & Connections, tap "Set Up USB Terminal".
2. In the sheet, tap "Detect".
3. Expected progress sequence in the sheet:
   - "Scanning USB devices…" (~200 ms)
   - "Waiting for USB permission…" (Android dialog appears the first time; choose Allow)
   - "Verifying terminal app is responsive…" (~500 ms)
   - "Terminal verified" card with device/VID/PID/serial
4. Tap Done. Expected:
   - Toast: "USB terminal verified (CastlesPay X.Y.Z). Complete registration below."
   - Register form opens pre-filled with `connectionType=USB`, name + model from the device.
5. Add a Test TPN + Auth Key (sandbox), tap Register.
6. ❌ If permission dialog never appears OR handshake fails, capture the error string + hint, fix per its recommendation, repeat.

## Test 3 — Happy-path sale over USB

1. With the USB-registered terminal as the active station's payment terminal, open any check → Pay → Card.
2. Run a $0.01 sandbox sale (Visa test card, etc.).
3. Expected:
   - "READ CARD" progress bar advances
   - Card prompt appears on the terminal
   - Sale approves
   - Receipt prints (Star or built-in)
   - Order marked Paid
4. Check logs for `[CastlesService] Connected + verified` and `processSale` succeeded.

## Test 4 — Detach mid-sale recovery

1. Start a fresh Card sale; while the terminal is prompting for the card, **physically yank the USB cable** from the tablet.
2. Expected within ~2 seconds:
   - Header pill flips to "Terminal disconnected"
   - `TerminalDetachedModal` slides in with cable icon and 3-step instructions
   - Log: `[CastlesUsbTransport] USB device detached`
   - Log: connection store quality → `lost`
3. Re-plug the USB cable.
4. Expected within 5 seconds (next poll tick):
   - Log: listDevices() returns the device again
   - Service auto-reconnect attempted; on success quality → `ok`
   - Modal animates away
5. Retry the sale. Expected: completes cleanly.

## Test 5 — Permission denied recovery

1. From device's Settings → Apps → \[your app\] → Permissions, **revoke USB permission** for the Castles device.
2. Open Set Up USB Terminal → Detect.
3. Expected:
   - Sheet stages: detecting → permission (dialog) → if user taps Deny, sheet shows "USB permission was denied" with hint.
   - If user taps Allow, sheet proceeds to handshake.
4. Verify Try Again button re-prompts.

## Test 6 — Wedge recovery (USB)

CastlesPay can wedge on USB too (though less common than TCP). To repro reliably:

1. Set `EXPO_PUBLIC_CASTLES_MOCK=1` in `.env`, restart Metro.
2. From USB Diagnostics, switch mock scenario to "Wedge (empty buffer)".
3. Trigger a sale or testConnection.
4. Expected within ~5 s:
   - `TerminalWedgedModal` appears with power-cycle steps and elapsed counter
   - Log: `[CastlesSupervisor] Terminal wedged`
   - Background probe loop log every 15 s
5. Switch mock scenario to "Healthy".
6. Expected within 15 s:
   - Log: `[CastlesSupervisor] Terminal recovered (probe-success)`
   - Modal auto-dismisses
7. Set `EXPO_PUBLIC_CASTLES_MOCK=0` and restart Metro before going back to real hardware tests.

## Test 7 — Cable yanked while idle (not mid-sale)

1. Register terminal over USB, leave app on the order screen (no sale in flight).
2. Yank cable.
3. Expected:
   - Connection store quality eventually goes to `lost` (next watchdog tick or next attempted command)
   - Header pill appears
   - `TerminalDetachedModal` does NOT appear here (no payment sheet open) — that's intentional. The pill is the surface for idle.
4. Re-plug. Header pill should clear within a watchdog cycle (~30 s) or sooner if a payment is started.

## Sign-off

For each merchant onboarding:

- [ ] Tablet model, OS version, OTG cable model recorded in `docs/features/payments-terminals/castles-usb-compatibility.md`
- [ ] Tests 1–5 pass
- [ ] Test 6 (mock wedge) passes — proves the supervisor works on the deployed build
- [ ] No new errors in Sentry under tag `source: castles_*` during the test window
- [ ] One real card sale processed and settled

If all green, the merchant can be flipped to USB Castles. Update the compatibility matrix with the model row.

## Open issues to verify on first real-hardware run

- Whether `CastlesUsbTransport.disconnect()` fully releases the native serial port after detach (we use `usbClose().catch(() => {})` — confirm no zombie file descriptors via `adb shell lsof | grep ttyACM`).
- Whether the supervisor's 15s probe interval is appropriate for USB. (TCP rationale was 15s ≈ recovery time; USB recovery from re-plug is usually under 5s — we already poll every 5s in `TerminalDetachedModal`. If the supervisor's interval feels slow during testing, lower `WEDGE_PROBE_INTERVAL_MS` in `castlesConnectionSupervisor.ts` for the USB case.)
- Whether the existing Kotlin prober (`CASTLES_PRODUCT_IDS` array, currently `[0x0070]`) covers every Castles model the merchant might have. If the live terminal isn't a Saturn1000, the diagnostics page surfaces the new PID — add it to the array and rebuild the dev client.
