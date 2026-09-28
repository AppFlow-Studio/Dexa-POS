# Handheld (Dexa Go) — what is left

Snapshot 2026-09-28, branch `handheld`. Everything below is open; everything
not below is built. "Done" means every box in sections 1–5 is ticked.

**Built:** Waves 1–3.5 (tables, checks, add / send / correct, seat, new
order), Wave 4a (card payment, screens 6–9), Wave 4b **UI only** (split,
merge, cash, receipts, payments list, refund, tip adjust), closing tables
with or without auto-clear, Wave 5 (low battery, roaming / no signal), and
the 2 GB performance pass. Plans: `wave2-3-plan.md`, `wave4-plan.md`,
`wave4b-plan.md`, `wave5-plan.md`; boot diet and perf pass in `README.md`.

---

## 1. Code still to build

### 1.1 Wire the Wave 4b payment screens

The screens exist and read real data; each action is a stub in
`handheld/screens/pay/unwired.ts` that toasts "not connected yet" and
returns `false`. Wiring = replacing one function body.

- [ ] **`payShare`** (split: evenly / by seat / by item) — run the share through screens 7–8 with the share's amount instead of the balance; by seat / by item pass `share.items` as item coverage. Must keep the table open until the last share.
- [ ] **`recordCash`** — blocked on the business decision in §2. Needs the drawer session, the closed-check guard `handlePaymentCompletion` lacks, and `amountOverride` (`wave4-plan.md` → "Cash — why it is out").
- [ ] **`mergeChecks`** — ownership of the source checks, and what happens to a source check that already has payments.
- [ ] **`sendReceipt`** — text and email have no handheld path yet; print must pin to the built-in printer, not the register's.
- [ ] **`refundPayment`** — the register's refund path. When wired, also lift the `if (isHandheld) return;` before the refund-journal scan in `app/_layout.tsx`, or a crashed handheld refund is never recovered.
- [ ] **`adjustTip`** — per-terminal support (ATOM tip adjust).

### 1.2 Card flow gaps (Wave 4a)

- [ ] **Payment-unknown screen** — the artifact's "Open payment app" and "Get a manager" buttons. Today the verify state only offers "Back to the check".
- [ ] **`order:paid` parity** — the handheld records with `addPaymentToOrder` and never emits `order:paid`. The table-status subscriber is now mirrored (`lib/tableClose.ts` `markTablePaid`); the **takeout / delivery auto-archive** (`lib/eventSubscribers.ts` subscriber 1, completion mode `auto`) is not, so a takeout paid on the handheld stays open where the register would archive it.
- [ ] **Per-order PIN attribution after payment** — the register clears it in `handleSuccessClose`; the handheld never calls that. Verify the next check still asks for a PIN, clear it explicitly if not.
- [ ] **Crash-recovery takeover** (`wave4-plan.md` trap 6) — after a crash mid-charge the register's verifying sheet opens full-screen on boot over whatever page restored. Legible now, still abrupt; give it a handheld entry point.
- [ ] **Split by item: part of a line** — paying 1 of 3 of the same item (the register's PayForItemsView quantity picker). Today whole lines only.

### 1.3 Device and native (Wave 0 build)

- [ ] **Native landscape lock** — `app.json` `"orientation": "landscape"`. The handheld's JS portrait lock may be ignored on a production build until the native lock is removed (Temur).
- [ ] **Screen-on** — `MainActivity.kt` sets `FLAG_KEEP_SCREEN_ON` for every station, so a pocketed handheld's screen never sleeps and drains the battery. Clear it for handheld stations (small native call, or `expo-keep-awake` activate-then-release, which clears the flag) and pick a timeout.
- [ ] **Cash-drawer detection** — only if cash-in-pocket is chosen in §2.
- [ ] **Valor VP550** — no on-device card path and no printer driver; payments and printing on it are their own wave.

### 1.4 Register-side work the handheld depends on

- [ ] **`markAsCharged` has no `atom` branch** (trap 7) — a crashed Landi charge is recorded as `terminal_vendor: "castles"`, and ATOM writes `terminalTxnId` only after the sale returns.
- [ ] **Permissions are not enforced** (trap 9) — `can_process_payments` / `can_void_orders` gate nothing; `cancelInProgressPayment` really reverses charges from a Dexa Go. Decide and enforce before handheld refunds / voids go live.
- [ ] **Tax-exempt** — needs an order field on the register first.

### 1.5 Platform

- [ ] **Shared / floating handheld stations** — one station locks to one device, so six servers need six stations. Shared stations, or accept one per device.
- [ ] **Handheld local data policy** — `lib/db/policy.ts` `stationKind` still gives a handheld the register's policy (customers and staff on the device). Needs its own before this ships widely.
- [ ] **Tables seated elsewhere** (trap 11) — every close action fails when the device has no local session for the table. Verify session hydration covers tables the handheld never seated.

---

## 2. Decisions owed (business)

- [ ] **Cash on the handheld** — take cash at the table (drawer story for a pocketed device), or "print the check, pay at the register" (already built). Unblocks `recordCash`.
- [ ] **`autoClearTableOnPayment` per location** — both paths now work (on: table frees up; off: closes to cleaning, then "Mark clean"). It is a location setting, so it changes the register too.
- [ ] **After payment: available or cleaning?** — auto-clear frees the table; the manual close sends it to cleaning.
- [ ] **Split by seat: unseated items** — own "Shared" card today, or spread across seats.
- [ ] **Refund reasons** — `RefundPage` `REASONS` are placeholders; use the register's list.
- [ ] **Handheld screen timeout** — goes with the screen-on fix in §1.3.

---

## 3. Verify on device

Open boxes in the plan docs (360 dp, font scale 1.3, Landi P30):

- [ ] Wave 2 — add to a check: 5 (`wave2-3-plan.md`)
- [ ] Wave 3 — open a check: 3 (`wave2-3-plan.md`)
- [ ] Wave 3.5 — correct a check: 6 (`wave2-3-plan.md`)
- [ ] Wave 4a — card payment and closing tables: 12 (`wave4-plan.md`), including DEV008 cancel / DEV009 timeout, kill mid-auth, offline card queue, and "a handheld-paid table reads Paid on the tablet"
- [ ] Wave 4b — once wired: 7 (`wave4b-plan.md`)
- [ ] Wave 5 — low battery and roaming: 7 (`wave5-plan.md`)
- [ ] Performance pass — receipt printing now falls back to the **built-in** printer when the station has no receipt printer set; confirm that is right on each location

---

## 4. Setup and rollout (Wave 1 leftovers)

- [ ] Staging `db push` of `20260921120000_handheld_station_type.sql` + the four verification queries (`README.md` → Migration verification)
- [ ] Station-quota unblock (HQ Device Inventory, or an HQ-admin insert)
- [ ] Landi screenshot diff of the **register** (the handheld must leave it untouched), plus KDS, CFD and kiosk regression
- [ ] Performance numbers on the 2 GB profile: boot to interactive Tables ≤ 3 s, tap-to-visual < 100 ms, sheet open < 150 ms
- [ ] Abubeckr's visual pass against the artifact
- [ ] Reconcile live handheld card payments against Luqra — the artifact's exit bar for Wave 4

---

## 5. Measure, then decide (performance)

Both would help a 2 GB device; both carry a recorded risk, so measure on a
P30 first (`README.md` → Performance pass).

- [ ] **`freezeOnBlur` on the handheld Stack** — stops hidden pages (Tables under an open check) re-rendering on broadcasts. `enableFreeze` is off app-wide after a measured 30 MB-per-visit native leak under `<Slot>`; check `dumpsys meminfo` over 20 push / pops.
- [ ] **Metro `inlineRequires`** — register modules the handheld never mounts are still evaluated at boot. App-wide change to module init order; profile boot before and after.

---

## Housekeeping

- `tsc` reports every `/handheld/...` route as unknown until Metro restarts on this branch (stale `.expo/types/router.d.ts`) — not a code error.
- `__tests__/syncOrderFromDatabaseDiscountMetadata.test.ts` fails on this branch with or without the handheld changes; not handheld work, but it keeps the suite red.
