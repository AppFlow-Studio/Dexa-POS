# Handheld Wave 4 — take payment

Branch `handheld`. Wave 4a (card, end to end) ships before Wave 4b (split,
receipts). Design: the "Dexa Go Handheld" artifact, screens 6–9.
Engineering reference: `README.md` next to this file.

Rules carried over from Waves 1–3.5:

- Writes go through the register's store actions and the existing queues; no
  new RPC.
- One file per concern: `useXRows` hook + memoised row + sheet + page; nothing
  over ~120 lines. Primitives over inline styling.
- `handheld/**` stays lazy; route files `React.lazy` their page.
- A spacing / sizing value new to the build goes in `style`, not `className`
  (NativeWind trap); no Android ripple on flex-1 Pressables.

## Scope decisions

Taken 2026-09-22. The map behind them is a 20-agent read of the register
payment stack: 92 reuse claims checked (36 confirmed, 52 corrected, 4
refuted) and 88 traps recorded. Every "Register call" in this plan is a
verified claim, not a guess.

| Decision | Call | Why |
| --- | --- | --- |
| **Cash is out of Wave 4 entirely** | Screen 6 renders **no Cash row** and **no "if paid in cash" line** | Business blocker, unresolved. The drawer story for a pocketed device is undecided; see "Cash — why it is out" below. |
| Device | **Landi P30 / P32 only** | ATOM is hard-gated on `manufacturer LANDI \|\| model P30 \|\| P32` (`atomLoopbackDetector.ts:63-64`). The Valor VP550 has no on-device card path and no printer driver — it is a USB-attached product (`usb-diagnostics.tsx:89`). Shipping Dexa Go on a VP550 is its own wave. |
| Tip | **Dexa draws screen 7**, tip baked into the auth (ATOM Flow B, `tipAmount`) | Matches the artifact. Flow A (`tipPrompt`, terminal-drawn) stays available as a one-field switch if the device pass goes badly. |
| Tip preselection | **None.** Screen 7 opens with no card lit | Deliberate departure from the artifact, which draws the middle preset already selected (user's call 2026-09-22). A pre-selected tip on a guest-facing screen decides for the guest. Continuing without choosing is allowed and means no tip, so nobody is trapped on the screen; "No tip" makes the same outcome explicit and visible. |
| Tip policy | **Not enforced** | `tipsConfig.requireTipOnCard` / `maxTipPercentage` are not enforced on the register today. Enforcing on the handheld only would make two devices behave differently for the same guest. |
| Split | **Wave 4b** | `SplitByItemView`, `PayForItemsView` and `SplitEvenlyView` are true two-pane landscape layouts — the only real portrait rewrites in the stack. Deferring them is most of the wave's cost. |
| Receipts | **Wave 4b** | Screen 9 ships the approved hero + Close table. The 2×2 receipt grid follows with split. |
| Offline card | **Match the register: allow, and queue the record** | The register does *not* block card when offline — `syncPaymentToBackend` queues and toasts "Payment Saved" (`useOrderStore.ts:4039-4045`). Gating the handheld would make it stricter than the register, against the wave's iron rule. `useCardPaymentDisabled` (`hooks/useNetworkStatus.ts:91`) exists but is dead code; do not wire it. |
| Manager PIN on payment | **None** | The register gates void and discount only. Taking payment is ungated there, and Wave 4a has no refund or tip-adjust surface. |
| Screens 6–9 | **Handheld-native routes**, not the register's views | See "Why the register's views are not reused". |

Answered by the business team 2026-09-22:

- **Auto-clear on payment: yes.** `config.dining.autoClearTableOnPayment` is
  to be switched **on**. Note this is a *location* config field, not a
  handheld one — turning it on changes the register's behaviour at that
  location too, so it is a rollout step, not a code change.
- **Paying an unsent check fires the kitchen: yes.**

Two consequences of "auto-clear yes" that the artifact does not show:

- **It frees the table; it does not send it to cleaning.**
  `finalizeDineInPaymentClear` dispatches `{ type: "CLEAR" }`, which
  `useTableSessionStore.ts:93` defines as *"remove session"*. With the session
  gone, `getTableStatus` falls back to the floor-plan row — the table reads
  **available**. Screen 9's hint must therefore say the table frees up, not
  that it "moves to cleaning" (the artifact's copy). If cleaning is actually
  what is wanted, that is a different action (`CLEAR_TABLE`) with different
  side effects — flag it before the device pass, not after.
- **`clearTableEffect` does not run on this path.** It is keyed on
  `CLEAR_TABLE`, so the unconditional `archiveOrder` — and the stock
  double-decrement it causes — is not reached by `finalizeDineInPaymentClear`.
  Traps 10 and 12 below are downgraded accordingly. Do **not** add a
  `CLEAR_TABLE` dispatch to the handheld close path to "also" clean the table:
  that reintroduces both.

`finalizeDineInPaymentClear` still refuses on four grounds, and screen 9 must
report which: `setting-disabled`, `no-session`, `siblings-due`, and
`unpaid-items` (an items-level guard that outranks a cached `amount_due`,
`:52-75`).

### Cash — why it is out, and what it would have cost

Recorded so the decision does not get re-litigated from scratch:

- Option (c), "print the check, pay at the register", is **already built** —
  `handheld/components/check/useCheckActions.ts:33`. If the business team
  wants an affordance now, screen 6's existing "Print the check" link is it.
- Option (b), record-without-drawer, is mechanically free but breaks the iron
  rule in spirit three ways: `handlePaymentCompletion` has **no closed-check
  guard** (that gate lives only in `usePaymentStore.open()`, `:463-469`), so a
  handheld calling it directly can take money the register would refuse; the
  drawer write silently no-ops without a session (`paymentService.ts:343-344`),
  so end of day reconciles short by exactly the handheld cash; and it ignores
  the amount passed unless `amountOverride` is set (`:1387-1393`).
- `CashPaymentView` also drives the counter's customer display through the
  whole flow (`useCFD()`), so reusing it makes the CFD narrate a transaction
  happening 30 feet away.

## Why the register's views are not reused

`PaymentBottomSheet` is **already mounted for the handheld** —
`contexts/RegisterRuntime.tsx:72` renders it as a sibling of `{children}` for
both station types, and `CheckFooter.tsx:32-34` already reserves the Pay slot.
So the sheet needs no mount work. It needs a different fix:

- It sits **above** `HandheldFrame`, whose dp-true pin is a NativeWind
  `vars({"--ui-scale": 1})` React context (`HandheldFrame.tsx:13,28`), so the
  pin never reaches it. `PaymentBottomSheet.tsx:31` calls `useUiScale()`
  independently and gets `min(360/1333, 720/752) = 0.27`, clamped to the 0.6
  floor (`lib/uiScale.ts:55`). The sheet title renders at 14 px, the CLOSE
  label at 8 px.
- `CardPaymentView` has nine `flexDirection: "row"` bands and
  `maxWidth: s(400)` columns — 240 dp inside a 360 dp screen — and its tip
  tiles are `width: s(72)`. It is authored for a half-tablet column.

Wave 4a therefore builds screens 6–9 at `handheld/primitives` sizes and keeps
the register sheet mounted **only** for the crash-recovery / verifying
surface, wrapped so it is legible:

- [x] `contexts/RegisterRuntime.tsx` — wrap `<PaymentBottomSheet />` in
      `FixedUiScaleProvider scale={1}` on the handheld branch. Two details the
      plan did not anticipate: the provider is rendered **unconditionally**
      with a nullable scale (branching on it swaps the element shape and
      remounts the subtree — the "PUSH was not handled by any navigator"
      failure), and it needs `fill={false}`, because the default wraps
      children in a `flex-1` View that would sit in the same column as
      `{children}` and take half the screen from the app.
- The handheld happy path never calls `usePaymentStore.open()` — that would
  render the landscape views. It calls the store's lower-level pieces, and
  `handheld/lib/payments.ts` re-implements `open()`'s two guards.

## Register paths reused

| Handheld action | Register call | Notes |
| --- | --- | --- |
| Enable / disable Pay | `useOrderStore` selector for `{ tableId: tableIdOf(o), due: o.amount_due }` + `order.check_status !== "Closed"` | `CheckPage.tsx:70` gates on ownership only, never on `check_status`, so a paid or closed check still renders `CheckFooter`. Disable on `due <= 0.01`, or `addPaymentToOrder` rejects with "No unpaid items remaining" (`useOrderStore.ts:12907-12914`) *after* the sheet has opened. `tableIdOf` is not yet imported in `CheckFooter.tsx:8`. |
| Claim the check before charging | `claimOrderById` via the existing `TakeOverCard` | **The single most important line in this plan.** `chargeActiveTerminal` has zero access control; `addPaymentToOrder` re-checks ownership at write time (`useOrderStore.ts:12861` → `_checkCartEditable` → `isOrderReadOnly`) and returns false with only a `__DEV__` warn. In a release build a handheld paying a register-owned check **charges real money and records nothing**. The read-only check must happen before the swipe. |
| Lock the check across stations | `usePaymentStore.lockOrderForPayment(orderId, expectedVersion)` / `unlockOrderForPayment` (`:1656`, `:1741`) | Backend-visible. `TakeOverCard.tsx:17` already renders "The other station is taking payment on it." Release on abandon, or the register is locked out of the check. |
| Balance due (screen 6 hero) | `useOrderTotals(orderId)` (`stores/selectors/orderSelectors.ts:374`) | Takes the id the page holds, no dependence on `activeOrderId`, so no first-frame wrong-order flash. Do **not** read `order.total_cash_amount` — it is a backend-sync snapshot and goes stale on every local edit. |
| Tip presets (screen 7) | `useOrderTotals(orderId).amountDue` as the base, `round2` for each preset | The register formats with `toFixed(2)` on an unrounded float that reaches `p_tip_amount` (`CardPaymentView.tsx:248`); the kiosk rounds (`useKioskCheckout.ts:289`). Match the kiosk — the backend is 2 dp. |
| Card availability (screen 6) | `useActiveProcessor()` → `source === "atom"`, plus `useTerminalStatus(...).isReady` (`:452`) | `source === "atom"` needs **both** `useAtomTerminalStore.internalTerminal` non-null (set only by the loopback probe) **and** `useProcessorPreferenceStore.atomEnabled === true` (`useActiveProcessor.ts:60-63`). Before the first 30 s probe lands, `source` is `'none'` and the banner says "No payment terminal selected" — which on an ATOM-only handheld is the *normal startup state*, not an error. Screen 6 needs its own copy for that. |
| Charge the card (screen 8) | `chargeActiveTerminal({ amount, tipAmount, orderId, dbOrderId, supabase, onChargeStarted })` (`services/terminals/chargeActiveTerminal.ts:128`) | Handles the ATOM probe-suspend refcount itself at `:388/:398` — do **not** also call `suspendAtomLoopbackProbing`. Resolves the terminal from `useAtomTerminalStore.internalTerminal` (`useActiveProcessor.ts:126`). Hard-fails in RELEASE when no active terminal resolves (`:156-160`). |
| Return to the POS after the read | `atomBringPosToForeground()` (`chargeActiveTerminal.ts:399`) | ATOM foregrounds itself for the card read and does **not** relaunch the POS. Both register paths call this explicitly; omitting it strands the server in the ATOM app. |
| Fire the kitchen for an unsent check | the handheld's own `handheld/lib/sendCourse.ts`, **after** `addPaymentToOrder` resolves | The register fires from inside `handlePaymentCompletion` (`:1400-1407`), i.e. on success — match that, so a declined card never sends food. Use the handheld's send, not `sendNewItemsToKitchenForOrder` directly: table checks need the `batchUpdateItemKitchenStatus` → `markCourseSent` → `dispatchAction SEND_TO_KITCHEN` path that `sendCourse.ts` already implements and Wave 2 device-tested. One send path, no race. |
| Record the payment | `useOrderStore.getState().addPaymentToOrder({ orderId, amount, method: "Card", tipAmount, transactionDetails })` (`useOrderStore.ts:12839`) | Takes an explicit `orderId` — unlike `handlePaymentCompletion`, which is bound to `activeOrderId` and lands on the **wrong order** if it drifts. This is why Wave 4a does not use `handlePaymentCompletion`, and it is also what keeps payment from firing the kitchen. Returns `true` before the backend is contacted (`:13375-13401` is fire-and-forget). |
| Close the check when the auto-close did not land | `dispatchAction({ type: "CLOSE_CHECK", … })` | `closeCheckEffect.ts:25-33` queues when unsynced, so the offline case works; the register's "Order must be synced" refusal (`TableOrderView.tsx:748-755`) is its own UX choice, not a requirement. |
| Release the table | `finalizeDineInPaymentClear` (`services/tables/finalizeDineInPaymentClear.ts`) | Returns `{cleared:false, reason:"setting-disabled"}` unless `config.dining.autoClearTableOnPayment === true` (`:35-40`), and `reason:"siblings-due"` when other checks on the session are unpaid (`:52-55`). Surface both — do not show a success the call refused. |

## Files

Built 2026-09-22. `npx tsc --noEmit` clean project-wide; `npx eslint handheld
"app/(main)/handheld" contexts/RegisterRuntime.tsx` clean (the two warnings it
prints are pre-existing, on `RegisterRuntime`'s drawer effect); the NativeWind
class audit passes — every `className` token in these files already exists
elsewhere in the build, so no Metro `--clear` is needed for them.

Routes (`app/(main)/handheld/`):

- [x] `pay/[orderId].tsx` → lazy `handheld/pages/PayPage` — screen 6
- [x] `pay/tip/[orderId].tsx` → lazy `handheld/pages/TipPage` — screen 7
- [x] `pay/charge/[orderId].tsx` → lazy `handheld/pages/ChargePage` — screens 8 + 9
- [x] `_layout.tsx` — three `Stack.Screen` lines, `POS_SCREEN_OPTIONS`

Pages / screens (`handheld/`):

- [x] `pages/PayPage.tsx` — screen 6: `.hero-a` balance-due hero, Card row only, "Print the check" footer link
- [x] ~~`screens/pay/usePayGuards.ts`~~ — **folded into `lib/payments.ts`** as `payBlockedReason` / `canPay`. A separate hook would have been a wrapper around one pure call; the guard has to be callable from a tap handler and from `useCharge`, neither of which wants a hook.
- [x] `screens/pay/MethodRow.tsx` — the `.op` 84 dp row with a 52 dp `.ti` tile; `pri` variant for Card
- [x] `pages/TipPage.tsx` — screen 7: `.tipt` header, 3-up `.tp` grid, Custom / No tip, "Continue · $"
- [x] `screens/pay/useTip.ts` — renamed from the planned `useTipPresets.ts`: it owns the selection state as well as the presets, and a name that says "presets" would have hidden that. Presets off `useOrderTotals(orderId).amountDue`, `round2`.
- [x] `screens/pay/TipCard.tsx` — not in the plan: the `.tp` preset card, the `.tipg2` Custom / No tip pair, and the row wrapper. Split out to keep `TipPage` under the ~120-line rule.
- [x] `screens/pay/CustomTipSheet.tsx` — `primitives/BottomSheet` + `Keypad` (omit `leftKey`; it defaults to `"."`)
- [x] `pages/ChargePage.tsx` — screen 8 (`.msg` + 112 dp `.orb`, "Open card reader") then screen 9 (`.okh` hero, "Close table N"), plus the declined / verify / unrecorded states
- [x] `screens/pay/ChargeMessage.tsx`, `screens/pay/SuccessView.tsx` — not in the plan: the `.msg`/`.orb` block and the `.okh` header, split out of `ChargePage` for the ~120-line rule. `SuccessView` also carries `describeCard`, a best-effort read of the terminal response for the artifact's "Approved · Visa ending 4412" line that degrades to a bare "Approved" rather than printing something wrong.
- [x] `screens/pay/useCharge.ts` — the charge → record → send-if-unsent sequence. **The two amounts are not the same number**: `chargeActiveTerminal.amount` is the grand total INCLUDING tip, `addPaymentToOrder.amount` is the balance EXCLUDING it with `tipAmount` passed alongside (`usePaymentStore.ts:1386-1391`). Passing the tipped total to the recorder would over-record every tip.
- [x] `screens/pay/useCloseTable.ts` — `finalizeDineInPaymentClear`, surfacing all four refusal reasons; copy says the table frees up, not "moves to cleaning"
- [x] `lib/payments.ts` — the guard + derivation layer: `open()`'s two gates, tip presets, `chargeTotal`. Terminal availability stayed out of it — that needs `useActiveProcessor` / `useAtomTerminalStore`, so it belongs in a hook, not this pure module.
- [x] `components/check/CheckFooter.tsx` — Pay action added, tonal + `fit` as `.btn.tonal.fit`; its own string-returning selector (an object selector re-renders the footer on every broadcast), re-asserted at tap time
- [x] `lib/tokens.ts` / `lib/type.ts` — `optionRow 84`, `optionTile 52`, `tipCard 116`, `orb 112`, `successDot 84`, `receiptCard 92` and the `hero` / `tipPercent` / `successAmount` type ramp, with the artifact's em letter-spacing converted to dp

Register-side (two lines, both gated on station type):

- [ ] `contexts/RegisterRuntime.tsx` — `FixedUiScaleProvider scale={1}` around `<PaymentBottomSheet />` for handheld
- [x] `app/_layout.tsx` — narrowed `if (isHandheld) return;` to **payments only**: the blanket gate is gone and the same early return now sits immediately before the refund scan, so a handheld recovers a crashed card charge but does not hydrate a refund store nothing renders.

## Traps

Each one cost an agent a read; none are hypothetical.

1. **The silent ownership eat.** Covered above. Claim before charging.
2. **Two same-named directories.** `components/bill/ paymentView/` (leading
   space) holds `CardPaymentView`, `CashPaymentView`, `ItemsReviewView`,
   `PaymentSuccessView`, `SplitPaymentView`. `components/bill/paymentView/`
   (no space) holds everything else, including the error modals and the
   verifying overlay. `PaymentBottomSheet.tsx:13-26` imports from **both**,
   with the space baked into the specifier. Any grep or import written against
   the no-space path silently misses five files.
3. **`activeOrderId` drifts.** `CheckPage.tsx:28-31` sets it in a `useEffect`
   keyed on `[orderId]` and guarded on `ordersById[orderId]` — on a cold open
   or an offline replay the effect runs once against an empty slot and never
   retries. Every handheld write helper already re-asserts at call time
   (`sendCourse.ts:118`, `useAddItem.ts:33`, `useItemActions.ts:25`); the pay
   path must do the same.
4. **`handleSuccessClose` moves the ground.** It clears per-order PIN
   attribution unconditionally (`usePaymentStore.ts:615`) and, when
   `config.ordering.autoCreateOrder` is on, mints a new active order 100 ms
   later (`:665-670`) — under a `CheckPage` that is still mounted on the Stack.
   Wave 4a does not call it; `useCloseTable` does the two steps explicitly and
   `router.back()`s.
5. **Modal over Modal.** `handheld/primitives/BottomSheet.tsx:53` is a plain RN
   `Modal`, as is `PaymentBottomSheet.tsx:126`. On Android stacking is
   presentation order, not tree order. If Pay is ever reachable from inside a
   handheld sheet, close it and await a frame first.
6. **Boot recovery is a full-screen takeover.** Once the gate is lifted,
   `openForVerification` sets `isOpen: true` during cold start
   (`app/_layout.tsx:869-870`), over whatever route restored, before the
   operator has picked a check. It also bypasses the closed-check guard by
   design (`:407-409`).
7. **A crashed Landi charge cannot be reconciled properly.** ATOM writes
   `terminalTxnId` only *after* the sale returns
   (`chargeActiveTerminal.ts:426-430`), so an `initiated` journal has none, and
   `markAsCharged` has no `atom` branch — a P30 falls into the `else` and is
   recorded as `terminal_vendor: "castles"` (`usePaymentVerification.ts:423-443`).
   Wave 4a records the limitation; fixing it is register work.
8. **Payments do not ride the SQLite outbox.** They use the legacy
   `offlineSyncService` queue (`:57-59`), not `lib/db/outbox.ts`. Any pending
   or retry UI built on the outbox shows zero payments.
9. **`can_process_payments` gates nothing.** The only client reads are the two
   kiosk guards. The handheld's `true` grants nothing and its
   `can_void_orders = false` prevents nothing — `cancelInProgressPayment` will
   really reverse charges from a Dexa Go.
10. **`archiveOrder` is not idempotent** — it double-decrements local stock
    (`useOrderStore.ts:13492-13497`). Downgraded: the chosen close path
    (`finalizeDineInPaymentClear` → `CLEAR`) never reaches `clearTableEffect`,
    which is keyed on `CLEAR_TABLE`. This only bites if someone adds a
    `CLEAR_TABLE` dispatch to the handheld. Do not.
11. **No local session, no close.** `view_scope = 'location'` means the
    handheld lists tables it never seated, and session hydration is a separate
    path from the order list. Every close action returns `success:false` when
    `sessions[tableId]` is missing (`useTableSessionStore.ts:626-632`).
12. **`cleaning` has no handheld vocabulary** — `lib/tableStatus.ts` has a
    label and a sort rank for it but omits it from `IN_USE_STATUSES` and has
    no `tintKey` case (it falls through to `neutral`), and nothing in
    `handheld/` calls `finishCleaning`. Downgraded: the chosen close path
    frees the session outright, so Wave 4a produces no cleaning tables. It
    returns the moment anyone routes the close through `CLEAR_TABLE`.

## Verify

- [ ] Pay is absent on a closed or fully paid check, and on a check this station does not own the take-over card shows first
- [ ] A card taken on a register-owned check is impossible: claiming is forced before the reader opens
- [ ] Tip presets match the register's amounts to the cent on a partially paid check
- [ ] The charge screen survives the ATOM app taking over, and the POS returns to screen 9 by itself
- [ ] Cancelling in the ATOM app (DEV008) and letting it time out (DEV009) both land back on screen 6 with the check unchanged and no journal left behind
- [ ] Killing the app mid-authorization, then relaunching, surfaces the recovery sheet legibly (not at 0.6 scale)
- [ ] A card payment taken offline shows as queued, survives a relaunch, and drains on reconnect
- [ ] Close table reports what actually happened — cleared, `setting-disabled`, or `siblings-due` — and never claims a clear it did not get
- [ ] The same check paid from the handheld shows identically on the tablet: amount, tip, method, and the table's state
- [ ] Device pass on 360 dp, font scale 1.3

## Out of scope (Wave 4b and later)

Cash in any form (business blocker); split check and merge; the screen 9
receipt grid — text, email and the built-in printer; refunds and tip
adjustment from the handheld; Valor VP550 as a payment or print target;
low-battery transfer and Wi-Fi roaming (Wave 5); the `atom` branch in
`markAsCharged` (register work). `finishCleaning` from the handheld tables
list is no longer needed for Wave 4a, since the close path frees the session
rather than sending the table to cleaning.
