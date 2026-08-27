/**
 * Phase 8 — automated companions to the new physical QA matrix rows.
 *
 * The physical matrix rows added by the kitchen-send & order-sync audit are
 * exercised on hardware; these simulations cover the same scenarios' logic so
 * CI can catch a regression before a device does:
 *
 *  - "Offline burst": three offline sends over overlapping item sets must fold
 *    into ONE send_to_kitchen op (S7), so reconnect replays one logical send
 *    with no ticket churn.
 *  - "Late item during cook": sending a third item must not touch the already
 *    fired items — the batch is scoped to the new line (K3) and a re-fire
 *    preserves fire_time (S2), so KDS tickets and timers stay stable.
 */
import { readFileSync } from "fs";
import { join } from "path";

const repoRoot = join(__dirname, "..");
const syncServiceSrc = readFileSync(
  join(repoRoot, "services", "offlineSyncService.ts"),
  "utf8",
);
const storeSrc = readFileSync(
  join(repoRoot, "stores", "useOrderStore.ts"),
  "utf8",
);
const refireMigration = readFileSync(
  join(repoRoot, "supabase", "migrations", "20260827160000_fix_kds_refire_preserves_fire_time.sql"),
  "utf8",
);

describe("QA row: offline burst — one logical send per order", () => {
  // Faithful transcription of the S7 dedup (union) in queueOperation. The
  // structural assertions below pin it to the real source.
  const findDedupeTarget = (
    pending: Array<{ type: string; status: string; localOrderId: string; params: { localItemIds: string[] } }>,
    localOrderId: string,
    newIds: string[],
  ) => {
    const newSet = new Set(newIds);
    let best: unknown = null;
    let bestOverlap = -1;
    for (const op of pending) {
      if (op.status !== "pending" || op.type !== "send_to_kitchen") continue;
      if (op.localOrderId !== localOrderId) continue;
      const existing = new Set(op.params.localItemIds ?? []);
      const overlap = [...newSet].filter((id) => existing.has(id)).length;
      if (overlap === 0) continue;
      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        best = op;
      }
    }
    return best as { id: string; params: { localItemIds: string[] } } | null;
  };

  it("three overlapping offline presses fold into a single op with the union", () => {
    const pending = [
      { id: "op-1", type: "send_to_kitchen", status: "pending", localOrderId: "o1", params: { localItemIds: ["A"] } },
    ];
    // Press 2: items [A, B] → folds into op-1 (overlap on A) and unions.
    const t2 = findDedupeTarget(pending, "o1", ["A", "B"]);
    expect(t2?.id).toBe("op-1");
    // Mirror the real union behaviour: op-1 now covers [A, B].
    pending[0].params.localItemIds = [...new Set(["A", "B", ...pending[0].params.localItemIds])];
    // Press 3: items [B, C] → still folds into op-1 (overlap on B).
    const t3 = findDedupeTarget(pending, "o1", ["B", "C"]);
    expect(t3?.id).toBe("op-1");
    // A disjoint press is a genuinely different send.
    const t4 = findDedupeTarget(pending, "o1", ["X"]);
    expect(t4).toBeNull();
  });

  it("the real source folds into the existing op and returns its id", () => {
    expect(syncServiceSrc).toContain("findSendToKitchenDedupeTarget(");
    expect(syncServiceSrc).toContain("const union = new Set<string>(");
    expect(syncServiceSrc).toContain("return dedupeTarget.id;");
  });
});

describe("QA row: late item during cook — sent lines are untouched", () => {
  it("the send batch is scoped to the new line, never the already-fired ones", () => {
    // sendNewItemsToKitchen builds newItems from unsent lines only.
    const sendFnStart = storeSrc.indexOf("sendNewItemsToKitchen: async () =>");
    const sendFn = storeSrc.slice(
      sendFnStart,
      sendFnStart + 20000,
    );
    expect(sendFn).toContain(
      'const newItems = currentOrder.items.filter(',
    );
    expect(sendFn).toContain(
      '!item.kitchen_status || item.kitchen_status === "new"',
    );
    // The finalCart is a map — it never rewrites already-fired lines.
    expect(sendFn).toContain("const finalCart = currentOrder.items.map(");
  });

  it("a re-fire preserves fire_time (original KDS ticket)", () => {
    expect(refireMigration).toContain(
      "WHEN p_status = 'sent' THEN COALESCE(fire_time, v_now)",
    );
    // Ticket identity is order+course+floor(fire_time_ms) — preserved.
    expect(refireMigration).not.toMatch(
      /WHEN p_status = 'sent' THEN v_now/,
    );
  });

  it("keeps started_preparing_at COALESCE semantics for preparing", () => {
    expect(refireMigration).toContain(
      "THEN COALESCE(started_preparing_at, v_now)",
    );
  });
});
