# CodePay on-terminal integration

Dexa-POS runs **on** a CodePay Android terminal and drives payments by launching
the pre-installed **CodePay Register** app via an Android Intent
(`com.codepay.transaction.call`, `startActivityForResult` → `onActivityResult`).
No cloud REST, no RSA signing, no TCP/WebSocket — pure same-device app-to-app.
This is the ATOM-class on-device pattern (see `services/terminals/atom-service.ts`).

## Intent contract

- Request extras: `version="2.0"`, `app_id`, `topic`, `biz_data` (JSON string).
- Result extras: `response_code` (`"000"` = success), `response_msg`, `biz_data`.
- One Intent, topic-switched:
  - Sale / Refund / Void → topic `ecrhub.pay.order`, `trans_type` `1` / `3` / `2`
  - Query → `ecrhub.pay.query`
  - Tip adjust → `ecrhub.pay.tip.adjustment` (field `tip_adjustment_amount`)
  - Batch close → `ecrhub.pay.batch.close`
- Referenced refund/void reference the original by `orig_merchant_order_no`.
- Result `biz_data` fields (per docs/guides/api-structure): `trans_no`,
  `merchant_order_no`, `order_amount`, `tip_amount`, `tax_amount`, `trans_status`,
  `trans_end_time`, `card_no` (masked PAN, e.g. `430277****5723`), `auth_code`,
  `ref_no` (RRN), `entry_mode` (`1` swipe/`2` chip/`3` contactless/`4` manual),
  `merchant_no`, `merchant_name`, `card_holder_name`, `signature_url`.
  There is **no card-brand field** — brand is derived from the PAN BIN.

## Client code map

| Concern | File |
|---|---|
| Types / Intent contract | `types/codepay.ts` |
| Native Intent bridge | `android/.../codepay/CodePayBridgeModule.kt` (+ `...Package.kt`, registered in `MainApplication.kt`) |
| JS bridge | `native/CodePayBridge.ts` |
| Service (sale/refund/void/query/tipAdjust/batchClose) | `services/terminals/codepay-service.ts` |
| Response → JSONB mapper | `services/terminals/codepay-response-mapper.ts` |
| POS sale routing | `components/bill/ paymentView/CardPaymentView.tsx` (codepay branch) |
| Kiosk sale routing | `services/terminals/chargeActiveTerminal.ts` |
| Refund/void routing | `services/refundService.ts` (`processCodePayTerminalRefund`) |
| Settlement | `services/settlementService.ts` (`runCodePaySettlement`), `services/pendingFinalize.ts` |
| Manual batch-out UI | `components/settings/batchout/BatchoutPanel.tsx` (gated by `CODEPAY_BATCHOUT_ENABLED`) |

`app_id` is stored in `payment_terminals.register_id` (no dedicated column) for a
manually-configured terminal, and in `useCodePayTerminalStore.appId` (persisted,
seeded from `CODEPAY_DEFAULT_APP_ID`) for the auto-detect path.

## Auto-detect (ATOM-style, on-device)

Like ATOM, CodePay auto-surfaces on-device — with ONE difference: CodePay's
Intent needs the merchant `app_id` (ATOM needs no credentials). So the POS holds
`app_id` once; detection + activation are then automatic.

- `stores/useCodePayTerminalStore.ts` — the persisted `app_id` + the detected
  synthetic internal terminal (`buildInternalCodePayTerminal`, id `codepay-internal`,
  `register_id = app_id`).
- `services/terminals/codepayDetector.ts` — started in `PosSyncProvider` (POS-only).
  Every 30s + on app-resume it presence-checks via `codepayIsRegisterAvailable()`
  and surfaces/un-surfaces the internal terminal (only when `app_id` is set). The
  presence check is a pure `resolveActivity` — zero-cost, never launches Register,
  so no suspend/resume machinery (unlike ATOM's loopback probe).
- `hooks/useActiveProcessor.ts` — surfaces the internal CodePay terminal as a
  **fallback after any configured terminal** (`codepayEnabled` gate). A real
  provisioned CodePay row therefore always wins (it carries a DB id sales stamp +
  is what settlement/BatchoutPanel need); the synthetic internal terminal covers
  sale/refund/tip when nothing is configured.
- Settlement note: batch-out needs a real `payment_terminals` row (BatchoutPanel
  reads the station's configured terminal). The synthetic internal terminal does
  sale/refund/tip but not settlement — so the detector now **auto-provisions** a
  real row (see below) once online, and a Settings card lets an operator do it
  explicitly. No more per-device SQL.

## Auto-provision (real payment_terminals row, no SQL)

Sales run off the synthetic terminal (they only need the Intent `app_id`), but
settlement needs a DB row. So on-device CodePay now creates one itself, keyed on a
**stable per-device serial** so it is a find-or-create (never a duplicate).

- `services/terminals/codepayDeviceIdentity.ts` — `resolveCodePayDeviceIdentity()`:
  native hardware serial (`Build.getSerial` via the new
  `CodePayBridgeModule.getDeviceSerial()`), falling back to a prefixed
  `ANDROID_ID` (`expo-application`, zero-permission) when the ROM blocks the
  privileged serial. Both are device-bound and survive reinstall (not factory
  reset). `Build.getSerial` needs `READ_PRIVILEGED_PHONE_STATE` (declared with
  `tools:ignore`; only granted if Dexa is privileged on the terminal) — hence the
  fallback.
- `services/terminals/codepayAutoProvision.ts` — `ensureCodePayTerminalProvisioned()`:
  headless find-or-adopt on `(location_id, serial_number)` (the DB partial-unique
  index is the backstop; a 23505 race resolves to an adopt). Inserts
  `terminal_type='codepay'`, `register_id=<app_id>`, `connection_type='local'`,
  `serial_number=<serial>`, `is_active=true`, then deactivates sibling rows at the
  station. Never throws; returns `{ ok, terminalId, created, serial, reason }`.
  Supabase client registered via `setCodePayProvisionSupabaseClient` in
  `PosSyncProvider`.
- The detector (`codepayDetector.ts`) fires `maybeAutoProvision()` once per
  session after presence + app_id, fire-and-forget (never blocks the probe),
  gated by `CODEPAY_AUTO_PROVISION_ENABLED` (kill switch in `types/codepay.ts`).
- UI: a CodePay card in **both** the register settings
  (`devices-connections.tsx`) and the kiosk settings
  (`KioskDiagnosticsScreen.tsx`) — app_id input, Enabled/Off toggle,
  "Save & Set Up" (detect + provision), and an "Other CodePay devices at this
  location" list (derived from the shared `usePaymentTerminal` terminals, no
  extra query).

## Settlement: backend RPCs — APPLIED TO STAGING (2026-09-15)

CodePay settles on the terminal (topic `ecrhub.pay.batch.close`). Like Valor it
is **manual batch-out only** (BatchoutPanel) — deliberately excluded from the
unattended auto-settle scheduler to avoid a double-cut against a host/terminal
auto-batch. `CODEPAY_BATCHOUT_ENABLED` is now **ON** (RPCs live on staging).

**Backend migrations authored in the website repo, applied + verified on STAGING
(`dfwqakoyittmrwbqvxgw`); PROD is the user's manual deploy:**
- `20260915120000_add_codepay_terminal_type.sql` — `ALTER TYPE terminal_type ADD VALUE 'codepay'`.
- `20260915120100_process_payment_v17_codepay_branch.sql` — byte-exact copy of the latest `process_payment_v17` + a `codepay_transaction` extraction block + `terminal_type` CASE branch.
- `20260915120200_codepay_settlement_rpcs.sql` — `prepare_codepay_settlement` / `finalize_codepay_settlement` (+ `get_unsettled_summary_by_terminal` broadened to include codepay).

The RPCs mirror the Valor pattern exactly (contract preserved below for reference):

### `prepare_codepay_settlement(p_terminal_id uuid, p_merchant_id uuid, p_initiated_by text)`
Mirror `prepare_valor_settlement`. Snapshot unsettled captured CodePay payments
for the terminal, pin them to a new `settlement_batches` row, return one of:
- `{ batch_uuid, batch_id, payment_count }` — normal path
- `{ branch: 'nothing_to_settle' }` (or `nothing_to_settle: true`) — nothing open
- `{ branch: 'needs_manual', message }` — >1 open batch, don't guess
Identify CodePay payments the same way the refund context does: rows whose
`processor_response ->> 'terminal_type' = 'codepay'` (or `terminal_vendor`),
unsettled (`is_settled = false`), captured, `refunded_amount = 0`.

### `finalize_codepay_settlement(p_batch_uuid uuid, p_merchant_id uuid, p_codepay_response jsonb)`
Mirror `finalize_valor_settlement`. Read success from
`p_codepay_response ->> 'response_code' = '000'`. On success, mark the pinned
payments `is_settled = true` + stamp `settlement_batch_id` / `batch_number`;
otherwise route the batch to `needs_review`. Return
`{ success, should_retry, requires_support, batch_id, status, batch_number, error }`.
The client also replays this via `pending_finalize_journal` (processor `codepay`)
if the first finalize call fails after a confirmed close.

## Status

- **Phase 1 — sale**: done (native Intent bridge, service, mapper, POS + kiosk routing).
- **Phase 2 — refund/void/query**: done (`refundService.processCodePayTerminalRefund`, referenced by `orig_merchant_order_no`).
- **Phase 3 — settlement**: client done (`runCodePaySettlement` + pending-finalize replay). Manual batch-out only (BatchoutPanel, kill switch `CODEPAY_BATCHOUT_ENABLED` OFF). **Blocked on backend RPCs** (above).
- **Phase 4 — tip-adjust / health / identity / test / labels**: done.
  - Tip adjust: `useTipAdjustMutation` codepay branch (topic `ecrhub.pay.tip.adjustment`, references original by `merchant_order_no`). UI gating (`getTerminalMatchInfo`) already allows it.
  - Health check: `terminalHealthCheck.performCodePayHealthCheck` + `usePaymentTerminal.testConnection` codepay branch → non-intrusive native `isRegisterAvailable()` presence check (never launches Register).
  - Identity: no passive serial discovery on the Intent path — `serial_number` is config-driven and flows into the `codepay_transaction` JSONB.
  - Display labels fixed in `TerminalSection.tsx` + `devices-connections.tsx`.
- **Provisioning (done)**: on-device CodePay now **auto-provisions** its own `payment_terminals` row (detector, once per session) and exposes a Settings card ("Save & Set Up") in both the register and kiosk screens — no per-device SQL. Keyed on a stable device serial (hardware serial → ANDROID_ID). See "Auto-provision" above. Kill switch `CODEPAY_AUTO_PROVISION_ENABLED`.
- **Phase 5 — EAS native rebuild + on-hardware QA**: pending (needs the terminal).

## Verify on live hardware
1. `trans_status` arrives as a string vs number (client handles both).
2. `response_code` is a top-level Intent extra vs nested in `biz_data` (both handled).
3. Confirm the exact `biz_data` result keys against a real sale.
4. New native module ⇒ requires an **EAS native rebuild** (not OTA-able). The
   `getDeviceSerial` method + `READ_PRIVILEGED_PHONE_STATE` also need the rebuild.
5. Confirm `getDeviceSerial()` returns a real serial on the CodePay ROM (privileged)
   vs falls back to `ANDROIDID-…` (check the provisioned row's `serial_number`),
   then confirm auto-provision created exactly one row and batch-out runs off it.

## Kiosk "Please see a staff member" lockups (fixed 2026-09-25)

Bread & Butter Deli Kiosk 8 / 10 kept locking on "Payment is being verified".
Prod orders S15-0034, S15-0036, S14-0031 stuck `draft/pending`; S15-0036 hit the
assistance screen exactly ~120s after the charge started.

Root cause: the native watchdog (`CODEPAY_SALE_TIMEOUT_MS`) and the Register
order expiry (`CODEPAY_DEFAULT_EXPIRES_SEC`) were both 120s. A slow customer let
our watchdog win → `indeterminate` → kiosk payment hold (`checkoutGuard`). The
real Register result arriving later was dropped by the bridge.

Fix (JS only, OTA-able):
- Watchdog = expiry + 60s, so Register's own timeout returns a definitive result.
- `processSale` auto-queries (`ecrhub.pay.query` by `merchant_order_no`) on an
  indeterminate result; ONLY a confirmed completed sale (status 2, same order no,
  sale type, same amount) recovers to success. Anything else keeps the hold —
  "no charge" is never inferred from a lookup (query not-found semantics are
  still unverified on live hardware).
- Kiosk: a bridge rejection (Register never launched) is a clean failure, not
  a `payorder_exception` hold.
- Unlock dialog names the active processor instead of hardcoded "Valor".
