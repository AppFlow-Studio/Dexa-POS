# QR Table Ordering — POS Surface Build (v2, grounded against site implementation)

## Context

QR at-table ordering is **live end-to-end on the site side** (DexaPOS-Website: storefront `/sites/[slug]/t/[token]`, dashboard `QrTableManager`, Supabase backend on staging `dfwqakoyittmrwbqvxgw`). Guest scans a tent, orders, pays; the order lands as `order_type='qr_dine_in'` linked via `orders.online_session_id`. Guest phone flow is QA'd (Haidar's E2E pass).

This ticket builds the **POS-facing surface** in Dexa-POS only. **No schema, RPC, token, or broadcast work** — everything server-side already exists (verified against the site repo's migrations).

**Hard invariant:** a QR order is "an order with a label," never a seated party. It never seizes/flips floor-plan dining state; `orders.session_id` stays NULL. Brand blue `#0C4FD1`, never teal. Bell is chrome, never a ticket state.

## Backend contract (verified from site migrations — wire only)

### QR code generation
- `generate_table_qr_code(p_floor_plan_object_id uuid, p_regenerate boolean=false)` → jsonb.
  - Grants: `authenticated` — POS staff session can call it directly. Enforces `authorize_location_access`, table category (`table`/`booth`), table active.
  - No regenerate + active code exists → `action:'reprint_existing'` with the **same** `token`/`token_version`.
  - `p_regenerate=true` → deactivates old rows (`is_active=false`, `rotated_at=now()`), inserts new row with `token_version = latest+1`, returns `action:'regenerated'`.
  - Returns: `id, table_label, token, token_version, is_active, scan_count, last_scanned_at, section_id, zone_name, capacity, location_id, merchant_id`.
  - **Returns the raw signed token only — NOT a URL.** Client must build the guest URL (below).
  - ⚠️ The RPC does **not** enforce the QR billing tier — the dashboard checks `getQrBillingGateStatus` before calling. POS mirror: check store config eligibility (see "Store config gate") before offering Print; do not rebuild billing logic.

### Guest URL (must match site exactly)
Site's `app/sites/lib/store-url.ts`:
- Base: `custom_domain` (add `https://` if bare) → else `https://{slug}.{ROOT_DOMAIN}` → else `{APP_URL}/sites/{slug}`.
- QR URL: `{base}/t/{encodeURIComponent(token)}`.
- POS needs a mirrored `buildQrTableUrl` util + a root-domain constant (same value as site's `NEXT_PUBLIC_ROOT_DOMAIN`; confirm the production value at implementation time, put it in `constants/`).

### Store config gate
`online_store_config` per location: `slug, custom_domain, store_name, is_active, accepts_dine_in, qr_kill_switch`. Guest scan fails unless `is_active && accepts_dine_in && !qr_kill_switch` — POS should read this row and disable/warn on Print if the store can't serve QR (prevents printing dead tents).

### Active-code state (per table)
Read `table_qr_codes` directly (same as dashboard): `select id, token, token_version, is_active, scan_count, last_scanned_at where floor_plan_object_id = X and is_active = true order by created_at desc limit 1`.

### QR On/Off per table (revoke pattern — no RPC exists)
- **Off** = update the active `table_qr_codes` row: `{ is_active: false, rotated_at: now() }` (copied from dashboard `revokeTableQrCode`). The printed tent keeps working only if re-enabled with the same token — it isn't; revoke kills it.
- **On** = call `generate_table_qr_code` again (new token_version → old printed tent is dead; UI must say "re-enabling requires printing a new tent").

### Orders
- `accept_online_order(p_order_id)` / `decline_online_order(p_order_id)` — already wired via `useOnlineOrderActions`.
- Order shape: `order_type='qr_dine_in'`, `orders.table_number` = table label, `orders.session_id` NULL, `orders.online_session_id` → guest session (which carries `floor_plan_object_id`, `table_label`, `table_qr_code_id`).

### Guest alerts (call-server bell)
- Raise is guest-side (`raise_qr_guest_alert`, anon) — POS never calls it. Server dedups by `session_id|alert_type` (re-raise refreshes `created_at`) and rate-limits — **do not re-implement dedup client-side**.
- `resolve_qr_guest_alert(p_alert_id uuid)` → jsonb — `authenticated`, location-authorized, **idempotent** (`idempotent:true` on re-resolve), records `resolved_by` from JWT sub. Returns `open_alert_count`.
- `get_qr_guest_alert_open_count(p_location_id uuid)` → `{open_alert_count}` — poll fallback only.
- **Realtime: the POS never calls `broadcast_qr_guest_alert_event`** (it's service_role-internal; raise/resolve RPCs call it themselves). The POS just **subscribes**: events arrive on the **existing** `location:{location_id}:orders` topic — the same private channel the POS already joins for order broadcasts — with event name **`qr_guest_alert_changed`**. Payload: `{operation: 'upsert'|'resolved', alert_id, status, alert_type, table_label, message, created_at, resolved_at?, resolved_by?, order_id, online_order_session_id, open_alert_count}`. Every payload carries the authoritative `open_alert_count` — trust it, don't count client-side.
- Alert list content: read `qr_guest_alerts` directly (`status <> 'resolved'`, location-scoped) — same as the dashboard does. Realtime payloads then patch the list.

## Existing POS code to reuse (do not rebuild)

- **`qr_code` IR node** exists (`types/print-document.ts`), renders on Star (`StarXpandRenderer.ts` → `actionPrintQRCode`) and Landi (`LandiDriver.printDocument`). A tent = `text_line` headers + `qr_code` + `cut`. **No driver changes.**
- **`PrinterService`** (`services/printing/PrinterService.ts`): copy `printNoSaleReceipt` → new `printTableQr` (build doc → `getReceiptPrinter(locationId)` → `createDocumentJob` → `usePrintQueueStore.enqueue` → `ensureProcessing`).
- **`TableContextSheet.tsx`** — `ActionItem[]` + `getActionsForStatus` + `useMemo` append (~line 556); Print Receipt / Print Kitchen Ticket actions are the model.
- **`OnlineOrderCard.sourceLabel`** (lines 37–49) already labels QR (`` `${tableLabel} · QR` `` keyed on `table_number` presence). `OnlineOrderEdgeTab` / `OnlineOrderDrawer` — the incoming surface QR rides.
- **`useOnlineOrderActions`** — accept/decline.
- **Audio ping** — `kdsSoundService.playForSource(orderSource)` from `_layout.tsx` / `kds.tsx` broadcast handlers.
- **`react-native-qrcode-svg`** via `CFDPairingQR.tsx` pattern — on-screen Preview.
- **`ManagerPinModal`** + `usePinOverrideStore` (`MANAGER_ROLES`) — gate Regenerate and QR Off.
- **The existing location orders realtime channel** (`location:{id}:orders`) — attach the `qr_guest_alert_changed` handler to the same subscription the order handlers use (`useOrdersRealtime` / `_layout.tsx`), **not** a new channel.
- **`toastService.show`** — print confirmations.
- RPC pattern: `useSupabaseClient()` in components; static wrappers on `services/floorPlanService.ts`.

## Implementation

### A. Print QR Code actions on TableContextSheet

1. **`utils/qrTableUrl.ts` (new)** — mirror of site `buildStoreUrl`/`buildQrTableUrl`: custom domain → `https://{domain}`; else `https://{slug}.{ROOT_DOMAIN}`; append `/t/{encodeURIComponent(token)}`. `QR_ROOT_DOMAIN` constant in `constants/` (match site prod env; confirm value).
2. **`FloorPlanService` statics**:
   - `generateTableQrCode(client, { floorPlanObjectId, regenerate })` → RPC, typed result.
   - `getActiveTableQrCode(client, floorPlanObjectId)` → active-code select (drives Print vs Reprint + On/Off state).
   - `revokeTableQrCode(client, floorPlanObjectId)` → find active row, update `{is_active:false, rotated_at}`.
   - `getQrStoreConfig(client, locationId)` → `online_store_config` row (slug/custom_domain/store_name/is_active/accepts_dine_in/qr_kill_switch).
3. **`PrinterService.printTableQr({ tableLabel, storeName, qrUrl, locationId })`** — bold table label, `qr_code` node (data = full guest URL), "Scan to order", store name, `cut`.
4. **TableContextSheet QR action group** (labelled buttons, no hidden gestures):
   - **Print QR / Reprint QR** — one entry; on open, fetch active-code + store config. No active code → RPC (generate) then print; active → RPC returns `reprint_existing` (same token) then print. Disabled with reason if store config fails the gate (`!is_active || !accepts_dine_in || qr_kill_switch`) or no `slug`/`custom_domain`.
   - **Regenerate QR** — manager-gated (`usePinOverrideStore`); confirm dialog "the old printed code stops working"; RPC `regenerate=true`; print new tent.
   - **QR Off (this table)** — manager-gated confirm ("printed tent stops working"); revoke update. When off, entry flips to **QR On** → confirm "requires printing a new tent" → generate + print.
   - **Preview** — sheet with `qrcode-svg` render of the exact guest URL + label, before printing.
   - Print actions Admin/Owner-gated; success toast; printer-offline → code is still saved server-side, show Preview sheet as fallback ("show guest / print later").

### B. Incoming `qr_dine_in` surfacing

1. Verify `qr_dine_in` flows into `useOnlineOrders()` → `OnlineOrderCard`. Fix any `order_type` narrowing that drops it — the realtime type at `useOrdersRealtime.ts:205` collapses it to `takeout`; label path keys on `table_number` so verify end-to-end and widen the union if needed.
2. Audio ping for `qr_dine_in` rides `playForSource` — verify the source mapping doesn't treat it as `pos`.
3. Accept tray: with `auto_accept_orders` off, one-tap accept via `useOnlineOrderActions.acceptOrder` (build regardless of pilot default).
4. **Non-seizing blue marker (optional v1)**: `stores/useQrOrderMarkerStore.ts` keyed by `table_number`, rendered as a separate overlay inside `ReadonlyTable` — never touches `useTableSessionStore`, never sets Seated/Ordered, never blocks. Blue `#0C4FD1`.

### C. Call-waiter bell (Order Line + KDS)

1. **`stores/useQrGuestAlertsStore.ts` (new)** — `{alerts: QrGuestAlert[], openCount}` fed by:
   - Initial seed: direct select on `qr_guest_alerts` (`status <> 'resolved'`, location).
   - Realtime: `qr_guest_alert_changed` handler **added to the existing location orders channel subscription** (in `useOrdersRealtime`/`_layout.tsx` handler map, alongside order events — no new channel). `operation:'upsert'` → add/refresh row; `'resolved'` → remove; always overwrite `openCount` from payload's `open_alert_count`.
   - Fallback: poll `get_qr_guest_alert_open_count` (e.g. 30s) only while realtime is disconnected; on count mismatch re-seed via select.
2. **`components/qr/QrCallWaiterBell.tsx` (new)** — renders **only when openCount ≥ 1** (zero = no bell). Count badge. Tap → bottom sheet: rows of table label, "Call server", optional message, age (amber after **3 min** — proposed, confirm; never red). **Resolve** → `resolve_qr_guest_alert`; optimistic remove, reconciled by the resolve broadcast; re-resolve is a server no-op.
3. Mount: Order Line `rightToolbarSlot` (`order-processing.tsx` ~line 1347) and KDS header beside Settings (`kds.tsx`). Must not collide with the QR blue identity band or T-18 overdue red. Store is the single source of truth → resolving on either surface clears both.

### D. Validation pass (staging `dfwqakoyittmrwbqvxgw` only)

QA matrix rows 1, 2, 11, 12, 19, 20, 21, 22 with a real POS-printed tent; per-row evidence; side-by-side recording. Fix POS-surface defects from Haidar's E2E pass.

## Files touched

- `constants/` — `QR_ROOT_DOMAIN`
- `utils/qrTableUrl.ts` (new)
- `services/printing/PrinterService.ts` — `printTableQr`
- `services/floorPlanService.ts` — 4 statics above
- `components/tables/TableContextSheet.tsx` — QR action group
- `components/tables/cards/ReadonlyTable.tsx` — blue marker overlay (if in scope)
- `components/qr/QrCallWaiterBell.tsx` + Preview sheet component (new)
- `stores/useQrGuestAlertsStore.ts`, `stores/useQrOrderMarkerStore.ts` (new)
- `hooks/realtime/useOrdersRealtime.ts` (or `_layout.tsx`) — `qr_guest_alert_changed` handler on existing channel; verify `qr_dine_in` typing
- `app/(main)/order-processing.tsx`, `app/(main)/kds.tsx` — mount bell

## Verification

- `npx tsc --noEmit` (project-wide), `npm run lint`, `npm test` for touched logic.
- Manual on staging (never production):
  - Print tent from POS → scanned URL equals dashboard's `buildQrTableUrl` output for the same table (compare against dashboard "Copy link").
  - Scan → order lands as labelled incoming order; DB: `session_id IS NULL`, `online_session_id` set, `order_type='qr_dine_in'`.
  - Reprint → same `token_version`; Regenerate → version bump + old rows `is_active=false, rotated_at` set; old tent scan → "Invalid or inactive QR code".
  - QR Off → tent scan fails; QR On → new tent works.
  - Call-server: bell appears on both surfaces via broadcast; re-raise from same guest dedups (single row, refreshed age); resolve on one surface clears the other; count matches `get_qr_guest_alert_open_count`.
  - Printer offline → RPC still ran (code saved), Preview fallback shows; queue drains when printer returns.
- Ticket SQL layer: order shape, token rotation, alert dedup, resolve attribution (`resolved_by` = staff JWT sub).

## Open items to confirm

- `QR_ROOT_DOMAIN` production value (site `NEXT_PUBLIC_ROOT_DOMAIN`).
- Amber-after-N-min: proposed **3 min**.
- Pilot `auto_accept_orders` default (accept tray built either way).
- Blue table marker (B.4) in v1 or deferred.
- Whether the POS should surface the billing-tier gate message verbatim (dashboard uses `getQrBillingGateStatus` server action — POS only has the store-config gate; a non-entitled merchant would get an RPC-level failure or a working code with a gated storefront — confirm which and copy accordingly).
