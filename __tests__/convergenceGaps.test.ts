/**
 * Phase 7 — close the convergence gaps (S1–S9).
 *
 *  S3  bounded optimistic kitchen-status preservation (in-flight tracker)
 *  S5  pending-items broadcast block narrowed to header-only suppression
 *  S6  batchUpdateItemKitchenStatus carries an explicit orderId
 *  S7  queued send_to_kitchen ops deduplicated per (order, item set)
 *  S8  coursing/seating pointers pruned when a cart line is removed
 *  S9  fired lines are immutable — quantity changes require void + re-add
 *
 * Structural assertions on real sources; behavior is exercised where cheap.
 */
import { readFileSync } from "fs";
import { join } from "path";

const repoRoot = join(__dirname, "..");
const storeSrc = readFileSync(join(repoRoot, "stores", "useOrderStore.ts"), "utf8");
const traceSrc = readFileSync(
  join(repoRoot, "lib", "kdsSendTraceability.ts"),
  "utf8",
);
const syncServiceSrc = readFileSync(
  join(repoRoot, "services", "offlineSyncService.ts"),
  "utf8",
);
const syncInitSrc = readFileSync(
  join(repoRoot, "services", "offlineSyncInit.ts"),
  "utf8",
);
const coursingSrc = readFileSync(
  join(repoRoot, "stores", "useCoursingStore.ts"),
  "utf8",
);
const seatingSrc = readFileSync(
  join(repoRoot, "stores", "useSeatingStore.ts"),
  "utf8",
);

describe("S3 — bounded optimistic kitchen-status preservation", () => {
  it("tracks in-flight kitchen sends", () => {
    expect(traceSrc).toContain("export function markKitchenSendInFlight(");
    expect(traceSrc).toContain("export function clearKitchenSendInFlight(");
    expect(traceSrc).toContain("export function isKitchenSendInFlight(");
  });

  it("preserves local kitchen_status only while a send is in flight", () => {
    const mergeBlock = storeSrc.slice(storeSrc.indexOf("// S3: preserve the local kitchen_status"));
    expect(mergeBlock).toContain("isKitchenSendInFlight(localItem.id)");
  });

  it("self-heals the marker once the server catches up", () => {
    expect(storeSrc).toContain("clearKitchenSendInFlightIfCaughtUp(");
    expect(traceSrc).toContain(
      "export function clearKitchenSendInFlightIfCaughtUp(",
    );
  });

  it("clears the marker when a send resolves rejected/skipped", () => {
    expect(storeSrc).toContain(
      'result.status === "rejected" || result.status === "skipped"',
    );
    const effectSrc = readFileSync(
      join(repoRoot, "services", "sessionEffects", "sendToKitchenEffect.ts"),
      "utf8",
    );
    expect(effectSrc).toContain(
      'outcome.status === "rejected" || outcome.status === "skipped"',
    );
  });

  it("clears the marker when the offline replay confirms", () => {
    expect(syncInitSrc).toContain("clearKitchenSendInFlight(localItemIds);");
  });
});

describe("S5 — pending-items broadcast block is header-only", () => {
  it("lets broadcasts with item changes through during the burst", () => {
    const block = storeSrc.slice(
      storeSrc.indexOf("const hasNoItemChanges = !hasItemLevelChanges("),
    );
    expect(block).toContain("hasNoItemChanges");
    expect(block).toContain("// hasItemChanges: fall through");
  });
});

describe("S6 — batchUpdateItemKitchenStatus carries its order", () => {
  it("takes an explicit orderId parameter", () => {
    expect(storeSrc).toMatch(
      /batchUpdateItemKitchenStatus: \(\r?\n\s+orderId: string,\r?\n\s+itemIds: string\[\],/,
    );
    expect(storeSrc).toContain(
      "batchUpdateItemKitchenStatus: (orderId, itemIds, status) => {",
    );
    expect(storeSrc).toContain(
      "// S6: operate on the order OWING the ids, never the active order.",
    );
  });
});

describe("S7 — queued kitchen sends are deduplicated", () => {
  it("finds an overlapping pending send_to_kitchen op to fold into", () => {
    expect(syncServiceSrc).toContain(
      "function findSendToKitchenDedupeTarget(",
    );
    expect(syncServiceSrc).toContain('op.type !== "send_to_kitchen"');
  });

  it("folds into the existing op in queueOperation instead of adding a key", () => {
    const dedupeBlock = syncServiceSrc.slice(
      syncServiceSrc.indexOf("// S7: deduplicate queued kitchen sends"),
    );
    expect(dedupeBlock).toContain('op.type === "send_to_kitchen"');
    expect(dedupeBlock).toContain("findSendToKitchenDedupeTarget(");
    expect(dedupeBlock).toContain("return dedupeTarget.id;");
  });
});

describe("S8 — coursing/seating pointers pruned on removal", () => {
  it("exposes removeItemCourse and removeItemSeat", () => {
    expect(coursingSrc).toContain("removeItemCourse: (");
    expect(seatingSrc).toContain("removeItemSeat: (");
  });

  it("calls them when a cart line is removed or merged away", () => {
    expect(storeSrc).toContain(".removeItemCourse(");
    expect(storeSrc).toContain(".removeItemSeat(");
    // Both removal points: removeItemFromActiveOrder and the merge.
    expect(storeSrc.match(/\.removeItemCourse\(/g)!.length).toBeGreaterThanOrEqual(2);
    expect(storeSrc.match(/\.removeItemSeat\(/g)!.length).toBeGreaterThanOrEqual(2);
  });
});

describe("S9 — fired lines are immutable", () => {
  it("refuses quantity changes on fired lines with a clear remedy", () => {
    expect(storeSrc).toContain("// S9/S1: a fired line is immutable.");
    expect(storeSrc).toContain("if (isKitchenItemSent(item)) {");
    expect(storeSrc).toContain(
      "Void it and re-add to change the quantity.",
    );
  });
});
