/**
 * K1 — re-adding an identical item after a send must produce a NEW line and a
 * real send, not a silent no-op.
 *
 * Regression for the reported bug: ring item A, Send (lands). Ring A again,
 * Send again. The old merge loop folded the new line A₂ back into the already
 * fired line A₁ (qty bump local-only), then dropped A₂ from the cart entirely.
 * The backend batch therefore resolved to zero items and `_commitKitchenSendForBatch`
 * returned `skipped` — which produced no toast. Silent forever.
 *
 * Phase 1 fix: `sendNewItemsToKitchen` now maps `currentOrder.items` and keeps
 * every line (fired lines are immutable), exactly like `sendNewItemsToKitchenForOrder`.
 *
 * These are structural assertions on the real source plus a faithful simulation
 * of the deployed block — exercising the live runtime path needs Supabase plus
 * a live queue, which the sibling suites avoid because the store pulls in
 * Sentry / supabase / offlineSyncService.
 */
import { readFileSync } from "fs";
import { join } from "path";

const repoRoot = join(__dirname, "..");
const storeSrc = readFileSync(
  join(repoRoot, "stores", "useOrderStore.ts"),
  "utf8",
);

function sliceFunction(src: string, name: string): string {
  // Store methods look like `  name: async (`; module-level functions look like
  // `async function name(`. Try both.
  const methodStart = src.indexOf(`  ${name}: async (`);
  const fnStart = methodStart === -1 ? src.indexOf(`async function ${name}(`) : -1;
  const start = methodStart !== -1 ? methodStart : fnStart;
  if (start === -1) throw new Error(`${name} not found`);
  // Find the closing of the function: walk from the start tracking brace depth
  // from the first '{' after the arrow head / signature.
  const headEnd = src.indexOf("{", start);
  let depth = 0;
  let i = headEnd;
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) break;
    }
  }
  return src.slice(start, i + 1);
}

const sendFn = sliceFunction(storeSrc, "sendNewItemsToKitchen");
const commitFn = sliceFunction(storeSrc, "_commitKitchenSendForBatch");

describe("K1 — re-add + re-send keeps every line and sends the new one", () => {
  it("no longer merges a re-added line into its already-sent sibling", () => {
    // The old loop called areCartItemsMergeIdentical(activeOrderId, item, newItem)
    // inside sendNewItemsToKitchen. It must not.
    expect(sendFn).not.toContain(
      "areCartItemsMergeIdentical(activeOrderId, item, newItem)",
    );
    expect(sendFn).not.toContain("mergedItemIds");
    expect(sendFn).not.toContain("itemsToKeep");
    expect(sendFn).not.toContain("cartToProcess");
  });

  it("maps currentOrder.items and keeps every line", () => {
    // The fix mirrors sendNewItemsToKitchenForOrder: a pure map, no filter.
    expect(sendFn).toMatch(/const finalCart = currentOrder\.items\.map\(/);
    // No clause may drop the newly-added line — the old rebuild filtered
    // `!isNew && !wasMerged`, which removed A₂ because it was new.
    expect(sendFn).not.toContain("!isNew && !wasMerged");
    // The map must advance unsent items only.
    expect(sendFn).toMatch(
      /if \(!item\.kitchen_status \|\| item\.kitchen_status === "new"\)/,
    );
    expect(sendFn).toContain("getKitchenSentStatus()");
  });

  it("builds the backend batch from the pre-merge new items (A₂'s id)", () => {
    // sentLocalIds must come from `newItems` (captured before the map), so the
    // backend send carries exactly the re-added line.
    const idx = sendFn.indexOf("const sentLocalIds = new Set(");
    expect(idx).toBeGreaterThan(-1);
    const after = sendFn.slice(idx, idx + 160);
    expect(after).toContain("newItems.map((item) => item.id)");
  });

  it("surfaces a skipped batch instead of staying silent", () => {
    expect(sendFn).toContain('sendResult.status === "skipped"');
    expect(sendFn).toContain('title: "Nothing was sent"');
    expect(sendFn).toContain('type: "warning"');
  });

  it("keeps _commitKitchenSendForBatch resolving per-batch ids", () => {
    // The commit must still key off the explicit sentLocalIds set (the
    // hardened contract), and never scan for `kitchen_status === 'sent'`.
    expect(commitFn).toContain("sentLocalIds.has(i.id)");
    expect(commitFn).toMatch(/\.filter\(\s*\(i\) => sentLocalIds\.has\(i\.id\)/);
  });
});

describe("K1 — simulation of the reported scenario (send A, re-add A, send again)", () => {
  // Faithful transcription of the Phase 1 block that now lives in
  // sendNewItemsToKitchen. Kept in sync with the source by the structural
  // assertions above; running it proves the scenario end-to-end.
  const getKitchenSentStatus = () => "sent";
  const advance = (items: Array<{ id: string; kitchen_status?: string; quantity: number }>) =>
    items.map((item) => {
      if (!item.kitchen_status || item.kitchen_status === "new") {
        return { ...item, kitchen_status: getKitchenSentStatus() };
      }
      return item;
    });

  it("keeps two lines after re-adding the same item and re-sending", () => {
    const a1 = { id: "A1", kitchen_status: "sent", quantity: 1, db_order_item_id: "db-1" };
    const a2 = { id: "A2", kitchen_status: "new", quantity: 1, db_order_item_id: "db-2" };

    // First send: A1 fired.
    const afterFirstSend = advance([a1]);
    expect(afterFirstSend).toHaveLength(1);
    expect(afterFirstSend[0].kitchen_status).toBe("sent");

    // Re-add identical A → A2 at 'new' (addItemToActiveOrder refuses to merge
    // into a fired line — this part was already correct).
    const cartBeforeSecondSend = [a1, a2];

    // Second send: every line survives; A2 advances to sent.
    const afterSecondSend = advance(cartBeforeSecondSend);
    expect(afterSecondSend).toHaveLength(2);
    expect(afterSecondSend.map((i) => i.id)).toEqual(["A1", "A2"]);
    expect(afterSecondSend[1].kitchen_status).toBe("sent");

    // Batch for the backend = exactly the newly fired line's db id → a real
    // send, never 'skipped'.
    const sentLocalIds = new Set(
      cartBeforeSecondSend
        .filter((i) => i.kitchen_status === "new")
        .map((i) => i.id),
    );
    const dbItemIds = afterSecondSend
      .filter((i) => sentLocalIds.has(i.id) && i.db_order_item_id)
      .map((i) => i.db_order_item_id);
    expect(dbItemIds).toEqual(["db-2"]);
    expect(dbItemIds.length).toBeGreaterThan(0); // not skipped
  });

  it("reports skipped only when the batch truly has nothing to send", () => {
    // A batch whose items all lack db ids and have no stragglers is the ONLY
    // legitimately silent case, and it now toasts.
    const items = [{ id: "A1", kitchen_status: "sent", quantity: 1 }];
    const sentLocalIds = new Set<string>();
    const dbItemIds = items
      .filter((i) => sentLocalIds.has(i.id) && i.db_order_item_id)
      .map((i) => i.db_order_item_id);
    expect(dbItemIds).toHaveLength(0);
    // Guard exists in the real caller:
    expect(sendFn).toContain('sendResult.status === "skipped"');
  });
});
