# Previous Orders — New / Modified Orders Not Showing (Live-Update Fix)

## Summary

Reported: creating an order then opening Previous Orders didn't show it, and
modifications (payment / void) weren't reflected. Root cause is in the
local-mirror path (`EXPO_PUBLIC_LOCAL_PREVIOUS_ORDERS=1` + `EXPO_PUBLIC_DELTA_SYNC=1`):

1. **Entry-time miss** — `refreshPreviousOrders` trusted a "fresh" mirror and
   returned without ever consulting the server. The mirror can lag the server
   by up to one delta cycle (~30s) or a missed/dropped broadcast, so a
   just-created order (or a just-payment/voided order) wasn't in the mirror yet
   → the screen showed it missing/stale even though the server had the truth.
2. **Live miss (own-station)** — the fan-out in `app/(main)/_layout.tsx`
   suppresses own-station broadcast echoes (3s window). A void / close-check /
   reopen / payment initiated from the Previous Orders screen therefore never
   reached the visible row (and `useVoidOrder` invalidates React Query keys the
   list doesn't read).

## Scope

- `stores/usePreviousOrdersStore.ts`
- `hooks/pos/usePreviousOrdersListSync.ts`
- `app/(main)/_layout.tsx`

Non-scope: broadcast row-insert (adding brand-new rows to the live list from a
trimmed v3 payload) — deferred; entry/refresh paths now cover it.

## Plan

1. **Probe before trusting a fresh mirror.** In `refreshPreviousOrders`, the
   "local-first when FRESH" early return now runs the existing cheap signature
   probe (`getHistoryWindowSignature` + `isCacheFresh` vs. the last
   server-fetched signature). Backend unchanged → keep mirror rows (zero
   network beyond the aggregate probe). Backend moved (new order → count;
   payment/void/refund → `updated_at`) → fall through to the authoritative
   fetch.
2. **Don't paint the offline cache over fresher mirror rows.** The
   cache-and-revalidate block is now skipped when the mirror painted the page
   (`!local`).
3. **Own-echo convergence.** Added `schedulePreviousOrdersRefresh()` (trailing
   debounce, mounted-gated via new `_isListMounted` flag). `_layout.tsx` calls
   it on suppressed own echoes so a void/close/reopen/payment done from the
   Previous Orders screen converges without a manual pull-to-refresh.
4. **Live cross-station void badge.** `_handleOrderBroadcast` now patches
   `voided` from the broadcast status so a cross-station void renders the
   Voided badge immediately.

## Progress

- [x] Probe-gated fresh-mirror return in `refreshPreviousOrders`
- [x] `!local` guard on cache-and-revalidate paint
- [x] `schedulePreviousOrdersRefresh` + `_isListMounted` + `setListMounted`
- [x] `usePreviousOrdersListSync` sets/clears the mounted flag
- [x] `_layout.tsx` routes suppressed own echoes to the debounced refresh
- [x] `_handleOrderBroadcast` patches `voided`

## Verification

- `npx tsc --noEmit` — no new errors (pre-existing: `orderDayGrouping.test.ts`)
- `npx jest previousOrdersCacheFreshness historyOrderFilters db/historyQuery
db/realtimeApply aud10EchoSuppression broadcastV3PayloadTrim ...` — all pass
- Pre-existing unrelated failure confirmed on HEAD before this change:
  `broadcastMergeStationId.test.ts` (structural test vs. `useOrderStore.ts`)

## Files

- `stores/usePreviousOrdersStore.ts`
- `hooks/pos/usePreviousOrdersListSync.ts`
- `app/(main)/_layout.tsx`

## Open QA

- [ ] Device QA: create → pay an order → open Previous Orders → row appears
      immediately (no pull-to-refresh).
- [ ] Device QA: void / close-check / reopen from the Previous Orders screen →
      row updates within ~1s.
- [ ] Device QA: second station pays an order while this station views Previous
      Orders → payment status patches live; void shows the Voided badge.
- [ ] Confirm one aggregate signature probe per screen open is acceptable (the
      tradeoff for instant correctness).

---

## Follow-up: refunded rows showed "Awaiting Payment"

`_derivePaymentStatus` (Previous Orders payment status mapping) dropped the
`"Refunded"` case and fell through to `"Unpaid"`, so a fully refunded order
rendered as "Awaiting Payment". The server sets `paid_status='refunded'` for
full refunds (`update_order_payment_status_after_refund_v2`) and
`derivePaidStatus` surfaces it first — the mapping just never forwarded it.

**Fix**: extracted the mapping to `derivePreviousOrderPaymentStatus()` in
`lib/paymentStatus.ts` (pure, testable — the store module is too heavy to
import in tests) and added the `"Refunded"` branch. Covers `_transformFetchedOrder`,
`addOrderToHistory`, and the broadcast patch.

## Follow-up: Refund button showed on unpaid orders

The "Process Refund" action (row context menu + expanded panel) only checked
"not fully refunded" — never whether money was actually collected — so an
unpaid order offered a refund with nothing to refund.

**Fix**: added `hasCollectedPayment()` in `lib/paymentStatus.ts` (any real,
non-pre-auth, non-voided **captured** payment with amount > 0) and gated both
`PreviousOrderRow`'s context menu and `ExpandedOrderPanel`'s button on it. The
detail sheet (`PaymentDetailBottomSheetBody`) already required
`paymentSummary.collected > 0`, so it needed no change.

### Files (follow-ups)

- `lib/paymentStatus.ts`
- `stores/usePreviousOrdersStore.ts`
- `components/previous-orders/PreviousOrderRow.tsx`
- `components/previous-orders/ExpandedOrderPanel.tsx`
- `__tests__/paymentStatus.test.ts`

### Verification (follow-ups)

- `npx jest paymentStatus` — 9 tests pass (refunded mapping + collected-money
  gates)
- `npx tsc --noEmit` — no new errors (pre-existing `orderDayGrouping.test.ts`)
