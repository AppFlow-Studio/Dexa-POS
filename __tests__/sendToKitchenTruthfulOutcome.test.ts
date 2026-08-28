/**
 * Phase 4 / K6 + K10 — tell the operator the truth about the send.
 *
 * dispatchAction used to fire SEND_TO_KITCHEN via queueMicrotask and return
 * { success: true } immediately; TableOrderView read that as confirmation and
 * printed/toasted before the send had even run, so a real backend failure could
 * never reach the rollback branch.
 *
 * Phase 4: dispatchAction opts into awaiting the effect (awaitEffects), the
 * kitchen effect returns a discriminated outcome, and TableOrderView prints
 * only after the outcome is known (holding the ticket when queued).
 *
 * Structural assertions on real sources.
 */
import { readFileSync } from "fs";
import { join } from "path";

const repoRoot = join(__dirname, "..");
const storeSrc = readFileSync(
  join(repoRoot, "stores", "useTableSessionStore.ts"),
  "utf8",
);
const effectSrc = readFileSync(
  join(repoRoot, "services", "sessionEffects", "sendToKitchenEffect.ts"),
  "utf8",
);
const infraSrc = readFileSync(
  join(repoRoot, "lib", "sessionSideEffects.ts"),
  "utf8",
);
const viewSrc = readFileSync(
  join(repoRoot, "components", "tables", "TableOrderView.tsx"),
  "utf8",
);

describe("K6 — the effect returns the real outcome", () => {
  it("declares the discriminated outcome union", () => {
    expect(infraSrc).toContain("export type KitchenEffectOutcome =");
    expect(infraSrc).toContain('{ status: "sent" }');
    expect(infraSrc).toContain('{ status: "queued" }');
    expect(infraSrc).toContain('{ status: "rejected"; error: unknown }');
    expect(infraSrc).toContain('{ status: "skipped" }');
  });

  it("sendToKitchenEffect returns a KitchenEffectOutcome", () => {
    expect(effectSrc).toContain(
      "): Promise<KitchenEffectOutcome> {",
    );
    // Every terminal path returns an explicit outcome.
    expect(effectSrc).toContain('return { status: "sent" };');
    expect(effectSrc).toContain('return { status: "queued" };');
    expect(effectSrc).toContain('return { status: "rejected", error: result.error };');
    expect(effectSrc).toContain('return { status: "skipped" };');
    // No bare `void` returns remain.
    expect(effectSrc).not.toMatch(/^\s*return;\s*$/m);
  });

  it("_fireEffects surfaces fulfilled handler values", () => {
    expect(infraSrc).toContain(
      "export async function _fireEffects(ctx: SideEffectContext): Promise<unknown[]> {",
    );
    expect(infraSrc).toContain("PromiseFulfilledResult<unknown>");
  });
});

describe("K6 — dispatchAction can await and carry the outcome", () => {
  it("accepts an awaitEffects option", () => {
    expect(storeSrc).toContain("opts?: { awaitEffects?: boolean }");
    expect(storeSrc).toMatch(
      /dispatchAction: \(\r?\n\s+action: DispatchableAction,\r?\n\s+opts\?: \{ awaitEffects\?: boolean \},/,
    );
  });

  it("awaits _fireEffects when opted in and maps the outcome", () => {
    expect(storeSrc).toContain("if (opts?.awaitEffects) {");
    expect(storeSrc).toContain("const outcomes = await _fireEffects(ctx);");
    expect(storeSrc).toContain("isKitchenEffectOutcome");
    // sent/queued → success with outcome; rejected/skipped → failure.
    expect(storeSrc).toContain('kitchenOutcome.status === "sent" ||');
    expect(storeSrc).toContain('"The kitchen rejected the send."');
  });

  it("carries outcome on DispatchResult", () => {
    expect(storeSrc).toContain("outcome?: KitchenEffectOutcome;");
  });
});

describe("K6/K10 — TableOrderView acts on the truth", () => {
  it("awaits the effect for SEND_TO_KITCHEN", () => {
    expect(viewSrc).toContain("{ awaitEffects: true }");
  });

  it("prints only after the outcome is known, and holds the ticket when queued", () => {
    // The queued branch returns BEFORE the print block.
    const queuedIdx = viewSrc.indexOf("Course send queued");
    const printIdx = viewSrc.indexOf("printKitchenTickets(");
    expect(queuedIdx).toBeGreaterThan(-1);
    expect(printIdx).toBeGreaterThan(-1);
    expect(queuedIdx).toBeLessThan(printIdx);
    expect(viewSrc).toContain("outcome === \"queued\"");
  });

  it("keeps the rollback branch for real failures", () => {
    expect(viewSrc).toContain("unmarkCourseSent(activeOrder.id, course);");
    expect(viewSrc).toContain('title: "Send Failed"');
  });
});
