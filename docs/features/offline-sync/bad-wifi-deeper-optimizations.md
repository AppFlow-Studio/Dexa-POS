# Bad-WiFi Deeper Optimizations (Deferred Phase 2 / Phase 3)

This document captures the deeper optimizations evaluated for the bad-WiFi initiative but **deferred** in favor of Option C (Phase 1 + minimal foundations, shipped as `lets-look-into-this-stateless-blossom.md`). Preserved for future reference if/when the residual freeze surface (payment, seat guests, add item, etc.) becomes a business priority.

## When to revisit

- A specific restaurant operator complains about payment / seating / add-item freezes (not just kitchen / status).
- Multi-tablet conflicts emerge from Category B replays.
- Operator demand surfaces for a "Verifying payment…" recovery flow.
- Engineering capacity exists for a 3-week initiative with concentrated payment correctness risk.

## What's covered

This deferred work has two main pieces:

1. **Server-side idempotency layer** — `idempotency_keys` table + claim-then-record helpers + `pg_cron` purge.
2. **Per-RPC Category B versioned forks** — 13 RPCs migrated to v(n+1) with `p_idempotency_key`, behind feature flags, canaried per-location.

## Hard correctness gaps to fix BEFORE shipping any Category B work

A senior backend engineer review of the prior plan surfaced four real correctness issues:

### Gap 1 — Mid-execution failure (must fix)

**Problem:** RPC starts → server crashes / connection cut → client retries with same key → cache lookup returns NULL → second call re-executes body. Duplicate side effects.

**Fix:** Claim-then-record pattern. Insert key with NULL result + `status='claimed'` at function start. UPDATE row with result + `status='completed'` on completion. Concurrent same-key arrivals see the claimed row and either wait or reject.

```sql
CREATE FUNCTION _idempotency_claim(p_key UUID, p_op TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_existing RECORD;
BEGIN
  INSERT INTO public.idempotency_keys (key, op, result_json, status)
  VALUES (p_key, p_op, NULL, 'claimed')
  ON CONFLICT (key) DO NOTHING;

  IF NOT FOUND THEN
    SELECT result_json, status, created_at INTO v_existing
    FROM public.idempotency_keys WHERE key = p_key;

    IF v_existing.status = 'completed' THEN
      RETURN v_existing.result_json;
    ELSIF v_existing.status = 'claimed' AND v_existing.created_at > now() - INTERVAL '60 seconds' THEN
      RAISE EXCEPTION 'idempotency_in_flight: key %', p_key
        USING ERRCODE = 'serialization_failure';
    ELSIF v_existing.status = 'claimed' THEN
      -- Stale claim (>60s): assume crashed; allow takeover
      UPDATE public.idempotency_keys SET created_at = now() WHERE key = p_key;
      RETURN NULL;
    ELSE
      RETURN v_existing.result_json;
    END IF;
  END IF;

  RETURN NULL;
END;
$$;
```

### Gap 2 — Concurrent same-key race (must fix)

**Problem:** Two clients fire same key simultaneously → both pass `_idempotency_lookup` (NULL) → both execute body.

**Fix:** Same as Gap 1. Atomic claim via `INSERT ... ON CONFLICT DO NOTHING + IF NOT FOUND` makes second concurrent call see claimed row and reject with `idempotency_in_flight`. Client retries after small backoff.

### Gap 3 — Migration ordering (must fix)

**Problem:** `seat_guests_v3.sql` depends on `_idempotency_claim` from infrastructure migration. Project applies migrations manually — order isn't auto-enforced.

**Fix:** Prefix infra files with `00_`. Document explicit deploy sequencing in runbook. Verify in staging before prod.

### Gap 4 — Payment "Try again" auth check (must fix)

**Problem:** Original payment charged → realtime didn't deliver → 30s timer expires → cashier hits "Try again" → new idempotency key → re-charges. Customer is double-charged.

**Fix:** Before re-charging on "Try again," run authoritative `SELECT 1 FROM payments WHERE order_id = ? AND created_at > now() - INTERVAL '120 seconds'` with a tight deadline. If a recent payment exists, prompt "already recorded — mark complete?" instead of re-charging. Don't rely on cashier judgment alone.

```ts
const recent = await withDeadline(
  (signal) => supabase.from('payments')
    .select('id, created_at, amount')
    .eq('order_id', orderId)
    .gte('created_at', new Date(Date.now() - 120_000).toISOString())
    .limit(1)
    .abortSignal(signal),
  DEADLINES.read,
  'verify_recent_payment',
)
if (recent.data?.length) {
  return promptCashier('Already recorded — mark complete?', recent.data[0])
}
// Else: safe to retry with new key
```

## Other backend engineer concerns (should fix, less critical)

- **Index optimization:** drop `op` from `_idempotency_lookup` predicate (UUIDv4 collision is astronomical); keep `op` as metadata only.
- **Result size cap:** refuse to cache results >32KB in `_idempotency_complete`; force re-execution on retry.
- **Tenant isolation:** include `merchant_id` in cache lookup OR hash-combine key with `user_merchant_id()` to defense-in-depth against cross-tenant cache leakage.
- **Return-type heterogeneity:** audit each Category B RPC's return type. RPCs returning `RECORD`/scalar may need wrapping to `json` first.
- **Verbatim body CI check:** ship a CI script that diffs body markers between v(n) and v(n+1); fail build if they differ.
- **`pg_cron` fallback:** if not available, use a daily Edge Function cron for purge.

## Foundation migrations (server-side)

### `00_idempotency_layer.sql`

```sql
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE EXCEPTION 'pg_cron required. Enable in Supabase dashboard or use Edge Function cron.';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.idempotency_keys (
  key UUID PRIMARY KEY,
  op TEXT NOT NULL,
  result_json JSONB,
  status TEXT NOT NULL DEFAULT 'claimed' CHECK (status IN ('claimed', 'completed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idempotency_keys_created_at_idx ON public.idempotency_keys (created_at);

ALTER TABLE public.idempotency_keys ENABLE ROW LEVEL SECURITY;

-- _idempotency_claim defined above (Gap 1).

CREATE FUNCTION _idempotency_complete(p_key UUID, p_op TEXT, p_result JSONB)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF octet_length(p_result::text) > 32768 THEN
    DELETE FROM public.idempotency_keys WHERE key = p_key;
    RETURN;
  END IF;
  UPDATE public.idempotency_keys
  SET result_json = p_result, status = 'completed', completed_at = now()
  WHERE key = p_key AND op = p_op;
END;
$$;

REVOKE ALL ON FUNCTION _idempotency_claim(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION _idempotency_complete(UUID, TEXT, JSONB) FROM PUBLIC;

SELECT cron.schedule(
  'idempotency_keys_purge',
  '0 3 * * *',
  $$ DELETE FROM public.idempotency_keys WHERE created_at < now() - INTERVAL '24 hours' $$
);
```

### `00_idempotency_layer_rollback.sql`

```sql
SELECT cron.unschedule('idempotency_keys_purge');
DROP FUNCTION IF EXISTS _idempotency_complete(UUID, TEXT, JSONB);
DROP FUNCTION IF EXISTS _idempotency_claim(UUID, TEXT);
DROP TABLE IF EXISTS public.idempotency_keys;
```

## Per-RPC migration template

Each Category B RPC follows this exact skeleton. v(n) body is copy-pasted *verbatim*; only the param list adds `p_idempotency_key UUID DEFAULT NULL` (last param) and 2 wrappers are added.

```sql
-- =====================================================================
-- Migration: <rpc>_v<n+1> — adds idempotency-key support
-- =====================================================================
-- Forks from <rpc>_v<n>. Original is NOT modified. Rollback = DROP v<n+1>.
-- =====================================================================

CREATE FUNCTION <rpc>_v<n+1>(
  -- existing params verbatim, exact types and order
  p_idempotency_key UUID DEFAULT NULL  -- NEW (last param)
)
RETURNS <same as v<n>>
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cached JSONB;
  v_result <return type>;
  -- existing v<n> declarations follow
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    v_cached := _idempotency_claim(p_idempotency_key, '<rpc>_v<n+1>');
    IF v_cached IS NOT NULL THEN
      RETURN v_cached::<return type>;
    END IF;
  END IF;

  -- BEGIN_VERBATIM (lines X-Y of <rpc>_v<n>.sql)
  -- ... copy v<n> body verbatim, ending with v_result assignment ...
  -- END_VERBATIM

  IF p_idempotency_key IS NOT NULL THEN
    PERFORM _idempotency_complete(p_idempotency_key, '<rpc>_v<n+1>', to_jsonb(v_result));
  END IF;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION <rpc>_v<n+1>(<param types>) TO authenticated;
COMMENT ON FUNCTION <rpc>_v<n+1> IS '<v<n> comment, append: + idempotency-key support>';

-- =====================================================================
-- Verification (run on staging before flag flip)
-- =====================================================================
-- 1. NULL-key parity: v<n+1>(args, NULL) ≡ v<n>(args) state diff = 0.
-- 2. Replay safety: v<n+1>(args, key) twice → row delta = 1, second returns cached.
-- 3. Concurrent same-key: parallel calls → second raises 'idempotency_in_flight'
--    OR (after first completes) returns cached.
-- =====================================================================
```

## Worked example: `seat_guests_v3`

Source: existing `seat_guests_v2` (`utils/supabase/migrations/update_seat_guests_with_session_linking.sql`, 199 lines, returns `json`).

```sql
CREATE FUNCTION seat_guests_v3(
  p_table_ids UUID[],
  p_party_size INTEGER,
  p_guest_name TEXT DEFAULT NULL,
  p_guest_phone TEXT DEFAULT NULL,
  p_guest_notes TEXT DEFAULT NULL,
  p_reservation_id UUID DEFAULT NULL,
  p_waitlist_id UUID DEFAULT NULL,
  p_create_order BOOLEAN DEFAULT FALSE,
  p_station_id UUID DEFAULT NULL,
  p_device_id TEXT DEFAULT NULL,
  p_staff_id UUID DEFAULT NULL,
  p_idempotency_key UUID DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_cached JSONB;
  v_result JSON;
  -- v2 declarations verbatim
BEGIN
  IF p_idempotency_key IS NOT NULL THEN
    v_cached := _idempotency_claim(p_idempotency_key, 'seat_guests_v3');
    IF v_cached IS NOT NULL THEN RETURN v_cached::json; END IF;
  END IF;

  -- BEGIN_VERBATIM (lines 39-149 of update_seat_guests_with_session_linking.sql)
  -- ... v2 body produces v_result via json_build_object ...
  -- END_VERBATIM

  IF p_idempotency_key IS NOT NULL THEN
    PERFORM _idempotency_complete(p_idempotency_key, 'seat_guests_v3', to_jsonb(v_result));
  END IF;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION seat_guests_v3(UUID[], INTEGER, TEXT, TEXT, TEXT, UUID, UUID, BOOLEAN, UUID, TEXT, UUID, UUID) TO authenticated;
```

Rollback: `DROP FUNCTION IF EXISTS seat_guests_v3(UUID[], INTEGER, TEXT, TEXT, TEXT, UUID, UUID, BOOLEAN, UUID, TEXT, UUID, UUID);`

## Migration file inventory (Category B)

All under `utils/supabase/migrations/`. `00_` prefix on infra ensures it's documented as applied first.

| # | File | Purpose |
|---|---|---|
| 1 | `00_idempotency_layer.sql` + rollback | Table, helpers, pg_cron purge |
| 2 | `seat_guests_v3.sql` + rollback | First Category B canary (low frequency) |
| 3 | `add_order_discount_v2.sql` + rollback | Low frequency |
| 4 | `add_order_item_modifier_v2.sql` + rollback | |
| 5 | `remove_order_item_modifier_v2.sql` + rollback | |
| 6 | `duplicate_order_item_v2.sql` + rollback | |
| 7 | `recall_order_items_v2.sql` + rollback | |
| 8 | `add_order_item_v3.sql` + rollback | Higher frequency |
| 9 | `add_open_item_v3.sql` + rollback | |
| 10 | `create_order_v3.sql` + rollback | |
| 11 | `apply_refund_to_payment_v2.sql` + rollback | |
| 12 | `record_refund_items_v2.sql` + rollback | |
| 13 | `create_reversal_v2.sql` + rollback | |
| 14 | `process_payment_v9.sql` + rollback | **Last** — highest stakes |

## Client-side architecture (Category B)

Additions on top of Option C:

- **`lib/network/idempotencyKey.ts`** — `getOrCreateIdempotencyKey(opSignature)`. For payment, reuses `paymentJournal` (which already has `idempotencyKey` field). For other ops, generates fresh per call. **Key generated BEFORE first RPC call**, not on queue insert.
- **`lib/network/clientFingerprint.ts`** — verify-then-retry helpers for create-style ops without server idempotency (interim).
- **`lib/network/featureFlags.ts`** — typed `useIdempotent<RpcName>: boolean`. Backed by Supabase `feature_flags` table or `useStoreSettingsStore`. Default OFF. Per-RPC.
- **`executeWithFallback`** extended with `verify-then-retry` and `surface` shapes.
- **`OrderService` Category B methods:** branch on `featureFlags.useIdempotent<X>` — ON: v(n+1) with key; OFF: v(n) unchanged.
- **`stores/usePaymentStore.ts`** + **`components/bill/paymentView/PaymentProgressHeader.tsx:135-158`**: add `'verifying'` view state, 30s reconciliation timer, manual prompt modal with auth-check (Gap 4 fix).
- **`lib/payments/dejavoo-spin-api.ts:302, 529`**: wrap `fetch()` with `withDeadline` + `AbortController`. Surface fallback (no queue — hardware).

## Phased rollout (Category B)

For each Category B RPC, in order:

(a) Write `<rpc>_v<n+1>.sql` + rollback.
(b) Apply forward to staging. Verification queries. Rollback drill.
(c) Apply forward to prod. New function exists, no client uses it (flag OFF).
(d) Ship client build with flag-gated branch. Verify with flag OFF that prod path is unchanged.
(e) Flip flag ON for one staging tablet. Soak 4h.
(f) Flip flag ON for one prod location. Soak 24h. Watch:

- `idempotency_keys` insert rate matches RPC call rate.
- `_idempotency_claim` hit rate (~0% baseline; spikes during recovery normal).
- Error rate vs baseline.
- RPC-specific invariants.

(g) Flip ON for next location. Continue.
(h) After 7+ days all-locations soak, plan v(n) removal in future minor release.

**Per-RPC rollback (L1):** flip flag OFF. <30s.

## Phase 3 polish (after all Category B canaried)

- Stale-op replay age check.
- `conflictDetectionService.ts` extension for op age.
- Production observability dashboard.
- Multi-tablet stale-replay test suite.

## Risk table (Category B)

| # | Risk | Mitigation | Rollback |
|---|---|---|---|
| R1 | New RPC behavior delta vs old | Verbatim copy + CI diff check + verification SQL. | L1 flag flip |
| R2 | `idempotency_keys` table grows | pg_cron 24h purge. Index. Alert >1M rows. 32KB result cap. | L4 drop table |
| R3 | `pg_cron` not available | Verify staging. Edge Function cron fallback. | n/a |
| R4 | `process_payment_v9` corrupts charge state | Migrate LAST. 24h staging soak with terminal. Per-tablet canary. `paymentJournal` key reuse. Auth-check on retry (Gap 4). | L1 flag; v8 untouched |
| R5 | Client/server flag desync | v(n) NEVER dropped during Phase 2. | n/a |
| R6 | Flag flip slow to running clients | Test propagation. Gate on app foreground if needed. | ≤app-restart worst case |
| R7 | Cross-tenant cache leak | Hash-combine key with `user_merchant_id()`. | n/a |
| R8 | Mid-execution failure stale claim | 60s TTL on 'claimed' status. | n/a |
| R9 | Concurrent same-key race | Atomic claim. | n/a |
| R10 | Migration applied out of order | `00_` prefix. Verify staging. | L4 drop sequence reverse |
| R11 | Split-payment idempotency | Unique key per split portion. Stored per-portion in `paymentJournal`. | n/a |

## Effort estimate (Category B)

- Foundations + correctness gap fixes: 2 days server.
- Per Category B RPC: ~1 day each. 13 RPCs × 1 day = 13 days, sequential per location.
- Phase 3 polish: 3 days.
- **Total:** ~3 weeks at one engineer; ~1.5 weeks with parallelism.

`process_payment_v9` is ~3-4h focused work + 1 week soak before prod canary.

## Acceptance criteria (full Category B rollout)

- All Category B mutations safe under 100-op timeout soak (zero duplicates, zero double-charges).
- Payment never double-charges across all canaries.
- `'verifying'` UI never gets stuck.
- Per-RPC L1 rollback rehearsed in staging at least once before prod canary.
- Multi-tablet stale-replay test → no overwrites.
- Verbatim CI check passing on every Category B RPC.
