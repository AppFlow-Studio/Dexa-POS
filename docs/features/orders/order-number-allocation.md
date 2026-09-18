# Order Number Allocation

## Summary

Reported: "create order 1 and send it to the kitchen, create order 2, pay
order 1, press New Order — you get order 3 and there is no way to reach order
2." Numbers were being consumed by orders nobody could ever open, so the day's
numbering skipped.

Under Decision 0.1 (local-first orders) the number the device mints is FINAL —
it is what `create_order_v4` stores and what prints on the guest's receipt. So
"allocate once, never renumber" is not a nicety here; anything else puts the
paper and the system out of step.

## Root causes

Four defects, all in the allocation path.

1. **The counter cache was read-preferred but write-partial.**
   `lib/localOrderSequence.ts` kept an in-process `Map` seeded from MMKV, and
   `nextSequence` read it in preference to MMKV. But `seedLocalSequence` and
   `forceSetLocalSequence` wrote MMKV _only_. After the first number of a
   session, every "heal the counter back to N" call in the app was inert.

   The visible damage was the inverse of the intent: the reused-empty-draft
   path exists to hand a draft back its own low number, and with the seed dead
   it fell through to `cached + 1` and issued a brand-new higher one — leaving
   the draft's original number spent on an order that had just been renamed out
   from under it.

2. **Seating minted the order twice.** Every seat gesture creates its
   optimistic order first (`startNewOrder`, at the call site or inside
   `seatGuests`). `seatLocal` then minted its OWN uuid and its OWN number and
   wrote _that_ order to SQLite and the outbox. The session pointed at the new
   row; the store still held the old one, which could never sync, never be
   reached, and never give its number back. Two numbers per seat, one order
   orphaned.

3. **A fresh order's floor ignored empty drafts.** `startNewOrder` floored the
   counter at the highest _meaningful_ order (drafts excluded), which can sit
   below a number a draft on screen is still displaying — so a new order could
   be handed a duplicate of it. `order-processing.tsx` had already worked
   around this locally with `max(reliable, highestSeenToday)`; the store had
   not.

4. **Renumbering a draft diverged from the database.** Under local writes an
   empty draft is eager-created the moment it goes active — row plus outbox op,
   both carrying its number. `getRefreshedReusableDraftNumbers` then rewrote the
   number in the Zustand store alone, with nothing propagating it.

Plus: `create_order_v4`'s collision renumber (§6.3) was logged and dropped, so
a device that _was_ renumbered kept displaying the number it lost.

## Changes

- [x] `lib/localOrderSequence.ts` — one `readSequence`/`writeSequence` pair; the
      cache and MMKV can no longer disagree. `nextSequence(key, floor)` takes a
      floor so allocation is `max(counter, floor) + 1`. `seedLocalSequence` is
      up-only; `forceSetLocalSequence` keeps its rewind but is documented as
      for server-assigned numbers only. Dead `generateLocalDisplayNumber`
      removed. `cleanupOldSequenceKeys` now also drops the cache entry.
- [x] `lib/reusableEmptyDraft.ts` — `getReliableTodaySequenceFloor` (+ its
      "meaningful order" notion) replaced by a single `getTodaySequenceFloor`
      that counts every order visible today for the station, drafts included.
      `allocateOrderNumbers` is the one store-aware minting entry point.
      `getRefreshedReusableDraftNumbers` deleted. `isReusableEmptyDraftOrder`
      now rejects a draft carrying a previous day's number — that draft's
      number is already on the server, so it is replaced rather than rewritten.
- [x] `stores/useOrderStore.ts` — `startNewOrder` mints via
      `allocateOrderNumbers`. New `startOrResumeOrder({ excludeOrderId,
    resetDineInFields })` action: resume the latest reusable empty draft, else
      mint; sets the result active; reads the store when it runs.
- [x] `services/localFirst/localWrites.ts` — `seatLocal` accepts
      `orderId`/`orderNumber`/`displayNumber` and only mints when the caller
      supplied none, mirroring `createLocalOrder`. Its order INSERT is now
      `ON CONFLICT(id) DO UPDATE` so seating an order that already has a row
      attaches the session instead of failing the transaction.
- [x] `stores/useTableSessionStore.ts` — passes the optimistic order's id and
      numbers into `seatLocal`, then `hydrateOrderFromSeat`s the same id back to
      link the session and mark the order written.
- [x] `services/localFirst/opHandlers.ts` — a server renumber is now adopted
      into the local row and the store, not just logged.
- [x] Call sites collapsed onto `startOrResumeOrder`: `order-processing.tsx`,
      `BillSection.tsx` (×2), `PaymentSuccessView.tsx` (×2),
      `usePaymentStore.handleSuccessClose`. That last one had also been
      resuming against a 100 ms-stale `ordersById` snapshot taken before the
      archive fired.

## Follow-up defect: the startup seed still counted every open order

Reported after the above shipped: "I was on order 24, went to tables (lots of
older open orders), created a new order — it was 77."

Root cause was NOT in the mint path (which was fixed above and is day-aware) —
it was the leftover seed loop inside `useOrderStore.initializeOrders`. That
loop computed `highestSeq` from every open order the server fetch returned,
filtered by station prefix only, with **no day check**, and fed it to
`seedLocalSequence` (up-only). Tables still open from a previous service day
carry their own day's numbers (`#S1-0076` born yesterday), so the seed
force-lifted TODAY's MMKV counter to 76 and the next minted order was 77. The
day-aware floor (`getTodaySequenceFloor`) was only wired into `startNewOrder`;
the seed never got the same treatment.

Fix: `initializeOrders` now seeds from `getTodaySequenceFloor` over the merged
store — the exact scan the mint path uses — so seed and mint cannot disagree
about what "visible today" means. Covered by
`__tests__/orderNumberAllocation.test.ts` ("seeds today's counter from today's
floor, not from old open orders").

Note: `seedLocalSequence` is deliberately up-only, so a device whose counter
was already polluted by the old code keeps the inflated value for the rest of
that local day. The counter key is per-day, so the next business day (or a
cleared MMKV / reinstall) starts clean.

## Invariant

> A number is allocated exactly once, when the order row is created, from
> `max(counter, highest number visible today for this location+station) + 1`,
> and never changes afterwards.

The only downward move left is `forceSetLocalSequence`, and only when echoing a
number the database itself minted.

## Verification

```bash
npx tsc --noEmit                                   # clean (1 pre-existing _layout.tsx error)
npx jest __tests__/orderNumberAllocation.test.ts   # 12 passed
npx jest __tests__/db/localWritesEndToEnd.test.ts  # 20 passed
npx jest                                           # 2265 passed; 23 failures identical to baseline
```

`__tests__/orderNumberAllocation.test.ts` walks the reported scenario end to
end plus: never renumbering a resumed draft, empty drafts counting toward the
floor, recovery from a mid-session counter wipe, station and day scoping, stale
drafts not being resumed, and the cache/MMKV coherence regressions.

`__tests__/db/localWritesEndToEnd.test.ts` gains "seating adopts the caller's
order instead of minting a second one", which fails on the pre-fix code with
the seatLocal-minted uuid.

## Open QA

On-device, per station:

- Ring #1 → send to kitchen → New Order (#2) → pay #1 → New Order. Must land
  back on #2. Ring #2 → New Order must be #3.
- Seat a table. Exactly one number is consumed and the ticket on screen carries
  it; the number is the same on the KDS ticket and the printed receipt.
- Seat from the waitlist and from the tables sidebar — same check.
- Kill the app mid-service and reopen: the next order continues the sequence,
  it does not restart at #1 or jump.
- Two stations ringing simultaneously keep independent `#S1-` / `#S2-` runs.
- Cross local midnight with an empty draft open: the next order starts the new
  day at #1 and the stale draft is not resumed.
