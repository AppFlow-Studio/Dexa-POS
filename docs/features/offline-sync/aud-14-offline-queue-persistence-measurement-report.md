# AUD-14 Offline Queue Persistence Measurement Report

## Status

Repository preparation complete. Physical-device measurement is pending. No
production optimization has been approved or implemented.

## Objective

Determine whether full-array queue persistence causes measurable JS-thread
stalls or unsafe replay behavior at queue depths 100, 300, and 500 on the
target Landi hardware under poor connectivity.

## Build And Device

| Field                | Value                 |
| -------------------- | --------------------- |
| Commit               | `01e51efe` baseline   |
| Build variant        | Android release       |
| Landi model          | Pending               |
| Android version      | Pending               |
| App version          | Pending               |
| Location/environment | Staging test location |
| Network control      | Pending               |

Do not use production payments. Use staging orders and payment-adjacent queue
records that cannot contact a live processor.

## Instrumentation

Existing instrumentation provides:

- `perf.pos.queue_flush` for total replay duration. The source span also sends
  ready/blocked/pending and success/failure attributes to Sentry.
- The telemetry long-task watcher for JS stalls and route attribution.
- Hidden telemetry export through a 600 ms long-press on `Current Version` in
  `Settings > Devices & Connections`.
- Logcat fallback using `[telemetry-export]` records.
- The queue depth and operation list in `Settings > Syncing > Sync Queue`.

Existing instrumentation does not separate the synchronous queue save into
filter, `JSON.stringify`, and MMKV `set` durations. The release manifest is not
debuggable/profileable, so Android Studio cannot recover this JS-level split
from the current release APK.

This is a measurement tooling gap, not evidence of a product defect. Complete
the release baseline first. To collect the exact split required by the ticket,
obtain approval for one of these measurement-only options:

1. A profileable internal release build with a profiler that can attribute the
   JS work accurately.
2. A temporary local patch around `saveQueueToStorage()` that emits depth,
   bytes, filter ms, stringify ms, MMKV write ms, and total ms.

Do not commit or push the temporary patch. Do not implement batching, SQLite,
or queue behavior changes before the report is reviewed.

## Queue Mix

Use the same deterministic mix at every depth:

| Operation class                | Share | Notes                                   |
| ------------------------------ | ----: | --------------------------------------- |
| Order/item creation            |   35% | Include dependency-linked item records  |
| Quantity/modifier/note updates |   25% | Multiple operations per test order      |
| Kitchen/status transitions     |   20% | Preserve per-order sequence             |
| Discount/service metadata      |   10% | Non-payment mutation payloads           |
| Payment-adjacent records       |   10% | Staging-safe; never issue a real charge |

Use distinct idempotency keys and preserve each operation's real dependency
shape. Do not synthesize independent rows that bypass queue ordering.

### Queue Population Rules

Do not hand-edit MMKV, insert arbitrary queue JSON, or use production data. Build
the queue through normal POS actions at a staging location so replay exercises
real operation parameters and dependencies.

- Create distinct orders and distinct items. Repeated quantity, modifier,
  status, or detail updates for the same entity can collapse into one queued
  operation and will not reliably increase queue depth.
- Never perform a real card charge. Use non-payment actions and only a
  staging-safe payment-adjacent flow approved by QA.
- Confirm the exact depth from `Settings > Syncing > Sync Queue`; the panel
  refreshes every five seconds.
- Record the operation counts by type at each depth so all repeated runs use a
  comparable mix.
- If manually rebuilding the same queue five times is not practical, request a
  test-harness follow-up. Do not add that harness to this branch before the
  measurement-first gate is satisfied.

## Procedure

1. Install the release APK on the Landi tablet and sign into a staging test
   location. Confirm telemetry is enabled in Settings.
2. Connect USB debugging, run `adb devices`, then clear old logs with
   `adb logcat -c`.
3. Take the tablet fully offline and use normal POS actions to reach depth 100.
   Confirm the count in `Settings > Syncing > Sync Queue`.
4. Record 20 additional queue transitions while watching for frozen taps or
   delayed navigation. Record start/end wall-clock times.
5. Force-stop the app, relaunch while still offline, and confirm the same queue
   depth restores. Use `adb shell am force-stop com.temurappflowstudios.dexapos`
   when a reproducible force-stop is required.
6. Restore a measured degraded/flapping connection. Open Sync Queue, tap
   `Sync Now` if replay does not start automatically, and time reconnect until
   the queue reaches zero.
7. Repeat replay five times per depth using the same operation mix. Rebuild the
   queue through normal POS actions between runs.
8. Repeat steps 3-7 at depths 300 and 500.
9. During one replay at each depth, force-stop the app. Relaunch and verify that
   the remaining operations recover without duplicates or dependency inversion.
10. After every run, long-press `Current Version` under
    `Settings > Devices & Connections` for 600 ms and export the telemetry JSON.

Network phases per depth: fully offline, high latency, packet loss, connection
flapping, then stable reconnect. Record the actual shaping method and settings;
do not label Wi-Fi as degraded without measured latency/loss values.

### Windows ADB Export

If the tablet has no usable share target, reconstruct the most recent telemetry
export from Logcat in Windows PowerShell:

```powershell
adb logcat -d > aud14-logcat.txt
$lines = Get-Content .\aud14-logcat.txt |
  Select-String '\[telemetry-export\]' |
  ForEach-Object { $_.Line -replace '^.*\[telemetry-export\]\s+', '' }
$chunks = $lines |
  Where-Object { $_ -notmatch '^(BEGIN|END)\s' } |
  ForEach-Object { $_ -replace '^\d+/\d+\s+', '' }
($chunks -join '') | Set-Content -NoNewline .\aud14-telemetry.json
Get-Content .\aud14-telemetry.json -Raw | ConvertFrom-Json | Out-Null
```

Clear Logcat before each export so chunks from separate runs cannot be mixed.
The local replay span key in the JSON is `perf.pos.queue_flush`; long-task
samples use `longtask`. A long task is recorded when event-loop drift exceeds
100 ms.

## Results

| Depth | Payload bytes |   Saves | Filter P50/P95/Max ms | Stringify P50/P95/Max ms | MMKV P50/P95/Max ms | Total P50/P95/Max ms | >100 ms stalls |
| ----: | ------------: | ------: | --------------------- | ------------------------ | ------------------- | -------------------- | -------------: |
|   100 |       Pending | Pending | Pending               | Pending                  | Pending             | Pending              |        Pending |
|   300 |       Pending | Pending | Pending               | Pending                  | Pending             | Pending              |        Pending |
|   500 |       Pending | Pending | Pending               | Pending                  | Pending             | Pending              |        Pending |

| Depth | Replay runs | Replay P50/P95/Max s | Throughput ops/s | Retries | Duplicates | Ordering failures | Final queue |
| ----: | ----------: | -------------------- | ---------------: | ------: | ---------: | ----------------: | ----------: |
|   100 |  5 required | Pending              |          Pending | Pending |    Pending |           Pending |     Pending |
|   300 |  5 required | Pending              |          Pending | Pending |    Pending |           Pending |     Pending |
|   500 |  5 required | Pending              |          Pending | Pending |    Pending |           Pending |     Pending |

## Decision Gate

Recommend Step 2 optimization only if at least one condition is observed:

- Queue persistence P95 exceeds 16.7 ms.
- Repeated JS stalls exceed 100 ms and overlap queue persistence.
- Replay blocks a live order-entry or payment interaction.
- Crash/relaunch or crash-mid-replay loses, duplicates, or reorders work.

Payment-critical transitions must remain immediately durable regardless of the
result. Any batching or SQLite proposal requires a separate reviewed ticket.

## Evidence

- Raw telemetry JSON: Pending
- Raw measurement-only timing data: Pending approval/instrumentation
- Network shaping configuration: Pending
- Screen recording: Pending
- Non-implementer verifier: Pending

## Conclusion

Pending physical-device evidence. Do not infer a performance defect or approve
an optimization from source inspection alone.
