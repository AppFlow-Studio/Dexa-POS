# Per-order staff PIN attribution — POS flow (Ali J scope)

## Decisions locked
- Lock target: lightweight PIN overlay over order screen (verify-only).
- Grace window: none — re-enter PIN before every order when setting ON.
- Lock scope: order creation only.
- Setting level: per-location boolean, default false until backend column ships.

## Review (implemented, default-OFF — dormant until backend ships)
Files changed:
- `stores/useEmployeeStore.ts` — `orderAttributionStaffId` + set/clear + `getEffectiveCreatorStaffId()`
- `stores/useStoreSettingsStore.ts` — `requirePinPerOrder` (type/default/persist)
- `hooks/useVerifyStaffPin.ts` — NEW: online `verify_staff_pin` RPC + offline `findEmployeeByPin` fallback
- `components/auth/OrderPinGate.tsx` — NEW: attribution-only PIN overlay (Dialog modal)
- `stores/useOrderStore.ts:1123,1255` — call sites -> `getEffectiveCreatorStaffId()`
- `services/offlineSyncInit.ts:288` enqueue -> effective creator; `:1765` lost-params rebuild kept on loggedInEmployee (stale-safe)
- `components/bill/BillSection.tsx` — gate subscriptions, send guard + post-send clear+new-order, gate mounted in both return paths
- `components/menu/MenuSection.tsx` — folds `isAwaitingOrderPin` into `isMenuAddDisabled` so item-adds (the true order-creation point) are blocked until a PIN is verified. Closes the timing gap where an order could be created/attributed before the PIN.
- `app/(main)/settings/order-line.tsx` — "Staff Attribution" section: Require-PIN-per-order toggle wired to updateField.

### Payment attribution (added)
Payments previously recorded `processed_by_staff_id = NULL` (client never sent p_staff_id).
Now the ringing staff (getEffectiveCreatorStaffId) is attached to payments:
- `services/paymentService.ts` — `processPaymentOutcome` injects `p_staff_id` for ALL helpers (online).
- `stores/useOrderStore.ts` — direct online path (was `p_staff_id: null`), offline-queue build, and retry build all set `p_staff_id`.

### Coverage fix — single store chokepoint (corrected)
Gating only MenuSection/BillSection missed add surfaces (ModifierScreen, ItemCustomizationDialog,
OrderActionsMenu, OpenItemAdder, OrderDetails, modifier sidebar) — any of which could create &
attribute an order before the PIN. Root cause: `startNewOrder()` only makes a LOCAL draft; the
backend order row is created by `ensureOrderCreated`, triggered by `addItemToActiveOrder`.
Fix: a single PIN guard in `useOrderStore.addItemToActiveOrder` (the one chokepoint all add
surfaces funnel through) — no UI path can bypass it. MenuSection/BillSection visual gates remain
as proactive UX. Dine-in is exempt (attributes via table-session assigned_server), enforced
consistently in the store guard + both UI gates (`order_type !== "dine_in"`).

### FINAL FIX — attribution bound to a target (was global, leaked)
Root cause of "sometimes shows / sometimes not": orderAttributionStaffId was a single
global flag. A verification from one (often unfinished) order satisfied the gate for a
DIFFERENT order — e.g. a QSR draft's PIN satisfied a later table seating, or survived a
send-to-kitchen into the next order. Clears were scattered and missed cases (only payment
cleared QSR).
Fix: bind the verification to its target via `orderAttributionOrderId`:
- QSR: set to the active order id at PIN time.
- Dine-in seating: set to PENDING_SEAT_ATTRIBUTION sentinel (no order exists yet).
Every gate now checks `orderAttributionOrderId === <thisTarget>`:
- BillSection pinGateOpen, MenuSection isAwaitingOrderPin (=== activeOrderId)
- ensureOrderCreated + addItemToActiveOrder guards (=== order.id)
- order-processing eager-create effect (=== activeOrderId; re-runs on change)
- tables/index seating gate (=== PENDING_SEAT_ATTRIBUTION only)
Post-create the `!db_order_id` checks still short-circuit (covers local→db rekey).
OrderPinGate takes `attributionOrderId` and stores it with the staff id.
useEmployeeStore: added orderAttributionOrderId + PENDING_SEAT_ATTRIBUTION; setter takes
(staffId, orderId).

### Dine-in now included (was exempt)
Per-order PIN now applies to dine-in too. Since dine-in orders are created at SEATING
(seat_guests), the PIN is captured there:
- `app/(main)/tables/index.tsx` — handleGuestCountSubmit gates on PIN: stashes guest count,
  opens OrderPinGate, resumes seating on verify. Clears attribution after seatGuests so the
  NEXT table re-prompts (attribution is global, not per-table).
- `stores/useTableSessionStore.ts` — seating staffId = getEffectiveCreatorStaffId() (PIN'd
  staff → order creator + assigned server).
- `components/auth/OrderPinGate.tsx` — added optional onVerified callback.
- Gates/guards de-exempted dine-in AND changed to fire only for NEW orders (no db_order_id),
  so a seated dine-in order accepts items without re-prompting:
  - addItemToActiveOrder cart guard, BillSection pinGateOpen, MenuSection isAwaitingOrderPin
    all add `!db_order_id`.
  - ensureOrderCreated backstop already only runs for new creation.

### Gate scoping fix (PIN showed after payment)
`pinGateOpen` / `isAwaitingOrderPin` fired whenever per-order-PIN was on + attribution
cleared, even with NO active order (or a just-paid one) — so the PIN popped right after
payment when auto-create was disabled. Fixed by requiring a real order being rung up:
active order exists, non-dine-in, paid_status !== "Paid", check_status !== "Closed".
- `components/bill/BillSection.tsx` — pinGateOpen
- `components/menu/MenuSection.tsx` — isAwaitingOrderPin (+ currentOrderPaidStatus selector)
The ensureOrderCreated store guard is unchanged (only runs during genuine new creation).

### Setting: disableAutoCreateOrder (added)
New per-location flag (default false) that stops ALL automatic order creation:
- `app/(main)/order-processing.tsx` — skips the auto local-draft init effect AND the
  eager-backend-create effect when on. Existing in-progress orders still resume.
- `stores/usePaymentStore.ts` (handleSuccessClose) — the AUTOMATIC post-payment close
  (e.g. auto_on_payment) skips auto-starting the next order; screen stays empty.
- `components/bill/ paymentView/PaymentSuccessView.tsx` (handleDone) is the EXPLICIT
  "Start New Order" button — it ALWAYS creates, even with the setting on. (Earlier it was
  wrongly suppressed; corrected so the button still works.)
- Explicit `startNewOrder` paths (New Order button, OrderTypeDrawer) are NOT gated — the
  operator can always start an order on purpose.
- `app/(main)/settings/order-line.tsx` — "Order Creation" section toggle.
- Store: type/default/persist in useStoreSettingsStore.

### Attribution lifecycle (corrected)
Verified staff is held from PIN entry THROUGH payment, so order + payment are credited to
the same person. Cleared only when the order is fully paid/closed:
- `components/bill/BillSection.tsx` — send no longer clears (was clearing on send, which would
  let payment fall back to the shift user).
- `components/bill/ paymentView/PaymentSuccessView.tsx` — `handleDone` clears attribution at the
  top (runs on both dine-in and QSR finalize paths), re-opening the gate for the next order.

## Follow-ups
- `verify_staff_pin` not in `database.types.ts` yet -> called via `(supabase.rpc as any)`. Regenerate types after Ali D deploys, drop the cast.
- Hydration of `requirePinPerOrder` from the location setting NOT wired (column TBD). Stays false until then.
- Dine-in/`assigned_server` interaction intentionally unchanged (QSR-focused).

## QA matrix (pending on device)
- ON, two staff back-to-back -> each order correct `created_by_staff_id`.
- OFF -> behavior unchanged, active user credited.
- Wrong PIN -> rejected, shake, no order started.
- Offline -> cached-hash verify; attribution syncs on reconnect.
- No new `station_sessions`; no clock in/out from per-order PIN.
