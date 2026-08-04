# AUD-14 Offline Queue Persistence Measurement Report

## Status

Physical-device measurement pending. No production optimization has been
approved or implemented.

## Objective

Determine whether full-array queue persistence causes measurable JS-thread
stalls or unsafe replay behavior at queue depths 100, 300, and 500 on the
target Landi hardware under poor connectivity.

## Build And Device

| Field                | Value                 |
| -------------------- | --------------------- |
| Commit               | Pending               |
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

- `pos.queue_flush` for total replay duration and ready/blocked/pending counts.
- The telemetry long-task watcher for JS stalls and route attribution.
- Hidden Settings telemetry export through a long-press on the version label.
- Logcat fallback using `[telemetry-export]` records.

Existing instrumentation does not separate the synchronous queue save into
filter, `JSON.stringify`, and MMKV `set` durations. For the measurement build
only, use an uncommitted diagnostic patch around `saveQueueToStorage()`:

1. Time `pendingOperations.filter(...)` with `performance.now()`.
2. Time `JSON.stringify(toSave)` separately.
3. Persist that string through `setSyncString(STORAGE_KEY, serialized)` and
   time the MMKV call separately.
4. Emit one structured `[aud14]` record containing depth, bytes, filter ms,
   stringify ms, write ms, and total ms.
5. Remove the diagnostic patch after exporting results. Do not include it in
   the production PR.

`setSyncString` uses the same `dexa-pos-sync` MMKV instance as `setSyncJSON`, so
the diagnostic build preserves the storage target and serialized payload.

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

### Reproducible Seeder

Do not hand-edit MMKV or insert arbitrary queue JSON. Invalid RPC parameters
would measure repeated failures rather than the production replay path.

For the measurement build, add a temporary development-only action beside the
existing offline-sync diagnostics. The action must call the same exported
`queueOperation` / dependent-operation helpers used by normal POS mutations and
must be removed before the PR is prepared.

1. In staging, capture one valid, non-payment operation fixture for each row in
   the Queue Mix table by performing the action normally and exporting the
   resulting queued operation while offline.
2. Replace every captured order/item UUID and idempotency key with a generated
   value per seeded test order. Never reuse a production UUID.
3. Queue the create-order operation first and retain its returned operation ID.
4. Queue item and follow-up mutations with their real `dependsOn` relationship
   to that create operation. Preserve operation order within each test order.
5. Repeat the fixed mix until the requested depth is reached; assert the queue
   length equals exactly 100, 300, or 500 before recording.
6. Export a SHA-256 hash of the normalized fixture plus the generated seed so
   every run at a given depth can be reproduced.
7. Restore each replay run by clearing only the staging station's queue and
   invoking the seeder with the same fixture, seed, and target depth.

The harness must reject any fixture containing a production project URL,
merchant/location ID, live payment processor operation, or missing dependency.
Record the temporary harness commit or patch hash in the Build And Device table,
then discard the harness after evidence collection.

## Procedure

1. Install the release measurement build and clear only the staging test
   station's local app data.
2. Start telemetry and clear logcat with `adb logcat -c`.
3. Force the app offline and run the reproducible seeder to depth 100; record
   its fixture hash and seed.
4. Record at least 20 additional queue transitions at that depth.
5. Force-kill, relaunch while offline, and confirm all queued operations load.
6. Restore a degraded/flapping connection and measure replay to an empty queue.
7. Repeat replay five times, restoring the same seed between runs.
8. Repeat steps 3-7 for depths 300 and 500.
9. At one run per depth, force-kill during replay and verify recovery without
   duplicate effects or dependency inversion.
10. Export telemetry and `[aud14]` logcat records after every run.

Network phases per depth: fully offline, high latency, packet loss, connection
flapping, then stable reconnect. Record the actual shaping method and settings;
do not label Wi-Fi as degraded without measured latency/loss values.

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
- Raw `[aud14]` logcat data: Pending
- Screen recording: Pending
- Non-implementer verifier: Pending

## Conclusion

Pending physical-device evidence. Do not infer a performance defect or approve
an optimization from source inspection alone.
