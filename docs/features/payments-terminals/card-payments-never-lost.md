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
