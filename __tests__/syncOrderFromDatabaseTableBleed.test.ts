/**
 * Structural guard for the "parallel local key" item merge inside
 * `syncOrderFromDatabase` (Table 53 ghost-items bug, Charcoal Gardenia
 * 2026-09-25).
 *
 * The merge exists to rescue pending items stranded under a temp key of the
 * SAME order mid-rekey. It used to match every local order on the same table
 * (`service_location_id`), so paid/archived orders kept in `ordersById` for
 * History had their items appended to the live check. Voiding those ghosts
 * then voided items on the already-paid orders.
 *
 * The order store is too heavy to load in Jest (see
 * syncOrderFromDatabaseDiscountMetadata.test.ts), so the contract is pinned
 * against source drift.
 */

import { readFileSync } from "fs";
import { join } from "path";

const orderStoreSource = readFileSync(
  join(__dirname, "..", "stores", "useOrderStore.ts"),
  "utf-8",
);

function sliceFunction(source: string, startMarker: string, endMarker: string) {
  const start = source.indexOf(startMarker);
  expect(start).toBeGreaterThan(-1);
  const end = source.indexOf(endMarker, start);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

const syncFromDbBody = sliceFunction(
  orderStoreSource,
  "syncOrderFromDatabase: async (",
  "syncOrderFromBackendComplete: async (",
);

// The parallel-key merge loop: from the ordersById scan to the payments mapping.
const mergeLoop = sliceFunction(
  syncFromDbBody,
  "for (const [key, candidate] of Object.entries(",
  "// Map payments from database",
);

describe("syncOrderFromDatabase — parallel-key item merge is scoped to one order", () => {
  it("only merges candidates that share this order's db_order_id", () => {
    expect(mergeLoop).toMatch(
      /if \(candidate\.db_order_id !== dbOrderId\) continue;/,
    );
  });

  it("never matches candidates by table / service location", () => {
    expect(mergeLoop).not.toMatch(/service_location_id/);
    expect(mergeLoop).not.toMatch(/table_number/);
  });
});
