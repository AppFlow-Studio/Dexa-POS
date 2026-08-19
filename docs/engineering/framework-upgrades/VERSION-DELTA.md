# VERSION-DELTA: v2.1.5 → v2.1.6 → HEAD (91ad9674)

Repo: Dexa-POS · Branch: `Table-And-Order-Syncing` · Generated: 2026-07-12

## 1. Release points

There are **no git tags**. Releases are tracked by `app.json` `version` + `runtimeVersion` bumps.

| Release | Commit | Date | Notes |
|---|---|---|---|
| **2.1.5** | `74ccc9bd` — "feat: new runtime 2.1.5" | 2026-06-20 | Single bump, on the Table-And-Order-Syncing mainline |
| **2.1.6** (bump A) | `1b49e88b` — PR #137 "online orders — kanban board, action flows, and global edge-tab drawer" | 2026-07-03 | On the main/PR lineage |
| **2.1.6** (bump B) | `4d6a4f9e` — "feat: runtime update" | 2026-07-03 | On the `feat/online-order` lineage |
| **HEAD** | `91ad9674` — "Jaffal bug fixes (#138)" | 2026-07-10 | Current tip |

**2.1.6 was bumped twice on the same day on two parallel branches.** Neither bump is an ancestor of the other; both descend from the 2.1.5 bump (`74ccc9bd`), and both are ancestors of HEAD (the branches were merged back via `955c834c` "open item handling" and `7adc8eda` "Merge feat/online-order"). Which of the two was actually published to the 2.1.6 EAS Update channel cannot be determined from git alone.

**Is HEAD ahead of 2.1.6?** Yes.
- **10 commits** ahead of *both* 2.1.6 bumps combined (`git rev-list HEAD ^1b49e88b ^4d6a4f9e`) — this is the true "new since any 2.1.6 build" set.
- 19 commits ahead of bump A alone; 11 commits ahead of bump B alone (each count includes the other branch's commits).

## 2. Commit log with classification

### 2.1.5 → 2.1.6, main/PR lineage (`74ccc9bd..1b49e88b`, 12 commits)

| Commit | Class | Summary (diffstat highlights) |
|---|---|---|
| `74f675e2` | [OTHER] | Regenerate native launcher/splash icons for new logo (30 files, AndroidManifest, gradle.properties) |
| `6eb63315` | [OTHER] | Merge feat/perf (icon merge, same content) |
| `8be43cc7` | [FEATURE] | Alidika dev pos (#130) — timeclock rework (timeclock.tsx +313), EOD settings, PrinterService tweaks, receipt pricing-mode tests (12 files, +541/−55) |
| `2047f775` | [BUGFIX] | Jaffal (#131) — **203 files, +16,881/−14,169**: payment views refactor (CardPaymentView, PayForItemsView, PaymentDetailBottomSheet), `process_payment_v16` tiny-total-tolerance migration, receipt-templates, AddToWaitlistForm rewrite; touched `SplitPaymentView.tsx` + `useOrderStore.ts` |
| `20e007b7` | [BUGFIX] | Jaffal (#132) — profile panel / notification sheet fixes (4 files) |
| `69e70471` | [FEATURE] | Multi-receipt print flow — `SplitReceiptSelectorModal` (+432), PrinterService (+243) |
| `e4d4359f` | [OTHER] | Merge feat/split-pay (same content) |
| `9e1283ef` | [FEATURE] | Split payment receipt flow — PaymentSuccessView, PrinterService |
| `40dee0fd` | [BUGFIX] | Single-cent payment support — `useOrderStore.ts` only (+18/−16) |
| `90f0ed1e` | [BUGFIX] | Jaffal (#134) — 39 files: reopen-check with item-level outstanding + `reopen_count` migration, transfer-table, auto-clear table on payment, KDS timer, tax-rate POS sync, **memory-leak fixes (parts 1–2, profile/loyalty leaks)**; touched `offlineSyncService.ts` and `lib/storage.ts` |
| `b1f25a97` | [PERF] | Jaffal (#135) — `DraggableTable.tsx` decomposed 1367→ split into `TableCardContent`/`EditableTable`/`useTableCardData`; inventory item screens (51 files, +6,253/−2,361) |
| `1b49e88b` | [FEATURE] | Online orders: kanban board, action flows, global edge-tab drawer (#137) — 78 files, +15,475/−8,552; **2.1.6 bump A** |

### 2.1.5 → 2.1.6, feat/online-order lineage extras (`74ccc9bd..4d6a4f9e` minus shared, 9 commits)

| Commit | Class | Summary |
|---|---|---|
| `9d188914` | [FEATURE] | Kanban online-order reintro — **added `accepted`/`declined` status ranks to `_handleOrderBroadcast`** (see §3d) |
| `eb6098a7` | [OTHER] | "perf updates and store optimizations" — despite the message, **package-lock.json only** (−598 lines dedupe) |
| `66d56972` | [PERF] | Merge of feat/perf — 86 files, +8,084/−3,966: store optimizations + test updates |
| `e90294c3` | [FEATURE] | Online order flow — Cancel/MarkReady dialogs, OnlineOrderCard |
| `16477970` | [FEATURE] | Online order side drawer + drawer store (+1 line `lib/storage.ts`: CLEARABLE key) |
| `0eb16282` | [BUGFIX] | Jaffal (#136) — 42 files: kds.tsx, settings/kds, order-processing, previous-orders |
| `e4efa191` | [OTHER] | Merge (same content as #136) |
| `aa713dc9` | [OTHER] | supabase `.temp` files |
| `4d6a4f9e` | [OTHER] | Runtime bump — **2.1.6 bump B** |

### 2.1.6 → HEAD (`HEAD ^1b49e88b ^4d6a4f9e`, 10 commits)

| Commit | Class | Summary |
|---|---|---|
| `2f09a7f4` | [FEATURE] | KDS reflects online-order drawer — `useKDSStore.ts` +44 |
| `1f68c58f` | [BUGFIX] | Printing summary fixes — PrinterService +152, receipt templates |
| `45c789f7` | [BUGFIX] | Tax fetching — per-rate-group tax rounding (round once per group, matches server group-by) in split views; touched `SplitPaymentView.tsx` (math only) + `useOrderStore.ts` |
| `6a340d8a` | [OTHER] | PR #139 merge (same content as 1f68c58f) |
| `3508d40e` | [BUGFIX] | Open-item dual-percentage fix — `useOrderStore.ts` +8, `open_item_dual_pricing_inverse` migration |
| `955c834c` | [OTHER] | Merge: open item handling (brings main lineage in) |
| `7adc8eda` | [OTHER] | Merge feat/online-order into Table-And-Order-Syncing |
| `7bce0073` | [OTHER] | Remove supabase `.temp` files |
| `78b62064` | [OTHER] | gitignore supabase/.temp |
| `91ad9674` | [BUGFIX] | Jaffal (#138) — 34 files, +7,028/−4,197: kds.tsx (+704), online-orders, previous-orders, order-processing; net `useOrderStore.ts` delta 2.1.6→HEAD is +196/−108 |

## 3. Hotspot cross-check (audit items a–f)

Checked in both ranges: 2.1.5→2.1.6 (union of both lineages) and 2.1.6→HEAD.

| Item | 2.1.5→2.1.6 | 2.1.6→HEAD |
|---|---|---|
| **a. useOrderStore partialize / lib/storage.ts:349-392 debounce** | **NO** (functional) — `partialize`/`persistableOrderIds` untouched. `lib/storage.ts` changed only in `CLEARABLE_STORAGE_KEYS` (+`online-order-drawer-storage`, `16477970`) and `clearCacheData` eviction of `prev_orders_offline:`/`today_orders:` keys (`90f0ed1e`). The debounced `setItem` path (349-392) is byte-identical. | **NO** — zero commits touched `lib/storage.ts`; no partialize-region changes in `useOrderStore.ts`. |
| **b. Unguarded console in useOrderStore hot paths** | **NO** (substantive) — totals 406→408. Delta was 8 added / 6 removed, all reflow or guard shuffles in `claimOrder`/`releaseOrderState`/`archiveOrder`/`hydrateOrderFromSeat` (claimOrder warn *gained* a `__DEV__` guard; releaseOrderState warn *lost* one). Hot-path (addItem etc.) consoles unchanged. | **NO** — 0 console lines added or removed (408→408). |
| **c. SplitPaymentView whole-store hook** | **NO** — whole-store `useOrderStore()` subscription present at 2.1.5 (L36, L70), still present at 2.1.6 (L39: `const { activeOrderOutstandingTotal } = useOrderStore()`, plus L73). | **NO** — still present at HEAD (L40, L74). `45c789f7` changed split tax math only, not the subscription. |
| **d. _handleOrderBroadcast merge/guards (HEAD :4992-6154)** | **YES** — `9d188914` (carried into both 2.1.6 bumps) added `accepted: 1` and `declined: 4` to both `STATUS_RANK` and `ORDER_STATUS_RANK` maps used for stale-broadcast rejection (online-order statuses). Rest of the 1,163-line body delta is pure reflow — the `sync_version`-based check_status guard already existed at 2.1.5. | **NO** — implementation body is byte-identical (md5 `003bcd9497`) at both 2.1.6 bumps and HEAD. |
| **e. get_order_details detail-sync trigger (HEAD :6041-6049)** | **NO** — the item-count-mismatch → `_debouncedOrderRefresh` block is present and unchanged at 2.1.5 (:5901), 2.1.6 (:6022), HEAD (:6040). The `get_order_details` RPC call site (`syncOrderFromBackendComplete`, HEAD :16414) is also unchanged. | **NO** |
| **f. offlineSyncService queue/debounce** | **NO** (mechanics) — single touch: `90f0ed1e` **removed** an 18-line `today_orders` business-day cache-eviction block from `startAppStateListener` (superseded by the `clearCacheData` sweep in lib/storage.ts). Queue, retry, and debounce logic untouched. | **NO** — zero commits. |

## 4. Verdict

**What the merchant's 2.1.5 build lacked vs 2.1.6:**

1. **Bug-fix waves #131–#136**: `process_payment_v16` tiny-total tolerance, reopen-check with item-level outstanding (+ `reopen_count` migration), transfer-table, auto-clear table on payment completion, KDS timer fixes, tax-rate POS sync, and — notably for a perf complaint — the **memory-leak fixes (parts 1 & 2, profile/loyalty leaks)** in `90f0ed1e`.
2. **Perf work**: `DraggableTable` decomposition (`b1f25a97`) and the feat/perf store-optimization merge (`66d56972`).
3. **Features**: full online-orders suite (kanban, action dialogs, edge-tab drawer), split-payment receipt / multi-receipt printing, single-cent payment support, timeclock rework.
4. **Broadcast semantics**: `accepted`/`declined` ranks in `_handleOrderBroadcast` — a 2.1.5 station ranks these statuses as 0 (unknown), so online-order accept/decline broadcasts are mis-ranked in its stale-rejection logic.

**Do commits in 2.1.6..HEAD invalidate audit findings pinned at 91ad9674?**

**No.** The audits are pinned at HEAD itself, and the question is whether they transfer backward — they do:
- All six audited hotspots (partialize shape, storage debounce, unguarded consoles, SplitPaymentView whole-store hook, `_handleOrderBroadcast` merge logic, detail-sync trigger, offline queue) are **functionally identical between 2.1.6 and HEAD**. The only `useOrderStore.ts` changes in that range (`45c789f7` tax math, `3508d40e` open-item dual pricing, #138 misc) don't touch the audited code paths.
- Findings also transfer to **2.1.5** with one caveat: 2.1.5's `_handleOrderBroadcast` lacks the `accepted`/`declined` ranks (irrelevant unless the merchant uses online orders) — everything else audited (including the SplitPaymentView whole-store subscription and hot-path consoles) already existed in 2.1.5 in the same form.
- Line-number references in the audits shift by ~+18 lines between 2.1.6 and HEAD in `useOrderStore.ts` (e.g. broadcast impl starts :4974 at 2.1.6 vs :4992 at HEAD) but the code is the same.
