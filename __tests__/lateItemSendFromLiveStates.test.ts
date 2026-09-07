/**
 * Phase 5 / K7 — a late item can reach the kitchen from any live state.
 *
 * paying and closing are local-only intermediates; ringing one more drink while
 * the check is open is ordinary floor behaviour, so SEND_TO_KITCHEN must be
 * allowed from both. paid and cleaning stay blocked, and the operator is told
 * the reason and the remedy (reopen the check) instead of a generic failure.
 */
import { readFileSync } from "fs";
import { join } from "path";
import {
  canTransition,
  transitionTableStatus,
} from "@/lib/tableStateMachine";

const repoRoot = join(__dirname, "..");
const viewSrc = readFileSync(
  join(repoRoot, "components", "tables", "TableOrderView.tsx"),
  "utf8",
);

describe("K7 — late send allowed from paying and closing", () => {
  it("allows SEND_TO_KITCHEN from paying", () => {
    expect(canTransition("paying", "SEND_TO_KITCHEN")).toBe(true);
    expect(transitionTableStatus("paying", "SEND_TO_KITCHEN")).toBe("ordered");
  });

  it("allows SEND_TO_KITCHEN from closing", () => {
    expect(canTransition("closing", "SEND_TO_KITCHEN")).toBe(true);
    expect(transitionTableStatus("closing", "SEND_TO_KITCHEN")).toBe("ordered");
  });

  it("still allows it from the standard live states", () => {
    for (const status of ["seated", "ordering", "ordered", "served", "check_presented"] as const) {
      expect(canTransition(status, "SEND_TO_KITCHEN")).toBe(true);
    }
  });

  it("keeps paid and cleaning blocked", () => {
    expect(canTransition("paid", "SEND_TO_KITCHEN")).toBe(false);
    expect(canTransition("cleaning", "SEND_TO_KITCHEN")).toBe(false);
  });
});

describe("K7 — blocked sends name the reason and the remedy", () => {
  it("tells the operator to reopen the check for paid/cleaning", () => {
    expect(viewSrc).toContain(
      "Reopen it to send late items to the kitchen.",
    );
    expect(viewSrc).toContain(
      'sessionStatus === "paid" || sessionStatus === "cleaning"',
    );
  });
});
