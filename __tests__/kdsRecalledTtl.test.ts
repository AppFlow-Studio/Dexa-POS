/**
 * B2 (memory audit): KDS recalled-ticket Sets must TTL-evict so incomplete
 * recalls don't accumulate over a shift / across restarts. Unit-tests the pure
 * TTL predicate + source-asserts the wiring (useKDSStore is heavy to load).
 */
import { isRecallExpired } from "@/lib/kdsAutomation";
import fs from "fs";
import path from "path";

const TTL = 4 * 60 * 60 * 1000;

describe("isRecallExpired", () => {
  it("is false within the TTL", () => {
    const at = 1_000_000;
    expect(isRecallExpired(at, at + TTL - 1, TTL)).toBe(false);
    expect(isRecallExpired(at, at, TTL)).toBe(false);
  });
  it("is true once older than the TTL", () => {
    const at = 1_000_000;
    expect(isRecallExpired(at, at + TTL + 1, TTL)).toBe(true);
    expect(isRecallExpired(at, at + 5 * 60 * 60 * 1000, TTL)).toBe(true);
  });
});

describe("B2 — recalled TTL wired into useKDSStore (source)", () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), "stores", "useKDSStore.ts"),
    "utf8",
  );

  it("tracks recall timestamps + a 4h TTL", () => {
    expect(source).toContain("_recalledTicketAt = new Map<string, number>()");
    expect(source).toContain("RECALLED_TICKET_TTL = 4 * 60 * 60 * 1000");
    expect(source).toContain("_recalledTicketAt.set(ticketId, Date.now())");
  });

  it("culls expired recalls (both Sets + timestamp map) and is wired into overlayPendingActions", () => {
    expect(source).toContain("function cullExpiredRecalls(");
    expect(source).toContain("isRecallExpired(at, now, RECALLED_TICKET_TTL)");
    expect(source).toContain("_recalledCycleTicketIds.delete(ticketId)");
    expect(source).toContain("cullExpiredRecalls(now)");
  });

  it("clears the recall Sets + timestamp map in _cleanup and seeds timestamps on rehydrate", () => {
    expect(source).toContain("_recalledTicketIds.clear();");
    expect(source).toContain("_recalledCycleTicketIds.clear();");
    expect(source).toContain("_recalledTicketAt.clear();");
    // rehydrate seeds the timestamp so the TTL clock restarts on boot
    expect(source).toMatch(/recalledTicketIds[\s\S]*_recalledTicketAt\.set\(ticketId, Date\.now\(\)\)/);
  });
});
