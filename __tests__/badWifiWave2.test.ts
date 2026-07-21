/**
 * Bad-WiFi Wave 2 — deadline coverage for hot-path RPCs that previously ran RAW.
 * Persona-reviewed scope:
 *  B) ModifierScreen's redundant OrderService.updateOpenItem call removed — the
 *     edit is already synced (deadline-wrapped + offline-queued) by
 *     updateItemInActiveOrder (qty/notes) + setItemSeat (seat).
 *  A) The LIVE KDS poll (get_kds_tickets_v2 in useKDSStore fetchTickets +
 *     _backgroundFetchTickets) is now deadline-wrapped.
 *  C) The seat_guests legacy PGRST202 fallback is now deadline-wrapped.
 *
 * useOrderStore/useKDSStore are too heavy to load at runtime (mocked/source-
 * tested elsewhere); runWithDeadline's timeout->{error} behavior is covered by
 * __tests__/runWithDeadline.test.ts. These assertions guard the wiring at the
 * exact hot-path call sites (and prevent the double-sync from being re-added).
 */
import fs from "fs";
import path from "path";

const read = (...p: string[]) =>
  fs.readFileSync(path.join(process.cwd(), ...p), "utf8");

describe("Wave 2 — B: redundant open-item double-sync removed", () => {
  const src = read("components", "menu", "ModifierScreen.tsx");

  it("ModifierScreen no longer calls OrderService.updateOpenItem", () => {
    expect(src).not.toContain("OrderService.updateOpenItem(");
  });

  it("ModifierScreen still routes the edit through updateItemInActiveOrder + setItemSeat", () => {
    expect(src).toContain("updateItemInActiveOrder(updatedOpenItem)");
    expect(src).toContain(".setItemSeat(");
  });
});

describe("Wave 2 — A: live KDS poll is deadline-wrapped", () => {
  const src = read("stores", "useKDSStore.ts");

  it("imports the deadline helpers", () => {
    expect(src).toContain('from "@/lib/network/runWithDeadline"');
    expect(src).toContain('from "@/lib/network/deadlines"');
  });

  it("wraps BOTH get_kds_tickets_v2 poll sites in runWithDeadline + DEADLINES.read", () => {
    // both poll sites are deadline-wrapped
    expect((src.match(/runWithDeadline<KDSTicket\[\]>/g) ?? []).length).toBe(2);
    expect((src.match(/"get_kds_tickets",\s*DEADLINES\.read/g) ?? []).length).toBe(2);
    // both still hit the RPC, with abortSignal threaded for real cancellation
    expect((src.match(/get_kds_tickets_v2/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((src.match(/\.abortSignal\(signal\)/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });
});

describe("Wave 2 — C: seat_guests legacy fallback is deadline-wrapped", () => {
  const src = read("services", "floorPlanService.ts");

  it("wraps the PGRST202 legacy retry in runWithDeadline (closeCheck)", () => {
    expect(src).toContain('from "@/lib/network/runWithDeadline"');
    expect(src).toContain('"seat_guests_legacy"');
    expect(src).toContain("DEADLINES.closeCheck");
    expect(src).toMatch(/\.rpc\("seat_guests_v3"[\s\S]{0,80}\.abortSignal\(signal\)/);
  });
});
