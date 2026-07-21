# Complete Gesture & Shortcut Inventory — Dexa-POS

Exhaustive audit of every shortcut, gesture, and non-obvious interaction in the POS, KDS, and CFD apps. For staff training manual use.

---

## Phase 1 — Surface Area Map

```
app/
├── index.tsx                            — Entry router (redirects based on auth state)
├── _layout.tsx                          — Root provider hierarchy
├── +not-found.tsx                       — 404 screen
├── my-profile.tsx                       — Legacy profile (dupe)
│
├── (auth)/
│   ├── _layout.tsx                      — Two-column auth layout
│   ├── login.tsx                        — Email/password + Google OAuth
│   ├── pin-login.tsx                    — 4-digit PIN login, takeover, clock-out
│   ├── store-select.tsx                 — Location picker
│   ├── station-select.tsx               — Station picker (POS/KDS/CFD)
│   ├── _sign-up.tsx                     — Signup with email verification
│   ├── forgot-pin.tsx                   — PIN reset request
│   ├── reset-pin.tsx                    — PIN reset confirm
│   └── oauth-native-callback.tsx        — OAuth redirect handler
│
├── (main)/
│   ├── _layout.tsx                      — POS layout + providers
│   ├── home.tsx                         — Main menu dashboard
│   ├── order-processing.tsx             — Core POS: bill + menu + order badges
│   ├── kds.tsx                          — Kitchen Display System
│   ├── previous-orders.tsx              — Completed orders list
│   ├── previous-orders/[orderId].tsx    — Order detail
│   ├── order-processing/previous-orders.tsx — Alt previous orders
│   ├── customers-list.tsx               — Customer list (placeholder)
│   ├── requests.tsx                     — Staff shift requests
│   ├── pto.tsx                          — PTO management
│   ├── open-shifts.tsx                  — Open shift pickup
│   ├── host-station.tsx                 — Host/waitlist manager
│   ├── analytics.tsx                    — Analytics redirect
│   │
│   ├── tables/
│   │   ├── index.tsx                    — Floor plan view + context sheets
│   │   ├── [tableId].tsx                — Individual table modal
│   │   ├── edit-layout.tsx              — Floor plan editor (pan/pinch/tap)
│   │   ├── floor-plan/index.tsx         — Floor plan management
│   │   ├── clean-table/[tableId].tsx    — Clean table screen
│   │   └── waitlist.tsx                 — Waitlist management
│   │
│   ├── menu/
│   │   ├── index.tsx                    — Menu editor (drag reorder)
│   │   ├── add-item.tsx / edit-item.tsx
│   │   ├── add-category.tsx / edit-category.tsx
│   │   ├── add-menu.tsx / edit-menu.tsx
│   │   └── add-modifier.tsx / edit-modifier.tsx
│   │
│   ├── inventory/
│   │   ├── index.tsx                    — Inventory dashboard
│   │   ├── reports.tsx                  — Inventory reports
│   │   ├── vendors.tsx / [vendor-id].tsx
│   │   ├── ingredient-items/[itemId].tsx
│   │   ├── menu-items/[itemId].tsx
│   │   └── purchase-orders/ (index, create, create-expense, [poId], edit/[poId])
│   │
│   ├── online-orders/
│   │   ├── index.tsx                    — Kanban board (4 columns)
│   │   └── [orderId].tsx                — Online order detail
│   │
│   ├── scheduling/
│   │   ├── index.tsx                    — Scheduling menu
│   │   ├── dashboard.tsx                — Shift scheduling dashboard
│   │   ├── reports.tsx                  — Scheduling reports
│   │   ├── [periodId].tsx               — Period detail
│   │   └── templates/ (index, create, [id])
│   │
│   ├── loyalty/
│   │   ├── index.tsx                    — Loyalty hub (4 tabs)
│   │   ├── program-form.tsx             — Create/edit program
│   │   └── enroll-customer.tsx          — Enroll customer
│   │
│   ├── analytics/
│   │   ├── analytics-dashboard.tsx      — Main dashboard
│   │   ├── custom-report-builder.tsx    — Report builder
│   │   └── report-view.tsx              — View report
│   │
│   └── settings/
│       ├── general.tsx, financial.tsx, terminal.tsx, etc. (26 settings screens)
│       ├── receipt-templates.tsx         — Receipt template editor (drag reorder)
│       ├── fraud-detection.tsx           — Fraud detection config
│       ├── end-of-day.tsx               — EOD start
│       └── end-of-day/settlement.tsx    — EOD settlement
│
├── (cfd)/
│   ├── _layout.tsx                      — CFD layout + error boundary
│   ├── cfd-pairing.tsx                  — QR scan + manual IP pairing
│   └── cfd-display.tsx                  — CFD screen router + admin 5-tap
│
└── (profiles-and-timeclock)/
    ├── my-profile.tsx                   — Employee profile (3 tabs)
    └── timeclock.tsx                    — Daily shift report
```

**Total: ~88 unique screens** across 4 route groups.

---

## POS App Gestures

| File:Line | Screen / Feature | Gesture Type | Target Element | What It Does | Conditions / Gating | Discoverable? | Confidence |
|---|---|---|---|---|---|---|---|
| **ORDER PROCESSING** ||||||||
| `components/bill/BillItem.tsx:232` | Order Processing — Bill | Pan swipe left | Bill item row | Reveals red delete button (swipe left past 50% of button width commits delete) | Item not voided | Partially — no swipe hint | High |
| `components/bill/BillItem.tsx:240` | Order Processing — Bill | Pan swipe right | Bill item row | Reveals green +1 increment button (swipe right past 50% commits increment) | Not a kitchen-sent item | Partially — no swipe hint | High |
| `components/bill/BillItem.tsx:567` | Order Processing — Bill | Tap | Bill item row | Opens item notes/modifier edit screen | Item not voided | Yes | High |
| `components/bill/CourseAccordion.tsx:121` | Order Processing — Bill | Double-tap (2 taps, 250ms) | Course header | Triggers `onDoubleTap(courseId)` — expands all items in course | Coursing enabled, items sent | No — no double-tap hint | High |
| `components/bill/CourseAccordion.tsx:132` | Order Processing — Bill | Single tap | Course header | Toggles expand/collapse of course items | Always | Yes | High |
| `components/bill/CourseAccordion.tsx:145` | Order Processing — Bill | Long-press (500ms) | Course header | Opens course action sheet (Gesture.LongPress) | Course is sent AND not yet served | No — no long-press hint | High |
| `components/bill/SeatCourseAccordion.tsx:306` | Order Processing — Bill (Seat view) | Long-press | Course sub-header | Opens course action sheet (rush/prioritize/resend) | Course sent, not served | No | High |
| `components/bill/TableBillSection.tsx:129` | Order Processing — Bill | Tap | Seat header | Toggle seat expand/collapse + select seat | Always | Yes | High |
| `components/bill/TableBillSection.tsx:212` | Order Processing — Bill | Tap | Course sub-header (DenseSeatView) | Toggle course expand/collapse | Always | Yes | High |
| `components/bill/TableBillSection.tsx:213` | Order Processing — Bill | Long-press | Course sub-header (DenseSeatView) | Opens Rush/Prioritize/Resend action modal | Course sent, not served | No | High |
| `components/bill/TableBillSection.tsx:244` | Order Processing — Bill | Tap | Inline "Send" button | Sends unsent course items to kitchen | Course has unsent items | Yes | High |
| `components/bill/TableBillSection.tsx:1121` | Order Processing — Bill | Tap | Discount X button | Removes applied discount | Discount exists | Yes | High |
| `components/order/OrderBadge.tsx:790` | Order Processing — Badge bar | Swipe up (PanGestureHandler, -10px Y activation, +/-15px X fail) | Order badge pill | Completes order (mark done) — green "Done" indicator reveals behind badge | `canSwipeComplete` = order paid + ready, or auto-complete mode | No — no swipe hint | High |
| `components/order/OrderBadge.tsx:908` | Order Processing — Badge bar | Tap (left side) | Order badge content | Retrieves order to payment screen | Always | Yes | High |
| `components/order/OrderBadge.tsx:954` | Order Processing — Badge bar | Tap (right side) | Three-dot menu icon | Opens popover: Mark Done, View Items, Print Receipt, Retrieve to Pay, Reopen Check | Always | Yes | High |
| `order-processing.tsx:1021` | Order Processing — Badge bar | Scroll | Badge FlatList | Tracks scroll position for left/right affordance arrows | Always | Yes | High |
| **MORE OPTIONS BOTTOM SHEET** ||||||||
| `components/bill/MoreOptionsBottomSheet.tsx:496` | More Options | Tap | "Close Check" row | Closes check (balance must be zero) | Check open, balance = 0 | Yes | High |
| `components/bill/MoreOptionsBottomSheet.tsx:605` | More Options | Tap | "Apply Discount" row | Opens discount sheet | No refunds on order, check not closed | Yes | High |
| `components/bill/MoreOptionsBottomSheet.tsx:652` | More Options | Tap | "Add Customer" row | Opens customer sheet | Always | Yes | High |
| `components/bill/MoreOptionsBottomSheet.tsx:715` | More Options | Tap | "Print Receipt" row | Prints receipt | Has items, not already printing | Yes | High |
| `components/bill/MoreOptionsBottomSheet.tsx:757` | More Options | Tap | "Print Kitchen Ticket" row | Prints kitchen ticket | Has items | Yes | High |
| `components/bill/MoreOptionsBottomSheet.tsx:825` | More Options | Tap | "Rush Order" row | Toggles rush flag on order (sends to kitchen) | Items in kitchen | Yes | High |
| `components/bill/MoreOptionsBottomSheet.tsx:890` | More Options | Tap | "Prioritize Order" row | Toggles priority flag (moves to top of KDS queue) | Items in kitchen | Yes | High |
| `components/bill/MoreOptionsBottomSheet.tsx:1029` | More Options | Tap | "Clear Cart" row | Clears all items (shows confirmation) | Check not closed | Yes | High |
| `components/bill/MoreOptionsBottomSheet.tsx:1067` | More Options | Tap | "Void Order" row | Voids entire order (confirmation modal, **NO PIN GATE**) | Order has items or db_order_id | Yes | High |
| `components/bill/MoreOptionsBottomSheet.tsx:1109` | More Options | Tap | "Open Drawer (No Sale)" row | Opens cash drawer without sale | Config: `requireNoSaleApproval` may require manager PIN | Yes | High |
| `components/bill/MoreOptionsBottomSheet.tsx:1175` | More Options | Tap + Manager PIN | Tax Exempt toggle | Requires 4-digit manager PIN to enable tax exemption | Manager/admin/owner role | Yes (button visible) | High |
| **CUSTOMER SHEET** ||||||||
| `components/bill/CustomerSheet.tsx:413` | Customer Sheet | Tap | Customer row / frequent pill | Assigns customer to order | Always | Yes | High |
| `components/bill/CustomerSheet.tsx:414` | Customer Sheet | Long-press | Customer row / frequent pill | Opens edit mode — pre-fills form with customer data | Always | No — no long-press hint | High |
| **MODIFIER SCREEN** ||||||||
| `components/menu/ModifierScreen.tsx:134` | Modifier Selection | Long-press (400ms) | Modifier option button | Toggles "NO" modifier (e.g., "NO onions") — red styling | During modifier selection | No — no hint | High |
| `components/menu/ModifierScreen.tsx:67` | Modifier Selection | Tap | Category pill | Selects modifier category | Always | Yes | High |
| **TABLES** ||||||||
| `tables/index.tsx:233` | Floor Plan | Tap | Table (normal mode) | Opens context sheet (Seat Guests, Navigate, Seat Reservation) | Not in merge mode, clocked in | Yes | High |
| `tables/index.tsx:215` | Floor Plan | Tap | Table (merge mode) | Toggles table selection for merge | In merge mode | Yes | High |
| `tables/index.tsx:357` | Floor Plan | Long-press | Table (available) | Opens guest count modal for seating | Normal mode, clocked in | No — no hint | High |
| `tables/index.tsx:339` | Floor Plan | Long-press | Table (occupied) | Navigates directly to table detail view | Normal mode, clocked in | No — no hint | High |
| `components/tables/TableLayoutView.tsx:383` | Floor Plan | Pan (10px min) | Canvas | Pans floor plan view | Always | Partially | High |
| `components/tables/TableLayoutView.tsx:405` | Floor Plan | Pinch | Canvas | Zooms floor plan (0.5x-3x) | Always | Partially | High |
| `components/tables/TableLayoutView.tsx:433` | Floor Plan | Simultaneous pan+pinch | Canvas | Both gestures work together | Always | Partially | High |
| `components/tables/DraggableTable.tsx:505` | Floor Plan Editor | Pan (220ms hold + 12px min) | Table | Drags table to new position, snaps to 5px grid | Edit mode only | Partially | High |
| `components/tables/DraggableTable.tsx:528` | Floor Plan Editor | Rotation | Table | **DISABLED** — rotation via UI buttons only | N/A | N/A | High |
| `components/tables/DraggableTable.tsx:549` | Floor Plan | Long-press (300ms) | Table (Gesture.LongPress) | Calls `onLongPress` handler | Normal mode, not edit mode | No | High |
| `components/tables/DraggableTable.tsx:556` | Floor Plan | Tap (Gesture.Tap) | Table | Calls `onPress` (normal) or `onSelect` (edit) | Mode-dependent | Yes | High |
| `components/tables/DraggableTable.tsx:564` | Floor Plan Editor | Simultaneous(drag, rotate, tap) | Table | All gestures concurrent in edit mode | Edit mode | N/A | High |
| `components/tables/DraggableTable.tsx:567` | Floor Plan | Race(longPress, tap) | Table | First gesture wins in normal mode | Normal mode | N/A | High |
| `components/tables/DraggableShape.tsx:21` | Floor Plan Editor | Pan (long-press activation) | Wall/divider shapes | Drag shape after long-press hold | Edit mode | Partially | High |
| `components/tables/SelectableTable.tsx:38` | Table Selection | Tap (Gesture.Tap) | Table | Scale animation + selection | Always | Yes | High |
| `tables/edit-layout.tsx:218` | Floor Plan Editor | Pan (8px min) | Canvas | Pans canvas | Always | Partially | High |
| `tables/edit-layout.tsx:240` | Floor Plan Editor | Pinch | Canvas | Zooms canvas (0.5x-3x) | Always | Partially | High |
| `tables/edit-layout.tsx:262` | Floor Plan Editor | Tap (Gesture.Tap) | Canvas background | Clears current table selection | Always | Partially | High |
| `tables/edit-layout.tsx:266` | Floor Plan Editor | Simultaneous(pinch, pan, tap) | Canvas | All three work together | Always | N/A | High |
| **MENU EDITOR** ||||||||
| `menu/index.tsx:205` | Menu Editor | Pan (Gesture.Pan) | Category row | Drag to reorder categories | Edit mode | Partially — drag handle visible | High |
| `menu/index.tsx:441` | Menu Editor | Pan (Gesture.Pan) | Submenu row | Drag to reorder submenus | Edit mode | Partially | High |
| `components/menu/DraggableMenuItem.tsx:108` | Menu Editor | Pan (Gesture.Pan) | Menu item row | Drag to reorder items (scale 1.05x during drag) | Edit mode | Partially — drag handle visible | High |
| **SCHEDULING** ||||||||
| `components/scheduling/DraggableShift.tsx:75` | Scheduling Dashboard | Pan (4-stage) | Shift chip | Drag shift to new employee/date cell; collision detection per-frame | Always | Partially — chip looks draggable | High |
| `components/scheduling/DraggableTemplateShift.tsx:73` | Schedule Templates | Pan (4-stage) | Template shift chip | Drag template shift to new cell | Always | Partially | High |
| **HOST STATION** ||||||||
| `components/host-station/WaitlistQueueCard.tsx:73` | Host Station — Waitlist | Swipe left (PanResponder, >80px reveals 260px tray) | Waitlist queue card | Reveals action buttons (Notify, Seat, Cancel, No-Show, Offer Comp) | Always | No — no swipe hint | High |
| `components/host-station/AnimatedCardItem.tsx:48` | Host Station — Waitlist | Simultaneous(LongPress 300ms, Pan) | Waitlist card | Long-press then drag to reorder cards in queue | Always | No | High |
| **ANALYTICS** ||||||||
| `components/analytics/InteractivePieChart.tsx:137` | Analytics Dashboard | Tap (Gesture.Tap) | Pie chart slice | Selects/deselects slice for detail view | Always | Partially | High |
| `components/analytics/EnhancedPieChart.tsx:161` | Analytics Dashboard | Tap (Gesture.Tap) | Pie chart slice | Same as InteractivePieChart | Always | Partially | High |
| **PREVIOUS ORDERS** ||||||||
| `previous-orders.tsx:812` | Previous Orders | Pull-to-refresh (RefreshControl) | FlatList | Reloads orders from backend | Always | Yes | High |
| `previous-orders/[orderId].tsx:424` | Previous Order Detail | Pull-to-refresh | ScrollView | Refreshes order details | Always | Yes | High |
| **MODALS / SHEETS** ||||||||
| `components/receipts/ReceiptModal.tsx:299` | Receipt Modal | Vertical drag down (PanResponder) | Modal container | Swipe > threshold dismisses modal; else springs back | When modal open | Partially — drag handle | High |
| `components/previous-orders/PrintReceiptModal.tsx:85` | Print Receipt Modal | Vertical drag down (PanResponder) | Modal container | Swipe > 100px closes | When modal open | Partially | High |
| `components/previous-orders/OrderNotesModal.tsx:138` | Order Notes Modal | Vertical drag down (PanResponder) | Modal container | Vertical drag closes | When modal open | Partially | High |
| **ONLINE ORDERS** ||||||||
| `online-orders/index.tsx:134` | Online Orders Kanban | Tap | Column header | Focuses column fullscreen; tap again unfocuses | Always | Partially | High |
| **RECEIPT TEMPLATES** ||||||||
| `settings/receipt-templates.tsx:1400,1752,2034,2340,2645` | Receipt Templates | Long-press to drag | Template section row (x5 types) | Initiates drag-to-reorder via draggable-flatlist | In edit mode | Partially — standard reorder pattern | High |
| **UI PRIMITIVES** ||||||||
| `components/ui/slider.tsx:44` | Various Settings | Pan (PanResponder) | Slider thumb | Drag to set value | When rendered | Yes | High |
| `components/ui/custom-slider.tsx:91` | Various Settings | Pan + track tap (PanResponder) | Slider thumb / track | Drag or tap track to set value | Not disabled | Yes | High |
| **NAVIGATION** ||||||||
| `lib/screenConfig.ts:23-24` | All POS screens | Gesture suppression | Stack navigator | `gestureEnabled: false` + `fullScreenGestureEnabled: false` — prevents swipe-back | Always (kiosk mode) | N/A | High |
| **CASH DRAWER** ||||||||
| `components/cash-drawer/PayInOutModal.tsx:581` | Cash Management | Tap + Manager PIN (4-digit) | Pay In / Pay Out / Cash Drop | Enters amount, selects reason, manager PIN approval, drawer opens | **Always requires manager PIN** | Yes | High |
| `components/cash-drawer/NoSaleModal.tsx:359` | Cash Management | Tap + optional Manager PIN | No Sale (open drawer) | Opens cash drawer; PIN required only if `requireNoSaleApproval` in config | **Conditional** on location config | Yes | High |
| **HAPTIC FEEDBACK** (signals nearby gesture) ||||||||
| `components/HapticTab.tsx:12` | Bottom tab bar | Haptic on press | Tab buttons | Light impact haptic on tab switch | iOS only | Yes (tactile) | High |
| `hooks/orders/useOrderActions.ts:26,74,120` | Order lifecycle | Haptic notification | N/A (feedback) | Success/Error haptic on close check, reopen, void | After action | Yes (tactile) | High |
| `hooks/orders/useRefundMutation.ts:367,401` | Refund flow | Haptic notification | N/A | Success/Error on refund completion | After refund | Yes (tactile) | High |
| `hooks/orders/useTipAdjustMutation.ts:235,263` | Tip adjustment | Haptic notification | N/A | Success/Error on tip adjust | After tip adjust | Yes (tactile) | High |
| **PULL-TO-REFRESH** ||||||||
| `components/panels/TablesPanel.tsx:463` | Tables Panel | RefreshControl | FlatList | Refreshes table list | Always | Yes | High |
| `menu/index.tsx:1006,1058,1373,1564` | Menu Editor (4 tabs) | RefreshControl | FlatList (x4) | Refreshes menus/categories/items/modifiers | Always | Yes | High |
| `settings/end-of-day.tsx:450,463,479,487,496` | EOD Wizard (5 steps) | onRefresh button | Step areas | Refreshes EOD data | Always | Yes | High |
| `components/menu/PreviousOrdersSection.tsx:483` | Previous Orders Section | RefreshControl | FlatList | Refreshes orders | Always | Yes | High |
| `components/menu/OrdersTable.tsx:575` | Orders Table | RefreshControl | FlatList | Refreshes orders | When onRefresh prop provided | Yes | High |
| **PIN SHAKE ANIMATIONS** (visual feedback, not gesture) ||||||||
| `pin-login.tsx:155` | PIN Login | Animated shake | PIN dot row | Horizontal shake on wrong PIN | On failure | Yes (visual) | High |
| `components/auth/ManagerPinModal.tsx:141` | Manager PIN | Animated shake | PIN dots | Shake on wrong PIN | On failure | Yes | High |
| `components/auth/DeactivateTerminalModal.tsx:57` | Deactivate Terminal | Animated shake | PIN dots | Shake on wrong PIN | On failure | Yes | High |
| `settings/general.tsx:100` | General Settings PIN | Animated shake | PIN dots | Shake on wrong PIN | On failure | Yes | High |
| `components/settings/security-and-login/SwitchAccountModal.tsx:118` | Account Switch | Animated shake | PIN dots | Shake on wrong PIN | On failure | Yes | High |
| `components/bill/MoreOptionsBottomSheet.tsx:229` | Tax Exempt PIN | Animated shake | PIN dots | Shake on wrong PIN | On failure | Yes | High |
| **REFUND FLOW** ||||||||
| `components/previous-orders/RefundApprovalModal.tsx:155` | Refund Approval | Tap + Manager PIN (4-digit, auto-submit at 4 chars) | PIN numpad | Approves refund blocked by velocity guard | Only when `shouldBlock === true` (fraud threshold exceeded) | Yes | High |

---

## KDS App Gestures

| File:Line | Screen / Feature | Gesture Type | Target Element | What It Does | Conditions / Gating | Discoverable? | Confidence |
|---|---|---|---|---|---|---|---|
| `kds.tsx:354` | KDS Ticket Grid | Double-tap (hand-rolled, <420ms, `Date.now()` tracking) | Ticket card | Auto-advances ticket status: pending->preparing, cooking->ready, ready->served | Not in bulk mode | **No** — no visual hint for double-tap vs single-tap | High |
| `kds.tsx:383,531` | KDS Ticket Grid | Long-press (400ms) | Ticket card (Pressable) | Opens context menu: Recall (ready only), Prioritize/Unprioritize, Rush/Remove Rush, Bump Order | Not in bulk mode | **No** — no long-press hint | High |
| `kds.tsx:816` | KDS Ticket Grid | Tap | Individual item row (within ticket) | Marks individual item done (`markItemDone`) | **2-step workflow mode only** (`workflowMode === '2-step'`); item not voided/inactive/already done | **No** — only active in 2-step mode, no visual indicator | High |
| `kds.tsx:1479` | KDS Header | Triple-tap (hand-rolled, 3 taps in 600ms, counter+setTimeout) | Station name text (TouchableOpacity with `activeOpacity={1}`) | Logs out station — calls `pos_staff_logout` RPC, clears session, navigates to PIN login. **No confirmation dialog.** | Always (station name visible) | **No** — text looks non-interactive (`activeOpacity=1`) | High |
| `kds.tsx:1767` | KDS Ticket Grid | Pull-to-refresh (onRefresh callback) | FlatList | Re-fetches KDS tickets from backend | Always, requires locationId | Yes | High |
| `kds.tsx:2357` | KDS Header | Tap (normal mode behavior) | Station name | Acts as triple-tap counter (see above) | Always | No — see above | High |
| `kds.tsx:2416` | KDS Bulk Mode | Tap | "Select All" button | Selects all visible tickets | Bulk mode active | Yes | High |
| `kds.tsx:2433` | KDS Bulk Mode | Tap | "Clear" button | Deselects all | Bulk mode active | Yes | High |
| `kds.tsx:2452` | KDS Bulk Mode | Tap | "Advance Selected" button | Advances selected tickets to next status | Selection count > 0 | Yes | High |
| `kds.tsx:2477` | KDS Bulk Mode | Tap | "Advance All in Tab" button | Advances ALL tickets in active tab | Tickets exist in tab | Yes | High |

---

## CFD App Gestures

| File:Line | Screen / Feature | Gesture Type | Target Element | What It Does | Conditions / Gating | Discoverable? | Confidence |
|---|---|---|---|---|---|---|---|
| `cfd-display.tsx:66,150` | CFD Display (disconnected) | 5-tap in 2s (hand-rolled, `Date.now()` + `useRef` counter) | Invisible 60x60 Pressable, absolute top-right, zIndex 100, no children | Opens admin Alert: "Back to Pairing" / "Disconnect & Exit CFD" / Cancel | CFD mode, disconnected state | **No** — completely invisible | High |
| `cfd-display.tsx:66,252` | CFD Display (connecting) | 5-tap in 2s | Same invisible Pressable | Same admin menu | CFD mode, connecting state | **No** | High |
| `cfd-display.tsx:66,324` | CFD Display (connected) | 5-tap in 2s | Same invisible Pressable | Same admin menu | CFD mode, connected state | **No** | High |
| `cfd-pairing.tsx:243` | CFD Pairing | Camera barcode scan | CameraView (`expo-camera`) | Scans QR code for device pairing (IP, port, stationId JSON) | QR tab active, camera permission granted | Yes (viewfinder visible) | High |

---

## Appendix 1: Hidden Shortcuts (no visible UI affordance)

**Priority order by risk/impact:**

1. **KDS Triple-Tap Station Logout** (`kds.tsx:1479`) — 3 taps in 600ms on station name text logs out without confirmation. `activeOpacity={1}` makes text look non-interactive. **Risk: accidental logout, no undo.**

2. **CFD 5-Tap Admin Menu** (`cfd-display.tsx:66-78, 150/252/324`) — 5 taps in 2s on invisible 60x60 corner target. Allows disconnecting CFD or returning to pairing. **Risk: customer could discover and exit CFD.**

3. **KDS Double-Tap Ticket Advance** (`kds.tsx:354`) — Double-tap (<420ms) auto-advances ticket status. No visual difference between single-tap (no-op) and double-tap (advance). **Risk: accidental status changes on fast taps.**

4. **KDS 2-Step Item Tap** (`kds.tsx:816`) — Individual item tap marks item done, but ONLY in 2-step workflow mode. In 3-step mode, item taps do nothing. No visual indicator of tap-ability. **Risk: confusion when switching modes.**

5. **Bill Item Swipe Left/Right** (`BillItem.tsx:232`) — Swipe left reveals delete, swipe right reveals +1 increment. No swipe hint, rail, or visual indicator. **Risk: undiscovered by new staff.**

6. **OrderBadge Swipe-Up to Complete** (`OrderBadge.tsx:790`) — Swipe up on order badge marks order done. Green "Done" reveals behind badge during swipe. **Risk: undiscovered shortcut.**

7. **Course Header Long-Press** (`CourseAccordion.tsx:145`, `SeatCourseAccordion.tsx:306`, `TableBillSection.tsx:213`) — Long-press (500ms) opens Rush/Prioritize/Resend menu. No long-press affordance. **Risk: undiscovered.**

8. **Modifier Long-Press "NO" Toggle** (`ModifierScreen.tsx:134`) — Long-press (400ms) on modifier toggles "NO" state (e.g., "NO onions"). No hint. **Risk: staff won't find it.**

9. **Customer Long-Press Edit** (`CustomerSheet.tsx:414`) — Long-press on customer row/pill opens edit mode. No hint. **Risk: undiscovered.**

10. **Table Long-Press** (`tables/index.tsx:357`) — Long-press on available table opens guest count modal; on occupied table navigates to table detail. No hint. **Risk: undiscovered shortcut.**

11. **Waitlist Card Swipe Left** (`WaitlistQueueCard.tsx:73`) — Swipe left >80px reveals action tray. No visual swipe rail. **Risk: undiscovered.**

12. **Online Orders Column Focus** (`online-orders/index.tsx:134`) — Tap column header to focus fullscreen; tap again to unfocus. Non-standard pattern. **Risk: accidental.**

---

## Appendix 2: Shortcuts That Duplicate a Visible Button

| Hidden Shortcut | Visible Alternative |
|---|---|
| KDS double-tap ticket advance | Long-press -> "Bump Order" in context menu |
| OrderBadge swipe-up to complete | Popover -> "Mark as Done" |
| Bill item swipe-right increment | Tap item -> quantity control in modifier screen |
| Bill item swipe-left delete | Tap item -> void/remove in item detail |
| Table long-press (available) | Tap -> context sheet -> "Seat Guests" |
| Table long-press (occupied) | Tap -> context sheet -> "Navigate" |

---

## Appendix 3: Disabled / Dead / DEV-Only Gesture Code

| File:Line | What | Status |
|---|---|---|
| `components/tables/DraggableTable.tsx:528` | `Gesture.Rotation().enabled(false)` — table rotation disabled, replaced by UI buttons | Dead code (disabled) |
| `components/NetworkStatusBadge.tsx:44` | `onLongPress={toggleForceOffline}` with 800ms delay — force-offline toggle | **`__DEV__` only** — badge wraps in TouchableOpacity only in dev, View in prod |

---

## Appendix 4: Things I Am Unsure About

1. **PaymentDetailBottomSheet.tsx (~3400 lines)** — This file is massive and I did not read it line-by-line. It likely contains additional gesture interactions for payment splits, tip adjustments, and payment method selection. The previous memory note mentions pre-existing TS errors at lines 2280-2284. **Medium confidence** that I've captured all gestures in the payment flow.

2. **`components/bill/DiscountBottomSheet.tsx`** — Referenced by MoreOptionsBottomSheet but I did not fully audit. May contain additional tap/selection gestures for discount types (percentage vs fixed, predefined vs custom). **Medium confidence.**

3. **`components/tables/Sidebar.tsx`** — Contains `onKeyPress` for PinNumpad (line 370) and likely has additional table management gestures. I verified the PIN interaction but did not read the full ~400+ line file. **Medium confidence.**

4. **Host Station sub-components** — `host-station.tsx` delegates to `HostStationScreenEnhanced`. I audited the waitlist card components but the main enhanced screen may have additional gestures I didn't trace. **Medium confidence.**

5. **`components/cfd-client/CFDScreenRouter.tsx`** — Routes to various CFD sub-screens (tip selection, loyalty, phone input). These sub-screens may have additional tap/gesture patterns I didn't audit. **Low-medium confidence.**

6. **Settings screens (26 total)** — I audited `general.tsx`, `fraud-detection.tsx`, `receipt-templates.tsx`, `end-of-day/settlement.tsx`, `cash-management.tsx`. The remaining ~21 settings screens are mostly form-based but may contain unexpected gestures. **Medium confidence** they are standard tap/toggle only.

7. **Remote Actions System** (`hooks/useRemoteActionsListener.ts`) — Handles 7 server-broadcast actions (force_refresh, clear_cache, restart_app, force_logout, deactivate, config_update, send_logs) with NO local PIN gate. These are triggered remotely, not by local gestures, but staff should know they exist. I documented them but cannot confirm the full authorization model on the server side.

8. **Void Order has NO PIN gate** — `MoreOptionsBottomSheet.tsx:1067` only shows a confirmation modal. This may be intentional (speed over security) or an oversight. I documented it as-is.

9. **Barcode Scanner** — Hardware detection infrastructure exists (`native/HardwareDetection.ts` detects USB HID scanners) but no barcode-to-item scanning is implemented. Only active barcode feature is QR scanning for CFD pairing. Scanner input would arrive as keyboard-wedge events but I found no handler for it. **High confidence** there is no barcode-to-item flow.

---

## Barcode Scanner Integration

**Status: Detection only — no POS barcode scanning implemented.**

- `native/HardwareDetection.ts:10` — `hasBarcodeScanner: boolean` in detection result
- `android/.../HardwareDetectionModule.kt:395-413` — Detects USB HID scanners (Honeywell 0x0C2E, Zebra/Symbol 0x05E0, Datalogic 0x05F9)
- `services/hardware/deviceDetection.ts:103` — Caches detection, displayed in settings
- `app/(cfd)/cfd-pairing.tsx:243` — QR scan for CFD pairing only (expo-camera)
- **No barcode to item lookup.** No keyboard-wedge input capture for scanners.

---

## NativeEventEmitter / System Listeners (non-gesture, but relevant)

| File:Line | System | What It Does |
|---|---|---|
| `native/NsdDiscovery.ts:28` | NativeEventEmitter | Android mDNS discovery for CFD servers on LAN |
| `native/HardwareDetection.ts:42` | NativeEventEmitter | USB hotplug events (scanner/printer/drawer attach/detach) |
| `native/TcpServer.ts:24` | NativeEventEmitter | CFD client TCP connect/disconnect events |
| `lib/payments/dvpaylite.ts:55` | Linking.addEventListener("url") | Captures return URL from DVPaylite payment app |

---

## Permission Gate to Gesture Mapping

| Gate | Action | Gesture Trigger | PIN Required? |
|---|---|---|---|
| Manager PIN | Tax exemption toggle | Tap in MoreOptionsBottomSheet | **Yes (always)** |
| Manager PIN | Pay In / Pay Out / Cash Drop | Tap in PayInOutModal | **Yes (always)** |
| Manager PIN | No Sale (open drawer) | Tap in NoSaleModal | **Conditional** (`requireNoSaleApproval`) |
| Manager PIN | Refund (velocity blocked) | Tap in RefundApprovalModal | **Conditional** (`shouldBlock`) |
| Manager PIN | Menu unlock / Category unlock | Tap locked tab in MenuControls/MenuSection | **Yes** (with timeout session) |
| Confirmation only | Void Order | Tap in MoreOptionsBottomSheet | **No PIN** |
| Confirmation only | Clear Cart | Tap in MoreOptionsBottomSheet | **No PIN** |
| Reason selection | Void Item | Tap void icon on item | **No PIN** |
| None | Apply Discount | Tap in MoreOptionsBottomSheet | **No PIN** |
