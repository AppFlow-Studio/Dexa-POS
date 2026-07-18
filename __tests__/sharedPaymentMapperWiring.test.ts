/**
 * H2 — structural drift-guard: both order-detail sync paths route payment
 * mapping through the single canonical mapper (mapFetchedPaymentsToProfile),
 * and the refund-monotonicity merge lives in exactly one shared helper.
 *
 * The store is too heavy to load in Jest (see demandDrivenDetailFetch.test.ts),
 * so the wiring is pinned against source drift. The mapper's behavior is
 * unit-tested in sharedPaymentMapper.test.ts.
 */

import { readFileSync } from "fs";
import { join } from "path";

const storeSrc = readFileSync(
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

const sfdb = sliceFunction(
  storeSrc,
  "syncOrderFromDatabase: async (",
  "syncOrderFromBackendComplete: async (",
);
const sfbc = sliceFunction(
  storeSrc,
  "syncOrderFromBackendComplete: async (",
  "// QUEUED UPDATE ACTIONS",
);

describe("H2 — both sync paths use the shared canonical payment mapper", () => {
  it("syncOrderFromDatabase maps payments via mapFetchedPaymentsToProfile", () => {
    expect(sfdb).toMatch(/mapFetchedPaymentsToProfile\(/);
  });

  it("syncOrderFromBackendComplete maps payments via mapFetchedPaymentsToProfile", () => {
    expect(sfbc).toMatch(/mapFetchedPaymentsToProfile\(/);
  });

  it("neither sync path keeps a hand-rolled inline payment mapper", () => {
    // The old inline mappers emitted `db_payment_id: p.id` / `db_payment_id: payment.id`
    // inside a paymentsData.map/dbPayments.map. If those come back, this fails.
    expect(sfdb).not.toMatch(/dbPayments\.map\(\(p\)\s*=>\s*\{[\s\S]*db_payment_id:/);
    expect(sfbc).not.toMatch(
      /paymentsData\.map\(\(payment[^)]*\)\s*=>\s*\{[\s\S]*db_payment_id:/,
    );
  });
});

describe("H2 — refund-monotonicity lives in one shared helper", () => {
  it("defines mergeLocalRefundEvidence once at module scope", () => {
    const defs = storeSrc.match(/function mergeLocalRefundEvidence\(/g) || [];
    expect(defs.length).toBe(1);
  });

  it("syncOrderFromDatabase re-applies the merge post-map (mapper is pure)", () => {
    expect(sfdb).toMatch(/mergeLocalRefundEvidence\(/);
  });

  it("all three refund-merge sites call the shared helper (SFDB + SFBC mergedPayments + mergePayments)", () => {
    // 1 definition + 3 call sites = 4 occurrences.
    const occurrences =
      storeSrc.match(/mergeLocalRefundEvidence\(/g) || [];
    expect(occurrences.length).toBeGreaterThanOrEqual(4);
  });

  it("no inline refund-merge copies remain (one localHasMoreRefund declaration — the helper)", () => {
    // Was 3 (SFDB inline + SFBC mergedPayments + mergePayments); now only the helper declares it.
    const decls = storeSrc.match(/const localHasMoreRefund =/g) || [];
    expect(decls.length).toBe(1);
  });
});
