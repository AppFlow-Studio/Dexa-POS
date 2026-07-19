/**
 * M1 (PR #150 fast-follow) — Structural guard for the discount / reversal /
 * refund-item wiring in `syncOrderFromDatabase`.
 *
 * Background: post-#150 `syncOrderFromDatabase` fetches the full order via the
 * `get_order_details` RPC, which returns `reversals`, `order_refund_items`, and
 * `order_discounts` — but the function used to unwrap only items/payments/
 * payment_items/order and DROP those three collections. Result: on the light
 * hydration paths (tableOrderPrefetch, useRefreshActiveOrder, useTableSession,
 * cold load, FailedSyncResolutionModal) the Refunds tab, discount badge, and
 * reversals timeline went blank until a heavier syncOrderFromBackendComplete
 * happened to run.
 *
 * The order store is too heavy to load in Jest (same rationale as
 * demandDrivenDetailFetch.test.ts / orderPersistMemo.test.ts), so the wiring is
 * pinned here against source drift. The pure discount transform it delegates to
 * (restoreDiscountsFromBackend) is behavior-tested separately.
 *
 * Contract pinned:
 * 1. syncOrderFromDatabase extracts reversals / order_refund_items /
 *    order_discounts from the RPC `data`.
 * 2. Its updatedOrderProfile wires all three, with an EMPTY-GUARD so an empty
 *    (or RLS-raced) read preserves the local order's existing collections
 *    instead of wiping a locally-applied-but-unsynced discount/refund.
 * 3. The assertions target the syncOrderFromDatabase function body specifically
 *    (not the sibling syncOrderFromBackendComplete, which also wires these).
 */

import { readFileSync } from "fs";
import { join } from "path";

const orderStoreSource = readFileSync(
  join(__dirname, "..", "stores", "useOrderStore.ts"),
  "utf-8",
);

// Slice to the syncOrderFromDatabase function body so none of these assertions
// can be satisfied by syncOrderFromBackendComplete's equivalent wiring.
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

describe("M1 — syncOrderFromDatabase extracts the RPC's discount/reversal/refund collections", () => {
  it("unwraps reversals from data", () => {
    expect(syncFromDbBody).toMatch(
      /const reversalsData = \(data\.reversals \?\? \[\]\) as any\[\];/,
    );
  });

  it("unwraps order_refund_items from data", () => {
    expect(syncFromDbBody).toMatch(
      /const orderRefundItemsData = \(data\.order_refund_items \?\?\s*\[\]\) as any\[\];/,
    );
  });

  it("unwraps order_discounts from data", () => {
    expect(syncFromDbBody).toMatch(
      /const orderDiscountsData = \(data\.order_discounts \?\? \[\]\) as any\[\];/,
    );
  });
});

describe("M1 — syncOrderFromDatabase wires the collections with an empty-guard", () => {
  it("wires reversals, preserving local when the read is empty", () => {
    expect(syncFromDbBody).toMatch(
      /reversals:\s*reversalsData\.length > 0\s*\?\s*reversalsData\s*:\s*\(localOrder\?\.reversals \?\? \[\]\)/,
    );
  });

  it("wires order_refund_items, preserving local when the read is empty", () => {
    expect(syncFromDbBody).toMatch(
      /order_refund_items:\s*orderRefundItemsData\.length > 0\s*\?\s*orderRefundItemsData\s*:\s*\(localOrder\?\.order_refund_items \?\? \[\]\)/,
    );
  });

  it("only overwrites discounts when the backend actually returned some (never wipes with an empty read)", () => {
    expect(syncFromDbBody).toMatch(
      /\.\.\.\(orderDiscountsData\.length > 0\s*\?\s*restoreDiscountsFromBackend\(orderDiscountsData\)\s*:\s*\{\}\)/,
    );
  });
});

describe("M1 — dependencies", () => {
  it("imports the shared restoreDiscountsFromBackend transform", () => {
    expect(orderStoreSource).toMatch(
      /import \{ restoreDiscountsFromBackend \} from "@\/utils\/discountUtils";/,
    );
  });
});
