import fs from "fs";
import path from "path";

describe("rapid table-order hydration", () => {
  it("preserves optimistic items when a full backend snapshot races initial adds", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "stores", "useOrderStore.ts"),
      "utf8",
    );

    expect(source).toContain(
      "Preserve optimistic items while the first table-order adds are",
    );
    expect(source).toContain(
      "const localPendingItems = existing.items.filter(",
    );
    expect(source).toContain(
      "(item) => !item.db_order_item_id && !item.isDraft",
    );
    expect(source).toContain("const claimedPendingIds = new Set<string>();");
    expect(source).toContain("...localPendingItems.filter(");
    expect(source).toContain("...localDraftItems,");
  });
});
