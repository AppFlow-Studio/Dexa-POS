import { canTransition, transitionTableStatus } from "@/lib/tableStateMachine";
import { readFileSync } from "fs";
import { join } from "path";

const repoRoot = join(__dirname, "..");

function read(relPath: string): string {
  return readFileSync(join(repoRoot, relPath), "utf-8");
}

describe("clear table from served sessions", () => {
  it("allows served tables to enter cleaning", () => {
    expect(canTransition("served", "CLEAR_TABLE")).toBe(true);
    expect(transitionTableStatus("served", "CLEAR_TABLE")).toBe("cleaning");
  });

  it("dispatches grouped table clear once after archiving remaining orders", () => {
    // The clear-table flow now lives only in ExpandedTableDetails; TableListItem
    // was reduced to the void path and no longer dispatches CLEAR_TABLE.
    for (const src of [read("components/tables/ExpandedTableDetails.tsx")]) {
      expect(src).toContain(
        "const [firstOrder, ...remainingOrders] = tableData.orders;",
      );
      expect(src).toMatch(
        /(?:useOrderStore\.getState\(\)\.)?archiveOrder\(order\.id\);/,
      );
      expect(src).toContain("orderId: firstOrder.id,");
      expect(src).not.toMatch(
        /for \(const order of tableData\.orders\) \{[\s\S]{0,180}?type: "CLEAR_TABLE"/,
      );
    }
  });
});
