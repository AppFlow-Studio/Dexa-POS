# Lessons Learned

## Hidden coupling: TTL guards poisoned by mass operations

- The floor-switch "all tables available" regression: `_patchSessionsFromTables` cleared OTHER plans' sessions on every plan-scoped snapshot patch (wrong authority scope), and each CLEAR fed `recentlyClearedSessions` (a 30s TTL guard meant for real table clears). The TTL map then made `fetchFloorPlanSnapshot` strip those sessions from every fresh fetch — so making fetches MORE frequent (prefetch re-warm) surfaced a latent state-destruction loop.
- Pattern: a "recently X" TTL guard is only sound if X is recorded ONLY for genuine X events. Before adding/refreshing any fetch path, grep for guards that filter its output (`wasRecently*`, suppress windows) and check what feeds them.
- Snapshot patch functions must match the snapshot's authority scope: a plan-scoped fetch may only clear state for tables IN that plan.

## Native code in "JS" dependencies

- Never claim a new dependency needs no dev-client rebuild without checking for an `android/` or `ios/` directory in its package. `@shopify/flash-list` v1 looks JS-only (RecyclerListView heritage) but ships native views (`AutoLayoutView`, `CellContainer`) — old dev clients throw "View config not found".
- Check: `ls node_modules/<pkg>/android` or look for `codegenConfig`/`RN podspec` in its package.json. If native code exists: `npm run android` rebuilds for emulator; Landi needs a fresh EAS development build.
- ~~FlashList v1 on New Architecture: native `AutoLayoutView` can misdraw a dark rectangle over viewport space below short content. Use `disableAutoLayout` for uniform-cell grids.~~ **Wrong on both counts — reverted.** The dark rectangle was a themed `backgroundColor` frozen into `StyleSheet.create` at module load (the `colors` Proxy defaults to dark), not `AutoLayoutView`; fixed properly in 0b748ad1 by applying the background inline. And `disableAutoLayout` is never safe as a blanket setting: it disables `clearGapsAndOverlaps`, the only in-frame corrector for cells drawn at stale offsets, which later surfaced as menu tiles overlapping on menu switch. Only set it when you supply a custom `CellRendererComponent` (the one case the FlashList docs list).
- FlashList v1 sizes grid rows from a running `AverageWindow` of **measured** cell heights (`GridLayoutProviderWithProps.reportItemLayout`), not from `estimatedItemSize` — that value only seeds the window, and the average carries across layout managers. So any zero-height cell permanently drags the row pitch down for every list that follows. Never pad a FlashList grid's last row with filler items the way you would a FlatList: `GridLayoutProvider.setLayout` already fixes each cell's width at `containerWidth / numColumns * span`, so a partial last row lays out correctly on its own.
- Debugging visual layout remotely: `adb exec-out screencap -p` + `adb shell uiautomator dump` (view bounds) + `adb shell input tap` against the running emulator beats guessing from cropped screenshots — the UI dump showed the list viewport was sized correctly, isolating the bug to the native overlay.

## Order Lookup Patterns

- `getOrder()` alone is fragile for DraggableTable — `dbOrderIdIndex` has timing gaps after seating
- Sidebar (`TableListItem`, `SeatedPanel`) already uses resilient fallbacks (scan by `service_location_id` or `db_order_id`)
- When multiple components need the same data, ensure they all have equivalent resilience — don't let one component use a weaker lookup strategy

## Supabase RPC Schema Checks

- Before adding column assignments inside SQL RPC migrations, verify the target table columns in `database.types.ts`; `kds_item_status` does not have `updated_at`.

## Workflow / subagent isolation

- Workflow (and Agent-tool) subagents share the MAIN working tree unless launched with `isolation: 'worktree'`. A read-only-intended Explore agent still has Bash and CAN run `git checkout` — one did, silently switching the shared tree from `feat/pos-menu-surface` to `Table-And-Order-Syncing` mid-run. Nothing was lost (tree was clean) but it's disruptive.
  - Fix going forward: when a workflow's agents will touch git or read from a specific branch, either (a) set `isolation: 'worktree'`, or (b) instruct them explicitly to use `git show <branch>:<path>` (never `checkout`), and re-assert "do not switch branches." Always restore the user's original branch afterward.
- Squash-merged PRs: the local feature-branch commit (e.g. `fix/sync-order-from-database-rpc` @ 959c4739) is NOT an ancestor of the integration branch after a GitHub squash-merge (which creates a fresh commit, e.g. 509cc7c1). To get the post-merge code locally you must `git fetch`; `git branch --contains <mergeSha>` returns empty until then. Base fast-follows on `origin/<integration-branch>` after fetching.

## Fixes silently reverted by big unrelated merges

- The single-cent payment guard regressed **twice**: shipped in `40dee0fd` ("feat: updated support for single cent payments"), then clobbered 2 days later by `90f0ed1e` ("Jaffal bug fixes #134") — a large void/broadcast refactor that had nothing to do with payments but reintroduced the old `isFinalSplitPortion` / `forceExplicitAmount`-gated `<= $0.01` guard in `addPaymentToOrder`. Symptom: a $0.01 card purchase approves on the pinpad but the POS shows "No unpaid items" and the order stays awaiting payment (the terminal charges BEFORE `addPaymentToOrder`, which then `return false`s at the guard and never calls the RPC).
- The penny-guard predicate now lives in `lib/paymentGuards.ts` (`isNothingLeftToCollect`) with `__tests__/paymentPennyGuard.test.ts` — a pure function + unit test so a third silent revert fails CI instead of shipping. Backend `process_payment_v16` already tolerates a $0.01 balance (only rejects when `v_payment_based_due <= 0`), and the full-pay flow passes `itemAllocations` so the downstream `itemsCovered.length === 0` guard doesn't fire — the client guard was the sole blocker.
- Pattern: when restoring a bug fix, check WHY it disappeared. `git log -S "<unique-token-from-the-fix>" -- <file>` shows the commit that added it AND the one that removed it. If a subtle, hard-to-integration-test predicate keeps regressing via unrelated merges, extract it to a pure helper with a test rather than re-inlining it.

## Counts and rows must come from ONE rule (Previous Orders)

- Symptom cluster: a provider chip reading "DoorDash (3)" over an empty list,
  "House" returning far more rows than its own count, tab counts that don't sum
  to All, and a Takeaway tab that counted `catering`/`online` order types but
  returned none of them. All one cause: channel/provider classification existed
  in three places — the row badge, the summary counts, and the SQL query — each
  with its own rule. The counts normalized casing (`resolveOrderPlatformLogo`)
  while the query matched a hardcoded list of literal spellings
  (`delivery_platform in ("doordash","DOORDASH",…)`), so `"Doordash"` or a
  trailing space was counted but never returned.
- Fix pattern: when a number and the list it describes are computed by different
  code, they WILL drift. Define the bucket once as data (a predicate AST in
  `services/historyOrderTaxonomy.ts`) and derive both the JS evaluator and the
  PostgREST filter from it. Testing the two implementations against each other is
  weaker than making a second implementation impossible.
- SQL/JS three-valued logic is the trap in that pattern: `NOT (a OR b)` is NULL
  in Postgres (row excluded) but `true` in JS. The AST therefore has NO compound
  `NOT` — negation only as leaves (`neq`, `notIlike`), with "or the column is
  null" spelled out. Under that restriction the two evaluators agree exactly.
- Nullable columns to watch on `orders`: `order_source` and `delivery_platform`.
  `not.in` / `neq` on them silently drops NULL rows from every filtered tab while
  All still counts them.
- Early returns owe the screen its numbers too: the cache-and-revalidate path in
  `refreshPreviousOrders` painted cached rows and returned before the summary
  fetch, leaving every tab badge at 0 over a visibly full list. Any early return
  that leaves rows on screen must also top up whatever the header reads from.
