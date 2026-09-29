# CodePay on-terminal integration

Dexa-POS runs **on** a CodePay Android terminal and drives payments by launching
the pre-installed **CodePay Register** app via an Android Intent
(`com.codepay.transaction.call`, `startActivityForResult` → `onActivityResult`).
Sales, refunds and batch-out are pure same-device app-to-app (no TCP/WebSocket).
This is the ATOM-class on-device pattern (see `services/terminals/atom-service.ts`).
The one cloud call is the kiosk's **host status lookup** (RSA2-signed Cloud API,
server-side in the `codepay-transaction-status` edge function) — see
"Kiosk payment window & host status lookup" below.

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
| Refund/void routing | `services/refundService.ts` (`processCodePayTerminalRefund`) → `CodePayService.reverse`; rules and codes in `services/terminals/codepay-reversal.ts` |
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

CodePay settles on the terminal (topic `ecrhub.pay.batch.close`), from the
BatchoutPanel and from the auto-settle scheduler (`autoSettlementScheduler.ts`
includes CodePay; backend parity in `20260917120000_codepay_auto_settle_support.sql`).
`CODEPAY_BATCHOUT_ENABLED` is **ON**.

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

## Refunds and voids (2026-09-29)

Every CodePay refund attempted before this change failed: 6 on prod (all on
2026-09-29, order S13-0001, Coffee Bar Kiosk 5, Bread & Butter) and 2 on
staging. Each failed in about 100 ms with no terminal response, because it was
started on a device that isn't a CodePay terminal. PR #221 (Kiosk Settings →
Orders) lets staff refund on the kiosk itself; this section is what happens
next.

### What the CodePay docs say

Source: `developer.codepay.us/docs/guides/integrate-with-codepay-terminal`,
`/docs/CloudAPI`, `/docs/ResponseCodes/{codepay,tsys,fiserv}`.

- **Void** (`trans_type 2`): "You can cancel a payment any time while it is
  still in the batch. Once the batch is closed, the payment can no longer be
  canceled." It cancels the whole charge.
- **Referenced refund** (`trans_type 3` + `orig_merchant_order_no`): no card
  needed. The Cloud refund API allows partial amounts.
- **Unreferenced refund** (`trans_type 3`, no `orig_merchant_order_no`): money
  goes to whatever card is presented. Dexa never sends this.
- Every documented refund and void sample carries `pay_scenario: "SWIPE_CARD"`.
  Dexa's requests didn't; they do now.
- **No time limit is documented** for a referenced refund, and no retention
  period for transactions. See "How far back" below.

### What Dexa does (`CodePayService.reverse`, rules in `codepay-reversal.ts`)

| Payment | Refund asked for | Sent to Register |
|---|---|---|
| Not batched out, nothing refunded yet | the whole payment | **Void** |
| Not batched out | part of it (custom amount, some items) | Refund |
| Batched out | any | Refund |

"Not batched out" is `order_payments.is_settled = false`. That flag is only
set by Dexa's own batch-out, so it can lag the host (on 2026-09-29 prod still
showed all 53 payments from 9/28 as open). The host decides:

- Void turned down because the batch closed → a refund is sent, once.
- Refund turned down because the batch is still open → a void is sent, once,
  and only for a whole payment.
- A partial refund turned down for that reason stops, and staff are told to
  refund in full or batch out first.
- Anything else (decline, host error, cancel on the terminal) is final. The
  second operation only follows a definitive "wrong operation for this batch
  state" answer, so no money has moved when it is sent.

| Meaning | Codes | Then |
|---|---|---|
| Batch closed, can't void | CodePay `ET008`, `ET007`, `CF008`; TSYS `D0004`, `D0090`, `E8908`, `E8909`; Fiserv 902 / 942 / 414 and CodePay 119 by message | Refund |
| Batch open, can't refund | TSYS `D0005`, `D0091` | Void (whole payment only) |
| Original not found | `ET002`, `ET003`, `E04110`, `E04111` | Stop |
| Amount too high | `E04126`, `E04130` | Stop |
| Partial not allowed | `E04132`, TSYS `E1502` | Stop |
| Already reversed | Fiserv 334 / 772 / 774 by message | Stop |
| Gateway or setup error | `SYS…`, `E07…` | Stop, never read as a verdict |

A processor prefix is stripped before matching (`TS-D0005` → `D0005`).

**Unknown outcome** (watchdog or unreadable result). Dexa asks Register about
the reversal's own `merchant_order_no` (`ecrhub.pay.query`), and for a void
also whether the sale now reads `trans_status 3`. A lookup can only turn the
result into a success. Otherwise the refund fails with the reference to look
up (`CPRF_…` / `CPVD_…`), which is also written to the refund journal
(`terminalTxnId`) before the Intent is sent. The other operation is never
tried after an unknown outcome.

**What is recorded.** Always a refund (`reversal_type = 'refund'`, refund
receipt as usual), whichever operation ran. The operation and every attempt
are in `reversals.terminal_response.codepay_reversal`.

**Tips.** `order_payments.amount` excludes the tip, and a refund gives back
`amount` only (same as every other processor). A void cancels the whole
charge, so the tip goes back too. The kiosk says so before staff confirm
(`wholeChargeCancelTotal`), and the result toast repeats it.

**Which device.** CodePay reversals launch Register, so they only run on a
CodePay terminal. Anywhere else the refund stops before anything is recorded
and tells staff to open the order on that device. A CodePay payment is always
routed to CodePay, even if its `payment_terminals` row is gone (it used to
fall through to Dejavoo) and whatever terminal the station has now.

**Kill switch.** `CODEPAY_REVERSAL_ROUTING_ENABLED` in `types/codepay.ts`
(OTA). Off = every reversal is a referenced refund with no second attempt.

### How far back

| Layer | Limit |
|---|---|
| CodePay payments in prod | Oldest is 2026-09-16; 279 in total on 2026-09-29 |
| Orders in prod | Oldest is 2026-04-14; nothing deletes or archives orders or payments |
| Kiosk Settings → Orders | Any past date. Presets stop at 30 days, the calendar has no earliest date |
| POS Previous Orders | Any past date through Custom range |
| Dexa refund rules | No age check anywhere |
| CodePay docs | No refund window or retention period stated |

So the real limit is the processor's, and it is not published. Ask CodePay /
MTech how long after a sale a referenced refund is accepted on the TSYS MID.
When it is refused, the refund fails with the host's reason.

### Verify on a terminal

- [ ] Same-day full refund on the kiosk (open batch): Register runs a void,
      the card gets the whole charge back, the order reads Refunded.
- [ ] Full refund after batch-out: Register runs a refund for `amount`.
- [ ] Custom amount after batch-out.
- [ ] Custom amount before batch-out: note the exact code and message.
- [ ] Void on a payment whose batch closed on the host while `is_settled` is
      still false: note the code, confirm the refund follows.
- [ ] Record the real `response_code` / `response_msg` for each decline here.
      The code list above is from the docs, not from a terminal.
- [ ] Does Register accept `tip_amount` on a void, and is `order_amount` the
      base or the total? Dexa sends base + tip, as the sale did.
- [ ] Refund from a POS register that is not a CodePay terminal: blocked with
      the "open the order on that device" message, no reversal row.

### Open

- A void gives the tip back but `order_payments.tip_amount` still holds it, so
  tip reports overstate by that tip. Needs a server-side decision (website
  repo migration), e.g. zero the tip when the terminal voided.
- After batch-out the tip stays with the merchant on a full refund. If a full
  refund should return the tip too, send `tip_amount` on the refund and track
  it; that is a product decision for every processor, not just CodePay.
- `prepare_codepay_settlement` only pins payments with `refunded_amount = 0`,
  so a partly refunded open-batch payment is never marked settled.
- The manual "mark completed" recovery screen still labels refunds as Castles
  (`useRefundVerification.ts`).

## Status

- **Phase 1 — sale**: done (native Intent bridge, service, mapper, POS + kiosk routing).
- **Phase 2 — refund/void/query**: done (`refundService.processCodePayTerminalRefund`, referenced by `orig_merchant_order_no`). Batch-aware void/refund routing added 2026-09-29, see "Refunds and voids"; not yet run on a terminal.
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

## Kiosk payment window & host status lookup (2026-09-28)

Why: kiosk sales whose Register result came back unknown locked the kiosk for
staff (Deli Kiosk 8: 44 min on 9/25, 6.7 h on 9/26), and a customer who walked
away held the card screen for 120 s. Plan:
`~/.claude/plans/lets-look-into-this-glittery-swan.md`.

**Payment window (kiosks only).** `kiosk_profiles.payment_window_seconds`
(45–180, default 60 since `20260929120000`; NULL = legacy 120 s with no
prompt, the per-profile kill switch) becomes the Register sale
`expires`. Register won't go below about 60 s (a 45 s window closed at ~60 s
on the staging terminal). Dexa cannot time this itself: JS timers pause while
Register is in front, and Dexa can't draw over it. The watchdog for a windowed
sale is `expires + 60 s`. The kiosk passes `on_screen_signature: false`.

**Watchdog never fires while Register is in front (bridge fix, 2026-09-29).**
A failed card read makes Register show "Read data failed" (Cancel / OK to
extend), which pauses its own `expires`. The old native watchdog resolved
`timedOut` anyway, then `onActivityResult` dropped the customer's later Cancel
(`pendingPromise` already cleared), and the host lookup couldn't prove "no
charge", so S10-0005 ($0.01, not charged) locked the kiosk for staff.
`CodePayBridgeModule` now:
- re-checks every 5 s instead of resolving while Dexa is paused (Register in
  front), logging `Watchdog deferred` once;
- resolves `timedOut` ("no result after Register closed") 5 s after Dexa comes
  back with nothing pending delivered (Android delivers the result before
  `onResume`);
- logs `Late CodePay result dropped` if a result ever arrives with nothing
  waiting.

Native change → ships in the 2.5.4 APK (runtime 2.5.4), installed on every
CodePay kiosk; the JS interface is unchanged. Known limit: a walk-away on the
read-failure screen stays on Register until someone taps.

**"Expired" classification** (`CodePayService._interpret`). Applies only when
the caller passed `expiresSec`, and only when every condition holds:
- The result arrived no earlier than 3 s before the deadline (monotonic
  clock), so a late Cancel after the window also counts.
- The result is non-000 or `RESULT_CANCELED`.
- There's no sign a card was read: no `trans_no` / `auth_code` / `card_no`,
  `trans_status ∉ {0,2,4,9}`, and no `paid_amount`.

A `000` always wins, **checked before `RESULT_CANCELED`**. Log line:
`[CodePayService] sale result … canceled, elapsedMs`. Record Register's real
expiry code here once observed.

**"Need more time?"** (`useKioskCheckout.payOrder` attempt loop):
1. A confirmed no-charge expiry clears the *persisted* review marker (a crash
   during the prompt doesn't reboot into a lock) but keeps the in-memory hold.
2. The kiosk shows `KioskPaymentTimeoutModal` with a 30 s countdown.
3. **Yes** relaunches Register on the same order with a new `CP_` ref and passes
   the previous ref as `priorReferenceId`. The host is asked about the previous
   ref first, and a late approval is recorded instead of charging again.
4. **Cancel order**, the countdown running out, or a 4th lapse (max 3 prompts)
   voids the order ("Kiosk: payment not completed in time") and returns to the
   attract screen.
5. A refused void holds the kiosk (`void_blocked`).

**Host status lookup** (`services/terminals/codepayStatusLookup.ts` → edge
function `codepay-transaction-status` → `_shared/codepayCloud.ts`):
- **Endpoints.** Cloud `/api/payments/recall` (by `merchant_order_no`) gives the
  verdict. `/api/entry/orderquery` (`method order.query`) supplies amounts, and
  must agree before a recall "not found" counts.
- **Status mapping.**
  - `trans_status` 2 or 4 → `approved`
  - 1 or 3 → `failed`
  - **0 or 9 → `pending` (never "no charge")**
  - M010 / "can't find" → `not_found`
  - an identity mismatch or a bad signature → `unavailable`, with no second
    opinion
- **After a watchdog.** Wait for `AppState` → active (Register closed), then
  require **two** not-charged answers ≥ 5 s apart. Still pending at the 20 s
  budget → hold (`cloud_pending`).
- **An approval must match amounts** (`order_amount` = base, `tip_amount`,
  `paid/trans_amount` = total). A mismatch → hold (`cloud_mismatch`). The
  payment is recorded via a synthesized `codepay_transaction` with
  `recoveredVia: "cloud_lookup"`. Card last-4 isn't available from the host.
- **Fallback.** Unconfigured or unreachable → the old on-device `_recoverSale`
  query. After a watchdog, if that also fails → the staff hold (last resort).
- **Kill switches.** Unset the `CODEPAY_CLOUD_CONFIG` secret (remote), or set
  `CODEPAY_CLOUD_LOOKUP_ENABLED` (OTA).

**Telemetry (Sentry).**
- `kiosk.payment.window`: outcome `expired|more_time|cancel|countdown|cap`, with
  attempt, referenceId, elapsedMs and raw codes.
- `kiosk.codepay.cloud_lookup`: outcome
  `recovered_via_cloud|no_charge_confirmed|hold|cloud_contradicts_register|…`,
  with the lookup trail.
- `kiosk.payment.assistance`: now tagged `cause`, with referenceId / elapsedMs.
- `order.void.backend_failed`.
- `kiosk.order.void_refused`.

**Cloud credentials runbook (keys never go through chat).**
1. **Generate our own key pair.** CodePay confirmed (2026-09-28) that the
   integrator generates it (docs: guides/api-secure). The private key never
   leaves this machine:
   `openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out codepay_pk.pem`
   (PKCS8, which is what the edge function's WebCrypto needs; CodePay's
   "PKCS1 for non-Java" note is about their SDK containers, and the signature
   is identical), then
   `openssl pkey -in codepay_pk.pem -pubout -out codepay_pub.pem`.
2. **Upload the public key.** PayPilot → Settings → Payment Apps → select the
   app → **API security** tab → auth type **RSA signature** → paste into
   **RSA Public Key** → **Submit**. Paste the single-line body first
   (`grep -v '^-' codepay_pub.pem | tr -d '\n'`); if it's rejected, paste the
   full PEM. The app's PAID is the Cloud `app_id`. CodePay's Cloud example
   uses the same `wz…` format as our ECR app id `wz1f2e3295adc70112`, so it's
   likely the same app; the probe confirms it.
   **B&B's gateway (via the MTech distributor):**
   `https://mtech-open.codepay.us/api/entry`. The code strips `/api/entry` and
   calls `/api/entry/orderquery` and `/api/payments/recall` on that host.
   PayPilot also shows a 2048-bit platform public key (base64 SPKI starting
   `MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAl838XBDy…`). Pass it as
   `--gateway-key`; `signed=verified` in the probe output confirms it's
   CodePay's key. MTech's "CodePay Key Tool" is a Windows `.exe` that only
   generates a key pair; openssl does the same job.
3. In the website repo, run
   `node --experimental-strip-types scripts/codepay-cloud-probe.ts --gateway … --app-id … --merchant-no … --key codepay_pk.pem [--gateway-key …] --ref <known approved CP_ ref> --ref <random CP_ ref> --trans-no <gap trans_no> --env-out codepay-cloud.env --location <location uuid>`.
   It prints recall/orderquery replies (full vs minimal envelope, signed?) and
   the function's verdict, then writes a base64 `CODEPAY_CLOUD_CONFIG` env file
   (mode 600).
4. `supabase secrets set --env-file codepay-cloud.env` (staging first), then
   delete the env file.

**Live probe findings (2026-09-28, MTech gateway):**
- **CodePay's replies are signed and verify** with the platform key from PayPilot.
- **Our request string-to-sign must include `sign_type=RSA2`**; only `sign` and
  empty values are excluded. Leaving `sign_type` out gave `SYS002`. The
  signature is standard base64; base64url gave `SYS002`.
- **Both endpoints return `E07303` "The API is not authorized or does not
  exist"** for app `wz1f2e3295adc70112`. Our signature is accepted, but the app
  isn't enabled for these Cloud APIs on MTech, or the `method` name differs.
  `/api/entry` and `/api/entry/orderquery` route the same way, so the gateway
  dispatches on `method`. The docs name orderquery both `order.query` and
  `pay.orderquery` (a `order_query_method` config / `--method` probe flag
  covers it).
- **Bug caught by the probe:** the old not-found regex matched "does not exist"
  in E07303, so a known-approved sale read as `not_found` (i.e. "no charge").
  Fixed two ways:
  - Not-found is now narrow (`M010` / "can't find original" / "order|transaction
    not found"), and `SYS…` / `E07…` are never not-found.
  - A `not_found` is only returned when a **canary** passes: the location's
    newest captured CodePay sale (≥2 min old) must look up as approved.
    Otherwise it's `unavailable` / `not_found_unverified`.

**After authorizing `order.query` in PayPilot (API tab), the same day:**
- `orderquery` (`method: order.query`) returns `code 0` and `data`, where
  `data` may arrive as a JSON string. Field names:
  - `trans_status`, `trans_type`
  - `order_amount` = base, `tip_amount`, `trans_amount` = `paid_amount` =
    base + tip (amounts like `"12.4"`)
  - masked card in **`pay_user_account_id`**, RRN in `ref_no`, entry mode in
    **`entry_model`**, brand in `pay_method_id`
  - declines carry `trans_error_code` / `trans_error_msg`
- **The function now uses `orderquery` as the primary.** `recall` is still
  `E07303` (not authorized) and is only a fallback that can never yield
  "not found" on its own.
- An unknown `merchant_order_no` returns **`E04111` "Merchant order number is
  invalid"**, now mapped to not-found (canary-guarded).
- Gap transactions resolved:
  - `…260925000031` (Kiosk 5, voided S13-0002) = **declined, Insufficient
    Funds** (TS-D2012). Not charged, and it shows that declines consume a
    trans_no.
  - `…260926000002` (Deli Kiosk 8, draft S15-0002) = **APPROVED $15.61** (13.01
    + 2.60 tip, MasterCard ****5478, `CP_1790424933625_d668`). The customer was
    charged but the POS never recorded it (the 6.7 h lock).
  - `…260925000033` (Kiosk 5, voided S13-0003) = declined, Insufficient Funds.
  - `…260925000056` (Deli Kiosk 8, draft S15-0034) = **APPROVED $16.28**
    (Visa ****2425, `CP_1790356567708_d668`).
  - `…260925000061` (Deli Kiosk 8, draft S15-0036) = **APPROVED $36.85**
    (Amex ****7140, `CP_1790359435387_d668`).
  - `…260925000062` (Deli Kiosk 10, draft S14-0031) = **APPROVED $14.10**
    (MasterCard ****0160, `CP_1790359431138_d28a`).
  - **Net: 4 customers were charged $82.84 with no POS payment.** Each one is a
    kiosk "see a staff" hold with the order stuck in draft (never sent to
    kitchen). The two declines were real. B&B has to record or refund the four
    charges. These charges also explain part of the terminal-vs-POS batch gap:
    Deli Kiosk 8 +$68.74, Deli Kiosk 10 +$14.10.
  - The two with no `electron_sign_url` (S15-0034, S15-0002) approved and then
    had no signature captured, which is consistent with Register sitting on its
    signature screen past our watchdog. Kiosk sales now send
    `on_screen_signature: false`.

**Open — confirm with the probe / on hardware before trusting in prod:**
- ~~Does Register return by itself at `expires` (the Wave 0 spike)?~~ Yes when
  no card is presented (2026-09-29): it closed the card screen at about 60 s
  with the window set to 45 s, so ~60 s is its floor. No after a failed read:
  "Read data failed" waits for Cancel / OK (see the bridge fix above).
- What does `trans_status 9` mean for an expired ECR sale? If it means
  "created, never paid", remap 9 → `failed` in `_shared/codepayCloud.ts`
  (server-only, no OTA). Until then every lapsed window whose host reports 9 is
  held.
- Which recall envelope does CodePay accept?
- The exact not-found code.
- Whether responses are signed.

