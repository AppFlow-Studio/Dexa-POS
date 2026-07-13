/**
 * KDS vanish-on-tap: markItemDone re-derives ticket status from remaining item
 * kitchen_statuses. Online orders arrive with items 'sent', so tapping one item
 * of a multi-item ticket used to yield status 'pending' — a bucket that is
 * hidden in 2-step mode (the only mode where tap-to-complete is enabled) — and
 * the ticket vanished until the next fetch remapped pending→cooking.
 *
 * The fix mirrors buildTicketsFromBroadcast's remap: in 2-step
 * (getKitchenSentStatus() === 'preparing'), anySent derives 'cooking'.
 * useKDSStore is heavy to load, so this source-asserts the wiring (same
 * pattern as kdsRecalledTtl.test.ts).
 */
import fs from "fs";
import path from "path";

describe("markItemDone 2-step remap (source)", () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), "stores", "useKDSStore.ts"),
    "utf8",
  );

  it("applies the workflow-mode remap when deriving the new ticket status", () => {
    // markItemDone body: allReady → ready; anySent → mode-remapped; else cooking
    // lastIndexOf: the first occurrence is the interface declaration
    const markItemDone = source.slice(
      source.lastIndexOf("markItemDone:"),
      source.lastIndexOf("acknowledgeNoticeItem:"),
    );
    expect(markItemDone.length).toBeGreaterThan(0);
    expect(markItemDone).toMatch(
      /anySent\s*\?\s*getKitchenSentStatus\(\)\s*===\s*"preparing"\s*\?\s*"cooking"\s*:\s*"pending"/,
    );
  });

  it("keeps the same remap in buildTicketsFromBroadcast (both derivation sites agree)", () => {
    const occurrences = source.match(
      /anySent\s*\?\s*getKitchenSentStatus\(\)\s*===\s*"preparing"\s*\?\s*"cooking"\s*:\s*"pending"/g,
    );
    expect(occurrences?.length ?? 0).toBeGreaterThanOrEqual(2);
  });
});
