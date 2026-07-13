# Hardware, Print & Payment-Handoff Audit (HEAD)

Audit C of 3 — hardware service layer + payment-moment choreography. Branch `Table-And-Order-Syncing`, HEAD family 91ad9674. Read-only; evidence = file:line + excerpt (≤10 lines). Audits A (state/persist/render) and B (realtime/fetch) not repeated; corrections to their anchors noted inline.

**Two premise corrections established up front, because they reshape sections 4, 5 and 7:**

- **C-1. There is no live deep-link/Intent card path at HEAD.** The iPOSPays/DVPayLite deep-link (`lib/payments/dvpaylite.ts:43-51`, `pay://pay?data=...`) has **zero importers** (grep hits only the file itself + `database.types.ts` enum strings `card_dvpaylite` at 11236/24726). Its callback scheme `myapp://payment-result` (dvpaylite.ts:77) is **not registered** — `android/app/src/main/AndroidManifest.xml:42-44` registers only `dexapos`/`exp+dexa-pos`; `app.json:8` `"scheme": "dexapos"`. The only `expo-intent-launcher` use is APK self-update (`services/appUpdater.ts:118`). Live card paths are **in-app awaits**: Castles TCP socket and Dejavoo SPIN long-held HTTPS. **The POS app does not background during card capture.** The per-card-transaction background/foreground cycle cost is zero.
- **C-2. Audit B's channel anchor is wrong on both counts.** Only **2** realtime channels are mounted (`location:{id}:tables` at `hooks/realtime/useFloorRealtime.ts:193`, `location:{id}:orders` at `useOrdersRealtime.ts:390`, both via `contexts/LocationRealtimeProvider.tsx:101,119` mounted once in `app/(main)/_layout.tsx:242/:279`; kitchen + session-events hooks are defined but unconsumed on POS). And **nothing unsubscribes on background** — the AppState handler early-returns on non-active (`useRealtimechannel.ts:335`); the file has zero `background` branches. Channels die passively (OS socket kill) and resurrect on active.

---

## 1. Tender-tap trace (cash)

Cash confirm lives in `components/bill/ paymentView/CashPaymentView.tsx` (directory name has a leading space), hosted by `components/bill/PaymentBottomSheet.tsx:107`. `PaymentDetailBottomSheet.tsx` is the previous-orders detail viewer, not the tender path.

**Headline: the payment RPC is NOT awaited by the tap handler.** The awaited window is purely local (totals math + Immer store writes + MMKV journal). Control returns to the user at the `view:"success"` swap — step 10 — typically milliseconds after the tap.

**1. Tap → `handleProcessCashPayment`** — `CashPaymentView.tsx:726` (defined `:100`). Button disables + relabels via local `isProcessing` (`:727,:747`). [UI BLOCKED — by local state, not network]

```tsx
<TouchableOpacity
  onPress={handleProcessCashPayment}
  disabled={(!isSufficient && total > 0) || isProcessing}
```

**2. CFD "processing" screens** — `CashPaymentView.tsx:105-107` → `contexts/CFDProvider.tsx:2050 (showPayment)`, `:2062 (showProcessing)`. Synchronous store + controller call. [SYNC]

**3. Cash drawer kick — FIRST, before payment** — `CashPaymentView.tsx:111-113`. [FIRE-AND-FORGET]

```ts
// Fire cash drawer immediately — don't wait for payment to complete.
PrinterService.openCashDrawer().catch((err) =>
  console.warn("[CashPayment] Cash drawer auto-open failed:", err));
```

Implementation `services/printing/PrinterService.ts:398-464`: direct driver call bypassing the print queue — `await driver.initialize()` if disconnected, `await driver.openCashDrawer()`. Async internally, never awaited by the handler.

**4. `await handlePaymentCompletion({method:"Cash"})`** — `CashPaymentView.tsx:116` → `stores/usePaymentStore.ts:977`. [AWAITED — but contains no network await; see 5–9]

**5. Kitchen send (pre-payment)** — `usePaymentStore.ts:1319-1325`: if order is draft/pending, `sendNewItemsToKitchenForOrder(activeOrderId)` (`useOrderStore.ts:13593`) called **without await**. Local item status flips sync; backend `update_order_status` + kitchen chit print run off the tap path. [FIRE-AND-FORGET]

**6. Build full-coverage `itemAllocations`** — `usePaymentStore.ts:1332-1342`. [SYNC]

**7. `await addPaymentToOrder(...)`** — `usePaymentStore.ts:1345` → `useOrderStore.ts:11553`. [AWAITED — local-only]. Sequentially sync inside: `_ensureTotalsFresh` + `calculateOrderTotals` ×3 (`:11584`, `:11672`, `:11959`); payment journal MMKV write ×2 (`:11886-11910`, `writePaymentJournal` + immediate `terminal_approved`); optimistic Immer `set()` (`:12005-12074`). Then the backend sync detaches:

```ts
// useOrderStore.ts:12096-12130
// Fire-and-forget: sync to backend in background
// Local optimistic state is already applied above — show success immediately
syncPaymentToBackend(order, {...}, rollbackState).catch((err) => { ... });
return true;
```

**7a. (BACKGROUND) `syncPaymentToBackend`** — `useOrderStore.ts:2728`. No `db_order_id` → `queueOperation({type:"process_payment"})` (~`:2876`) [QUEUED offline]. Otherwise ONE RPC (`:2934-2985`):

```ts
const { data, error } = await rpcWithIdempotency<any>(
  supabase, "process_payment",
  "process_payment_v12",   // flag OFF fallback
  "process_payment_v16",   // flag ON primary
  { p_order_id, p_payment_method: "cash", ... },
  { deadline: DEADLINES.paymentRpc, keyOverride: paymentDetails.paymentJournal?.idempotencyKey });
```

Option C deadline wrap applies: `DEADLINES.paymentRpc = 20000ms` (`lib/network/deadlines.ts:16`) + Wave Cat-B idempotency key. Deadline exceeded → `verifying` recovery handoff (`:3126-3133`); errors → queue retry (`:3179-3222`) or rollback (`:3582`). On success: reconcile, `completePaymentJournal`, then [FIRE-AND-FORGET] `OrderService.bulkUpdateOrderItemStatus(...'sent')` (~`:3445`) and `closeCheck` if fully paid (~`:3495`).

**8. Drawer ledger** — `usePaymentStore.ts:1362-1380` → `trackCashPaymentInDrawer` (`services/paymentService.ts:331`, returns `void`) → `recordDrawerOperation({operationType:"cash_sale"})`, with `payment_id:""` since the RPC hasn't run. [FIRE-AND-FORGET]

**9. `eventBus.emit("order:paid")`** — `usePaymentStore.ts:1418`, not awaited. `lib/eventBus.ts:204` runs subscribers via `Promise.allSettled`. Subscribers (`lib/eventSubscribers.ts`): auto-archive takeout `setTimeout 500` (`:34`); **table `dispatchAction({type:'FULL_PAYMENT'})`** (`:85-138`) then `loadFloorPlanStatus()` deferred `setTimeout 1000` (`:146-156`, explicitly to keep the print/USB window clean); analytics log (`:165`). [FIRE-AND-FORGET/QUEUED]

**10. `set({completedPaymentInfo, view:"success"})`** — `usePaymentStore.ts:1420-1428`. **⟵ CONTROL RETURNS TO THE USER HERE.** Sheet re-renders to `PaymentSuccessView`. Elapsed since tap = pure local compute (steps 4–9, zero network awaits).

**11. CFD approved** — `CashPaymentView.tsx:124` → `CFDProvider.tsx:2183-2209`. Error path: `showDeclined()` + `toastService.show({title:"Payment Failed"})` (`:130-136`). [SYNC]

**12. Receipt print** — `PaymentSuccessView.tsx:67-77` mount effect: if `autoPrintReceipt`, `PrinterService.printReceipt(order, selectedStore).catch(...)` — not awaited. `PrinterService.ts:121-160`: `buildReceiptTemplateData` runs **synchronously on the JS thread** once per copy (merchant + customer = 2 jobs), then enqueue + `queueMicrotask` drain kick (`:78-99`). [QUEUED]

**13. Sheet close / navigation — user-driven, never automatic.** "Finalize Payment" → `handleDone` (`PaymentSuccessView.tsx:84-253`): dine-in clear + fresh-draft `setTimeout 100` + `close()` (`:132-183`); quick-service equivalent (`:192-252`).

**Split/partial cash differences** (`usePaymentStore.ts:998-1292` vs standard `:1293-1429`): amount from `currentSplit.cashAmount` (`:1037-1042`); even splits pass `splitCount`/`splitPortionIndex` (`:1094-1134`); first split persists `split_payment_path` via direct fire-and-forget `supabase.from("orders").update` (`:1157-1167`); per-portion auto-print `printSplitPaymentReceipt` [QUEUED] (`:1205-1231`); non-final portion → `view:"split-payment-success"` (`:1234`); `order:paid` emitted only on the fully-paid guard (`:1258-1278`).

---

## 2. Print pipeline

### 2.1 Buffer build — two stages, both on the JS thread, both at enqueue time

**Stage A — template data**: `buildReceiptTemplateData()` `services/printing/PrinterService.ts:1176-1690`. Runs `calculateOrderTotals()` over all items (`:1207`), O(items) map with per-item price reconciliation (`:1244-1333`), and an O(sessions) scan:

```ts
// PrinterService.ts:1198-1202
const sessionPartySize = order.session_id
  ? (Object.values(
      useTableSessionStore.getState().sessions
    ).find((s) => s.id === order.session_id)?.party_size ?? null)
  : null
```

Logo injected as base64 string into template data (`:1681-1683`).

**Stage B — document IR**: `createJobForPrinter()` `PrinterService.ts:1050-1075` → `buildReceiptDocument()` (`templates/ReceiptDocumentTemplate.ts:404-868`) for Landi/Dejavoo/Star, or `buildReceiptCommands()` (`templates/ReceiptTemplate.ts:42`, raw ESC/POS) for `generic_escpos`. 114 `nodes.push` sites; a typical 10-item 1-payment receipt emits **~60–75 nodes**. Kitchen tickets ~20–35 nodes.

**Star = 100% raster path.** `StarXpandRenderer.ts:74-76`: "Force all printing to use graphics mode" — every Star receipt goes through `SkiaTicketRenderer.renderTextBlocksToImage()`. Chunking `MAX_CHUNK_HEIGHT_PX = 1200` (`StarXpandRenderer.ts:23`), 30px/line (`SkiaTicketRenderer.ts:26-27`) → ~40 lines/chunk; barcode/qr/image nodes force extra flushes (`StarXpandRenderer.ts:208-267`) → typically **3–4 Skia surfaces per receipt**, each up to 576×1200 (~2.7MB RGBA). Per line: 1 `drawText` (+1 bold stroke overlay, `SkiaTicketRenderer.ts:300-331`) + `getTextWidth` per block (`:237`) — ~60–130 synchronous draw calls/receipt.

**Base64/image work on the JS thread — three places:**
1. `SkiaTicketRenderer.ts:344`: `image.encodeToBase64(4, 100)` — synchronous JSI PNG encode of each chunk, then `FileSystem.writeAsStringAsync` (`:353`).
2. Logo: `StarXpandRenderer.ts:239-249` writes `node.base64Png` to `receipt-logo-${Date.now()}.png` — **a new temp file every print, never cleaned up**.
3. `serializePrintJob` (`types/printer.ts:395-420`) char-by-char concat + btoa — only for `generic_escpos`, which is dead (§2.2).

`padTwoColumn` (`StarXpandRenderer.ts:586-589`) is trivial and lives only on the non-graphics `renderNode` path (`:404-414`) — **currently unreachable** since graphics mode is forced.

**Hidden queue-store cost:** documents (including full base64 logo per copy) are stored in `usePrintQueueStore.jobs`; every enqueue re-sorts the whole array (`usePrintQueueStore.ts:56-61`) and re-triggers zustand persist stringify of retained jobs (`:238-252` keeps queued/failed/processing). **`clearCompleted()` has zero callers** — completed jobs accumulate in memory all session; failed jobs (cap 50, `:43`) with embedded logos persist to MMKV.

### 2.2 Landi vs Star vs NetworkDriver vs Dejavoo

| Path | Render cost (JS thread) | Transport | Blocking |
|---|---|---|---|
| Landi builtin (`LandiDriver.ts`) | Near-zero: filter + `JSON.stringify(doc)` (`:89-119`) | RN bridge → native | Native `printExecutor` single thread (`LandiPrinterModule.kt:77-78`); JS free |
| Star network (`StarMicronicsDriver.ts`) | Heavy: Skia raster + sync PNG encode/chunk | StarIO10 TCP, fresh open/print/close per job (`:225-247`) | Skia/encode blocks JS; per-IP `async-mutex` serializes (`starPrinterMutex.ts`) |
| NetworkDriver ESC-POS (`NetworkDriver.ts`) | — | **STUB — `initialize()`/`printRaw()` throw "not yet implemented"** (`:13-23`) | Dead path: `generic_escpos` printers cannot print at HEAD |
| Dejavoo (`DejavooDriver.ts`) | Cheap XML build (`:110`) | `fetch` POST, **no timeout** (`:120-127`) | Can hang until OS TCP timeout; drain slot recovered only by 30s force-release |

**Landi filters image/barcode — confirmed at HEAD, both sides:**

```ts
// LandiDriver.ts:13
const UNSUPPORTED_LANDI_NODES = new Set(["barcode", "image"]);
```
```kotlin
// LandiPrinterModule.kt:424-426
"image" -> {
    // TODO(landi-logo): VectorPrinter currently has no bitmap API exposed
```

Landi native runs prints on a dedicated `Landi-Print` daemon thread and drawer/status on a separate `Landi-Drawer` thread so drawer kicks aren't blocked by a print (`LandiPrinterModule.kt:66-80`).

### 2.3 Queued, not awaited

Callers are never blocked by physical printing. `printReceipt` builds data, enqueues, kicks the drain, returns immediately:

```ts
// PrinterService.ts:147-159
const job = createJobForPrinter(printer, templateData, 'receipt', 'normal', order.id, 'receipt')
usePrintQueueStore.getState().enqueue(job)
...
this.ensureProcessing()
return true
```

The `await PrinterService.printReceipt(...)` in `PaymentSuccessView.tsx:262` awaits only template-build + enqueue (ms of JS). Global job array, **per-printer drain loops** (`PrinterService.ts:66-69`, `drainPrinter` `:823-883`), one job at a time per printer (sequential `await processJob(job)` `:865`), different printers in parallel. Priority sort: high < normal < low then FIFO (`usePrintQueueStore.ts:36-61`). Queue survives restarts (processing→queued crash recovery `:253-262`).

### 2.4 Timeout / retry / offline mid-rush

- Star SDK timeouts (`starPrinterFactory.ts:39-44`): open **12s**, getStatus 5s, print **30s**.
- Star "in use" backoff (`StarMicronicsDriver.ts:18-19`): `[500,1000,2000,4000,6000]ms ±20%` ≈ **13.5s max** → `StarPrinterBusyError`.
- Queue retries (`usePrintQueueStore.ts:42-44`): `MAX_RETRIES = 3`, `RETRY_DELAYS = [1000,3000,9000]`. Quirk: readiness check `Date.now() - j.createdAt < delayMs * j.attempts` (`:107-112`) — backoff anchored to **creation time**, not last failure, so after a 12s connect-fail the retry is usually immediate.
- Drain wakeup: 250ms poll kick (`PrinterService.ts:76`, `:854-860`). Stuck-drain force-release **30s** (`PROCESSING_STUCK_MS` `:75`, `:830-841`). "Star SDK not ready" → silent re-queue + 3s retry, no attempt consumed (`:941-951`).
- **Offline mid-rush: caller gets `true`; the job burns 3 attempts (each up to 12s open-timeout inside the drain), then permanently `failed`.** Receipt jobs auto-reassign to another connected receipt printer (`:976-999`). User notification: one error toast **deduped to ≤1 per 30s** (`FAILURE_TOAST_DEDUP_MS` `:74`, `:1009-1026`). `retryAllFailed`/`getFailedJobs` exist in the store, but **grep found zero UI consumers of `usePrintQueueStore`** — no screen/banner to view or retry failed prints. The queue backs up silently.
- If a driver promise never settles (Dejavoo no-timeout fetch, Landi native hang), the job is stuck in `processing` forever (no job-level watchdog); only the drain slot recovers after 30s.

### 2.5 Split payments — N receipts

```ts
// PrinterService.ts:214-226
async printAllSplitReceipts (order, location) {
  const payments = (order.payments ?? []).filter(p => !p.isVoided)
  ...
  for (const p of payments) {
    const sent = await this.printSplitPaymentReceipt(order, p, location)
```

Sequential loop, but each iteration awaits only enqueue. Each `printSplitPaymentReceipt` re-runs the **full** `buildReceiptTemplateData` (incl. `calculateOrderTotals` over all items) per payment → **O(N_payments × N_items) at enqueue**, plus 1–2 jobs each (`:191-205`). Per-portion auto-print also fires after each split portion (`usePaymentStore.ts:1217-1227`); the combined receipt is then skipped (`PaymentSuccessView.tsx:66-77`). A 4-way split with merchant+customer copies = **8 sequential physical prints** on the receipt printer's drain.

### 2.6 Kitchen tickets vs receipts

Different routing (kitchen: `routeKitchenItems` `PrinterService.ts:237-289`; receipts: `PrintRouter.ts:21-76`), independent per-printer drains — distinct devices can't delay each other. **Two real coupling paths:** (1) shared physical printer: kitchen enqueues at `'high'` (`PrinterService.ts:284`), receipts at `'normal'` (`:150`) — the sort puts every queued kitchen ticket **ahead of** the payment receipt (starvation on single-printer shops); (2) same IP, two configs: the Star mutex keys by `networkAddress` (`starPrinterMutex.ts:18-23`), serializing at the driver + up to 13.5s in-use backoff if a peer POS holds the printer. Also: `openCashDrawer` bypasses the queue but on Star contends on the same per-IP mutex as an in-flight print (up to 30s print timeout + backoff before the pop).

---

## 3. Drawer kick at HEAD

**Verdict: the May bug is FIXED in its core dimensions (standalone command, cash-gated, fires before/independent of the receipt), PARTIALLY overall: status is still never verified, and cash refunds never kick.**

### 3.1 Separate command, not appended to the receipt buffer

Central API `PrinterService.openCashDrawer()` (`PrinterService.ts:398-464`) — standalone driver call, no receipt document:

```ts
// PrinterService.ts:447-452
const driver = getDriver(printer)
if (!driver.isConnected()) { await driver.initialize(printer) }
await driver.openCashDrawer()
return true
```

The IR node `{type:"cash_drawer"}` exists (`types/print-document.ts:44`) and renderers can emit `ESC p 0 25 250` = `[0x1B,0x70,0x00,0x19,0xFA]` (`escpos/EscPosBuilder.ts:44-45`; `StarXpandRenderer.ts:270,510`) — but repo-wide grep finds **no template ever constructs it**. Those renderer cases are dead in practice.

**Ordering vs receipt:** the kick fires **before payment completion** and thus before any receipt print (`CashPaymentView.tsx:108-116`, excerpt in §1 step 3). Star caveat: `StarMicronicsDriver.openCashDrawer` shares the per-printer mutex with prints (`StarMicronicsDriver.ts:289-290`) — a mid-print kitchen ticket on the same unit delays the pop; in the cash flow the kick is issued first, so it normally wins.

### 3.2 Gating — exactly 3 call sites repo-wide

`CashPaymentView.tsx`, `NoSaleModal.tsx`, `PayInOutModal.tsx`.

| Scenario | Kicks? | Evidence |
|---|---|---|
| (a) Full cash payment | ✅ | `CashPaymentView.tsx:111`; reached only via cash route (`ItemsReviewView.tsx:86`) |
| (b) Card payment | ✅ no kick | `CardPaymentView.tsx`/`ManualCardEntryView.tsx`: zero `openCashDrawer` refs |
| (c) Split — cash portion | ✅ | same handler; `CashPaymentView.tsx:65,76-78` split-aware total |
| (c) Split — card portion | ✅ no kick | CardPaymentView path |
| (d) Cash refund | ❌ **GAP — never kicks** | grep `drawer\|kick` over SimpleRefundModal/AdvancedRefundModal/RefundModal/refundService/useRefundMutation = 0 hits. Also `trackCashRefundInDrawer` (`services/paymentService.ts:366`) is **dead code — zero callers** → cash refunds aren't ledgered either |
| (e) Card refund | ✅ no kick | same zero-match grep |
| (f) Manual open | ✅ awaited, PIN-gated | `NoSaleModal.tsx:133-138` (after `recordDrawerOperation('no_sale')` `:123-131`, PIN `:108-114`); `PayInOutModal.tsx:169-176` (kicks pay_in/pay_out, deliberately not cash_drop); manual button `CashPaymentView.tsx:143-149` |

### 3.3 Status verification — still fire-and-forget ❌

- Star: probe reads the sensor — `starPrinterHealthCheck.ts:170` `const drawerOpen = !!(status as any).drawerOpenCloseSignal;` — but the consumer **discards it**: `handlePrinterOnline` (`:224-265`) stores only `isConnected/lastStatus/errorCount` (`:238-242`). No drawer-left-open detection, no post-kick verification.
- Landi: no drawer status API used; `LandiPrinterModule.kt` only `CashBox.openBox()` (`:673,:689`); `getPrinterStatus` (`:180-197`) is printer online/paper only.
- ESC/POS DLE EOT (0x10 0x04): absent from `services/` and `native/`.
- `CashDrawerStatusBar.tsx:47` "isOpen" is the **session** status, not physical state.
- NoSaleModal shows "Cash drawer opened." success toast (`:140-144`) **even if the kick failed** (error swallowed at `:134-138`). Auto-open failure on the cash path = `console.warn` only, no operator toast.

### 3.4 Hardware path per driver

- **Landi**: separate native call — `LandiDriver.openCashDrawer()` (`LandiDriver.ts:122-132`) → `LandiPrinterModule.openCashDrawer` (`LandiPrinterModule.kt:660-722`) via omnidriver **CashBox** (`cb.openBox()` `:673`), reflection fallback to `Printer.openCashDrawer()` (`:701-714`). Latency engineering: dedicated `drawerExecutor` thread so kicks don't queue behind vector prints (`:70-80`), plus `warmCashBox()` after every print to avoid "100-500ms re-acquisition" (`:726-739`, called `:301,:498`).
- **Star**: `react-native-star-io10` **DrawerBuilder** drawer-only document (`StarMicronicsDriver.ts:270-285`, `Action.Open`, channel No.1, 200ms on-time); `actionOpen()` avoided due to SDK circular-dep crash (`:265-269`).
- **NetworkDriver**: throws "not yet implemented" (`NetworkDriver.ts:31-33`); **Dejavoo**: throws "do not support external cash drawers" (`DejavooDriver.ts:145-146`); PrinterService's fallback loop tolerates both (`:453-459`).

---

## 4. Card handoff cycle

**Per premise correction C-1: the deep-link/backgrounding cycle does not exist at HEAD.** Path selection is pure config — `selectedStation.payment_terminal.terminal_type` at `components/bill/ paymentView/CardPaymentView.tsx:297`:

```ts
if (terminal.terminal_type === "castles") {   // → TCP socket, CardPaymentView.tsx:297-505
...
// ============ DEJAVOO BRANCH (default) ============  // → SPIN HTTPS, :507-546
```

Same dispatch duplicated in `hooks/usePaymentTerminal.ts:377-380`. Both paths hold the app foreground while the customer taps; the actual per-card work is: Castles connect-if-needed + `resetTerminalState` + counter init (`CardPaymentView.tsx:317-332`), pre-swipe journal MMKV writes (`:346-353,:380-386`), the terminal await (2–120s, customer-bound), then the process_payment RPC + receipt enqueue.

**Per-card background/foreground cycle cost: zero. At 15 payments/hour: zero repeated cycle cost.** The machinery below fires only on genuine backgrounding (app switch, screen off) — quantified here because it was the brief's question:

**On background (hypothetical/genuine, per event):**
- (a) **Synchronous MMKV flush — confirmed.** `app/_layout.tsx:856-862`:

```tsx
const sub = AppState.addEventListener("change", (state) => {
  if (state === "background" || state === "inactive") {
    flushAllPendingWrites();
  }
});
```

`lib/storage.ts:260-270` flushes every per-key lodash debouncer (300ms window, `:246-254`) and sets `isFlushing = true` so lazy writers `JSON.stringify` + `storage.set` **synchronously on the JS thread** (`:322-336`). Scope: **26 MMKV-persisted stores**; order-store payload per the code's own comment is **50–300KB** ("~150ms of JS thread blocking" per 10 stringifies, `storage.ts:294-297`); partialize bounded to `persistableOrderIds` ∪ active ∪ workingSet ∪ unsynced (`useOrderStore.ts:17429-17462`).
- (b) Realtime channel teardown — **does not happen** (correction C-2).
- (c) `clearInactiveOrders()` — synchronous O(all orderIds) GC scan (`PosSyncProvider.tsx:794-805`, fires only on `background`, not `inactive`).
- (d) Castles `getSharedCastlesService().suspend()` (`PosSyncProvider.tsx:810-812` → `castles-service.ts:533-552`: return2Idle + socket close, watchdog stopped). **Suspend does not check `isProcessingPayment`** — "Any in-flight `_sendAndReceive` will receive a close event and reject" (`:538-539`) — a mechanism candidate for the tracked crash-during-processSale race if the app ever backgrounds mid-sale.
- (e) Timers paused: terminal health check (90s interval, `terminalHealthCheck.ts:327-333`), Star health check (2min, `starPrinterHealthCheck.ts:494-505`), Star discovery (5min, `StarPrinterDiscoveryService.ts:116-126`), heartbeat paused + 2-min `sendGoingOffline` timer armed (`heartbeat.ts:117-149`), draft cleanup + print queue stopped (`_layout.tsx:875-891`), offline-sync timestamp (`offlineSyncService.ts:637-640`).

**On resume (per event):**
- Per-channel handler ×2 (`useRealtimechannel.ts:329-364`): dead → resubscribe after 1s (`removeChannel` → `realtime.setAuth()` → new subscribe); alive → `setAuth()` refresh only. Floor channel SUBSCRIBED transition → `loadFloorPlanStatusIfStale(30_000)` catch-up (`useFloorRealtime.ts:204-219`).
- **PosSyncProvider >2min gate — confirmed.** `contexts/PosSyncProvider.tsx:754-765`:

```ts
const dataAge = Date.now() - (cached?.state.dataUpdatedAt ?? 0);
if (dataAge > 2 * 60 * 1000) {
  queryClient.invalidateQueries({ queryKey: orderQueryKeys.active(storeSettings.selectedStore.id) });
}
```

Trips → refetch `get_active_orders_v1` (limit 200, `useOrdersQuery.ts:26,80-84`, deadline 20s), fingerprint-gated hydrate (`:146-155`). Doesn't trip → nothing. Also: `refreshSelectedStore` at 5min staleness (`:737-740`); Castles `resume()` + pre-warm connect (`:771-793`).
- **MMKV rehydrate: cold-start only** — no `.rehydrate()` call exists repo-wide; zustand hydrates once at store creation.
- **Clerk `getToken({skipCache:true})` — forced network round trip on EVERY foreground**, no time gate (`components/auth/ClerkSessionKeeper.tsx:62-68`, offline-skip only `:41`).
- Others: session-kick `validateSession` RPC gated 5min (`useSessionKickListener.ts:330-341`); offline-sync `connectionQuality.reset()` only if backgrounded >60s + unconditional `NetInfo.fetch()` (`offlineSyncService.ts:641-655`); terminal + Star health immediate probes; heartbeat immediate Supabase write; draft cleanup/print queue restart; business-day check (`useBusinessDayRollover.ts:70-73`); order reconcile 5s-debounced, **dark-shipped** behind `EXPO_PUBLIC_CART_SHAPE_RECONCILE`/`EXPO_PUBLIC_ORDER_HEADER_RECONCILE` (`useOrderReconcile.ts:34-35,84-92`; `orderHeaderReconcile.ts:90-96`).

---

## 5. Result handling

**No polling loop exists anywhere for terminal results. No Supabase broadcast/webhook is involved.**

- **Castles (TCP)**: single request/response — `processSale` writes one JSON frame and awaits the reply with `config.timeout ?? CASTLES_SOCKET_TIMEOUT_MS = 120_000` (`castles-service.ts:821`; `types/castles.ts:297`; `CardPaymentView.tsx:321` passes `timeout: 120_000`). Mutex acquire bounded at 60s (`castles-service.ts:97,792`). Timeout/error → `_forceReturn2Idle()` on a fresh socket (`:833-834,:866-868`); success → `_tryReturn2Idle()`. Cashier-cancel-on-terminal returns `E0000008: "User cancelled"` (`castles-response-mapper.ts:71`) → `showDeclined()` + error modal (`CardPaymentView.tsx:398-414`). Worst-case UI block ≈ 120s, then auto-recovery. Crash-mid-capture covered by the pre-swipe journal (`initiated` → `terminal_approved`/`failed`, `CardPaymentView.tsx:335-353,380-386,404-407`).
- **Dejavoo (SPIN)**: single blocking HTTPS POST — the SPIN proxy long-holds the request; the response body IS the result. `lib/payments/dejavoo-spin-api.ts:560-564`:

```ts
const response = await fetch(url, { method: "POST", headers: {...}, body: JSON.stringify(request) });
```

**No `setInterval`, no status polling — and no `AbortController`/client deadline** on this fetch. Server-side `SPInProxyTimeout` defaults to 120s (`timeout: 120`, `:192`). If the proxy never responds, the UI stays in "processing" until the OS network-stack timeout (statically unquantifiable). Flag: the `loadTerminal` local-credentials path hard-codes sandbox `baseUrl = "https://test.spinpos.net"` with a TODO (`:180-186`).
- **Manual unblock**: a "Cancel Transaction" button renders during `processing` (`CardPaymentView.tsx:1302-1334`): Castles → `gracefulDisconnect()` (return2Idle + close, `castles-service.ts:482-508`; pending `processSale` rejects); Dejavoo → `POST /v2/Payment/AbortTransaction` (`:1319-1321`), then `setStatus("ready")` + `showIdle()` to release the CFD (`:1327-1330`). Terminal-connectivity errors short-circuit to toast + sheet close (`:584-594`).

---

## 6. Startup/TTI residual

### Phase A — synchronous JS module evaluation [BLOCKS FIRST PAINT]

**A1.** `lib/storage.ts` import: 3 MMKV instances (`:35-56`); `reconcileEnvironmentOnBoot()` (`:193` — sync MMKV reads/writes; on env switch `clearAll()` ×2); `probeSecureStorage()` (`:234` — encrypted write+read-back).

**A2.** **26 of 63 stores rehydrate synchronously at module eval** (24× `createLazyPersistStorage`, 1× `mmkvStorage`, 1× `secureMMKVStorage`). All adapters have synchronous `getItem` (`storage.getString` + `JSON.parse`, `lib/storage.ts:349-359`); `app/_layout.tsx` statically imports most of the store graph. Big stores: `useOrderStore` (~17.5K lines, payload bounded by partialize), `useKDSStore` (`:3724`), `useFloorPlanStore` (`:2265`), `useScheduleStore` (`:1691`), `useTimeclockStore` (`:895`). `useOrderStore.merge` does 3 O(n·items) rebuild passes at hydration (`:17489-17524`: `dbOrderIdIndex`, `persistableOrderIds` incl. per-item scans, `_workingSetLookup`).

**A3.** `_layout.tsx` module scope: `Sentry.init` (`:115-148`), logger bridge (`:153`), global error handler (`:165`), CFD display require (`:238-240`), `initLogCollector` (`:243`), `initImmer` (`:245`).

### Phase B — RootLayout first render

**B1.** One guaranteed null frame — `_layout.tsx:893` `if (!isColorSchemeLoaded) { return null; }` (set in a layout effect, `:627-637`).

**B2.** [BACKGROUND] Perf F2 deferral shipped — `_layout.tsx:640-651`:

```tsx
// Perf F2: deferred past first paint. This used to run synchronously
// inside the layout effect and blocked the first frame —
const bootTask = InteractionManager.runAfterInteractions(() => {
  useOrderStore.getState().startDraftCleanup();
  ...
  PrinterService.startProcessing();
```

Same block: payment-journal scan + `check_recent_payment` RPCs **serial per journal** (`:727-792`), refund-journal scan (`:798-848`). Skipped on KDS/CFD.

**B3.** [BACKGROUND, but can restart the app] Update checks (`:612-625`): `Updates.checkForUpdateAsync` → `fetchUpdateAsync` → **`reloadAsync()` silent restart** (`:222-232`) — an OTA landing during boot doubles the cold start.

### Phase C — provider tree

**C1.** **ClerkGate is the only render-gating provider** — `_layout.tsx:509-540`: spinner until `isLoaded`; grace spinner if signed-out-but-was-signed-in. Recent fixes present: `getToken({skipCache:true})` (`:442`), 30s online grace (`:356`), offline-never-expire (`:460-463`), `__experimental_resourceCache` = MMKV (`:314-319`) so `isLoaded` resolves from cache offline. The whole PosSyncProvider warm-up cannot start until Clerk `isLoaded`.

**C2.** PosSyncProvider renders children immediately (`return <>{children}</>`, `PosSyncProvider.tsx:852`); all init is effects:
- [BACKGROUND, parallel] `useOrdersQuery` → `get_active_orders_v1` (limit 200, deadline-wrapped, staleTime 2min, `useOrdersQuery.ts:64-143`).
- [BACKGROUND] `initializeOfflineSync()` (`offlineSyncInit.ts:322-486`): id registry, NetInfo.configure, `loadQueueFromStorage()` (MMKV), listeners.
- **[BLOCKS — sync JS at provider mount] `getStorageSizeStats()`** (`PosSyncProvider.tsx:481-509`) — synchronously reads **every value in all 3 MMKV buckets** (`lib/storage.ts:714-739`), un-deferred, on the JS thread.
- [BACKGROUND, serial] Device detection chain (`:154-247`): detect → await stations DB update → await `fetchPrinters` → await station row fetch → Landi pre-warm — **4+ serial RTTs** before printer readiness.
- [BACKGROUND] terminal health check (`:250-264`), Castles USB auto-connect (`:270-286`), Star health + discovery (`:289-298`).
- [BACKGROUND, deferred, serial] employee sync: `InteractionManager` → `syncEmployees` → `hydrateActiveShifts` (`:456-468`).
- [BACKGROUND, parallel] menu sync `usePosSync` — `Promise.all` of 4 requests, staleTime Infinity (`usePosSync.ts:38-80,142`).
- [BACKGROUND, deferred, internally serial] Perf F3 floor plan owner (`:699-722`) — but `syncFloorPlans` itself is a **5-step serial await chain** (`:372-421`): `getLocationFloorPlans` → `setActiveFloorPlan` → `prefetchFloorPlans(ALL plans)` → `_stripOrphanedSessions` → `Promise.all(waitlist, reservations)`.

### Phase D — auth chain to first interactive tap

**D1.** `app/index.tsx:15-38` spinner until Clerk `isLoaded`, then Redirect → `/pin-login` (store persisted) / `/store-select` / `/login`.

**D2.** PIN login (`app/(auth)/pin-login.tsx:363-553`): **fast path** `performOptimisticSignIn` (`:382-395`) — cached-PIN, navigates immediately, zero blocking network. **Blocking path** (cache miss): `await getDeviceInfo()` → RPC `pos_staff_login_v2` (`:420-432`) → possible employee re-sync (`:493-532`) — up to **3 serial round trips** before navigation. On success `markStart("pos.boot_to_order")` (`:547`).

**D3.** `(main)/_layout.tsx` mount: redirect guards (`:224-237`); **`useTableSessionInit` at `:144`** (`hooks/useTableSessionInit.ts:50-77`: `registerAllSessionSideEffects()`, `setupTableOrderPrefetch()`, service-charge subscriber, `_patchSessionsFromTables`, stuck-session watchdog — all sync in a mount effect, singleton-guarded). LocationRealtimeProvider subscribe [BACKGROUND] (`:278-285`); cash-drawer hydrate effect (`:153-168`).

**D4.** Landing = `home.tsx` (MainMenu), not the register. Register (`order-processing.tsx:678-696`) uses staged rendering: Stage 0 skeleton → Stage 2 full; `markEnd("pos.boot_to_order")` at stage 2 (`:691`). [BLOCKS INTERACTIVITY]: first register tap = renderStage 2 (two nested double-rAF frames after mount).

### What the cold-start fix actually shipped

- **`usePreviousOrdersBootstrap` no longer exists.** Replaced by `usePreviousOrdersListSync`, mounted only by `app/(main)/previous-orders.tsx:304` and `components/menu/PreviousOrdersSection.tsx:191` — previous orders are **lazy on screen entry**, off the boot path (+ MMKV offline snapshot cache `stores/previousOrdersOfflineCache.ts`).
- Perf F2 (journal scans/draft cleanup deferred, `_layout.tsx:640`), F3 (floor-plan/tax dedupe + deferral, `PosSyncProvider.tsx:453-455,697-702`), inventory lazy in `inventory/_layout.tsx` (`:539-549`), background GC-not-purge (`:794-805`) to avoid the documented ~1hr-idle cold-start lag.
- **Stale doc note**: CLAUDE.md/memory say side-effect registration + tableOrderPrefetch live in `_layout.tsx` — both moved to `useTableSessionInit` mounted from `app/(main)/_layout.tsx:144`.

### Still serial / deferrable (evidence only)

1. 26-store sync MMKV rehydrate at module eval (no Metro `inlineRequires` override — `metro.config.js` is stock; `_layout.tsx` static imports defeat laziness anyway).
2. `getStorageSizeStats()` full-bucket sync read at PosSyncProvider mount.
3. Device-detection 4+-RTT serial chain; `syncFloorPlans` 5-step serial incl. prefetch of ALL plans before waitlist/reservations; `syncEmployees → hydrateActiveShifts` serial.
4. Blocking PIN path: 3 serial RTTs on cache miss.
5. Boot `check_recent_payment` loop serial per journal (`_layout.tsx:731-787`).
6. `checkForUpdate` can `reloadAsync()` mid-boot.

Existing measurement hooks: `lib/perf.ts` spans (`pos.boot_to_order` = PIN success → register stage 2 + double-rAF; `pos.table_open`, `pos.add_to_cart`); Sentry `reactNavigationIntegration({enableTimeToInitialDisplay:true})`, `enableNativeFramesTracking`, `appHangTimeoutInterval: 2` (`_layout.tsx:111-148`); MMKV >10MB warning (`PosSyncProvider.tsx:494-507`).

---

## 7. Background/foreground ledger

**Total: 15 `AppState.addEventListener("change", ...)` call sites; ~14 live listener instances on a POS station** (realtime hook = 1 per mounted channel ×2; CFD/KDS ones mount only in those modes). TanStack `focusManager` is deliberately NOT wired to AppState (`contexts/TanstackProvider.tsx:18-24`). Reminder per C-1: these fire on genuine backgrounding only — not per card payment.

| # | Listener | active→bg | bg→active | Gates | Cost class |
|---|---|---|---|---|---|
| 1 | `app/_layout.tsx:856` MMKV flush | `flushAllPendingWrites()` — **synchronous** debounce flush + lazy-writer stringify (`lib/storage.ts:260-270,322-336`) | — | none; fires on `background` AND `inactive` | heavy-if-dirty (order-store snapshot 50–300KB) |
| 2 | `app/_layout.tsx:876` draft-cleanup + print queue | stop intervals | restart intervals (may immediately process queued job) | `!isKDS && !isCFDMode` | trivial |
| 3 | `PosSyncProvider.tsx:727-824` central hub | `clearInactiveOrders()` sync O(n) scan (`:803-805`, `background` only, skipped if `isRecentlyNavigated()`); Castles `suspend()` (`:810-812`) — **does not check isProcessingPayment** | `refreshSelectedStore` (≥5min, `:737`); `loadFloorPlanStatusIfStale` (30s TTL, `:748`); orders invalidate (>2min, `:760-764`); Castles `resume()` + pre-warm connect (`:771-792`) | as listed | heavy after >2min idle; moderate on quick round-trips |
| 4 | `useRealtimechannel.ts:334-366` ×2 | **nothing** (early-return `:335`) | dead → resubscribe after 1s; alive → `setAuth()`; floor SUBSCRIBED → staleness-gated catch-up RPC (`useFloorRealtime.ts:207-222`); while dead: 5s fallback poll (`:239-246`) | channel-state branch | moderate–heavy (2–4 network RTs/resume) |
| 5 | `ClerkSessionKeeper.tsx:62-68` | — | `getToken({skipCache:true})` — **forced network exchange, every foreground**, only offline-skip (`:41`) | none time-based | heavy (external RT, latency uncontrolled) |
| 6 | `useSessionKickListener.ts:330-347` | — | `check_device_session_status` RPC, 500ms deferred | **≥5min** since last L3 validation | moderate/trivial |
| 7 | `useOrderReconcile.ts:84-93` | — | push+pull reconcile passes over all owned/active orders (N RPCs) | 5s debounce + in-flight guard + **env flags off by default** (`orderHeaderReconcile.ts:90-96`) | heavy when flags on; trivial off |
| 8 | `useBusinessDayRollover.ts:70-74` | — | `checkRollover()` — local date math; network only on actual rollover | enabled `!isKDS` | trivial |
| 9 | `offlineSyncService.ts:635-657` | timestamp | `connectionQuality.reset()` if bg >60s (`deadlines.ts:9`); unconditional `NetInfo.fetch()` → may kick `processQueue()` | 60s | trivial–moderate |
| 10 | `heartbeat.ts:117-149` | pause 60s interval; arm **2-min** `sendGoingOffline` timer | cancel timer; **immediate** heartbeat Supabase write + restart | 2min offline threshold | moderate (1 DB write/resume) |
| 11 | `terminalHealthCheck.ts:316-335` | clear interval | **immediate** `performHealthCheck()` + restart (90s default); no-ops if suspended/processing (`:43-60`) | — | moderate (probe + `update_terminal_health` RPC) |
| 12 | `starPrinterHealthCheck.ts:494-508` | clear interval | **immediate** full round — sequential TCP probe per Star printer (`:475-483`) + DHCP recovery | — | moderate–heavy (N sequential LAN probes; offline printer = slow) |
| 13 | `StarPrinterDiscoveryService.ts:116-129` | clear interval | restart interval, **no** immediate round (deliberate stagger) | 5min interval | trivial at transition |
| 14 | `useKDSTimer.ts:23-42` (KDS only) | clear 1s tick | immediate tick (board-wide re-render) + restart | — | trivial/moderate render fan-out |
| 15 | `useCFDWSClient.ts:293-309` (CFD only) | eager WS close (RN 0.76 Hermes bug #49243 workaround) | full WS `connect()` | — | trivial/moderate |

**Cross-cutting notes:**
- NetInfo listeners (`offlineSyncService.ts:618` + 10s fetch poll `:621-631`, `useRealtimechannel.ts:312` ×2, `terminalHealthCheck.ts:376`, `starPrinterHealthCheck.ts:539`) can **double-fire with their AppState twins** — Android frequently reports a connectivity edge after process resume.
- Most listeners treat `inactive` = `background`, but PosSyncProvider's background branch (#3) fires **only** on `background` — iOS `inactive` blips still trigger the MMKV flush (#1) but skip GC/suspend.
- Navigation focus/blur listeners do NOT fire on app background (react-navigation focus is AppState-independent); `BatchoutPanel.tsx:207-209`'s comment exists precisely because of this.

---

## The payment moment — total blocking ms budget

### Cash

| Phase | Blocking? | Budget |
|---|---|---|
| Tap → success view (steps 4–10, §1) | YES — synchronous JS: 3× `calculateOrderTotals`, Immer set on the ~17.5K-line store, 2 MMKV journal writes, `itemAllocations` build | **Best case: single-digit-to-tens of ms** (unmeasured — needs span; scales with item count) |
| Drawer pop (physical) | NO (fire-and-forget, pre-payment) | Landi warm: warm CashBox handle, dedicated thread → near-instant. Landi cold: full omnidriver init first. Star: DrawerBuilder doc behind the per-IP mutex — **worst case ≈ 30s print timeout + 13.5s busy backoff** if a kitchen ticket is mid-print on the same unit |
| Payment RPC | NO (detached; deadline 20s → `verifying` recovery) | 0 ms perceived |
| Receipt on paper | NO (queued) | but success-view mount runs `buildReceiptTemplateData` ×2 **synchronously**, and on Star the drain's Skia raster + sync `encodeToBase64` per ~1200px chunk (3–4 chunks) lands on the JS thread **in the same window as the success-view render** — the one place cash payments can visibly jank |
| Worst case (cash) | — | totals math on a large order + 2× template build + 3–4 sync PNG encodes contending in one frame window; plus the background RPC storm (process_payment + item status + closeCheck + FULL_PAYMENT sync + drawer ledger + floor refresh within ~1s) contending on bad WiFi |

### Card

| Phase | Blocking? | Budget |
|---|---|---|
| Terminal await | YES — in-app await, spinner (no backgrounding, per C-1) | Best case 2–10s (customer-bound, irreducible). Castles worst case **120s** socket timeout (`types/castles.ts:297`) + 60s mutex bound, then `_forceReturn2Idle` recovery. Dejavoo worst case **unbounded** — no client timeout on the fetch (`dejavoo-spin-api.ts:560-564`); server-side 120s SPInProxyTimeout only if the proxy behaves |
| Escape hatch | — | Cancel Transaction button during `processing` (`CardPaymentView.tsx:1302-1334`) |
| Post-approval | same as cash | RPC detached, receipt queued |
| Background/foreground cycle | — | **0 ms/transaction** (no backgrounding); at 15 payments/hour: 0 |

---

## Top findings ranked by contribution to perceived register slowness

1. **Dejavoo SPIN sale fetch has no client timeout** (`dejavoo-spin-api.ts:560-564`, no AbortController; server default 120s at `:192`). A misbehaving proxy leaves the register in "Processing…" for the OS TCP timeout — the single worst unbounded stall in the payment moment. (Cancel button exists but requires the cashier to know to use it.) Also flags: hard-coded sandbox `test.spinpos.net` in the local-credentials path (`:180-186`).
2. **Star receipt rasterization is synchronous JS-thread work at the success moment** — forced graphics mode (`StarXpandRenderer.ts:74-76`), ~60–130 Skia draw calls + 3–4 synchronous `encodeToBase64` PNG encodes per receipt (`SkiaTicketRenderer.ts:344`), ×2 copies, kicked via `queueMicrotask` in the same frame window as the success-view render and `buildReceiptTemplateData` ×2. This is the most likely source of visible post-tender jank on Star sites.
3. **Genuine-resume stampede** (per event, not per payment): sync MMKV flush up to ~300KB stringify on background (`_layout.tsx:856`, fires on `inactive` too) + sync `clearInactiveOrders` scan; on foreground an ungated Clerk `getToken({skipCache:true})` network exchange (`ClerkSessionKeeper.tsx:62-68`) + 2× `setAuth`/resubscribe + heartbeat write + immediate terminal probe + N sequential Star printer probes + possible 200-order refetch — ~5–8 concurrent network calls with registration-order-dependent interleaving. Hits the first tap after every pocketing/screen-off.
4. **Shared-printer priority starvation + drawer-mutex contention**: kitchen tickets enqueue `'high'` vs receipts `'normal'` (`PrinterService.ts:284` vs `:150`) — on single-printer shops every queued kitchen ticket jumps the payment receipt; the Star drawer kick shares the same per-IP mutex as prints (`StarMicronicsDriver.ts:289-290`) — worst case ~30s + 13.5s before the drawer pops mid-rush.
5. **Boot-path residuals**: 26-store synchronous MMKV rehydrate at module eval (incl. `useOrderStore.merge` 3× O(n·items) rebuild), `getStorageSizeStats()` full-bucket sync read at PosSyncProvider mount (`PosSyncProvider.tsx:481-509`), 3-serial-RTT blocking PIN path on cache miss, device-detection 4+-RTT serial chain delaying printer readiness, OTA `reloadAsync()` double cold start.
6. **Split payments multiply enqueue cost**: full `buildReceiptTemplateData` (incl. `calculateOrderTotals` over all items) re-runs per payment (`PrinterService.ts:214-226`) — O(N_payments × N_items) synchronous JS — and a 4-way split with both copies = 8 sequential physical prints on one drain.
7. **Silent print-failure mode**: 3 attempts (each up to 12s Star open timeout) → permanent `failed`; one toast per 30s; **zero UI consumers of `usePrintQueueStore`** — no failed-jobs screen/retry surface; retry backoff anchored to `createdAt` (effectively no backoff after slow failures); `clearCompleted()` never called (session-long job accumulation + MMKV persist of failed jobs with embedded logos); temp `star-ticket-*.png` / `receipt-logo-*.png` never cleaned.
8. **Castles `suspend()` on background doesn't check for an in-flight sale** (`PosSyncProvider.tsx:810-812`, `castles-service.ts:538-539`) — a genuine backgrounding mid-`processSale` rejects the transaction client-side while the terminal may still capture; mechanism candidate for the tracked TCP-in-flight recovery race.
9. **Non-perf gaps worth flagging from the drawer audit**: cash refunds neither kick the drawer nor ledger (`trackCashRefundInDrawer` dead at `paymentService.ts:366`); drawer status read (`drawerOpenCloseSignal`, `starPrinterHealthCheck.ts:170`) but discarded; NoSaleModal success toast even on failed kick; `NetworkDriver` ESC/POS entirely stubbed (`generic_escpos` printers cannot print at HEAD).

---

## Unknowns requiring runtime measurement

| # | Unknown | Resolving measurement |
|---|---|---|
| 1 | Duration of the awaited cash window (3× totals + Immer + MMKV journal), vs item count | `lib/perf.ts` span around `handlePaymentCompletion` (`usePaymentStore.ts:977`) |
| 2 | JS-thread stall per Star receipt raster (Skia draws + `encodeToBase64` per chunk) | `pos.print.raster` span around `renderTextBlocksToImage`; native frame drops at success-view mount with auto-print on |
| 3 | Drawer-pop latency: Landi cold (`LandiDriver.ts:123-127` empty-config init path) vs warm; Star with a queued print in flight | timestamp tap→physical kick; logcat `Landi-Drawer` timing |
| 4 | Whether `drawerOpenCloseSignal` is populated by TSP143 firmware over LAN (`(status as any)` cast) | log raw `getStatus()` payload on hardware |
| 5 | `flushAllPendingWrites` duration on background (pending payload dependent) | `performance.now()` delta at `_layout.tsx:858` per background event during a busy shift |
| 6 | `clearInactiveOrders` duration at end-of-shift order counts | timing wrap at `PosSyncProvider.tsx:804` with `orderIds.length` |
| 7 | Resume stampede total (concurrency/ordering across 14 listeners is registration-order dependent) | single AppState-active Sentry transaction with child spans (Clerk refresh, setAuth ×2, heartbeat, probes, refetch) |
| 8 | Clerk `getToken({skipCache:true})` foreground latency | breadcrumb timing in `ClerkSessionKeeper.refresh` |
| 9 | Whether channels are dead after short (5–15s) backgrounding (2 cheap `setAuth` vs 2 full resubscribes + catch-up RPC) | count the `__DEV__` branch logs at `useRealtimechannel.ts:351/359` over N cycles |
| 10 | Dejavoo fetch hang duration on unresponsive proxy (no client timeout) | pull terminal mid-sale; measure UI-unblock time vs the 30s drain force-release |
| 11 | Which payment RPC actually runs (`process_payment_v12` vs `v16`) per environment | runtime feature flag readout (`lib/network/featureFlags.ts`) |
| 12 | Production values of `EXPO_PUBLIC_CART_SHAPE_RECONCILE` / `EXPO_PUBLIC_ORDER_HEADER_RECONCILE` (flips ledger #7 between trivial and N-RPCs-per-resume) | check EAS production profile / `.env.production` |
| 13 | Post-payment background RPC storm behavior on bad WiFi (process_payment + item status + closeCheck + session sync + drawer ledger + floor refresh in ~1s) | network waterfall capture during tender on degraded WiFi |
| 14 | Whether shared receipt+kitchen printers exist in the fleet (decides if starvation finding #4 is live) | query `printers` config per location |
| 15 | Temp-file accumulation (`star-ticket-*.png`, `receipt-logo-*.png` in cacheDirectory) | inspect cache dir size after a busy day |
| 16 | MMKV persist cost of `print-queue-storage` with 50 failed logo-bearing jobs | measure `storage.setItem('print-queue-storage')` duration |
| 17 | Whether the heartbeat 2-min `sendGoingOffline` setTimeout fires under Android Doze/process suspension | background >2min, check `stations.is_online` server-side |
| 18 | Star resume health-check round duration with ≥2 printers, one unplugged (sequential probes) | time `performHealthCheckRound()` on-site |
| 19 | Clerk `isLoaded` duration cold (cache vs network) — not covered by `pos.boot_to_order` (starts at PIN success) | Sentry app-start transaction + ClerkGate breadcrumbs |
| 20 | Per-store MMKV rehydrate cost at module eval (payload varies by shift) | Hermes sampling profile over app start; per-key byte log (>10MB Sentry warning already exists) |
