/**
 * Phase 6 / K9 + S4 — scope the sync barrier to the batch.
 *
 * waitForPendingSyncs/hasPendingSyncs waited on EVERY non-draft item in the
 * order. One item whose add dead-lettered stayed at 'pending' forever, so every
 * later send burned the full timeout (S4) and the retroactive gate never opened
 * again. The table effect's fixed 800 ms barrier was shorter than a real
 * add_order_item round trip, converting normal sends into queued ones (K9).
 *
 * Structural assertions on real sources.
 */
import { readFileSync } from "fs";
import { join } from "path";

const repoRoot = join(__dirname, "..");
const storeSrc = readFileSync(join(repoRoot, "stores", "useOrderStore.ts"), "utf8");
const effectSrc = readFileSync(
  join(repoRoot, "services", "sessionEffects", "sendToKitchenEffect.ts"),
  "utf8",
);

describe("S4 — the barrier can be scoped to the fired batch", () => {
  it("hasPendingSyncs accepts an itemIds scope", () => {
    expect(storeSrc).toMatch(
      /hasPendingSyncs: \(orderId: string, itemIds\?: string\[\]\)/,
    );
    expect(storeSrc).toContain(
      "order.items.filter((item) => itemIds.includes(item.id))",
    );
  });

  it("waitForPendingSyncs accepts itemIds and restricts its checks", () => {
    expect(storeSrc).toContain("opts?: { maxMs?: number; itemIds?: string[] }");
    expect(storeSrc).toContain("const itemIdFilter = opts?.itemIds");
    expect(storeSrc).toContain(
      "order.items.filter((item) => itemIdFilter.has(item.id))",
    );
  });
});

describe("S4 — send paths scope their barrier to the batch", () => {
  it("sendNewItemsToKitchen waits on newItems ids", () => {
    const idx = storeSrc.indexOf(
      "await get().waitForPendingSyncs(activeOrderId, {",
    );
    expect(idx).toBeGreaterThan(-1);
    const after = storeSrc.slice(idx, idx + 180);
    expect(after).toContain("itemIds: newItems.map((item) => item.id)");
  });

  it("sendNewItemsToKitchenForOrder waits on the fired batch ids", () => {
    const idx = storeSrc.indexOf(
      "await get().waitForPendingSyncs(orderId, {",
    );
    expect(idx).toBeGreaterThan(-1);
    const after = storeSrc.slice(idx, idx + 180);
    expect(after).toContain(
      "itemIds: newItemsForPrint.map((item) => item.id)",
    );
  });

  it("fireActiveOrderToKitchen waits on the fired batch ids", () => {
    const idx = storeSrc.indexOf(
      "await get().waitForPendingSyncs(firedOrderId, {",
    );
    expect(idx).toBeGreaterThan(-1);
    const after = storeSrc.slice(idx, idx + 180);
    expect(after).toContain("itemIds: [...firedItemIds]");
  });

  it("retro paths gate on the fired batch, not the whole order", () => {
    // No order-wide hasPendingSiblings remains.
    expect(storeSrc).not.toContain("hasPendingSiblings");
    expect(storeSrc).toMatch(
      /\.hasPendingSyncs\(resolveOrderKey\(\), \[item\.id\]\)/g,
    );
  });
});

describe("K9 — the table effect waits like a normal send", () => {
  it("uses the batch scope and the real send deadline instead of 800 ms", () => {
    expect(effectSrc).toContain("itemIds,");
    expect(effectSrc).toContain("maxMs: DEADLINES.sendToKitchen");
    expect(effectSrc).toContain(
      'import { DEADLINES } from "@/lib/network/deadlines";',
    );
    expect(effectSrc).not.toContain("maxMs: 800");
  });
});
