/**
 * SC fire-and-forget drift-gate logic — Wave D-prelude fix.
 *
 * The gate that decides whether `recalculateOrder` calls
 * OrderService.applyServiceCharge lives in stores/useOrderStore.ts
 * (around line 14829, recalculateOrder action). It used to compare
 * computed SC against the local-cached `service_charge`, which gave a
 * false negative on the initial-apply race: the client cached SC=$1.42
 * before `db_order_id` arrived, then the post-rekey recalc found
 * scDelta=0 and never told the server, leaving server SC at 0.
 *
 * The fix compares computed SC against `_serverConfirmedServiceCharge`
 * — a transient field that is only updated when the RPC sync-back
 * confirms the server actually persisted the value.
 *
 * This file tests the gate formula in isolation. Wiring into the store
 * is verified end-to-end via the staging walkthrough in the migration
 * `How to test` comment, and via the device-side test in the plan.
 */

/**
 * Mirror of the drift-gate formula in stores/useOrderStore.ts:14831.
 * Kept here as a separate copy so the test owns its inputs; if the
 * production formula changes, this test will diverge and need to be
 * re-checked against the new behavior.
 */
function shouldFireScRpc(args: {
  computedServiceCharge: number;
  lastServerConfirmed: number | undefined;
  localPinnedRuleId: string | null;
}): boolean {
  const { computedServiceCharge, lastServerConfirmed, localPinnedRuleId } =
    args;
  if (lastServerConfirmed === undefined) {
    return computedServiceCharge > 0 || localPinnedRuleId != null;
  }
  return Math.abs(computedServiceCharge - lastServerConfirmed) >= 0.01;
}

describe("recalculateOrder SC drift gate", () => {
  test("first apply: eligible SC fires (no server-confirmed baseline yet)", () => {
    // Order is created, client computed SC=$1.42, server hasn't been told.
    expect(
      shouldFireScRpc({
        computedServiceCharge: 1.42,
        lastServerConfirmed: undefined,
        localPinnedRuleId: null,
      }),
    ).toBe(true);
  });

  test("first apply: pre-pinned local rule with SC=0 fires (clear-out path)", () => {
    // Local previously pinned a rule but eligibility just flipped to false
    // (e.g. party_size dropped below min). Need to tell server to clear.
    expect(
      shouldFireScRpc({
        computedServiceCharge: 0,
        lastServerConfirmed: undefined,
        localPinnedRuleId: "rule-1",
      }),
    ).toBe(true);
  });

  test("first apply: non-eligible order (SC=0, no rule) does NOT fire", () => {
    // Takeout order, no session, SC stays at 0. Nothing to sync.
    expect(
      shouldFireScRpc({
        computedServiceCharge: 0,
        lastServerConfirmed: undefined,
        localPinnedRuleId: null,
      }),
    ).toBe(false);
  });

  test("subsequent recalc: computed SC matches server-confirmed → no fire", () => {
    // SC stable across recalcs — no RPC noise.
    expect(
      shouldFireScRpc({
        computedServiceCharge: 1.42,
        lastServerConfirmed: 1.42,
        localPinnedRuleId: "rule-1",
      }),
    ).toBe(false);
  });

  test("subsequent recalc: SC drift ≥ $0.01 fires", () => {
    // Item added, subtotal moved, new SC = $1.50, server has $1.42 → fire.
    expect(
      shouldFireScRpc({
        computedServiceCharge: 1.5,
        lastServerConfirmed: 1.42,
        localPinnedRuleId: "rule-1",
      }),
    ).toBe(true);
  });

  test("subsequent recalc: sub-cent drift does NOT fire", () => {
    // Floating-point jitter shouldn't trigger noisy RPCs.
    expect(
      shouldFireScRpc({
        computedServiceCharge: 1.424,
        lastServerConfirmed: 1.42,
        localPinnedRuleId: "rule-1",
      }),
    ).toBe(false);
  });

  test("server-confirmed seeded to 0 from broadcast: client drift fires", () => {
    // Cross-station hydration scenario: peer fired RPC and we got the
    // broadcast. Our upsertOrder seeds _serverConfirmedServiceCharge=0
    // (server's view at time of broadcast). Our recalc computes $1.42 →
    // server is behind → fire.
    expect(
      shouldFireScRpc({
        computedServiceCharge: 1.42,
        lastServerConfirmed: 0,
        localPinnedRuleId: null,
      }),
    ).toBe(true);
  });

  test("clearing SC: computed 0, server had non-zero → fires to clear server", () => {
    // Party size dropped, eligibility lost. Tell server to clear snapshot.
    expect(
      shouldFireScRpc({
        computedServiceCharge: 0,
        lastServerConfirmed: 1.42,
        localPinnedRuleId: "rule-1",
      }),
    ).toBe(true);
  });
});
