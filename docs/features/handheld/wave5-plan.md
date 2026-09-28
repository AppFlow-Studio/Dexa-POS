# Handheld Wave 5 — life on the floor

Branch `handheld`. The artifact's "What a tablet never had to handle":
no signal, low battery and Wi-Fi roaming. Built 2026-09-28, wired (no
payment logic is involved).

## Scope decisions

| Decision | Call | Why |
| --- | --- | --- |
| No signal | **Already built** in Waves 1–2: `OfflineBanner`, the "Queued" course card, Send's queued toast | The artifact's offline screen also greys Pay ("Card payments need a connection"). Not done, on purpose: `wave4-plan.md` matches the register, which takes cards offline and queues the record. |
| Roaming | **A grace period, not new sync code** | Catch-up already exists: the orders channel refetches on rejoin (`useOrderSyncRecovery`), the floor channel reloads its snapshot on resubscribe (`useFloorRealtime`), and the sync service coalesces flaps into one reconnect sweep (`offlineSyncInit`). What a moving device lacks is a card that does not flash on every access-point hand-off. |
| Offline grace | **4 s** (`OFFLINE_GRACE_MS`) | A clean hand-off drops the link for 1–2 s. |
| Reconnecting | **New state, 8 s** (`RECONNECT_GRACE_MS`), info tint, tap to reconnect now | Wi-Fi up but the realtime socket down means other devices' changes are behind. The cold-start subscribe falls inside the same 8 s. |
| Low battery steps | **10 % and 5 %**, each once per discharge, never while charging | The artifact draws 8 %. Two steps give a server a second chance after "Not now". |
| Time left | **Only when measured**: ≥ 10 min of history since unplugged and a ≥ 2 % drop | "About 20 minutes left" is omitted rather than guessed. |
| Transfer | **The register's "Transfer server"**, backend write first | The register patches locally and fires the write without waiting. On a dying device a table must not look handed off here while no one else can see it, so the local patch follows a successful write. |
| Who can take tables | Clocked-in staff other than the signed-in server | `ServerSelectSheet`'s rule. |
| No open tables | **No sheet** | Nothing to hand off; it would only interrupt. |

## Files

- [x] `lib/connectionStore.ts` — `online / offline / reconnecting`, one store for every page
- [x] `hooks/useConnectionWatcher.ts` — the grace timers; once a card is up it follows the network immediately
- [x] `components/OfflineBanner.tsx` — reads the store; adds the "Reconnecting" card (tap → `reconnectAll`)
- [x] `lib/battery.ts` — steps, `shouldPrompt`, `estimateMinutesLeft`
- [x] `hooks/useLowBattery.ts` — expo-battery `useBatteryLevel` / `useBatteryState` (Android's battery-changed broadcast, no polling); samples reset on charge
- [x] `lib/transferServer.ts` — the register's transfer for several tables, reporting moved / failed
- [x] `screens/battery/` — `useMyOpenTables` (every floor, merged parties as one row), `TransferRows` (`.bs-row`, `.bs-to`), `ServerPickerSheet`, `LowBatterySheet`, `LowBatteryWatcher` (subscribes to sessions only while the prompt is due)
- [x] `HandheldFrame.tsx` — mounts both watchers once, in a leaf so their updates do not re-render the frame
- [x] `__tests__/handheldWave5.test.ts` — battery steps and estimate; grace: a short hand-off never shows, offline → reconnecting → online, a dead socket on a live network

## Verify on device

Emulator: `adb shell dumpsys battery unplug`, then `adb shell dumpsys battery set level 9`; `adb shell dumpsys battery reset` afterwards.

- [ ] At 10 % unplugged with open tables the sheet opens over any page; "Not now" keeps it closed until 5 %
- [ ] Plugging in and unplugging again re-arms both steps
- [ ] Transfer moves the tables: they leave Mine here and show the new server on the tablet floor plan
- [ ] Offline, Transfer is disabled with "Transfers need a connection"
- [ ] Walking between access points does not flash "You're offline"; airplane mode shows it after ~4 s
- [ ] Leaving airplane mode goes straight to "Reconnecting", then clears once live updates are back
- [ ] Device pass on 360 dp, font scale 1.3 — the battery sheet scrolls rather than clipping with many tables
