# Card payments are never silently lost

**Status:** Wave 1 implemented (branch `fix/card-payments-never-lost`); Waves 2–3 planned.
**Owner doc for:** payment persistence after terminal approval, void guards, unresolved-charge surfacing.

## Incident — 2026-09-25, 460 Bread and Butter (Register 1 Valor, EPI 2501496423)

Valor export vs `order_payments` (matched by RRN): two approved charges have no Dexa record.

| Time (ET) | Amount | Card | RRN | Auth |
|---|---|---|---|---|
| 9:36 | $3.26 | Amex ••6830 | 626813499298 | 804973 |
| 9:41 | $15.13 | Visa ••4549 | 626813166152 | 04058I |

$15.13 = 2 × Cold Brew $6.95 + 8.875% tax, on `ORD-20260925-S1-0005` (`911166d6…`). Only one `add_item`
drained, so the legacy `process_payment` op blocked on `item_not_synced`. Staff voided the order at 9:48, and
`voidOrder → cancelOrderOperations` discarded the queued payment. `process_payment_v17` also refuses void
orders, so even a kept op would have failed.

**Root causes:** payments stay on the legacy MMKV queue while items/orders are local-first (it needs server item
ids); ~10 code paths could drop a payment op silently; void wasn't guarded (client or server); dead-lettered
payments weren't shown on the order screen.

**Invariant:** once a terminal approves, the charge ends **recorded on the server**, **refunded**, or **visibly
unresolved in front of the operator**. Code never deletes, discards or evicts it.

## Wave 1 — stop the bleeding (legacy path)

- [x] `getUnrefundedCardCharges` / `describeVoidBlock` / `isCardPaymentVoidRefusal` in `lib/paymentGuards.ts`
- [x] `guardOrderVoid` / `getUnrefundedCardChargesForOrder` in `stores/useOrderStore.ts`. Enforced in `voidOrder`
      (now returns boolean), `voidOrderEffect`, MoreOptions `canVoid` + confirm, BillSection confirm, and Previous
      Orders void. Blocks any non-refunded card payment, synced or not (user decision), plus `terminal_approved`
      card journals.
- [x] Server `void_order` raises `P0010 ORDER_HAS_CAPTURED_CARD_PAYMENTS`. Migration
      `dexapos-website/supabase/migrations/20260925130000_void_order_block_captured_cards.sql`: **staging applied;
      PROD pending (user applies)**. The client maps P0010 to operator copy.
- [x] Legacy queue never drops payment ops:
  - `cancelOrderOperations` skips them; a void-blocked payment dead-letters as `PAYMENT_ORDER_VOID`.
  - Orphan and server-void drops in `offlineSyncInit` → `OpTerminal(PAYMENT_ORPHANED / PAYMENT_ORDER_VOID)`.
  - Dead-letter cap never evicts payments.
  - Retry resets `blockCount`.
  - Duplicate-precheck and 23505 now *complete* the journal.
- [x] Boot pre-check no longer fails `terminal_approved` journals on "no server row". It defers to the queue if a
      payment op still owns the journal, and otherwise sends the operator to reconciliation.
- [x] Card payments are never reverted or silently refused after approval:
  - `syncPaymentToBackend`'s unexpected-error path keeps them and routes to recovery.
  - `addPaymentToOrder` guard refusals escalate to recovery.
  - `discardUnsyncedPayments` skips cards.
- [x] Payment ops show on `OrderSyncBanner` ("Card charged $X — not saved"), with no Dismiss. The resolution
      modal probes the journal's idempotency key.
- [x] Tests: `__tests__/cardPaymentNeverLost.test.ts` (14).
- [ ] Device run on staging (script in plan: block the drain, card pay, try to void → blocked; restore → lands).

## Incident 2 — 2026-09-25, Charcoal Gardenia (S1 C20Pro, Castles)

`ORD-20260925-S1-0011` (`0cc9a7f2…`): the tablet and receipt show $108.48 paid (Visa ••9726, ref 626822170867). Prod shows $98.33 with 4 items, no `order_payments` row, and a void at 23:18 UTC.

**What happened:** the Vanilla Shake + custom modifier "Add espresso" never synced. The local-first `flattenModifiersForRpc` sent the custom modifier's sentinel ids, `add_order_item_v5` failed its uuid cast (22P02), and the op was parked `failed`. The payment op then blocked on `item_not_synced`, and the void discarded it, as in Incident 1.

**Since local-first went on** (2026-09-24 ~19:00 UTC), no add that carried a custom modifier reached the server at Charcoal.

**Voided orders with $0 recorded to match against the Castles batch:**

| Order | Date | Total |
|---|---|---|
| S1-0008 | 9/25 | $49.74 |
| S1-0018 | 9/20 | $39.59 |
| S1-0019 | 9/19 | $104.30 |
| S1-0009 | 9/14 | $227.11 |

Hotfix (branch `fix/lf-custom-modifier-lost-items`):
- [x] `lib/modifierRpc.ts` `sanitizeModifierRowsForRpc`, used by the flatten, both drain handlers and the legacy `replace_modifiers`.
- [x] `requeueFailedOps` heals `add_item`/`replace_modifiers` ops parked on `invalid input syntax for type uuid`, with no attempt ceiling. Sentry `poisoned_op_healed`.
- [x] `markRejected` reports to Sentry (`op_rejected`); prod has no Dev Flags screen.
- [x] Pre-charge gate `services/localFirst/paymentSyncGate.ts` for card and cash: block when the order has failed outbox ops, requeue them, show a toast, report to Sentry.
- [x] Drain: 25s per-op deadline (a timeout becomes a retry), and a nudge that arrives mid-drain schedules a rerun.
- [x] Tests: `__tests__/db/customModifierLostItem.test.ts` (8), `__tests__/flattenModifiersForRpc.test.ts` (3).
- [ ] Prod: apply `20260925130000_void_order_block_captured_cards.sql`, then publish the OTA with `--environment production`.

## Wave 1b — S1-0008 follow-ups (same branch)

`ORD-20260925-S1-0008` (prod `f5629a43…`, voided 21:48 UTC, $49.74, no payment row) is the S1-0011 bug again, plus three more it exposed. Verified against prod logs on 2026-09-25:

- 19:34 / 19:36 / 21:03 / 21:16: `invalid input syntax for type uuid: "custom-modifiers"` — the item adds (fixed in Wave 1).
- 21:04:05: `invalid input syntax for type uuid: "4ca2fa8e-…|modifiers:custom-modifiers:custom_mod_…"` — `process_payment_v17` was handed a composite cart id as an `order_item_id`. Then 21:04:10 / 21:04:14 `not fully paid (amount_due=49.74)`.
- The tablet's Previous Orders showed the rejected lines as "Unknown Item", and Print took the POS to the error screen (the mirror row's payload was the local-first placeholder; `calculateOrderTotals` threw on `quantity: undefined`).

Fixes:
- [x] (a) `lib/db/historyQuery.ts` `itemRowToFetchedItem`: a mirror item row is rebuilt from its promoted columns plus its payload. Payload wins for synced rows; columns win for local rows (later local writes update columns only). Used by `usePreviousOrdersStore.mirrorRowToFetchedOrder` and `useOnlineOrdersByDate`.
- [x] (b) `calculateOrderTotals` counts a non-numeric quantity as 0 (never 1: this math feeds payments). `ReceiptModal` catches a totals failure (Sentry `receipt-preview-totals`) and wraps the receipt paper in `ProductionErrorBoundary`.
- [x] (c) `syncPaymentToBackend` rebinds allocations to `db_order_item_id` from the fresh store line, keeps the CART id (never `item_row_id`) for an unbound line, and queues instead of calling the RPC when any allocation is unbound OR the order has pending/failed outbox ops (`unsyncedOpCountForOrder`) — a full-remaining payment carries no allocations and `process_payment_v17` would settle `p_amount = NULL` against a short server balance. The queued handler blocks on `order_ops_pending` until the outbox is clear; `flushItemBindings` nudges the legacy queue when a blocked payment waits on a line that just landed. Sentry breadcrumb `payment_queued_outbox_pending`.
- [x] (d) The drain's open-item branch now sends custom modifier rows via `replace_order_item_modifiers_v2` after `add_open_item_v5`, with `price_modifier: 0`. The entered open-item price is all-in (`OpenItemAdder` rolls modifier prices into `open_item_price`), the replace RPC reprices by row prices, and the client composer adds row prices again — a priced row is charged twice. Staging proof (rolled back): zero rows → `unit_price 14.50`, row present; a $2.50 row → `unit_price 17.00`. Transient failure retries the op; a permanent rejection keeps the item synced and reports `open_item_modifiers_rejected`.

Review — verified 2026-09-25 on the Pixel Tablet emulator against staging (no Jest cases added, per the user):
- (d) `ORD-20260925-S1-0007`: "Proof Salad" $10 + custom modifier "Extra sauce" $2.50. Drain log: `add_open_item_v5` ✓ then `open-item modifiers rows=1` ✓. Staging row: `unit_price 13.00`, `open_item_price 13.00`, modifier row "Extra sauce" @ 0 with null ids; cash totals match the tablet ($13.61). A priced row would have made it $15.50.
- (c) Same order, wifi off: added a second line, paid $1,059.43 cash. Log: `Queueing payment … unsyncedAllocation=true outbox=1p/0f`. Wifi on: the queued payment was `BLOCKED … order_ops_pending` twice while `add_order_item_v5` and `send_order_to_kitchen_v1` drained, then `process_payment_v17` SUCCESS with both allocations resolved to server ids (`items_paid` = both rows, `order_fully_paid: true`). Staging: `payment_status paid`, `amount_paid 1059.43`, cash payment `captured`. No uuid-cast error at any point.
- (a)/(b) `ORD-20260925-S1-0008`: a staging-only trigger rejected an `add_order_item_v5` with note FAILTEST (op parked `failed`, server has 0 items, order voided — the prod shape). Offline, Previous Orders (local mirror) showed "1x apeeeeeeeeee $999.00" instead of "Unknown Item"; Print Receipt rendered the preview (line, note, subtotal, tax, total) with no crash and no boundary fallback. Trigger dropped afterwards.
- Observed, not fixed: while online the same expanded row showed an EMPTY items panel (the in-memory voided copy hides its lines); a voided order's preview prints pre-void totals ($1,087.66 for a $0.00 order); the tablet's open-item subtotal composes $12.90 vs the server's $13.00 under dual pricing (`baseCardPrice` is dual-adjusted, the modifier price is not).

Left to the user: Castles batch check on S1 for ~5:04 PM ET 2026-09-25; the `location_id = 'undefined'` menu fetch seen in prod logs (unrelated); whether priced open-item modifiers are wanted (a pricing-model change, not done here).

## Wave 2 — `process_payment` on the SQLite outbox (`EXPO_PUBLIC_LOCAL_WRITES_PAYMENTS`)

- [ ] `local_payments` table (additive, SCHEMA_VERSION 14), `OutboxOp += process_payment`
- [ ] `recordLocalPayment` in `localWrites.ts`; allocations by `item_row_id` (no id resolution)
- [ ] Handler pins `process_payment_v17`, key = journal idempotency key; void/already-paid → `rejected` + surfaced
- [ ] `claimBatch`: don't overtake an earlier backing-off/failed op on the same order
- [ ] Tests: drain ordering, handler mapping, end-to-end offline 2-item + card pay

## Wave 3 — operator-visible unresolved charges

- [ ] `useUnresolvedCharges`: merge dead-letter + outbox failures + stale `terminal_approved` journals
- [ ] Location-level pill + Previous Orders badge, so charges on closed/voided tickets aren't invisible
      (today's banner only shows for the ACTIVE order)
- [ ] Actions: Retry / Record on new order / Mark refunded on terminal (manager PIN)

## Remediation for 2026-09-25

Keep the S1 tablet untouched: its journal holds both charges. Merchant decides per charge: refund on Register 1,
or record it against a new order.

## Review

- Wave 1 verification:
  - `npx tsc --noEmit` clean.
  - Full Jest: 2611 pass. One failure, `syncOrderFromDatabaseDiscountMetadata`, also fails on clean HEAD.
  - ESLint: 0 errors.
- Known gap until Wave 3: the banner is scoped to the active order. A charge parked on an already-voided order
  shows only in Settings → Syncing → Failed operations.
